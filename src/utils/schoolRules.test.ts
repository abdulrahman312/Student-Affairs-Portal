import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaffAssignmentRows,
  buildWhatsAppUrl,
  checkTimetableConflict,
  computeBehaviorWatchlist,
  filterBehaviorLogsForReport,
  filterTeachersInScope,
  getAvailableSubstitutes,
  getBehaviorLevel,
  getMonthlyClassBehaviorRows,
  getRoleScope,
  isAllowedSchoolEmail,
  isDateInRange,
  matchesBilingualSearch,
  normalizeSearchText,
  parseStudentExcelRows,
  validateRoleConfiguration,
} from './schoolRules';
import { addDaysToDateStr, getRecentMonths, getSchoolWeekBounds } from './riyadhTime';
import type {
  BehaviorLog,
  ClassSection,
  Division,
  Grade,
  Profile,
  Section,
  StaffClassAssignment,
  Student,
  Substitution,
  TeacherAbsence,
  TimetableSlot,
} from '../types/database';

test('isAllowedSchoolEmail enforces official school domain dynamically', () => {
  assert.equal(isAllowedSchoolEmail('teacher@meis.sch.sa', 'meis.sch.sa'), true);
  assert.equal(isAllowedSchoolEmail('Teacher@MEIS.SCH.SA', 'meis.sch.sa'), true);
  assert.equal(isAllowedSchoolEmail('user@gmail.com', 'meis.sch.sa'), false);
  assert.equal(isAllowedSchoolEmail('@meis.sch.sa', 'meis.sch.sa'), false);
});

test('checkTimetableConflict checks ONLY day_of_week and period_number (ignores clock times)', () => {
  const existing: TimetableSlot[] = [
    {
      id: 'slot-1',
      teacher_id: 't1',
      class_section_id: 'cs-4c',
      subject_id: 'sub-eng',
      day_of_week: 0,
      period_number: 4,
    },
  ];

  // Teacher t1 cannot take a second class in Period 4 on Sunday (even if Upper vs Lower grade)
  const teacherConflict = checkTimetableConflict(existing, {
    teacher_id: 't1',
    class_section_id: 'cs-7d',
    day_of_week: 0,
    period_number: 4,
  });
  assert.equal(teacherConflict.hasConflict, true);
  assert.equal(teacherConflict.reason, 'teacher_busy');

  // Another teacher t2 cannot claim Grade 4 - C in Period 4 on Sunday
  const classConflict = checkTimetableConflict(existing, {
    teacher_id: 't2',
    class_section_id: 'cs-4c',
    day_of_week: 0,
    period_number: 4,
  });
  assert.equal(classConflict.hasConflict, true);
  assert.equal(classConflict.reason, 'class_occupied');

  // Different period or different day has no conflict
  const okDifferentPeriod = checkTimetableConflict(existing, {
    teacher_id: 't1',
    class_section_id: 'cs-7d',
    day_of_week: 0,
    period_number: 5,
  });
  assert.equal(okDifferentPeriod.hasConflict, false);
});

