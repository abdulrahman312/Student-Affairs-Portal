import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { Substitution, TeacherAbsence, TimetableSlot } from '../types/database';
import {
  DAY_NAMES,
  getLocalizedDisplayName,
  getLocalizedName,
  tr,
} from '../utils/i18n';
import { exportDailyAbsencesPdf } from '../utils/pdfExport';
import {
  addDaysToDateStr,
  getIsoWeekdayFromDateStr,
  getRiyadhParts,
  getSchoolWeekBounds,
} from '../utils/riyadhTime';
import {
  checkTimetableConflict,
  filterTeachersInScope,
  getAvailableSubstitutes,
  getRoleScope,
  matchesBilingualSearch,
} from '../utils/schoolRules';

const DAYS = [0, 1, 2, 3, 4]; // Sun - Thu
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export const TimetableSubstitutionModule: React.FC = () => {
  const {
    lang,
    userProfile,
    schoolSettings,
    divisions,
    grades,
    sections,
    classSections,
    subjects,
    profiles,
    staffAssignments,
    students,
  } = useApp();

  const riyadhToday = getRiyadhParts(new Date()).dateStr;

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [absences, setAbsences] = useState<TeacherAbsence[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(userProfile?.id || '');
  const [ttTeacherSearch, setTtTeacherSearch] = useState('');
  const [editingCell, setEditingCell] = useState<{ day: number; period: number } | null>(null);
  const [cellClassId, setCellClassId] = useState('');
  const [cellSubjectId, setCellSubjectId] = useState('');
  const [cellError, setCellError] = useState<string | null>(null);

  // Absence & Substitution state
  const [absenceDate, setAbsenceDate] = useState(riyadhToday);
  const [activeDayDate, setActiveDayDate] = useState(riyadhToday);
  const [weekAnchorDate, setWeekAnchorDate] = useState(riyadhToday);
  const [absenceViewMode, setAbsenceViewMode] = useState<'day' | 'week'>('day');
  const [absenceTeacherId, setAbsenceTeacherId] = useState(userProfile?.id || '');
  const [absenceTeacherSearch, setAbsenceTeacherSearch] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceError, setAbsenceError] = useState<string | null>(null);
  const [exportingDayPdf, setExportingDayPdf] = useState(false);

  const [assignModal, setAssignModal] = useState<{
    absence: TeacherAbsence;
    slot: TimetableSlot;
  } | null>(null);
  const [subSearchQuery, setSubSearchQuery] = useState('');

  const activeRole = userProfile?.active_role || 'teacher';
  const canManageAll = activeRole !== 'teacher';
  const showTimetableEditor = activeRole === 'teacher' || activeRole === 'admin';
  const maxSubs = schoolSettings?.max_monthly_substitutions ?? 8;

  const scope = useMemo(
    () =>
      getRoleScope({
        profile: userProfile,
        divisions,
        grades,
        sections,
        classSections,
        staffAssignments,
        students,
      }),
    [userProfile, divisions, grades, sections, classSections, staffAssignments, students]
  );

  const teachersList = useMemo(
    () => filterTeachersInScope({ profiles, scope, staffAssignments, timetableSlots: slots }),
    [profiles, scope, staffAssignments, slots]
  );

  const filteredTtTeachers = useMemo(() => {
    if (!ttTeacherSearch.trim()) return teachersList;
    return teachersList.filter((t) =>
      matchesBilingualSearch(ttTeacherSearch, t.name_en, t.name_ar, t.email)
    );
  }, [teachersList, ttTeacherSearch]);

  const filteredAbsenceTeachers = useMemo(() => {
    if (!absenceTeacherSearch.trim()) return teachersList;
    return teachersList.filter((t) =>
      matchesBilingualSearch(absenceTeacherSearch, t.name_en, t.name_ar, t.email)
    );
  }, [teachersList, absenceTeacherSearch]);

  const loadAll = async () => {
    setLoading(true);
    const [slotRes, absRes, subRes] = await Promise.all([
      supabase.from('timetable_slots').select('*'),
      supabase.from('teacher_absences').select('*').order('absence_date', { ascending: false }),
      supabase.from('substitutions').select('*').order('created_at', { ascending: false }),
    ]);
    if (slotRes.data) setSlots(slotRes.data as TimetableSlot[]);
    if (absRes.data) setAbsences(absRes.data as TeacherAbsence[]);
    if (subRes.data) setSubstitutions(subRes.data as Substitution[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (userProfile) {
      setSelectedTeacherId(
        userProfile.roles.includes('teacher') && activeRole === 'teacher'
          ? userProfile.id
          : teachersList[0]?.id || userProfile.id
      );
      setAbsenceTeacherId(
        canManageAll
          ? teachersList[0]?.id || userProfile.id
          : userProfile.id
      );
    }
  }, [userProfile, activeRole, canManageAll, teachersList]);

  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const viewingTeacherId = canManageAll ? selectedTeacherId || userProfile?.id || '' : userProfile?.id || '';
  const viewingTeacher = profMap.get(viewingTeacherId);

  const viewingTeacherClassSections = useMemo(() => {
    if (!viewingTeacherId) return [];
    const assigned = staffAssignments.filter(
      (a) => a.user_id === viewingTeacherId && a.assignment_type === 'teacher'
    );
    const fallbackAssigned =
      assigned.length > 0
        ? assigned
        : staffAssignments.filter((a) => a.user_id === viewingTeacherId);

    if (fallbackAssigned.length > 0) {
      const allowedIds = new Set(fallbackAssigned.map((a) => a.class_section_id));
      return classSections.filter((cs) => allowedIds.has(cs.id));
    }

    if (viewingTeacher?.division_id) {
      const divGradeIds = new Set(
        grades.filter((g) => g.division_id === viewingTeacher.division_id).map((g) => g.id)
      );
      return classSections.filter((cs) => divGradeIds.has(cs.grade_id));
    }

    return scope.isUnrestricted ? classSections : scope.classSections;
  }, [viewingTeacherId, viewingTeacher, staffAssignments, classSections, grades, scope]);

  const viewingTeacherSubjects = useMemo(() => {
    if (activeRole === 'teacher' && viewingTeacher?.primary_subject_id) {
      const primary = subjects.find((s) => s.id === viewingTeacher.primary_subject_id);
      if (primary) return [primary];
    }
    return subjects;
  }, [activeRole, viewingTeacher, subjects]);

  const teacherSlotsMap = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    for (const s of slots) {
      if (s.teacher_id === viewingTeacherId) {
        map.set(`${s.day_of_week}-${s.period_number}`, s);
      }
    }
    return map;
  }, [slots, viewingTeacherId]);

  const openCellEditor = (day: number, period: number) => {
    if (!canManageAll && viewingTeacherId !== userProfile?.id) return;
    const existing = teacherSlotsMap.get(`${day}-${period}`);
    setEditingCell({ day, period });
    setCellClassId(existing?.class_section_id || '');
    setCellSubjectId(
      existing?.subject_id || viewingTeacher?.primary_subject_id || subjects[0]?.id || ''
    );
    setCellError(null);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell || !viewingTeacherId) return;
    setCellError(null);

    if (!cellClassId || !cellSubjectId) {
      setCellError(
        lang === 'ar' ? 'يرجى اختيار الفصل والمادة' : 'Please select a class section and subject'
      );
      return;
    }

    const existing = teacherSlotsMap.get(`${editingCell.day}-${editingCell.period}`);

    // Period-number-only conflict detection (ignoring Lower/Upper bell clock times)
    const conflict = checkTimetableConflict(slots, {
      id: existing?.id,
      teacher_id: viewingTeacherId,
      class_section_id: cellClassId,
      day_of_week: editingCell.day,
      period_number: editingCell.period,
    });

    if (conflict.hasConflict) {
      const otherTeacher = conflict.conflictingSlot
        ? profMap.get(conflict.conflictingSlot.teacher_id)
        : undefined;
      setCellError(
        conflict.reason === 'class_occupied'
          ? lang === 'ar'
            ? `تعارض في الحصة ${editingCell.period}: هذا الفصل محجوز بالفعل للمعلم (${getLocalizedName(otherTeacher, lang)})`
            : `Period ${editingCell.period} conflict: This class section is already claimed by ${getLocalizedName(otherTeacher, lang)}`
          : lang === 'ar'
            ? `تعارض في الحصة ${editingCell.period}: المعلم لديه حصة أخرى في نفس التوقيت`
            : `Period ${editingCell.period} conflict: Teacher already has a class in this period`
      );
      return;
    }

    if (existing) {
      const { error } = await supabase
        .from('timetable_slots')
        .update({ class_section_id: cellClassId, subject_id: cellSubjectId })
        .eq('id', existing.id);
      if (error) {
        setCellError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('timetable_slots').insert({
        teacher_id: viewingTeacherId,
        class_section_id: cellClassId,
        subject_id: cellSubjectId,
        day_of_week: editingCell.day,
        period_number: editingCell.period,
      });
      if (error) {
        setCellError(error.message);
        return;
      }
    }

    setEditingCell(null);
    await loadAll();
  };

  const handleClearSlot = async () => {
    if (!editingCell) return;
    const existing = teacherSlotsMap.get(`${editingCell.day}-${editingCell.period}`);
    if (existing) {
      await supabase.from('timetable_slots').delete().eq('id', existing.id);
    }
    setEditingCell(null);
    await loadAll();
  };

  const handleMarkAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setAbsenceError(null);

    const targetTeacherId = canManageAll ? absenceTeacherId : userProfile.id;
    if (!targetTeacherId || !absenceDate) return;

    const already = absences.find(
      (a) => a.teacher_id === targetTeacherId && a.absence_date === absenceDate
    );
    if (already) {
      setAbsenceError(
        lang === 'ar'
          ? 'هذا المعلم مسجل غيابه بالفعل في هذا التاريخ'
          : 'This teacher is already marked absent on this date'
      );
      return;
    }

    const { error } = await supabase.from('teacher_absences').insert({
      teacher_id: targetTeacherId,
      absence_date: absenceDate,
      reason: absenceReason.trim() || null,
      marked_by: userProfile.id,
    });
    if (error) {
      setAbsenceError(error.message);
      return;
    }

    setAbsenceReason('');
    await loadAll();
  };

  const handleDeleteAbsence = async (absenceId: string) => {
    await supabase.from('substitutions').delete().eq('absence_id', absenceId);
    await supabase.from('teacher_absences').delete().eq('id', absenceId);
    await loadAll();
  };

  const weekBounds = useMemo(() => getSchoolWeekBounds(weekAnchorDate), [weekAnchorDate]);

  const activeDayWeekday = getIsoWeekdayFromDateStr(activeDayDate);
  const activeDayWeekdayLabel = DAY_NAMES[activeDayWeekday]
    ? DAY_NAMES[activeDayWeekday][lang]
    : lang === 'ar'
      ? 'عطلة نهاية الأسبوع'
      : 'Weekend';

  const roleScopedAbsences = useMemo(() => {
    if (!canManageAll) {
      return absences.filter((a) => a.teacher_id === userProfile?.id);
    }
    if (scope.isUnrestricted) return absences;
    const allowedIds = new Set(teachersList.map((t) => t.id));
    return absences.filter((a) => allowedIds.has(a.teacher_id));
  }, [absences, canManageAll, userProfile, scope.isUnrestricted, teachersList]);

  const displayedAbsences = useMemo(() => {
    const filtered =
      absenceViewMode === 'day'
        ? roleScopedAbsences.filter((a) => a.absence_date === activeDayDate)
        : roleScopedAbsences.filter(
            (a) =>
              a.absence_date >= weekBounds.weekStart &&
              a.absence_date <= weekBounds.weekEndSat
          );
    return filtered.slice().sort((a, b) => a.absence_date.localeCompare(b.absence_date));
  }, [roleScopedAbsences, absenceViewMode, activeDayDate, weekBounds]);

  const handleExportDayPdf = async () => {
    const dayAbsences = roleScopedAbsences.filter((a) => a.absence_date === activeDayDate);
    setExportingDayPdf(true);
    try {
      await exportDailyAbsencesPdf({
        targetDate: activeDayDate,
        absences: dayAbsences,
        substitutions,
        timetableSlots: slots,
        classSections,
        subjects,
        profiles,
        settings: schoolSettings,
      });
    } finally {
      setExportingDayPdf(false);
    }
  };

  const mySubstitutionsToday = useMemo(() => {
    if (!userProfile) return [];
    return substitutions.filter(
      (s) => s.substitute_teacher_id === userProfile.id && s.absence_date >= riyadhToday
    );
  }, [substitutions, userProfile, riyadhToday]);

  const handleAssignSubstitute = async (substituteTeacherId: string) => {
    if (!assignModal || !userProfile) return;
    const { absence, slot } = assignModal;

    // Remove previous substitution if reassigning same absence/period
    await supabase
      .from('substitutions')
      .delete()
      .eq('absence_date', absence.absence_date)
      .eq('period_number', slot.period_number)
      .eq('class_section_id', slot.class_section_id);

    const { error } = await supabase.from('substitutions').insert({
      absence_id: absence.id,
      absence_date: absence.absence_date,
      period_number: slot.period_number,
      class_section_id: slot.class_section_id,
      original_teacher_id: absence.teacher_id,
      substitute_teacher_id: substituteTeacherId,
      assigned_by: userProfile.id,
    });

    if (error) {
      setAbsenceError(error.message);
      return;
    }

    setAssignModal(null);
    await loadAll();
  };

  const handleRemoveSubstitution = async (subId: string) => {
    await supabase.from('substitutions').delete().eq('id', subId);
    await loadAll();
  };

  const candidatesForModal = useMemo(() => {
    if (!assignModal) return [];
    const dow = getIsoWeekdayFromDateStr(assignModal.absence.absence_date);
    return getAvailableSubstitutes({
      profiles,
      timetableSlots: slots,
      absences,
      substitutions,
      targetDate: assignModal.absence.absence_date,
      dayOfWeek: dow,
      periodNumber: assignModal.slot.period_number,
      absentTeacherId: assignModal.absence.teacher_id,
      maxMonthlySubstitutions: maxSubs,
    });
  }, [assignModal, profiles, slots, absences, substitutions, maxSubs]);

  const filteredCandidatesForModal = useMemo(() => {
    if (!subSearchQuery.trim()) return candidatesForModal;
    return candidatesForModal.filter((cand) => {
      const sub = cand.teacher.primary_subject_id
        ? subMap.get(cand.teacher.primary_subject_id)
        : undefined;
      return matchesBilingualSearch(
        subSearchQuery,
        cand.teacher.name_en,
        cand.teacher.name_ar,
        cand.teacher.email,
        sub?.name_en,
        sub?.name_ar
      );
    });
  }, [candidatesForModal, subSearchQuery, subMap]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {showTimetableEditor
            ? lang === 'ar'
              ? 'الجدول المدرسي وحصص الانتظار'
              : 'Timetable & Period Substitutions'
            : lang === 'ar'
              ? 'غياب المعلمين وحصص الانتظار'
              : 'Teacher Absences & Substitutions'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {showTimetableEditor
            ? lang === 'ar'
              ? 'إعداد الجدول الأسبوعي (الأحد - الخميس، الحصص 1 إلى 7) مع فحص التعارض برقم الحصة، وتسجيل الغياب وتوزيع الانتظار.'
              : 'Weekly Sun–Thu (Periods 1–7) timetable with period-number conflict prevention, absence tracking, and smart substitutions.'
            : lang === 'ar'
              ? 'تسجيل غياب المعلمين وتعيين المعلمين المتاحين لحصص الانتظار حسب رقم الحصة.'
              : 'Mark teacher absences and assign available substitute teachers based on their period schedules.'}
        </p>
      </div>

      {/* Assigned Substitutions Banner for Logged-In Teacher */}
      {mySubstitutionsToday.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-amber-950 mb-2">
            {lang === 'ar' ? 'حصص الانتظار المسندة إليك' : 'Your Assigned Substitution Periods'}
          </h2>
          <div className="flex flex-wrap gap-3">
            {mySubstitutionsToday.map((s) => {
              const cs = classMap.get(s.class_section_id);
              return (
                <div
                  key={s.id}
                  className="px-3.5 py-2 rounded-xl bg-white border border-amber-200 text-xs font-semibold text-slate-900"
                >
                  <span className="font-mono">{s.absence_date}</span> ·{' '}
                  <span>{lang === 'ar' ? `الحصة ${s.period_number}` : `Period ${s.period_number}`}</span> ·{' '}
                  <strong className="text-emerald-700">{getLocalizedDisplayName(cs, lang)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Weekly Timetable Grid — Only for Teachers & System Admin */}
      {showTimetableEditor && (
      <section className="meis-glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'الجدول الأسبوعي' : 'Weekly Teaching Timetable'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'ar'
                ? 'اضغط على أي خلية لتعيين الفصل. يتم التحقق من التعارض برقم الحصة فقط.'
                : 'Click any cell to assign a class section. Conflicts are validated strictly by day and period number.'}
            </p>
          </div>

          {canManageAll && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
                <input
                  type="text"
                  value={ttTeacherSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTtTeacherSearch(val);
                    const firstMatch = teachersList.find((t) =>
                      matchesBilingualSearch(val, t.name_en, t.name_ar, t.email)
                    );
                    if (firstMatch) setSelectedTeacherId(firstMatch.id);
                  }}
                  placeholder={lang === 'ar' ? 'بحث بالمعلم...' : 'Search teacher (EN/AR)...'}
                  className="ps-8 pe-3 py-2 rounded-xl border border-slate-200 bg-white text-xs w-48"
                />
              </div>
              <label htmlFor="tt-teacher-select" className="text-xs font-semibold text-slate-600">
                {lang === 'ar' ? 'معلم الجدول:' : 'Teacher:'}
              </label>
              <select
                id="tt-teacher-select"
                value={viewingTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
              >
                {filteredTtTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {getLocalizedName(t, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3 text-start font-semibold w-28">
                  {lang === 'ar' ? 'اليوم / الحصة' : 'Day / Period'}
                </th>
                {PERIODS.map((p) => (
                  <th key={p} className="py-2.5 px-2 text-center font-semibold">
                    {lang === 'ar' ? `الحصة ${p}` : `Period ${p}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DAYS.map((day) => (
                <tr key={day}>
                  <td className="py-2.5 px-3 font-bold text-slate-800">
                    {DAY_NAMES[day][lang]}
                  </td>
                  {PERIODS.map((period) => {
                    const slot = teacherSlotsMap.get(`${day}-${period}`);
                    const cs = slot ? classMap.get(slot.class_section_id) : undefined;
                    const sub = slot ? subMap.get(slot.subject_id) : undefined;
                    return (
                      <td key={period} className="p-1.5">
                        <button
                          type="button"
                          onClick={() => openCellEditor(day, period)}
                          className={`w-full min-h-[56px] p-2 rounded-xl border text-center transition-colors cursor-pointer ${
                            slot
                              ? 'bg-emerald-50/80 border-emerald-200 hover:bg-emerald-100/70'
                              : 'bg-slate-50/70 border-slate-200/70 hover:bg-white text-slate-400'
                          }`}
                        >
                          {slot ? (
                            <>
                              <p className="font-bold text-slate-900 truncate">
                                {getLocalizedDisplayName(cs, lang)}
                              </p>
                              <p className="text-[11px] text-emerald-700 truncate mt-0.5">
                                {getLocalizedName(sub, lang)}
                              </p>
                            </>
                          ) : (
                            <span>+</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Mark Absence & Smart Substitution Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mark Absence Card */}
        <section className="lg:col-span-4 meis-glass rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-3">
            {lang === 'ar' ? 'تسجيل غياب معلم' : 'Mark Teacher Absence'}
          </h2>
          <form onSubmit={handleMarkAbsence} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'تاريخ الغياب' : 'Absence Date'}
              </label>
              <input
                type="date"
                dir="ltr"
                required
                value={absenceDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setAbsenceDate(next);
                  if (next) {
                    setActiveDayDate(next);
                    setWeekAnchorDate(next);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            {canManageAll && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ar' ? 'المعلم (بحث عربي/إنجليزي)' : 'Teacher (Search EN/AR)'}
                </label>
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
                    <input
                      type="text"
                      value={absenceTeacherSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAbsenceTeacherSearch(val);
                        const firstMatch = teachersList.find((t) =>
                          matchesBilingualSearch(val, t.name_en, t.name_ar, t.email)
                        );
                        if (firstMatch) setAbsenceTeacherId(firstMatch.id);
                      }}
                      placeholder={
                        lang === 'ar' ? 'ابحث باسم المعلم...' : 'Search teacher EN / AR...'
                      }
                      className="w-full ps-8 pe-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    />
                  </div>
                  <select
                    required
                    value={absenceTeacherId}
                    onChange={(e) => setAbsenceTeacherId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    {filteredAbsenceTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {getLocalizedName(t, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'السبب (اختياري)' : 'Reason (Optional)'}
              </label>
              <input
                type="text"
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder={lang === 'ar' ? 'إجازة مرضية / عذر...' : 'Sick leave / Personal...'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            {absenceError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                {absenceError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <CalendarX className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تسجيل الغياب' : 'Mark Absent'}</span>
            </button>
          </form>
        </section>

        {/* Absences & Smart Substitution List (Current Day / Current Week) */}
        <section className="lg:col-span-8 meis-glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar'
                  ? 'جدول المعلمين الغائبين وتوزيع الانتظار'
                  : 'Absent Teachers & Smart Substitutions'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {absenceViewMode === 'day'
                  ? `${activeDayDate} · ${activeDayWeekdayLabel}${
                      activeDayDate === riyadhToday
                        ? lang === 'ar'
                          ? ' (اليوم الحالي)'
                          : ' (Today)'
                        : ''
                    }`
                  : lang === 'ar'
                    ? `الأسبوع الدراسي: ${weekBounds.weekStart} إلى ${weekBounds.weekEndThu}`
                    : `School Week: ${weekBounds.weekStart} (Sun) — ${weekBounds.weekEndThu} (Thu)`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setAbsenceViewMode('day')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    absenceViewMode === 'day'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'ar' ? 'اليوم الحالي' : 'Current Day'}
                </button>
                <button
                  type="button"
                  onClick={() => setAbsenceViewMode('week')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    absenceViewMode === 'week'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'ar' ? 'الأسبوع الحالي' : 'Current Week'}
                </button>
              </div>

              {absenceViewMode === 'day' ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous day"
                    onClick={() => setActiveDayDate((d) => addDaysToDateStr(d, -1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronLeft className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDayDate(riyadhToday)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? 'اليوم' : 'Today'}
                  </button>
                  <button
                    type="button"
                    aria-label="Next day"
                    onClick={() => setActiveDayDate((d) => addDaysToDateStr(d, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous week"
                    onClick={() => setWeekAnchorDate((d) => addDaysToDateStr(d, -7))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronLeft className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekAnchorDate(riyadhToday)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? 'هذا الأسبوع' : 'This Week'}
                  </button>
                  <button
                    type="button"
                    aria-label="Next week"
                    onClick={() => setWeekAnchorDate((d) => addDaysToDateStr(d, 7))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}

              {canManageAll && absenceViewMode === 'day' && (
                <button
                  type="button"
                  disabled={exportingDayPdf}
                  onClick={() => void handleExportDayPdf()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'تصدير PDF لليوم' : 'Export Day PDF'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {loading ? (
              <p className="text-xs text-slate-500 py-8 text-center">{tr('loading', lang)}</p>
            ) : displayedAbsences.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  {absenceViewMode === 'day'
                    ? lang === 'ar'
                      ? 'لا توجد غيابات مسجلة للمعلمين في هذا اليوم.'
                      : 'No teacher absences recorded for this date.'
                    : lang === 'ar'
                      ? 'لا توجد غيابات مسجلة للمعلمين خلال هذا الأسبوع.'
                      : 'No teacher absences recorded for this week.'}
                </p>
              </div>
            ) : (
              displayedAbsences.map((abs) => {
                const teacher = profMap.get(abs.teacher_id);
                const absWeekday = getIsoWeekdayFromDateStr(abs.absence_date);
                const weekdayLabel = DAY_NAMES[absWeekday]
                  ? DAY_NAMES[absWeekday][lang]
                  : lang === 'ar'
                    ? 'عطلة نهاية الأسبوع'
                    : 'Weekend';
                const isToday = abs.absence_date === riyadhToday;
                const isFuture = abs.absence_date > riyadhToday;

                const teacherDaySlots = slots
                  .filter(
                    (s) => s.teacher_id === abs.teacher_id && s.day_of_week === absWeekday
                  )
                  .sort((a, b) => a.period_number - b.period_number);

                return (
                  <div
                    key={abs.id}
                    className={`p-4 rounded-xl bg-white border space-y-3 ${
                      isToday ? 'border-emerald-300' : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md tabular-nums">
                            {abs.absence_date} · {weekdayLabel}
                          </span>
                          {isToday && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              {lang === 'ar' ? 'اليوم' : 'Today'}
                            </span>
                          )}
                          {isFuture && (
                            <span className="text-[11px] font-bold text-amber-700">
                              {lang === 'ar' ? 'قادم' : 'Upcoming'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 mt-1.5">
                          {getLocalizedName(teacher, lang)}
                        </p>
                        {abs.reason && (
                          <p className="text-xs text-slate-500">{abs.reason}</p>
                        )}
                      </div>

                      {(canManageAll || abs.teacher_id === userProfile?.id) && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteAbsence(abs.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'إلغاء الغياب' : 'Remove Absence'}</span>
                        </button>
                      )}
                    </div>

                    {teacherDaySlots.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {lang === 'ar'
                          ? 'لا توجد حصص مجدولة لهذا المعلم في هذا اليوم.'
                          : 'No timetable periods scheduled for this teacher on this weekday.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {teacherDaySlots.map((slot) => {
                          const cs = classMap.get(slot.class_section_id);
                          const assignedSub = substitutions.find(
                            (s) =>
                              s.absence_date === abs.absence_date &&
                              s.period_number === slot.period_number &&
                              s.class_section_id === slot.class_section_id
                          );
                          const subTeacher = assignedSub
                            ? profMap.get(assignedSub.substitute_teacher_id)
                            : undefined;

                          return (
                            <div
                              key={slot.id}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900">
                                  {lang === 'ar'
                                    ? `الحصة ${slot.period_number}`
                                    : `Period ${slot.period_number}`}{' '}
                                  · {getLocalizedDisplayName(cs, lang)}
                                </p>
                                {assignedSub ? (
                                  <p className="text-xs font-semibold text-emerald-700 mt-0.5 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">
                                      {getLocalizedName(subTeacher, lang)}
                                    </span>
                                  </p>
                                ) : (
                                  <p className="text-xs text-amber-700 mt-0.5">
                                    {lang === 'ar' ? 'بانتظار تعيين معلم بديل' : 'Needs substitute'}
                                  </p>
                                )}
                              </div>

                              {canManageAll && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubSearchQuery('');
                                      setAssignModal({ absence: abs, slot });
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>
                                      {assignedSub
                                        ? lang === 'ar'
                                          ? 'تغيير'
                                          : 'Change'
                                        : lang === 'ar'
                                          ? 'تعيين بديل'
                                          : 'Assign Substitute'}
                                    </span>
                                  </button>
                                  {assignedSub && (
                                    <button
                                      type="button"
                                      aria-label="Remove substitute"
                                      onClick={() => void handleRemoveSubstitution(assignedSub.id)}
                                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-red-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Edit Timetable Cell Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {DAY_NAMES[editingCell.day][lang]} ·{' '}
              {lang === 'ar' ? `الحصة ${editingCell.period}` : `Period ${editingCell.period}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {getLocalizedName(viewingTeacher, lang)}
            </p>

            <form onSubmit={handleSaveSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ar' ? 'الفصل الدراسي' : 'Class Section'}
                </label>
                <select
                  required
                  value={cellClassId}
                  onChange={(e) => setCellClassId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">
                    {lang === 'ar' ? '-- اختر الفصل --' : '-- Select Class --'}
                  </option>
                  {viewingTeacherClassSections.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {getLocalizedDisplayName(cs, lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ar' ? 'المادة' : 'Subject'}
                </label>
                <select
                  required
                  value={cellSubjectId}
                  onChange={(e) => setCellSubjectId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {viewingTeacherSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getLocalizedName(s, lang)}
                    </option>
                  ))}
                </select>
              </div>

              {cellError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cellError}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                {teacherSlotsMap.has(`${editingCell.day}-${editingCell.period}`) ? (
                  <button
                    type="button"
                    onClick={() => void handleClearSlot()}
                    className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 cursor-pointer"
                  >
                    {lang === 'ar' ? 'إزالة الحصة' : 'Clear Slot'}
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCell(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {tr('cancel', lang)}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    {tr('save', lang)}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Substitute Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'ar' ? 'اختيار معلم بديل (حصة انتظار)' : 'Assign Substitute Teacher'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'ar'
                    ? `الحصة ${assignModal.slot.period_number}`
                    : `Period ${assignModal.slot.period_number}`}{' '}
                  · {getLocalizedDisplayName(classMap.get(assignModal.slot.class_section_id), lang)}{' '}
                  · <span className="font-mono">{assignModal.absence.absence_date}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModal(null)}
                className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                {tr('close', lang)}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-2.5 start-3.5" />
                <input
                  type="text"
                  value={subSearchQuery}
                  onChange={(e) => setSubSearchQuery(e.target.value)}
                  placeholder={
                    lang === 'ar'
                      ? 'ابحث عن المعلم بالاسم العربي أو الإنجليزي أو المادة...'
                      : 'Search teacher by English or Arabic name or subject...'
                  }
                  className="w-full ps-10 pe-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>

              <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pe-0.5">
                {filteredCandidatesForModal.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    {candidatesForModal.length === 0
                      ? lang === 'ar'
                        ? 'لا يوجد معلمون متاحون في هذه الحصة.'
                        : 'No free teachers available during this period.'
                      : lang === 'ar'
                        ? 'لا يوجد معلمون مطابقون للبحث.'
                        : 'No matching teachers found.'}
                  </p>
                ) : (
                  filteredCandidatesForModal.map((cand) => {
                    const primaryName = getLocalizedName(cand.teacher, lang);
                    const secondaryName =
                      lang === 'ar' ? cand.teacher.name_en : cand.teacher.name_ar;
                    const showSecondary =
                      secondaryName && secondaryName.trim() !== primaryName.trim();
                    const sub = cand.teacher.primary_subject_id
                      ? subMap.get(cand.teacher.primary_subject_id)
                      : undefined;
                    return (
                      <div
                        key={cand.teacher.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          cand.reachedLimit
                            ? 'bg-red-50/70 border-red-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {primaryName}
                            {showSecondary && (
                              <span className="text-xs font-normal text-slate-500 ms-1.5">
                                ({secondaryName})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                            {sub && (
                              <span className="font-semibold text-emerald-700 me-1.5">
                                {getLocalizedName(sub, lang)} ·
                              </span>
                            )}
                            {lang === 'ar'
                              ? `رصيد الانتظار هذا الشهر: ${cand.monthlyCount} / ${maxSubs}`
                              : `${cand.monthlyCount} / ${maxSubs} substitutions this month`}
                            {cand.reachedLimit && (
                              <span className="text-red-700 font-bold">
                                {' '}
                                · {lang === 'ar' ? 'بلغ الحد الشهري' : 'Monthly limit reached'}
                              </span>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={cand.alreadyAssignedThisPeriod}
                          onClick={() => void handleAssignSubstitute(cand.teacher.id)}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-40 shrink-0"
                        >
                          {cand.alreadyAssignedThisPeriod
                            ? lang === 'ar'
                              ? 'مكلف بالفعل'
                              : 'Assigned'
                            : lang === 'ar'
                              ? 'تعيين'
                              : 'Assign'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
