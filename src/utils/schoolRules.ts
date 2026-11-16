import type {
  BehaviorLog,
  ClassSection,
  Grade,
  Profile,
  Section,
  Student,
  Substitution,
  TeacherAbsence,
  TimetableSlot,
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