test('getAvailableSubstitutes filters busy/absent teachers and counts monthly substitutions', () => {
  const profiles: Profile[] = [
    {
      id: 't-absent',
      email: 'a@meis.sch.sa',
      name_en: 'Absent Teacher',
      name_ar: 'معلم غائب',
      roles: ['teacher'],
      active_role: 'teacher',
      primary_subject_id: null,
      division_id: null,
      is_onboarded: true,
      is_dummy: true,
      dummy_password: null,
    },
    {
      id: 't-busy',
      email: 'b@meis.sch.sa',
      name_en: 'Busy Teacher',
      name_ar: 'معلم مشغول',
      roles: ['teacher'],
      active_role: 'teacher',
      primary_subject_id: null,
      division_id: null,
      is_onboarded: true,
      is_dummy: true,
      dummy_password: null,
    },
    {
      id: 't-free-low',
      email: 'c@meis.sch.sa',
      name_en: 'Free Teacher Low',
      name_ar: 'معلم متاح ١',
      roles: ['teacher'],
      active_role: 'teacher',
      primary_subject_id: null,
      division_id: null,
      is_onboarded: true,
      is_dummy: true,
      dummy_password: null,
    },
    {
      id: 't-free-max',
      email: 'd@meis.sch.sa',
      name_en: 'Free Teacher Maxed',
      name_ar: 'معلم متاح ٢',
      roles: ['teacher'],
      active_role: 'teacher',
      primary_subject_id: null,
      division_id: null,
      is_onboarded: true,
      is_dummy: true,
      dummy_password: null,
    },
  ];

  const slots: TimetableSlot[] = [
    {
      id: 's1',
      teacher_id: 't-busy',
      class_section_id: 'cs-5c',
      subject_id: 'math',
      day_of_week: 1,
      period_number: 4,
    },
  ];

  const absences: TeacherAbsence[] = [
    {
      id: 'abs-1',
      teacher_id: 't-absent',
      absence_date: '2026-11-16',
      reason: 'Sick',
      marked_by: 'admin',
    },
  ];

  const substitutions: Substitution[] = [
    {
      id: 'sub-1',
      absence_id: 'abs-prev',
      absence_date: '2026-11-02',
      period_number: 1,
      class_section_id: 'cs-4c',
      substitute_teacher_id: 't-free-max',
      assigned_by: 'admin',
    },
    {
      id: 'sub-2',
      absence_id: 'abs-prev2',
      absence_date: '2026-11-05',
      period_number: 2,
      class_section_id: 'cs-4c',
      substitute_teacher_id: 't-free-max',
      assigned_by: 'admin',
    },
  ];

  const candidates = getAvailableSubstitutes({
    profiles,
    timetableSlots: slots,
    absences,
    substitutions,
    targetDate: '2026-11-16',
    dayOfWeek: 1,
    periodNumber: 4,
    absentTeacherId: 't-absent',
    maxMonthlySubstitutions: 2,
  });

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].teacher.id, 't-free-low');
  assert.equal(candidates[0].monthlyCount, 0);
  assert.equal(candidates[0].reachedLimit, false);
  assert.equal(candidates[1].teacher.id, 't-free-max');
  assert.equal(candidates[1].monthlyCount, 2);
  assert.equal(candidates[1].reachedLimit, true);
});

test('isDateInRange validates single dates and date ranges accurately', () => {
  assert.equal(isDateInRange('2026-11-16', '2026-11-16', '2026-11-16'), true);
  assert.equal(isDateInRange('2026-11-16', '2026-11-15', '2026-11-20'), true);
  assert.equal(isDateInRange('2026-11-21', '2026-11-15', '2026-11-20'), false);
});

test('computeBehaviorWatchlist filters by timeframe and flags threshold exceedance', () => {
  const students: Student[] = [
    {
      id: 'st-1',
      iqama_id: '2400000001',
      name_ar: 'طالب ١',
      name_en: 'Student One',
      father_mobile: '966500000001',
      grade_id: 'g5',
      section_id: 'sc',
      class_section_id: 'cs5c',
    },
  ];
  const logs: BehaviorLog[] = [
    {
      id: 'l1',
      student_id: 'st-1',
      teacher_id: 't1',
      class_section_id: 'cs5c',
      subject_id: 'eng',
      behavior_category_id: 'cat1',
      period_number: 1,
      notes: null,
      created_at: '2026-11-16T08:00:00Z',
    },
    {
      id: 'l2',
      student_id: 'st-1',
      teacher_id: 't1',
      class_section_id: 'cs5c',
      subject_id: 'eng',
      behavior_category_id: 'cat1',
      period_number: 2,
      notes: null,
      created_at: '2026-11-16T09:00:00Z',
    },
    {
      id: 'l3',
      student_id: 'st-1',
      teacher_id: 't1',
      class_section_id: 'cs5c',
      subject_id: 'eng',
      behavior_category_id: 'cat1',
      period_number: 3,
      notes: null,
      created_at: '2026-10-10T09:00:00Z',
    },
  ];

  const todayWatchlist = computeBehaviorWatchlist({
    logs,
    students,
    timeframe: 'today',
    riyadhToday: '2026-11-16',
    threshold: 3,
  });
  assert.equal(todayWatchlist[0].incidentCount, 2);
  assert.equal(todayWatchlist[0].exceedsThreshold, false);

  const allWatchlist = computeBehaviorWatchlist({
    logs,
    students,
    timeframe: 'all',
    riyadhToday: '2026-11-16',
    threshold: 3,
  });
  assert.equal(allWatchlist[0].incidentCount, 3);
  assert.equal(allWatchlist[0].exceedsThreshold, true);
});

