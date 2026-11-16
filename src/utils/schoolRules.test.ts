import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWhatsAppUrl,
  checkTimetableConflict,
  computeBehaviorWatchlist,
  getAvailableSubstitutes,
  isAllowedSchoolEmail,
  isDateInRange,
  parseStudentExcelRows,
} from './schoolRules';
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
