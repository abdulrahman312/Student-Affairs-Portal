import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type {
  BehaviorLog,
  DutyAssignment,
  PerformanceComment,
  PerformanceRequest,
  Substitution,
  TeacherAbsence,
} from '../types/database';
import { getLocalizedDisplayName, getLocalizedName, ROLE_LABELS } from '../utils/i18n';
import { getRiyadhParts } from '../utils/riyadhTime';
import {
  computeBehaviorWatchlist,
  filterTeachersInScope,
  getRoleScope,
  isDateInRange,
} from '../utils/schoolRules';
import type { NavTab } from './LayoutShell';
import { ActiveNoticeBanner } from './NoticeBoardSection';

interface DashboardHomeProps {
  onNavigate: (tab: NavTab) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigate }) => {
  const {
    lang,
    userProfile,
    schoolSettings,
    divisions,
    grades,
    sections,
    timeslots,
    students,
    classSections,
    staffAssignments,
    behaviorCategories,
    dutyTypes,
    profiles,
  } = useApp();

  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [perfRequests, setPerfRequests] = useState<PerformanceRequest[]>([]);
  const [perfComments, setPerfComments] = useState<PerformanceComment[]>([]);
  const [absences, setAbsences] = useState<TeacherAbsence[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [duties, setDuties] = useState<DutyAssignment[]>([]);

  const riyadhToday = getRiyadhParts(new Date()).dateStr;

  useEffect(() => {
    const loadDashboard = async () => {
      const [bRes, prRes, pcRes, abRes, suRes, duRes] = await Promise.all([
        supabase.from('behavior_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('performance_requests').select('*'),
        supabase.from('performance_comments').select('*'),
        supabase.from('teacher_absences').select('*').eq('absence_date', riyadhToday),
        supabase.from('substitutions').select('*').eq('absence_date', riyadhToday),
        supabase.from('duty_assignments').select('*'),
      ]);
      if (bRes.data) setBehaviorLogs(bRes.data as BehaviorLog[]);
      if (prRes.data) setPerfRequests(prRes.data as PerformanceRequest[]);
      if (pcRes.data) setPerfComments(pcRes.data as PerformanceComment[]);
      if (abRes.data) setAbsences(abRes.data as TeacherAbsence[]);
      if (suRes.data) setSubstitutions(suRes.data as Substitution[]);
      if (duRes.data) setDuties(duRes.data as DutyAssignment[]);
    };
    void loadDashboard();
  }, [riyadhToday]);

  if (!userProfile) return null;

  const activeRole = userProfile.active_role;
  const threshold = schoolSettings?.high_behavior_threshold ?? 3;
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

  const scopedTeachers = useMemo(
    () => filterTeachersInScope({ profiles, scope, staffAssignments }),
    [profiles, scope, staffAssignments]
  );

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const catMap = useMemo(
    () => new Map(behaviorCategories.map((c) => [c.id, c])),
    [behaviorCategories]
  );
  const dutyMap = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const scopedBehaviorLogs = useMemo(() => {
    if (scope.isUnrestricted) return behaviorLogs;
    if (activeRole === 'teacher') {
      return behaviorLogs.filter(
        (b) =>
          scope.classSectionIds.has(b.class_section_id) ||
          (scope.classSectionIds.size === 0 && b.teacher_id === userProfile.id)
      );
    }
    return behaviorLogs.filter((b) => scope.classSectionIds.has(b.class_section_id));
  }, [behaviorLogs, scope, activeRole, userProfile.id]);

  const todaysBehaviors = useMemo(
    () =>
      scopedBehaviorLogs.filter(
        (b) => getRiyadhParts(new Date(b.created_at)).dateStr === riyadhToday
      ),
    [scopedBehaviorLogs, riyadhToday]
  );

  const scopedStudentIds = useMemo(
    () => new Set(scope.students.map((s) => s.id)),
    [scope.students]
  );

  const scopedPerfRequests = useMemo(() => {
    if (scope.isUnrestricted) return perfRequests;
    return perfRequests.filter((r) => scopedStudentIds.has(r.student_id));
  }, [perfRequests, scope.isUnrestricted, scopedStudentIds]);

  const scopedAbsences = useMemo(() => {
    if (scope.isUnrestricted) return absences;
    const allowedTeacherIds = new Set(scopedTeachers.map((t) => t.id));
    return absences.filter((a) => allowedTeacherIds.has(a.teacher_id));
  }, [absences, scope.isUnrestricted, scopedTeachers]);

  const myPendingComments = useMemo(
    () => perfComments.filter((c) => c.teacher_id === userProfile.id && !c.is_submitted),
    [perfComments, userProfile.id]
  );

  const myDutiesToday = useMemo(
    () =>
      duties.filter(
        (d) =>
          d.teacher_id === userProfile.id && isDateInRange(riyadhToday, d.start_date, d.end_date)
      ),
    [duties, userProfile.id, riyadhToday]
  );

  const mySubstitutionsToday = useMemo(
    () => substitutions.filter((s) => s.substitute_teacher_id === userProfile.id),
    [substitutions, userProfile.id]
  );

  const watchlistPreview = useMemo(
    () =>
      computeBehaviorWatchlist({
        logs: scopedBehaviorLogs,
        students: scope.students,
        timeframe: 'month',
        riyadhToday,
        threshold,
      }).slice(0, 5),
    [scopedBehaviorLogs, scope.students, riyadhToday, threshold]
  );

  const visibleDivisions = scope.divisions.length > 0 ? scope.divisions : divisions;

  return (
    <div className="space-y-6">
      {/* Active Notice Board Banner */}
      <ActiveNoticeBanner onOpenManager={() => onNavigate('notices')} />

      {/* Welcome & Role Overview Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'ar'
              ? `مرحباً، ${getLocalizedName(userProfile, lang)}`
              : `Welcome, ${getLocalizedName(userProfile, lang)}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {ROLE_LABELS[activeRole][lang]} ·{' '}
            {lang === 'ar'
              ? 'ملخص العمليات المدرسية المباشر ليوم '
              : 'Live school operations summary for '}
            <span className="font-mono tabular-nums">{riyadhToday}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('behavior')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {activeRole === 'teacher'
                ? lang === 'ar'
                  ? 'تسجيل سلوك طالب'
                  : 'Log Student Behavior'
                : lang === 'ar'
                  ? 'مراجعة السلوك'
                  : 'Open Behavior Feed'}
            </span>
          </button>
          {activeRole === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <span>{lang === 'ar' ? 'إدارة النظام' : 'Open Admin Suite'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="meis-glass rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {scope.isUnrestricted
                ? lang === 'ar'
                  ? 'إجمالي الطلاب'
                  : 'Enrolled Students'
                : lang === 'ar'
                  ? 'طلاب فصلي / مرحلتي'
                  : 'Assigned Students'}
            </span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {scope.students.length}
          </p>
        </div>

        <div className="meis-glass rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{lang === 'ar' ? 'مخالفات اليوم' : "Today's Behavior Logs"}</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {todaysBehaviors.length}
          </p>
        </div>

        <div className="meis-glass rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {activeRole === 'teacher'
                ? lang === 'ar'
                  ? 'تقارير بانتظارك'
                  : 'Pending My Comments'
                : lang === 'ar'
                  ? 'تقارير الأداء المفتوحة'
                  : 'Performance Requests'}
            </span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {activeRole === 'teacher' ? myPendingComments.length : scopedPerfRequests.length}
          </p>
        </div>

        <div className="meis-glass rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {activeRole === 'teacher'
                ? lang === 'ar'
                  ? 'مناوباتي اليوم'
                  : 'My Duties Today'
                : lang === 'ar'
                  ? 'غياب اليوم'
                  : 'Absent Staff Today'}
            </span>
            <CalendarClock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {activeRole === 'teacher' ? myDutiesToday.length : scopedAbsences.length}
          </p>
        </div>
      </div>

      {/* Role-Specific Actionable Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Teacher Alerts OR Leadership Watchlist */}
        <section className="lg:col-span-7 meis-glass rounded-2xl p-5">
          {activeRole === 'teacher' ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'ar' ? 'المهام والالتزامات اليومية' : 'Today’s Teaching Alerts'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('performance')}
                  className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'فتح التقارير' : 'Open Reports'}
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {myDutiesToday.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-emerald-900">
                        {lang === 'ar' ? 'مناوبة نشطة اليوم' : 'Active Duty Today'} ·{' '}
                        {getLocalizedName(dutyMap.get(d.duty_type_id), lang)}
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">{d.location_text}</p>
                    </div>
                    <ClipboardCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  </div>
                ))}

                {mySubstitutionsToday.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-amber-950">
                        {lang === 'ar' ? 'حصة انتظار مسندة اليوم' : 'Substitution Assigned Today'} ·{' '}
                        {lang === 'ar' ? `الحصة ${s.period_number}` : `Period ${s.period_number}`}
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">
                        {getLocalizedDisplayName(classMap.get(s.class_section_id), lang)}
                      </p>
                    </div>
                    <CalendarClock className="w-4 h-4 text-amber-700 shrink-0" />
                  </div>
                ))}

                {myPendingComments.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-slate-900">
                      {lang === 'ar'
                        ? `لديك ${myPendingComments.length} تقارير أداء طلابية بانتظار تعليقك.`
                        : `You have ${myPendingComments.length} student performance report comments pending.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('performance')}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {lang === 'ar' ? 'كتابة التقييم' : 'Fill Comments'}
                    </button>
                  </div>
                )}

                {myDutiesToday.length === 0 &&
                  mySubstitutionsToday.length === 0 &&
                  myPendingComments.length === 0 && (
                    <p className="text-xs text-slate-500 py-8 text-center">
                      {lang === 'ar'
                        ? 'لا توجد مناوبات أو حصص انتظار أو تقارير معلقة لك اليوم.'
                        : 'No active duties, substitutions, or pending performance reports for today.'}
                    </p>
                  )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'ar'
                    ? 'أبرز الطلاب في قائمة المتابعة السلوكية (هذا الشهر)'
                    : 'High Negative Behavior Watchlist (This Month)'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('behavior')}
                  className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'عرض الكل' : 'View All'}
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {watchlistPreview.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    {lang === 'ar'
                      ? 'لا توجد مخالفات سلوكية مسجلة هذا الشهر.'
                      : 'No behavior incidents logged this month yet.'}
                  </p>
                ) : (
                  watchlistPreview.map((item) => (
                    <div
                      key={item.student.id}
                      className="p-3 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {getLocalizedName(item.student, lang)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getLocalizedDisplayName(
                            classMap.get(item.student.class_section_id),
                            lang
                          )}{' '}
                          · <span className="font-mono">{item.student.iqama_id}</span>
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${
                          item.exceedsThreshold
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {item.incidentCount}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* Right Panel: Live Bell Schedule & Absences Summary */}
        <section className="lg:col-span-5 meis-glass rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'جدول التوقيت الدراسي المعتمد' : 'Active Bell Schedules'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('timetable')}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              {activeRole === 'teacher' || activeRole === 'admin'
                ? lang === 'ar'
                  ? 'الجدول والانتظار'
                  : 'Timetable'
                : lang === 'ar'
                  ? 'الغياب والانتظار'
                  : 'Substitutions'}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {visibleDivisions.map((div) => {
              const divSlots = timeslots
                .filter((t) => t.division_id === div.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <div key={div.id} className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-800">{getLocalizedName(div, lang)}</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {divSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
                          slot.is_break
                            ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
                            : 'bg-white border-slate-200/80 text-slate-700'
                        }`}
                      >
                        <span className="truncate font-semibold">{getLocalizedName(slot, lang)}</span>
                        <span dir="ltr" className="font-mono tabular-nums shrink-0 text-slate-500">
                          {slot.start_time.slice(0, 5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {activeRole !== 'teacher' && scopedAbsences.length > 0 && (
              <div className="pt-3 border-t border-slate-200/80">
                <p className="text-xs font-bold text-slate-800 mb-1.5">
                  {lang === 'ar' ? 'المعلمون الغائبون اليوم' : 'Absent Teachers Today'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {scopedAbsences.map((a) => (
                    <span
                      key={a.id}
                      className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg"
                    >
                      {getLocalizedName(profMap.get(a.teacher_id), lang)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {todaysBehaviors.length > 0 && activeRole !== 'teacher' && (
              <div className="pt-3 border-t border-slate-200/80 text-xs text-slate-500">
                {lang === 'ar' ? 'آخر مخالفة مسجلة اليوم: ' : 'Latest behavior logged today: '}
                <strong className="text-slate-800">
                  {getLocalizedName(catMap.get(todaysBehaviors[0].behavior_category_id), lang)}
                </strong>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