test('parseStudentExcelRows maps 6-column Excel rows and normalizes mobile', () => {
  const grades: Grade[] = [
    { id: 'g5', division_id: 'low', grade_number: 5, name_en: 'Grade 5', name_ar: 'الصف الخامس', sort_order: 5 },
  ];
  const sections: Section[] = [
    { id: 'sc', code: 'C', name_en: 'Section C', name_ar: 'شعبة C', sort_order: 1 },
  ];
  const classSections: ClassSection[] = [
    { id: 'cs5c', grade_id: 'g5', section_id: 'sc', display_name_en: 'Grade 5 - C', display_name_ar: 'الصف الخامس - C', is_active: true },
  ];

  const result = parseStudentExcelRows(
    [
      ['Arabic Name', 'English Name', 'ID/Iqama', 'Father Mobile', 'Grade', 'Section'],
      ['أحمد علي', 'Ahmed Ali', '2455512345', '0551234567', 'Grade 5', 'C'],
      ['ناقص', 'Bad Grade', '2455599999', '966501112222', 'Grade 99', 'C'],
    ],
    grades,
    sections,
    classSections
  );

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].iqama_id, '2455512345');
  assert.equal(result.validRows[0].father_mobile, '966551234567');
  assert.equal(result.validRows[0].class_section_id, 'cs5c');
  assert.equal(result.errors.length, 1);
});

test('buildWhatsAppUrl creates encoded wa.me link', () => {
  const url = buildWhatsAppUrl('0559569546', 'Hello Parent');
  assert.equal(url, 'https://wa.me/966559569546?text=Hello%20Parent');
});

