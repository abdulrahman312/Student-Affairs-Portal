import type {
  BehaviorLog,
  ClassSection,
  Division,
  Grade,
  Language,
  Profile,
  Section,
  StaffClassAssignment,
  Student,
  Substitution,
  TeacherAbsence,
  TimetableSlot,
  UserRole,
} from '../types/database';
import { getRiyadhParts } from './riyadhTime';

export function isAllowedSchoolEmail(email: string, allowedDomain: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const domain = allowedDomain.trim().toLowerCase().replace(/^@/, '');
  if (!trimmed || !domain) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0]) return false;
  return parts[1] === domain;
}

export function isDateInRange(targetDate: string, startDate: string, endDate: string): boolean {
  if (!targetDate || !startDate || !endDate) return false;
  return targetDate >= startDate && targetDate <= endDate;
}

export interface TimetableConflictResult {
  hasConflict: boolean;
  reason: 'teacher_busy' | 'class_occupied' | null;
  conflictingSlot?: TimetableSlot;
}

/**
 * Period-number-only conflict detection (ignoring Lower/Upper clock times).
 * Checks strictly by day_of_week (0..4) and period_number (1..7).
 */
export function checkTimetableConflict(
  existingSlots: TimetableSlot[],
  candidate: {
    id?: string;
    teacher_id: string;
    class_section_id: string;
    day_of_week: number;
    period_number: number;
  }
): TimetableConflictResult {
  for (const slot of existingSlots) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.day_of_week !== candidate.day_of_week || slot.period_number !== candidate.period_number) {
      continue;
    }
    if (slot.teacher_id === candidate.teacher_id) {
      return { hasConflict: true, reason: 'teacher_busy', conflictingSlot: slot };
    }
    if (slot.class_section_id === candidate.class_section_id) {
      return { hasConflict: true, reason: 'class_occupied', conflictingSlot: slot };
    }
  }
  return { hasConflict: false, reason: null };
}

export interface SubstituteCandidate {
  teacher: Profile;
  monthlyCount: number;
  reachedLimit: boolean;
  alreadyAssignedThisPeriod: boolean;
}

export function getAvailableSubstitutes(params: {
  profiles: Profile[];
  timetableSlots: TimetableSlot[];
  absences: TeacherAbsence[];
  substitutions: Substitution[];
  targetDate: string;
  dayOfWeek: number;
  periodNumber: number;
  absentTeacherId: string;
  maxMonthlySubstitutions: number;
}): SubstituteCandidate[] {
  const {
    profiles,
    timetableSlots,
    absences,
    substitutions,
    targetDate,
    dayOfWeek,
    periodNumber,
    absentTeacherId,
    maxMonthlySubstitutions,
  } = params;

  const monthPrefix = targetDate.slice(0, 7); // YYYY-MM

  const absentTeacherIdsOnDate = new Set(
    absences.filter((a) => a.absence_date === targetDate).map((a) => a.teacher_id)
  );
  absentTeacherIdsOnDate.add(absentTeacherId);

  const busyTeacherIdsInPeriod = new Set(
    timetableSlots
      .filter((s) => s.day_of_week === dayOfWeek && s.period_number === periodNumber)
      .map((s) => s.teacher_id)
  );

  const subBusyOnDatePeriod = new Set(
    substitutions
      .filter((s) => s.absence_date === targetDate && s.period_number === periodNumber)
      .map((s) => s.substitute_teacher_id)
  );

  const monthlyCounts = new Map<string, number>();
  for (const sub of substitutions) {
    if (sub.absence_date.startsWith(monthPrefix)) {
      monthlyCounts.set(
        sub.substitute_teacher_id,
        (monthlyCounts.get(sub.substitute_teacher_id) || 0) + 1
      );
    }
  }

  return profiles
    .filter((p) => {
      if (!p.roles.includes('teacher')) return false;
      if (absentTeacherIdsOnDate.has(p.id)) return false;
      if (busyTeacherIdsInPeriod.has(p.id)) return false;
      return true;
    })
    .map((teacher) => {
      const monthlyCount = monthlyCounts.get(teacher.id) || 0;
      return {
        teacher,
        monthlyCount,
        reachedLimit: monthlyCount >= maxMonthlySubstitutions,
        alreadyAssignedThisPeriod: subBusyOnDatePeriod.has(teacher.id),
      };
    })
    .sort((a, b) => a.monthlyCount - b.monthlyCount);
}