test('getRoleScope restricts teacher/supervisor strictly to assigned classes, principal/academic_supervisor to division, and admin unrestricted', () => {
  const divisions: Division[] = [
    { id: 'div-low', code: 'LOWER', name_en: 'Lower Grades', name_ar: 'الابتدائية', sort_order: 1, is_active: true },
    { id: 'div-up', code: 'UPPER', name_en: 'Upper Grades', name_ar: 'المتوسطة والثانوية', sort_order: 2, is_active: true },
  ];
  const grades: Grade[] = [
    { id: 'g4', division_id: 'div-low', grade_number: 4, name_en: 'Grade 4', name_ar: 'الصف الرابع', sort_order: 4 },
    { id: 'g5', division_id: 'div-low', grade_number: 5, name_en: 'Grade 5', name_ar: 'الصف الخامس', sort_order: 5 },
    { id: 'g10', division_id: 'div-up', grade_number: 10, name_en: 'Grade 10', name_ar: 'الصف العاشر', sort_order: 10 },
  ];
  const sections: Section[] = [
    { id: 'sc', code: 'C', name_en: 'Section C', name_ar: 'C', sort_order: 1 },
    { id: 'sd', code: 'D', name_en: 'Section D', name_ar: 'D', sort_order: 2 },
  ];
  const classSections: ClassSection[] = [
    { id: 'cs-4c', grade_id: 'g4', section_id: 'sc', display_name_en: 'Grade 4 - C', display_name_ar: '4 - C', is_active: true },
    { id: 'cs-4d', grade_id: 'g4', section_id: 'sd', display_name_en: 'Grade 4 - D', display_name_ar: '4 - D', is_active: true },
    { id: 'cs-5c', grade_id: 'g5', section_id: 'sc', display_name_en: 'Grade 5 - C', display_name_ar: '5 - C', is_active: true },
    { id: 'cs-10c', grade_id: 'g10', section_id: 'sc', display_name_en: 'Grade 10 - C', display_name_ar: '10 - C', is_active: true },
  ];
  const students: Student[] = [
    { id: 's1', iqama_id: '101', name_ar: 'ط1', name_en: 'S1', father_mobile: '966500000001', grade_id: 'g4', section_id: 'sc', class_section_id: 'cs-4c' },
    { id: 's2', iqama_id: '102', name_ar: 'ط2', name_en: 'S2', father_mobile: '966500000002', grade_id: 'g5', section_id: 'sc', class_section_id: 'cs-5c' },
    { id: 's3', iqama_id: '103', name_ar: 'ط3', name_en: 'S3', father_mobile: '966500000003', grade_id: 'g10', section_id: 'sc', class_section_id: 'cs-10c' },
  ];
  const teacher1: Profile = {
    id: 't1',
    email: 'teacher1@meis.sch.sa',
    name_en: 'teacher1',
    name_ar: 'teacher1',
    roles: ['teacher'],
    active_role: 'teacher',
    primary_subject_id: 'math',
    division_id: 'div-low',
    is_onboarded: true,
    is_dummy: true,
    dummy_password: '123',
  };
  const staffAssignments: StaffClassAssignment[] = [
    { id: 'a1', user_id: 't1', class_section_id: 'cs-4c', subject_id: 'math', assignment_type: 'teacher' },
    { id: 'a2', user_id: 't1', class_section_id: 'cs-4d', subject_id: 'math', assignment_type: 'teacher' },
  ];

  // Teacher with division_id=div-low but ONLY Grade 4 C & D assigned must NOT see Grade 5 or Grade 10
  const teacherScope = getRoleScope({
    profile: teacher1,
    divisions,
    grades,
    sections,
    classSections,
    staffAssignments,
    students,
  });
  assert.deepEqual(teacherScope.classSections.map((c) => c.id), ['cs-4c', 'cs-4d']);
  assert.deepEqual(teacherScope.grades.map((g) => g.id), ['g4']);
  assert.deepEqual(teacherScope.students.map((s) => s.id), ['s1']);

  // Lower Principal sees all Lower grades (Grade 4 & Grade 5) but NOT Grade 10
  const lowerPrincipal: Profile = { ...teacher1, id: 'p1', roles: ['principal'], active_role: 'principal', division_id: 'div-low' };
  const principalScope = getRoleScope({
    profile: lowerPrincipal,
    divisions,
    grades,
    sections,
    classSections,
    staffAssignments,
    students,
  });
  assert.deepEqual(principalScope.grades.map((g) => g.id), ['g4', 'g5']);
  assert.deepEqual(principalScope.students.map((s) => s.id), ['s1', 's2']);

  // Admin sees everything
  const admin: Profile = { ...teacher1, id: 'adm', roles: ['admin'], active_role: 'admin', division_id: null };
  const adminScope = getRoleScope({
    profile: admin,
    divisions,
    grades,
    sections,
    classSections,
    staffAssignments,
    students,
  });
  assert.equal(adminScope.isUnrestricted, true);
  assert.equal(adminScope.students.length, 3);

  // filterTeachersInScope isolates Lower teachers when in Lower Principal scope
  const upperTeacher: Profile = { ...teacher1, id: 't2', division_id: 'div-up' };
  const upperAssign: StaffClassAssignment = { id: 'a3', user_id: 't2', class_section_id: 'cs-10c', subject_id: 'math', assignment_type: 'teacher' };
  const scopedTeachers = filterTeachersInScope({
    profiles: [teacher1, upperTeacher],
    scope: principalScope,
    staffAssignments: [...staffAssignments, upperAssign],
  });
  assert.deepEqual(scopedTeachers.map((t) => t.id), ['t1']);
});

test('buildStaffAssignmentRows guarantees non-null assignment_type across all roles and multi-role combos', () => {
  const teacherRows = buildStaffAssignmentRows({
    userId: 'u1',
    roles: ['teacher'],
    classSectionIds: ['cs-8c', 'cs-8e', 'cs-8c'],
    primarySubjectId: 'sub-cs',
  });
  assert.equal(teacherRows.length, 2);
  assert.deepEqual(teacherRows[0], {
    user_id: 'u1',
    class_section_id: 'cs-8c',
    subject_id: 'sub-cs',
    assignment_type: 'teacher',
  });

  const supRows = buildStaffAssignmentRows({
    userId: 'u2',
    roles: ['supervisor'],
    classSectionIds: ['cs-4c'],
    primarySubjectId: 'sub-cs',
  });
  assert.deepEqual(supRows, [
    { user_id: 'u2', class_section_id: 'cs-4c', subject_id: null, assignment_type: 'supervisor' },
  ]);

  const multiRows = buildStaffAssignmentRows({
    userId: 'u3',
    roles: ['teacher', 'supervisor'],
    classSectionIds: ['cs-8c'],
    primarySubjectId: 'sub-cs',
  });
  assert.equal(multiRows.length, 2);
  assert.equal(multiRows[0].assignment_type, 'teacher');
  assert.equal(multiRows[1].assignment_type, 'supervisor');

  const principalRows = buildStaffAssignmentRows({
    userId: 'u4',
    roles: ['principal', 'academic_supervisor'],
    classSectionIds: ['cs-8c'],
    primarySubjectId: null,
  });
  assert.deepEqual(principalRows, []);
});