export type WatchlistTimeframe = 'today' | 'week' | 'month' | 'all';

export interface WatchlistEntry {
  student: Student;
  incidentCount: number;
  exceedsThreshold: boolean;
  latestIncidentAt: string;
}

export function computeBehaviorWatchlist(params: {
  logs: BehaviorLog[];
  students: Student[];
  timeframe: WatchlistTimeframe;
  riyadhToday: string;
  threshold: number;
}): WatchlistEntry[] {
  const { logs, students, timeframe, riyadhToday, threshold } = params;

  const studentMap = new Map<string, Student>();
  for (const s of students) studentMap.set(s.id, s);

  const todayDate = new Date(`${riyadhToday}T12:00:00Z`);
  const weekStartDate = new Date(todayDate);
  weekStartDate.setUTCDate(todayDate.getUTCDate() - 6);
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);
  const monthPrefix = riyadhToday.slice(0, 7);

  const counts = new Map<string, { count: number; latest: string }>();

  for (const log of logs) {
    const logRiyadhDate = getRiyadhParts(new Date(log.created_at)).dateStr;
    if (timeframe === 'today' && logRiyadhDate !== riyadhToday) continue;
    if (timeframe === 'week' && (logRiyadhDate < weekStartStr || logRiyadhDate > riyadhToday)) continue;
    if (timeframe === 'month' && !logRiyadhDate.startsWith(monthPrefix)) continue;

    const current = counts.get(log.student_id) || { count: 0, latest: log.created_at };
    counts.set(log.student_id, {
      count: current.count + 1,
      latest: log.created_at > current.latest ? log.created_at : current.latest,
    });
  }

  const results: WatchlistEntry[] = [];
  for (const [studentId, stats] of counts.entries()) {
    const student = studentMap.get(studentId);
    if (!student) continue;
    results.push({
      student,
      incidentCount: stats.count,
      exceedsThreshold: stats.count >= threshold,
      latestIncidentAt: stats.latest,
    });
  }

  return results.sort((a, b) => {
    if (b.incidentCount !== a.incidentCount) return b.incidentCount - a.incidentCount;
    return b.latestIncidentAt.localeCompare(a.latestIncidentAt);
  });
}

export interface ParsedStudentRow {
  rowNumber: number;
  name_ar: string;
  name_en: string;
  iqama_id: string;
  father_mobile: string;
  grade_id: string;
  section_id: string;
  class_section_id: string;
  gradeLabel: string;
  sectionLabel: string;
}

export interface StudentImportResult {
  validRows: ParsedStudentRow[];
  errors: { rowNumber: number; reason: string }[];
}