test('validateRoleConfiguration validates role-specific requirements', () => {
  assert.ok(
    validateRoleConfiguration({
      roles: ['teacher'],
      primarySubjectId: '',
      divisionId: '',
      classSectionIds: ['cs-8c'],
      lang: 'en',
    })
  );
  assert.ok(
    validateRoleConfiguration({
      roles: ['teacher'],
      primarySubjectId: 'sub-cs',
      divisionId: '',
      classSectionIds: [],
      lang: 'en',
    })
  );
  assert.equal(
    validateRoleConfiguration({
      roles: ['teacher'],
      primarySubjectId: 'sub-cs',
      divisionId: '',
      classSectionIds: ['cs-8c', 'cs-8e', 'cs-8j'],
      lang: 'en',
    }),
    null
  );
  assert.ok(
    validateRoleConfiguration({
      roles: ['supervisor'],
      primarySubjectId: '',
      divisionId: '',
      classSectionIds: [],
      lang: 'en',
    })
  );
  assert.ok(
    validateRoleConfiguration({
      roles: ['principal'],
      primarySubjectId: '',
      divisionId: '',
      classSectionIds: [],
      lang: 'en',
    })
  );
  assert.equal(
    validateRoleConfiguration({
      roles: ['academic_supervisor'],
      primarySubjectId: '',
      divisionId: 'div-up',
      classSectionIds: [],
      lang: 'en',
    }),
    null
  );
});

test('getSchoolWeekBounds returns Sunday through Thursday/Saturday for any date', () => {
  // Monday 2026-11-16 -> Sun 2026-11-15 .. Thu 2026-11-19 .. Sat 2026-11-21
  const bounds = getSchoolWeekBounds('2026-11-16');
  assert.equal(bounds.weekStart, '2026-11-15');
  assert.equal(bounds.weekEndThu, '2026-11-19');
  assert.equal(bounds.weekEndSat, '2026-11-21');
  assert.equal(addDaysToDateStr('2026-11-15', 7), '2026-11-22');
});

test('matchesBilingualSearch searches both Arabic and English names with Arabic normalization', () => {
  assert.equal(normalizeSearchText('أَحْمَد إِبْرَاهِيم'), 'احمد ابراهيم');
  // Matches Arabic regardless of Hamza/diacritics
  assert.equal(
    matchesBilingualSearch('احمد', 'Ahmed Ibrahim', 'أحمد إبراهيم', 'ahmed@meis.sch.sa'),
    true
  );
  // Matches English case-insensitively
  assert.equal(
    matchesBilingualSearch('ibrahim', 'Ahmed Ibrahim', 'أحمد إبراهيم', 'ahmed@meis.sch.sa'),
    true
  );
  // Multi-token match across fields
  assert.equal(
    matchesBilingualSearch('ahmed إبراهيم', 'Ahmed Ibrahim', 'أحمد إبراهيم'),
    true
  );
  assert.equal(
    matchesBilingualSearch('khalid', 'Ahmed Ibrahim', 'أحمد إبراهيم'),
    false
  );
  assert.equal(matchesBilingualSearch('   ', 'Ahmed Ibrahim', 'أحمد إبراهيم'), true);
});

test('getBehaviorLevel maps 0 to green, 1..5 to orange, and >5 to red', () => {
  assert.equal(getBehaviorLevel(0), 'green');
  assert.equal(getBehaviorLevel(1), 'orange');
  assert.equal(getBehaviorLevel(5), 'orange');
  assert.equal(getBehaviorLevel(6), 'red');
  assert.equal(getBehaviorLevel(12), 'red');
});

test('getMonthlyClassBehaviorRows aggregates class students for target month only', () => {
  const students: Student[] = [
    { id: 's1', iqama_id: '101', name_ar: 'طالب 1', name_en: 'Adam', father_mobile: '966500000001', grade_id: 'g4', section_id: 'sa', class_section_id: 'cs-4a' },
    { id: 's2', iqama_id: '102', name_ar: 'طالب 2', name_en: 'Bilal', father_mobile: '966500000002', grade_id: 'g4', section_id: 'sa', class_section_id: 'cs-4a' },
    { id: 's3', iqama_id: '103', name_ar: 'طالب 3', name_en: 'Other Class', father_mobile: '966500000003', grade_id: 'g4', section_id: 'sb', class_section_id: 'cs-4b' },
  ];
  const logs: BehaviorLog[] = [
    { id: 'b1', student_id: 's1', teacher_id: 't1', class_section_id: 'cs-4a', subject_id: null, behavior_category_id: 'c1', period_number: 1, notes: null, created_at: '2026-11-10T09:00:00Z' },
    { id: 'b2', student_id: 's1', teacher_id: 't2', class_section_id: 'cs-4a', subject_id: null, behavior_category_id: 'c2', period_number: 2, notes: null, created_at: '2026-11-12T10:00:00Z' },
    { id: 'b3', student_id: 's1', teacher_id: 't1', class_section_id: 'cs-4a', subject_id: null, behavior_category_id: 'c1', period_number: 3, notes: null, created_at: '2026-10-20T10:00:00Z' },
  ];

  const novRows = getMonthlyClassBehaviorRows({
    students,
    logs,
    classSectionId: 'cs-4a',
    monthStr: '2026-11',
    lang: 'en',
  });
  assert.equal(novRows.length, 2);
  assert.equal(novRows[0].student.id, 's1');
  assert.equal(novRows[0].count, 2);
  assert.equal(novRows[0].level, 'orange');
  assert.equal(novRows[1].student.id, 's2');
  assert.equal(novRows[1].count, 0);
  assert.equal(novRows[1].level, 'green');

  const octRows = getMonthlyClassBehaviorRows({
    students,
    logs,
    classSectionId: 'cs-4a',
    monthStr: '2026-10',
    lang: 'en',
  });
  assert.equal(octRows[0].count, 1);
  assert.equal(octRows[0].level, 'orange');
});

test('filterBehaviorLogsForReport isolates teacher-only logs and date ranges', () => {
  const logs: BehaviorLog[] = [
    { id: 'b1', student_id: 's1', teacher_id: 't1', class_section_id: 'cs-4a', subject_id: null, behavior_category_id: 'c1', period_number: 1, notes: null, created_at: '2026-11-05T08:00:00Z' },
    { id: 'b2', student_id: 's1', teacher_id: 't2', class_section_id: 'cs-4a', subject_id: null, behavior_category_id: 'c1', period_number: 2, notes: null, created_at: '2026-11-10T08:00:00Z' },
    { id: 'b3', student_id: 's2', teacher_id: 't1', class_section_id: 'cs-4b', subject_id: null, behavior_category_id: 'c2', period_number: 3, notes: null, created_at: '2026-11-15T08:00:00Z' },
  ];

  const t1Logs = filterBehaviorLogsForReport({
    logs,
    fromDate: '2026-11-01',
    toDate: '2026-11-12',
    teacherOnlyId: 't1',
  });
  assert.deepEqual(t1Logs.map((l) => l.id), ['b1']);

  const classLogsAllTeachers = filterBehaviorLogsForReport({
    logs,
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    classSectionId: 'cs-4a',
  });
  assert.deepEqual(classLogsAllTeachers.map((l) => l.id), ['b2', 'b1']);
});

test('getRecentMonths returns current month first followed by previous months', () => {
  const months = getRecentMonths(new Date('2026-11-17T10:00:00Z'), 3);
  assert.equal(months.length, 3);
  assert.equal(months[0].monthStr, '2026-11');
  assert.equal(months[0].isCurrent, true);
  assert.equal(months[1].monthStr, '2026-10');
  assert.equal(months[1].isCurrent, false);
  assert.equal(months[2].monthStr, '2026-09');
});