export function normalizePhoneNumber(phone: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.startsWith('05') && digits.length === 10) {
    return '966' + digits.slice(1);
  }
  if (digits.startsWith('5') && digits.length === 9) {
    return '966' + digits;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhoneNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Parses rows from Excel in exact 6-column order:
 * 0: Arabic Name
 * 1: English Name
 * 2: ID/Iqama
 * 3: Father Mobile
 * 4: Grade (e.g. "Grade 5" or "5")
 * 5: Section (e.g. "C" or "Section C")
 */
export function parseStudentExcelRows(
  rawRows: unknown[][],
  grades: Grade[],
  sections: Section[],
  classSections: ClassSection[]
): StudentImportResult {
  const validRows: ParsedStudentRow[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];

  if (!rawRows.length) return { validRows, errors };

  // Detect optional header row
  const firstCell = String(rawRows[0]?.[0] ?? '').toLowerCase();
  const thirdCell = String(rawRows[0]?.[2] ?? '').toLowerCase();
  const hasHeader =
    firstCell.includes('arabic') ||
    firstCell.includes('الاسم') ||
    thirdCell.includes('iqama') ||
    thirdCell.includes('id');

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;

    const rowNumber = i + 1;
    const name_ar = String(row[0] ?? '').trim();
    const name_en = String(row[1] ?? '').trim();
    const iqama_id = String(row[2] ?? '').trim();
    const father_mobile = normalizePhoneNumber(String(row[3] ?? '').trim());
    const gradeRaw = String(row[4] ?? '').trim();
    const sectionRaw = String(row[5] ?? '').trim();

    if (!iqama_id || (!name_ar && !name_en)) {
      errors.push({ rowNumber, reason: 'Missing ID/Iqama or student name' });
      continue;
    }

    const gradeNumMatch = gradeRaw.match(/\d+/);
    const matchedGrade = grades.find(
      (g) =>
        g.name_en.toLowerCase() === gradeRaw.toLowerCase() ||
        g.name_ar === gradeRaw ||
        (gradeNumMatch && g.grade_number === Number(gradeNumMatch[0]))
    );
    if (!matchedGrade) {
      errors.push({ rowNumber, reason: `Unknown grade "${gradeRaw}"` });
      continue;
    }

    const cleanSectionCode = sectionRaw.replace(/^section\s+/i, '').trim().toUpperCase();
    const matchedSection = sections.find(
      (s) =>
        s.code.toUpperCase() === cleanSectionCode ||
        s.name_en.toLowerCase() === sectionRaw.toLowerCase() ||
        s.name_ar === sectionRaw
    );
    if (!matchedSection) {
      errors.push({ rowNumber, reason: `Unknown section "${sectionRaw}"` });
      continue;
    }

    const matchedClassSection = classSections.find(
      (cs) => cs.grade_id === matchedGrade.id && cs.section_id === matchedSection.id
    );
    if (!matchedClassSection) {
      errors.push({
        rowNumber,
        reason: `Class section "${matchedGrade.name_en} - ${matchedSection.code}" is not configured`,
      });
      continue;
    }

    validRows.push({
      rowNumber,
      name_ar: name_ar || name_en,
      name_en: name_en || name_ar,
      iqama_id,
      father_mobile,
      grade_id: matchedGrade.id,
      section_id: matchedSection.id,
      class_section_id: matchedClassSection.id,
      gradeLabel: matchedGrade.name_en,
      sectionLabel: matchedSection.code,
    });
  }

  return { validRows, errors };
}

export interface RoleScope {
  isUnrestricted: boolean;
  classSections: ClassSection[];
  classSectionIds: Set<string>;
  grades: Grade[];
  gradeIds: Set<string>;
  sections: Section[];
  sectionIds: Set<string>;
  divisions: Division[];
  divisionIds: Set<string>;
  students: Student[];
}

/**
 * Computes the strict operational scope (divisions, grades, sections, class sections, students)
 * for the user's active role:
 * - admin: unrestricted across entire school
 * - principal / academic_supervisor: scoped strictly to their assigned division_id
 * - teacher / supervisor: scoped strictly to their assigned staff_class_assignments
 *   (falling back to division_id only if they have zero explicit class assignments)
 */
export function getRoleScope(params: {
  profile: Profile | null;
  divisions: Division[];
  grades: Grade[];
  sections: Section[];
  classSections: ClassSection[];
  staffAssignments: StaffClassAssignment[];
  students: Student[];
}): RoleScope {
  const { profile, divisions, grades, sections, classSections, staffAssignments, students } = params;

  if (!profile || profile.active_role === 'admin') {
    const classSectionIds = new Set(classSections.map((c) => c.id));
    const gradeIds = new Set(grades.map((g) => g.id));
    const sectionIds = new Set(sections.map((s) => s.id));
    const divisionIds = new Set(divisions.map((d) => d.id));
    return {
      isUnrestricted: true,
      classSections,
      classSectionIds,
      grades,
      gradeIds,
      sections,
      sectionIds,
      divisions,
      divisionIds,
      students,
    };
  }

  const activeRole = profile.active_role;
  const gradeDivMap = new Map(grades.map((g) => [g.id, g.division_id]));

  if (activeRole === 'principal' || activeRole === 'academic_supervisor') {
    if (profile.division_id) {
      const scopedGrades = grades.filter((g) => g.division_id === profile.division_id);
      const scopedGradeIds = new Set(scopedGrades.map((g) => g.id));
      const scopedClassSections = classSections.filter((cs) => scopedGradeIds.has(cs.grade_id));
      const scopedClassIds = new Set(scopedClassSections.map((cs) => cs.id));
      const scopedSectionIds = new Set(scopedClassSections.map((cs) => cs.section_id));
      const scopedSections = sections.filter((s) => scopedSectionIds.has(s.id));
      const scopedDivisions = divisions.filter((d) => d.id === profile.division_id);
      const scopedDivisionIds = new Set(scopedDivisions.map((d) => d.id));
      const scopedStudents = students.filter(
        (st) => scopedClassIds.has(st.class_section_id) || scopedGradeIds.has(st.grade_id)
      );
      return {
        isUnrestricted: false,
        classSections: scopedClassSections,
        classSectionIds: scopedClassIds,
        grades: scopedGrades,
        gradeIds: scopedGradeIds,
        sections: scopedSections,
        sectionIds: scopedSectionIds,
        divisions: scopedDivisions,
        divisionIds: scopedDivisionIds,
        students: scopedStudents,
      };
    }
  }

  if (activeRole === 'teacher' || activeRole === 'supervisor') {
    const userAssignments = staffAssignments.filter((a) => a.user_id === profile.id);
    const typedAssignments = userAssignments.filter((a) => a.assignment_type === activeRole);
    const effectiveAssignments = typedAssignments.length > 0 ? typedAssignments : userAssignments;
    const assignedIds = new Set(effectiveAssignments.map((a) => a.class_section_id));

    let scopedClassSections: ClassSection[];
    if (assignedIds.size > 0) {
      scopedClassSections = classSections.filter((cs) => assignedIds.has(cs.id));
    } else if (profile.division_id) {
      const divGradeIds = new Set(
        grades.filter((g) => g.division_id === profile.division_id).map((g) => g.id)
      );
      scopedClassSections = classSections.filter((cs) => divGradeIds.has(cs.grade_id));
    } else {
      scopedClassSections = [];
    }

    const scopedClassIds = new Set(scopedClassSections.map((cs) => cs.id));
    const scopedGradeIds = new Set(scopedClassSections.map((cs) => cs.grade_id));
    const scopedSectionIds = new Set(scopedClassSections.map((cs) => cs.section_id));
    const scopedDivisionIds = new Set<string>();
    for (const gid of scopedGradeIds) {
      const did = gradeDivMap.get(gid);
      if (did) scopedDivisionIds.add(did);
    }
    if (scopedDivisionIds.size === 0 && profile.division_id) {
      scopedDivisionIds.add(profile.division_id);
    }

    const scopedGrades = grades.filter((g) => scopedGradeIds.has(g.id));
    const scopedSections = sections.filter((s) => scopedSectionIds.has(s.id));
    const scopedDivisions = divisions.filter((d) => scopedDivisionIds.has(d.id));
    const scopedStudents = students.filter((st) => scopedClassIds.has(st.class_section_id));

    return {
      isUnrestricted: false,
      classSections: scopedClassSections,
      classSectionIds: scopedClassIds,
      grades: scopedGrades,
      gradeIds: scopedGradeIds,
      sections: scopedSections,
      sectionIds: scopedSectionIds,
      divisions: scopedDivisions,
      divisionIds: scopedDivisionIds,
      students: scopedStudents,
    };
  }

  // Fallback for principal/academic_supervisor without division_id set
  const classSectionIds = new Set(classSections.map((c) => c.id));
  const gradeIds = new Set(grades.map((g) => g.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const divisionIds = new Set(divisions.map((d) => d.id));
  return {
    isUnrestricted: true,
    classSections,
    classSectionIds,
    grades,
    gradeIds,
    sections,
    sectionIds,
    divisions,
    divisionIds,
    students,
  };
}

/**
 * Filters teachers relevant to a user's operational scope (division / assigned class sections).
 */
export function filterTeachersInScope(params: {
  profiles: Profile[];
  scope: RoleScope;
  staffAssignments: StaffClassAssignment[];
  timetableSlots?: TimetableSlot[];
}): Profile[] {
  const { profiles, scope, staffAssignments, timetableSlots = [] } = params;
  const teachers = profiles.filter((p) => p.roles.includes('teacher'));
  if (scope.isUnrestricted || scope.classSectionIds.size === 0) return teachers;

  const teacherClasses = new Map<string, Set<string>>();
  const addClass = (tid: string, csid: string) => {
    const set = teacherClasses.get(tid) || new Set<string>();
    set.add(csid);
    teacherClasses.set(tid, set);
  };
  for (const a of staffAssignments) addClass(a.user_id, a.class_section_id);
  for (const s of timetableSlots) addClass(s.teacher_id, s.class_section_id);

  const matched = teachers.filter((t) => {
    const classes = teacherClasses.get(t.id);
    if (classes && classes.size > 0) {
      for (const csid of classes) {
        if (scope.classSectionIds.has(csid)) return true;
      }
      return false;
    }
    if (t.division_id && scope.divisionIds.size > 0) {
      return scope.divisionIds.has(t.division_id);
    }
    return true;
  });

  return matched.length > 0 ? matched : teachers;
}

export interface StaffClassAssignmentInsert {
  user_id: string;
  class_section_id: string;
  subject_id: string | null;
  assignment_type: 'teacher' | 'supervisor';
}

/**
 * Builds validated, deduplicated staff_class_assignments insert rows for any role combination.
 * Guarantees assignment_type is always explicitly 'teacher' or 'supervisor' (never null/undefined).
 */
export function buildStaffAssignmentRows(params: {
  userId: string;
  roles: UserRole[];
  classSectionIds: string[];
  primarySubjectId: string | null;
}): StaffClassAssignmentInsert[] {
  const { userId, roles, classSectionIds, primarySubjectId } = params;
  const uniqueClassIds = Array.from(new Set(classSectionIds.filter(Boolean)));
  if (!userId || uniqueClassIds.length === 0) return [];

  const rows: StaffClassAssignmentInsert[] = [];
  if (roles.includes('teacher')) {
    for (const class_section_id of uniqueClassIds) {
      rows.push({
        user_id: userId,
        class_section_id,
        subject_id: primarySubjectId || null,
        assignment_type: 'teacher',
      });
    }
  }
  if (roles.includes('supervisor')) {
    for (const class_section_id of uniqueClassIds) {
      rows.push({
        user_id: userId,
        class_section_id,
        subject_id: null,
        assignment_type: 'supervisor',
      });
    }
  }
  return rows;
}

/**
 * Validates role-specific requirements across onboarding and admin user management
 * so no teacher/supervisor/principal/academic_supervisor account is created without its scope.
 */
export function validateRoleConfiguration(params: {
  roles: UserRole[];
  primarySubjectId: string;
  divisionId: string;
  classSectionIds: string[];
  lang: Language;
}): string | null {
  const { roles, primarySubjectId, divisionId, classSectionIds, lang } = params;
  if (roles.length === 0) {
    return lang === 'ar' ? 'يرجى اختيار دور واحد على الأقل' : 'Please select at least one role';
  }
  if (roles.includes('admin')) {
    return null;
  }
  if (roles.includes('teacher') && !primarySubjectId) {
    return lang === 'ar' ? 'يرجى اختيار المادة الدراسية للمعلم' : 'Please select a primary subject for Teacher';
  }
  if ((roles.includes('teacher') || roles.includes('supervisor')) && classSectionIds.length === 0) {
    return lang === 'ar'
      ? 'يرجى اختيار فصل دراسي واحد على الأقل'
      : 'Please select at least one assigned class section';
  }
  if (
    (roles.includes('principal') || roles.includes('academic_supervisor')) &&
    !divisionId
  ) {
    return lang === 'ar'
      ? 'يرجى اختيار المرحلة الدراسية'
      : 'Please select the assigned school division';
  }
  return null;
}

/**
 * Normalizes English and Arabic text for forgiving bilingual search:
 * - Strips Arabic diacritics (tashkeel) and tatweel
 * - Normalizes Arabic Alef variants (أ/إ/آ/ٱ -> ا), Teh Marbuta (ة -> ه), Alef Maksura (ى -> ي)
 * - Lowercases Latin text and collapses whitespace
 */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a user search query against any combination of bilingual fields (English name,
 * Arabic name, email, Iqama ID, etc.). Every space-separated token must match at least one field.
 */
export function matchesBilingualSearch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedFields = fields.map((f) => normalizeSearchText(f)).filter(Boolean);
  if (normalizedFields.length === 0) return false;

  return tokens.every((token) => normalizedFields.some((field) => field.includes(token)));
}

export type BehaviorLevel = 'green' | 'orange' | 'red';

/**
 * Classroom Behavior Status Levels:
 * - 0 behaviors -> 'green'
 * - 1..5 behaviors -> 'orange'
 * - > 5 behaviors -> 'red'
 */
export function getBehaviorLevel(count: number): BehaviorLevel {
  if (count <= 0) return 'green';
  if (count <= 5) return 'orange';
  return 'red';
}

export interface ClassroomStudentBehaviorRow {
  student: Student;
  logs: BehaviorLog[];
  count: number;
  level: BehaviorLevel;
}

export function getMonthlyClassBehaviorRows(params: {
  students: Student[];
  logs: BehaviorLog[];
  classSectionId: string;
  monthStr: string;
  lang?: Language;
}): ClassroomStudentBehaviorRow[] {
  const { students, logs, classSectionId, monthStr, lang = 'en' } = params;
  if (!classSectionId) return [];

  const classStudents = students
    .filter((s) => s.class_section_id === classSectionId)
    .slice()
    .sort((a, b) => {
      const nameA = lang === 'ar' ? a.name_ar || a.name_en : a.name_en || a.name_ar;
      const nameB = lang === 'ar' ? b.name_ar || b.name_en : b.name_en || b.name_ar;
      return nameA.localeCompare(nameB);
    });

  const classStudentIds = new Set(classStudents.map((s) => s.id));
  const logsByStudent = new Map<string, BehaviorLog[]>();

  for (const log of logs) {
    if (!classStudentIds.has(log.student_id) && log.class_section_id !== classSectionId) continue;
    const logMonth = getRiyadhParts(new Date(log.created_at)).monthStr;
    if (logMonth !== monthStr) continue;
    const list = logsByStudent.get(log.student_id) || [];
    list.push(log);
    logsByStudent.set(log.student_id, list);
  }

  return classStudents.map((student) => {
    const studentLogs = (logsByStudent.get(student.id) || [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const count = studentLogs.length;
    return {
      student,
      logs: studentLogs,
      count,
      level: getBehaviorLevel(count),
    };
  });
}

export function filterBehaviorLogsForReport(params: {
  logs: BehaviorLog[];
  fromDate: string;
  toDate: string;
  teacherOnlyId?: string;
  classSectionId?: string;
  studentClassMap?: Map<string, string>;
}): BehaviorLog[] {
  const { logs, fromDate, toDate, teacherOnlyId, classSectionId, studentClassMap } = params;

  return logs
    .filter((log) => {
      if (teacherOnlyId && log.teacher_id !== teacherOnlyId) return false;
      if (classSectionId) {
        const effectiveClassId = log.class_section_id || studentClassMap?.get(log.student_id);
        if (effectiveClassId !== classSectionId) return false;
      }
      const riyadhDate = getRiyadhParts(new Date(log.created_at)).dateStr;
      if (fromDate && riyadhDate < fromDate) return false;
      if (toDate && riyadhDate > toDate) return false;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}


