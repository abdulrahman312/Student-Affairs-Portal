import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  FileDown,
  FileSpreadsheet,
  MessageCircle,
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
  TimetableSlot,
} from '../types/database';
import { DAY_NAMES, getLocalizedDisplayName, getLocalizedName, ROLE_LABELS, tr } from '../utils/i18n';
import { exportBehaviorReportPdf } from '../utils/pdfExport';
import { getActiveTimeslotLabel, getIsoWeekdayFromDateStr, getRiyadhParts, getSchoolWeekBounds } from '../utils/riyadhTime';
import {
  buildWhatsAppUrl,
  computeBehaviorWatchlist,
  filterTeachersInScope,
  getRoleScope,
  isDateInRange,
} from '../utils/schoolRules';
import type { NavTab } from './LayoutShell';
import { ActiveNoticeBanner } from './NoticeBoardSection';
import { ProfileSettingsModal } from './ProfileSettingsModal';

interface DashboardHomeProps {
  onNavigate: (tab: NavTab) => void;
}

const WEEK_DAYS = [0, 1, 2, 3, 4]; // Sun - Thu

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigate }) => {
  const {
    lang,
    userProfile,
    schoolSettings,
    divisions,
    grades,
    sections,
    timeslots,
    subjects,
    students,
    classSections,
    staffAssignments,
    behaviorCategories,
    dutyTypes,
    profiles,
    notices,
  } = useApp();

  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [perfRequests, setPerfRequests] = useState<PerformanceRequest[]>([]);
  const [perfComments, setPerfComments] = useState<PerformanceComment[]>([]);
  const [absences, setAbsences] = useState<TeacherAbsence[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [duties, setDuties] = useState<DutyAssignment[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);

  const [openAccordion, setOpenAccordion] = useState<'duty' | 'classes' | 'actions' | null>('duty');
  const [ringMode, setRingMode] = useState<'quota' | 'bell'>('quota');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [exportingStudentId, setExportingStudentId] = useState<string | null>(null);

  const now = new Date();
  const riyadhParts = getRiyadhParts(now);
  const riyadhToday = riyadhParts.dateStr;
  const monthPrefix = riyadhParts.monthStr;
  const weekBounds = useMemo(() => getSchoolWeekBounds(riyadhToday), [riyadhToday]);

  useEffect(() => {
    const loadDashboard = async () => {
      const [bRes, prRes, pcRes, abRes, suRes, duRes, ttRes] = await Promise.all([
        supabase.from('behavior_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('performance_requests').select('*'),
        supabase.from('performance_comments').select('*'),
        supabase.from('teacher_absences').select('*').eq('absence_date', riyadhToday),
        supabase.from('substitutions').select('*').gte('absence_date', `${monthPrefix}-01`),
        supabase.from('duty_assignments').select('*'),
        supabase.from('timetable_slots').select('*'),
      ]);
      if (bRes.data) setBehaviorLogs(bRes.data as BehaviorLog[]);
      if (prRes.data) setPerfRequests(prRes.data as PerformanceRequest[]);
      if (pcRes.data) setPerfComments(pcRes.data as PerformanceComment[]);
      if (abRes.data) setAbsences(abRes.data as TeacherAbsence[]);
      if (suRes.data) setSubstitutions(suRes.data as Substitution[]);
      if (duRes.data) setDuties(duRes.data as DutyAssignment[]);
      if (ttRes.data) setTimetableSlots(ttRes.data as TimetableSlot[]);
    };
    void loadDashboard();
  }, [riyadhToday, monthPrefix]);

  if (!userProfile) return null;

  const activeRole = userProfile.active_role;
  const threshold = schoolSettings?.high_behavior_threshold ?? 3;
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

  const scopedTeachers = useMemo(
    () => filterTeachersInScope({ profiles, scope, staffAssignments, timetableSlots }),
    [profiles, scope, staffAssignments, timetableSlots]
  );

  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
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

  const activeNotices = useMemo(() => {
    return notices.filter((n) => {
      if (!isDateInRange(riyadhToday, n.start_date, n.end_date)) return false;
      if (
        !scope.isUnrestricted &&
        n.target_division_id &&
        scope.divisionIds.size > 0 &&
        !scope.divisionIds.has(n.target_division_id)
      ) {
        return false;
      }
      return true;
    });
  }, [notices, riyadhToday, scope]);

  const scopedStudentIds = useMemo(
    () => new Set(scope.students.map((s) => s.id)),
    [scope.students]
  );

  const scopedPerfRequests = useMemo(() => {
    if (scope.isUnrestricted) return perfRequests;
    return perfRequests.filter((r) => scopedStudentIds.has(r.student_id));
  }, [perfRequests, scope.isUnrestricted, scopedStudentIds]);

  const myAllComments = useMemo(
    () => perfComments.filter((c) => c.teacher_id === userProfile.id),
    [perfComments, userProfile.id]
  );

  const myPendingComments = useMemo(
    () => myAllComments.filter((c) => !c.is_submitted),
    [myAllComments]
  );

  const scopedAbsencesToday = useMemo(() => {
    if (scope.isUnrestricted) return absences;
    const allowedTeacherIds = new Set(scopedTeachers.map((t) => t.id));
    return absences.filter((a) => allowedTeacherIds.has(a.teacher_id));
  }, [absences, scope.isUnrestricted, scopedTeachers]);

  const todaysSubstitutions = useMemo(
    () => substitutions.filter((s) => s.absence_date === riyadhToday),
    [substitutions, riyadhToday]
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
    () => todaysSubstitutions.filter((s) => s.substitute_teacher_id === userProfile.id),
    [todaysSubstitutions, userProfile.id]
  );

  const myMonthlySubsCount = useMemo(
    () =>
      substitutions.filter(
        (s) => s.substitute_teacher_id === userProfile.id && s.absence_date.startsWith(monthPrefix)
      ).length,
    [substitutions, userProfile.id, monthPrefix]
  );

  const monthlySubsTotalInScope = useMemo(() => {
    const teacherIds = new Set(scopedTeachers.map((t) => t.id));
    return substitutions.filter(
      (s) => s.absence_date.startsWith(monthPrefix) && teacherIds.has(s.substitute_teacher_id)
    ).length;
  }, [substitutions, scopedTeachers, monthPrefix]);

  // Top Metric Pill Bars Percentages
  const quotaPct = useMemo(() => {
    if (activeRole === 'teacher') {
      return Math.min(100, Math.round((myMonthlySubsCount / Math.max(1, maxSubs)) * 100));
    }
    const capacity = Math.max(1, scopedTeachers.length * maxSubs);
    return Math.min(100, Math.round((monthlySubsTotalInScope / capacity) * 100));
  }, [activeRole, myMonthlySubsCount, maxSubs, scopedTeachers.length, monthlySubsTotalInScope]);

  const reportsCompletedPct = useMemo(() => {
    if (activeRole === 'teacher') {
      if (myAllComments.length === 0) return 100;
      const done = myAllComments.filter((c) => c.is_submitted).length;
      return Math.round((done / myAllComments.length) * 100);
    }
    if (scopedPerfRequests.length === 0) return 100;
    const completed = scopedPerfRequests.filter((r) => r.status === 'completed').length;
    return Math.round((completed / scopedPerfRequests.length) * 100);
  }, [activeRole, myAllComments, scopedPerfRequests]);

  const coverageRatePct = useMemo(() => {
    const dow = getIsoWeekdayFromDateStr(riyadhToday);
    if (scopedAbsencesToday.length === 0) return 100;
    const absentIds = new Set(scopedAbsencesToday.map((a) => a.teacher_id));
    const slotsNeedingCover = timetableSlots.filter(
      (slot) => slot.day_of_week === dow && absentIds.has(slot.teacher_id)
    );
    if (slotsNeedingCover.length === 0) return 100;
    const coveredCount = slotsNeedingCover.filter((slot) =>
      todaysSubstitutions.some(
        (s) =>
          s.period_number === slot.period_number && s.class_section_id === slot.class_section_id
      )
    ).length;
    return Math.round((coveredCount / slotsNeedingCover.length) * 100);
  }, [riyadhToday, scopedAbsencesToday, timetableSlots, todaysSubstitutions]);

  // Weekly Behavior Incidents (Sun..Thu) for Vertical Bar Chart
  const weeklyBehaviorBars = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const log of scopedBehaviorLogs) {
      const dStr = getRiyadhParts(new Date(log.created_at)).dateStr;
      if (dStr >= weekBounds.weekStart && dStr <= weekBounds.weekEndThu) {
        const dow = getIsoWeekdayFromDateStr(dStr);
        if (dow >= 0 && dow <= 4) {
          counts[dow] += 1;
        }
      }
    }
    const maxVal = Math.max(1, ...counts);
    const total = counts.reduce((acc, v) => acc + v, 0);
    let peakDay = riyadhParts.weekdayIndex <= 4 ? riyadhParts.weekdayIndex : 0;
    let peakVal = -1;
    counts.forEach((c, idx) => {
      if (c > peakVal) {
        peakVal = c;
        peakDay = idx;
      }
    });
    return { counts, maxVal, total, peakDay };
  }, [scopedBehaviorLogs, weekBounds, riyadhParts.weekdayIndex]);

  // Radial Ring Gauge Math
  const ringDisplayPct = useMemo(() => {
    if (ringMode === 'quota') {
      return quotaPct;
    }
    return coverageRatePct;
  }, [ringMode, quotaPct, coverageRatePct]);

  const lowerDiv = useMemo(
    () => divisions.find((d) => d.code === 'LOWER') || divisions[0],
    [divisions]
  );
  const upperDiv = useMemo(
    () => divisions.find((d) => d.code === 'UPPER') || divisions[1],
    [divisions]
  );
  const activeBellLower = useMemo(
    () => (lowerDiv ? getActiveTimeslotLabel(timeslots, lowerDiv.id, now, lang) : null),
    [timeslots, lowerDiv, now, lang]
  );
  const activeBellUpper = useMemo(
    () => (upperDiv ? getActiveTimeslotLabel(timeslots, upperDiv.id, now, lang) : null),
    [timeslots, upperDiv, now, lang]
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

  const myTimetableMap = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    for (const s of timetableSlots) {
      if (s.teacher_id === userProfile.id) {
        map.set(`${s.day_of_week}-${s.period_number}`, s);
      }
    }
    return map;
  }, [timetableSlots, userProfile.id]);

  const visibleDivisions = scope.divisions.length > 0 ? scope.divisions : divisions;

  // Profile Initials + Metadata
  const staffInitials = useMemo(() => {
    const name = (userProfile.name_en || userProfile.name_ar || 'M').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [userProfile.name_en, userProfile.name_ar]);

  const primarySubject = userProfile.primary_subject_id
    ? subMap.get(userProfile.primary_subject_id)
    : undefined;
  const assignedDivision = userProfile.division_id
    ? divisions.find((d) => d.id === userProfile.division_id)
    : undefined;

  const canManageNotices =
    activeRole === 'principal' || activeRole === 'academic_supervisor' || activeRole === 'admin';

  const handleExportStudentPdf = async (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    setExportingStudentId(studentId);
    try {
      const stLogs = behaviorLogs.filter((l) => l.student_id === student.id);
      await exportBehaviorReportPdf({
        student,
        classSection: classMap.get(student.class_section_id),
        logs: stLogs,
        categories: behaviorCategories,
        subjects,
        profiles,
        settings: schoolSettings,
      });
    } finally {
      setExportingStudentId(null);
    }
  };

  const buildParentWhatsAppMsg = (studentNameEn: string, studentNameAr: string) => {
    const schoolEn = schoolSettings?.school_name_en || 'Middle East International School';
    const schoolAr = schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية';
    if (lang === 'ar') {
      return `السلام عليكم ولي أمر الطالب ${studentNameAr}، نود التواصل معكم من ${schoolAr} بخصوص متابعة السلوك المدرسي للطالب.`;
    }
    return `Dear Parent of ${studentNameEn}, greetings from ${schoolEn}. We are reaching out regarding a student behavior follow-up.`;
  };

  // Duties active this week for timeline view (leadership/admin)
  const scopedDutiesThisWeek = useMemo(() => {
    const allowedIds = new Set(scopedTeachers.map((t) => t.id));
    return duties.filter((d) => {
      if (!scope.isUnrestricted && activeRole !== 'teacher' && !allowedIds.has(d.teacher_id)) {
        return false;
      }
      if (activeRole === 'teacher' && d.teacher_id !== userProfile.id) return false;
      return d.end_date >= weekBounds.weekStart && d.start_date <= weekBounds.weekEndThu;
    });
  }, [duties, scopedTeachers, scope.isUnrestricted, activeRole, userProfile.id, weekBounds]);

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (ringDisplayPct / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* ==================== 1. WELCOME, TOP NOTICE BOARD & KPI METRIC STRIP ==================== */}
      <section className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              {lang === 'ar'
                ? `مرحباً، ${getLocalizedName(userProfile, lang)}`
                : `Welcome in, ${getLocalizedName(userProfile, lang)}`}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {ROLE_LABELS[activeRole][lang]} ·{' '}
              {lang === 'ar' ? 'تحديث مباشر لبوابة المدرسة ليوم ' : 'Live school operations for '}
              <span className="font-mono tabular-nums font-semibold text-slate-700">
                {riyadhToday}
              </span>
            </p>
          </div>

          {/* Active Notice Board prominently positioned at the top */}
          <div className="lg:col-span-7">
            <ActiveNoticeBanner
              onOpenManager={canManageNotices ? () => onNavigate('notices') : undefined}
            />
          </div>
        </div>

        {/* Horizontal Progress-Pill Bars (Left) + Crisp Display Counters (Right) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-end">
          {/* Left: Horizontal Progress-Pill Bars */}
          <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Bar 1: Monthly Quota Used */}
            <div className="sm:col-span-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
                <span className="truncate">
                  {activeRole === 'teacher'
                    ? lang === 'ar'
                      ? 'نصاب الانتظار'
                      : 'Sub Quota'
                    : lang === 'ar'
                      ? 'استهلاك الانتظار'
                      : 'Quota Used'}
                </span>
                <span className="tabular-nums font-mono">{quotaPct}%</span>
              </div>
              <div className="h-10 rounded-full bg-white/70 border border-white/90 p-1 flex items-center overflow-hidden shadow-xs">
                <div
                  style={{ width: `${Math.max(18, quotaPct)}%` }}
                  className="h-full rounded-full meis-pill-dark px-3 flex items-center text-[11px] font-bold tabular-nums transition-all duration-300"
                >
                  {quotaPct}%
                </div>
              </div>
            </div>

            {/* Bar 2: Performance Reports Completed */}
            <div className="sm:col-span-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
                <span className="truncate">
                  {lang === 'ar' ? 'تقارير الأداء' : 'Reports Done'}
                </span>
                <span className="tabular-nums font-mono">{reportsCompletedPct}%</span>
              </div>
              <div className="h-10 rounded-full bg-white/70 border border-white/90 p-1 flex items-center overflow-hidden shadow-xs">
                <div
                  style={{ width: `${Math.max(22, reportsCompletedPct)}%` }}
                  className="h-full rounded-full meis-accent-solid px-3 flex items-center text-[11px] font-bold tabular-nums transition-all duration-300"
                >
                  {reportsCompletedPct}%
                </div>
              </div>
            </div>

            {/* Bar 3: Today's Coverage Rate (Striped Track) */}
            <div className="sm:col-span-5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
                <span className="truncate">
                  {lang === 'ar' ? 'تغطية حصص اليوم' : "Today's Coverage"}
                </span>
                <span className="tabular-nums font-mono">{coverageRatePct}%</span>
              </div>
              <div className="h-10 rounded-full meis-striped-track border border-white/90 p-1 flex items-center justify-between overflow-hidden shadow-xs">
                <div
                  style={{ width: `${Math.max(24, coverageRatePct)}%` }}
                  className="h-full rounded-full bg-white/95 border border-white px-3.5 flex items-center text-[11px] font-bold text-slate-900 tabular-nums shadow-xs transition-all duration-300"
                >
                  {coverageRatePct}%
                </div>
                <span className="px-2.5 text-[11px] font-semibold text-slate-500 hidden sm:inline">
                  {scopedAbsencesToday.length}{' '}
                  {lang === 'ar' ? 'غياب' : 'absent'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Large Crisp Display Counters */}
          <div className="xl:col-span-5 flex flex-wrap items-center justify-start xl:justify-end gap-6 sm:gap-9 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('behavior')}
              className="text-start group cursor-pointer"
            >
              <div className="flex items-baseline gap-2">
                <Users className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                <span className="text-3xl sm:text-4xl font-light text-slate-900 tabular-nums tracking-tight">
                  {scope.students.length}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {scope.isUnrestricted
                  ? lang === 'ar'
                    ? 'إجمالي الطلاب'
                    : 'Students'
                  : lang === 'ar'
                    ? 'طلاب النطاق'
                    : 'Students'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('behavior')}
              className="text-start group cursor-pointer"
            >
              <div className="flex items-baseline gap-2">
                <AlertTriangle className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                <span className="text-3xl sm:text-4xl font-light text-slate-900 tabular-nums tracking-tight">
                  {todaysBehaviors.length}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {lang === 'ar' ? 'سلوك اليوم' : "Today's Logs"}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                canManageNotices ? onNavigate('notices') : onNavigate('performance')
              }
              className="text-start group cursor-pointer"
            >
              <div className="flex items-baseline gap-2">
                <Bell className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
                <span className="text-3xl sm:text-4xl font-light text-slate-900 tabular-nums tracking-tight">
                  {activeNotices.length}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {lang === 'ar' ? 'إعلانات نشطة' : 'Active Notices'}
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== 2. CENTRAL BENTO WORKSPACE GRID ==================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT CARD: Staff Profile & Collapsible Quick Info Accordions */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Portrait / Staff Identity Card */}
          <div className="meis-portrait-surface rounded-3xl p-5 border border-white/90 shadow-sm flex flex-col justify-between min-h-[210px]">
            <div className="flex items-start justify-between gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/90 border border-white shadow-xs flex items-center justify-center text-lg font-extrabold text-slate-900">
                {staffInitials}
              </div>
              <span className="px-3 py-1 rounded-full bg-white/85 border border-white text-[11px] font-bold text-slate-800 whitespace-nowrap">
                {ROLE_LABELS[activeRole][lang]}
              </span>
            </div>

            <div className="mt-5">
              <h2 className="text-lg font-bold text-slate-900 leading-snug">
                {getLocalizedName(userProfile, lang)}
              </h2>
              <p className="text-xs text-slate-700 mt-0.5">
                {lang === 'ar' ? userProfile.name_en : userProfile.name_ar}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-full bg-slate-900/10 text-slate-900 text-[11px] font-semibold truncate max-w-[160px]">
                  {primarySubject
                    ? getLocalizedName(primarySubject, lang)
                    : assignedDivision
                      ? getLocalizedName(assignedDivision, lang)
                      : lang === 'ar'
                        ? 'كافة المراحل'
                        : 'All Divisions'}
                </span>
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-full bg-white/90 hover:bg-white text-slate-900 text-xs font-bold shadow-xs cursor-pointer"
                >
                  {lang === 'ar' ? 'تعديل' : 'Profile'}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Accordion Rows */}
          <div className="meis-card rounded-3xl p-4 space-y-1 flex-1">
            {/* Accordion 1: Today's Duty Assignment */}
            <div className="border-b border-slate-200/60 pb-2">
              <button
                type="button"
                onClick={() =>
                  setOpenAccordion((prev) => (prev === 'duty' ? null : 'duty'))
                }
                className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <span>
                  {lang === 'ar' ? 'مناوباتي اليوم' : "Today's Duty Assignment"}
                </span>
                {openAccordion === 'duty' ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openAccordion === 'duty' && (
                <div className="pt-1 pb-2 space-y-2">
                  {myDutiesToday.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {lang === 'ar' ? 'لا توجد مناوبة نشطة لك اليوم.' : 'No active duty scheduled today.'}
                    </p>
                  ) : (
                    myDutiesToday.map((d) => (
                      <div
                        key={d.id}
                        className="p-2.5 rounded-2xl bg-white/90 border border-slate-200/70 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {getLocalizedName(dutyMap.get(d.duty_type_id), lang)}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{d.location_text}</p>
                        </div>
                        <ClipboardCheck className="w-4 h-4 meis-accent-text shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Accordion 2: Assigned Classes */}
            <div className="border-b border-slate-200/60 pb-2">
              <button
                type="button"
                onClick={() =>
                  setOpenAccordion((prev) => (prev === 'classes' ? null : 'classes'))
                }
                className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <span>
                  {lang === 'ar'
                    ? `الفصول المسندة (${scope.classSections.length})`
                    : `Assigned Classes (${scope.classSections.length})`}
                </span>
                {openAccordion === 'classes' ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openAccordion === 'classes' && (
                <div className="pt-1 pb-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {scope.classSections.slice(0, 12).map((cs) => (
                    <span
                      key={cs.id}
                      className="px-2.5 py-1 rounded-full bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-700"
                    >
                      {getLocalizedDisplayName(cs, lang)}
                    </span>
                  ))}
                  {scope.classSections.length > 12 && (
                    <span className="px-2.5 py-1 rounded-full meis-accent-pill text-[11px] font-bold">
                      +{scope.classSections.length - 12}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Accordion 3: Quick Actions */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setOpenAccordion((prev) => (prev === 'actions' ? null : 'actions'))
                }
                className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <span>{lang === 'ar' ? 'إجراءات سريعة' : 'Quick Actions'}</span>
                {openAccordion === 'actions' ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>
              {openAccordion === 'actions' && (
                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('behavior')}
                    className="px-3 py-1.5 rounded-full meis-pill-dark text-[11px] font-semibold cursor-pointer"
                  >
                    {lang === 'ar' ? 'تسجيل سلوك' : 'Log Behavior'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('performance')}
                    className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    {lang === 'ar' ? 'تقارير الأداء' : 'Reports'}
                  </button>
                  {activeRole === 'admin' && (
                    <button
                      type="button"
                      onClick={() => onNavigate('admin')}
                      className="px-3 py-1.5 rounded-full meis-accent-solid text-[11px] font-semibold cursor-pointer"
                    >
                      {lang === 'ar' ? 'لوحة الإدارة' : 'Admin Suite'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER CARDS: Weekly Behavior Bar Chart + Radial Substitutions/Bell Tracker */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Chart 1: Weekly Behavior Incidents (Sun-Thu) */}
          <div className="meis-card rounded-3xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {lang === 'ar' ? 'مؤشر السلوك' : 'Weekly Behavior'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {lang === 'ar' ? 'الأحد – الخميس' : 'Sun – Thu incidents'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Open Behavior Module"
                  onClick={() => onNavigate('behavior')}
                  className="w-9 h-9 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 tabular-nums">
                  {weeklyBehaviorBars.total}
                </span>
                <span className="text-xs text-slate-500">
                  {lang === 'ar' ? 'حالة هذا الأسبوع' : 'logged this week'}
                </span>
              </div>
            </div>

            {/* Stylized Vertical Capsule Bar Chart */}
            <div className="mt-6 pt-4 grid grid-cols-5 gap-2.5 items-end h-44">
              {WEEK_DAYS.map((dayIdx) => {
                const count = weeklyBehaviorBars.counts[dayIdx];
                const isPeak = dayIdx === weeklyBehaviorBars.peakDay;
                const heightPct =
                  count === 0
                    ? 14
                    : Math.max(24, Math.round((count / weeklyBehaviorBars.maxVal) * 100));
                const shortDay =
                  lang === 'ar'
                    ? DAY_NAMES[dayIdx].ar.slice(0, 5)
                    : DAY_NAMES[dayIdx].en.slice(0, 3);

                return (
                  <div key={dayIdx} className="flex flex-col items-center h-full justify-end gap-2">
                    <div className="relative flex-1 w-full flex items-end justify-center">
                      {/* Dotted vertical guide */}
                      <div className="absolute inset-y-2 w-px border-s border-dashed border-slate-300/80" />

                      {/* Highlight Pill Tooltip above Peak Bar */}
                      {isPeak && (
                        <span
                          style={{ bottom: `calc(${heightPct}% + 6px)` }}
                          className="absolute px-2 py-0.5 rounded-full meis-accent-solid text-[10px] font-bold tabular-nums shadow-xs whitespace-nowrap z-10"
                        >
                          {count}
                        </span>
                      )}

                      {/* Rounded Vertical Bar Capsule */}
                      <div
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: isPeak
                            ? 'var(--meis-bar-highlight)'
                            : 'var(--meis-bar-muted)',
                        }}
                        className="relative z-10 w-3.5 rounded-full transition-all duration-300 opacity-90"
                        title={`${DAY_NAMES[dayIdx][lang]}: ${count}`}
                      />
                    </div>

                    {/* Baseline Dot + Day Label */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isPeak ? 'meis-accent-bg' : 'bg-slate-800'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-slate-600">{shortDay}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: Radial Ring Gauge (Monthly Substitutions vs Limit / Active Bell) */}
          <div className="meis-card rounded-3xl p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {ringMode === 'quota'
                    ? lang === 'ar'
                      ? 'متابعة الانتظار'
                      : 'Quota Tracker'
                    : lang === 'ar'
                      ? 'تغطية اليوم'
                      : 'Bell & Coverage'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ringMode === 'quota'
                    ? lang === 'ar'
                      ? 'الرصيد الشهري المعتمد'
                      : 'Monthly substitutions'
                    : lang === 'ar'
                      ? 'حالة الجرس المباشرة'
                      : 'Live division bell'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Open Timetable & Substitutions"
                onClick={() => onNavigate('timetable')}
                className="w-9 h-9 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented Radial SVG Ring */}
            <div className="my-4 flex items-center justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 132 132" aria-hidden="true">
                  {/* Dashed outer tick ring */}
                  <circle
                    cx="66"
                    cy="66"
                    r={radius}
                    fill="none"
                    stroke="var(--meis-ring-track)"
                    strokeWidth="9"
                    strokeDasharray="4 4"
                  />
                  {/* Smooth theme accent arc */}
                  <circle
                    cx="66"
                    cy="66"
                    r={radius}
                    fill="none"
                    stroke="var(--meis-ring-stroke)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                  {ringMode === 'quota' ? (
                    <>
                      <span className="text-2xl font-bold text-slate-900 tabular-nums font-mono">
                        {activeRole === 'teacher'
                          ? `${myMonthlySubsCount}/${maxSubs}`
                          : `${quotaPct}%`}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 mt-0.5">
                        {activeRole === 'teacher'
                          ? lang === 'ar'
                            ? 'حصة هذا الشهر'
                            : 'This month'
                          : lang === 'ar'
                            ? `${monthlySubsTotalInScope} حصة`
                            : `${monthlySubsTotalInScope} assigned`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-bold text-slate-900 tabular-nums">
                        {coverageRatePct}%
                      </span>
                      <span className="text-[11px] font-semibold meis-accent-text truncate max-w-[90px] mt-0.5">
                        {activeBellLower?.isActive
                          ? activeBellLower.label
                          : activeBellUpper?.label || (lang === 'ar' ? 'خارج الدوام' : 'Off Hours')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Controls inside Ring Card */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="inline-flex p-1 rounded-full bg-slate-100/90 border border-slate-200/70">
                <button
                  type="button"
                  onClick={() => setRingMode('quota')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                    ringMode === 'quota' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {lang === 'ar' ? 'الرصيد' : 'Quota'}
                </button>
                <button
                  type="button"
                  onClick={() => setRingMode('bell')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                    ringMode === 'bell' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {lang === 'ar' ? 'الجرس' : 'Bell'}
                </button>
              </div>

              <button
                type="button"
                aria-label="Go to Timetable"
                onClick={() => onNavigate('timetable')}
                className="w-9 h-9 rounded-full meis-pill-dark flex items-center justify-center cursor-pointer shrink-0"
              >
                <Clock className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT CARD: Layered Dark Contrast Watchlist / Teacher Action Queue */}
        <div className="lg:col-span-4 flex flex-col">
          {/* Layered Header Card (mirrors "Onboarding 18%" bar above dark card) */}
          <div className="meis-card rounded-t-3xl rounded-b-2xl px-5 py-4 mb-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                {activeRole === 'teacher'
                  ? lang === 'ar'
                    ? 'إنجاز التقارير المطلوبة'
                    : 'Teaching Deliverables'
                  : lang === 'ar'
                    ? `حد التنبيه: ${threshold}+ مخالفات`
                    : `Watchlist Threshold: ${threshold}+`}
              </p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {activeRole === 'teacher'
                  ? lang === 'ar'
                    ? `${myPendingComments.length} معلق · ${mySubstitutionsToday.length} انتظار`
                    : `${myPendingComments.length} Pending · ${mySubstitutionsToday.length} Sub`
                  : lang === 'ar'
                    ? 'الطلاب الأكثر تكراراً للمخالفات'
                    : 'High-Frequency Behavior Watchlist'}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full meis-accent-pill text-xs font-bold tabular-nums">
              {activeRole === 'teacher' ? `${reportsCompletedPct}%` : watchlistPreview.length}
            </span>
          </div>

          {/* Dark Contrast Card (mirrors "Onboarding Task 2/8" dark card) */}
          <div className="rounded-3xl bg-slate-900 text-white p-5 shadow-xl flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
              <h2 className="text-sm font-bold tracking-wide">
                {activeRole === 'teacher'
                  ? lang === 'ar'
                    ? 'قائمة مهام المعلم اليوم'
                    : 'Teacher Action Queue'
                  : lang === 'ar'
                    ? 'المتابعة السلوكية (هذا الشهر)'
                    : 'Top Offenders Watchlist'}
              </h2>
              <button
                type="button"
                onClick={() =>
                  onNavigate(activeRole === 'teacher' ? 'performance' : 'behavior')
                }
                className="text-xs font-semibold text-sky-300 hover:text-sky-200 cursor-pointer"
              >
                {lang === 'ar' ? 'عرض الكل' : 'View All'}
              </button>
            </div>

            {activeRole === 'teacher' ? (
              <div className="mt-3.5 space-y-2.5 flex-1">
                {mySubstitutionsToday.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {lang === 'ar'
                            ? `حصة انتظار · الحصة ${s.period_number}`
                            : `Substitution · Period ${s.period_number}`}
                        </p>
                        <p className="text-[11px] text-slate-300 truncate">
                          {getLocalizedDisplayName(classMap.get(s.class_section_id), lang)}
                        </p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0" />
                  </div>
                ))}

                {myPendingComments.slice(0, 4).map((c) => {
                  const req = perfRequests.find((r) => r.id === c.request_id);
                  const st = req ? students.find((s) => s.id === req.student_id) : undefined;
                  const sub = subMap.get(c.subject_id);
                  return (
                    <div
                      key={c.id}
                      className="p-3 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-sky-400/20 text-sky-300 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {st ? getLocalizedName(st, lang) : 'Student'}
                          </p>
                          <p className="text-[11px] text-slate-300 truncate">
                            {getLocalizedName(sub, lang)} · {req?.request_date}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('performance')}
                        className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-[11px] font-bold hover:bg-sky-50 cursor-pointer shrink-0"
                      >
                        {lang === 'ar' ? 'تقييم' : 'Fill'}
                      </button>
                    </div>
                  );
                })}

                {mySubstitutionsToday.length === 0 && myPendingComments.length === 0 && (
                  <div className="py-10 text-center space-y-2">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                    <p className="text-xs text-slate-300">
                      {lang === 'ar'
                        ? 'جميع تقارير الأداء مكتملة ولا توجد حصص انتظار اليوم.'
                        : 'All performance comments submitted & no substitutions today.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3.5 space-y-2.5 flex-1">
                {watchlistPreview.length === 0 ? (
                  <p className="text-xs text-slate-400 py-10 text-center">
                    {lang === 'ar'
                      ? 'لا توجد مخالفات مسجلة هذا الشهر.'
                      : 'No behavior incidents logged this month yet.'}
                  </p>
                ) : (
                  watchlistPreview.map((item) => (
                    <div
                      key={item.student.id}
                      className="p-3 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                            item.exceedsThreshold
                              ? 'bg-red-500 text-white'
                              : 'bg-white/15 text-slate-200'
                          }`}
                        >
                          {item.incidentCount}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {getLocalizedName(item.student, lang)}
                          </p>
                          <p className="text-[11px] text-slate-300 truncate">
                            {getLocalizedDisplayName(
                              classMap.get(item.student.class_section_id),
                              lang
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={buildWhatsAppUrl(
                            item.student.father_mobile,
                            buildParentWhatsAppMsg(item.student.name_en, item.student.name_ar)
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={tr('whatsappFather', lang)}
                          aria-label={`WhatsApp parent of ${item.student.name_en}`}
                          className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          disabled={exportingStudentId === item.student.id}
                          onClick={() => void handleExportStudentPdf(item.student.id)}
                          title={tr('exportPdfEnglish', lang)}
                          aria-label={`Export PDF for ${item.student.name_en}`}
                          className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================== 3. BOTTOM SCHEDULE & LIVE BELL TIMES ROW ==================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Weekly Timetable / Duty & Absence Timeline Grid */}
        <div className="lg:col-span-7 meis-card rounded-3xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/70">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {activeRole === 'teacher'
                  ? lang === 'ar'
                    ? 'جدول الحصص الأسبوعي (الأحد – الخميس)'
                    : 'Weekly Teaching & Duty Timeline'
                  : lang === 'ar'
                    ? 'الجدول الزمني الأسبوعي والمناوبات'
                    : 'Weekly Schedule & Duty Timeline'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums font-mono">
                {weekBounds.weekStart} → {weekBounds.weekEndThu}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('timetable')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 border border-slate-200/80 hover:bg-white text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <span>{lang === 'ar' ? 'فتح الجدول' : 'Open Timetable'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeRole === 'teacher' ? (
            <div className="mt-4 overflow-x-auto flex-1">
              <div className="min-w-[540px] grid grid-cols-6 gap-2 text-xs">
                <div className="py-2 text-slate-400 font-semibold">
                  {lang === 'ar' ? 'الحصة' : 'Period'}
                </div>
                {WEEK_DAYS.map((d) => (
                  <div
                    key={d}
                    className={`py-2 text-center font-bold rounded-full ${
                      d === riyadhParts.weekdayIndex
                        ? 'meis-accent-pill'
                        : 'text-slate-700'
                    }`}
                  >
                    {DAY_NAMES[d][lang]}
                  </div>
                ))}

                {[1, 2, 3, 4, 5, 6, 7].map((period) => (
                  <React.Fragment key={period}>
                    <div className="py-2 font-mono font-semibold text-slate-500 flex items-center">
                      {lang === 'ar' ? `ح ${period}` : `P${period}`}
                    </div>
                    {WEEK_DAYS.map((day) => {
                      const slot = myTimetableMap.get(`${day}-${period}`);
                      const cs = slot ? classMap.get(slot.class_section_id) : undefined;
                      return (
                        <div key={day} className="flex items-center justify-center py-1">
                          {slot ? (
                            <span
                              title={getLocalizedName(subMap.get(slot.subject_id), lang)}
                              className="w-full text-center px-2 py-1.5 rounded-full meis-pill-dark text-[11px] font-semibold truncate"
                            >
                              {getLocalizedDisplayName(cs, lang)}
                            </span>
                          ) : (
                            <span className="w-full text-center py-1.5 rounded-full bg-slate-100/70 text-slate-300 text-[11px]">
                              —
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : (
            /* Leadership / Supervisor / Admin Horizontal Week Timeline */
            <div className="mt-4 space-y-3 flex-1">
              <div className="grid grid-cols-5 gap-2 text-center">
                {WEEK_DAYS.map((d) => {
                  const isToday = d === riyadhParts.weekdayIndex;
                  return (
                    <div
                      key={d}
                      className={`py-2 px-2 rounded-2xl border text-xs font-bold ${
                        isToday
                          ? 'meis-accent-pill'
                          : 'bg-white/70 border-slate-200/70 text-slate-700'
                      }`}
                    >
                      {DAY_NAMES[d][lang]}
                    </div>
                  );
                })}
              </div>

              {/* Duty & Absence Pills across Week */}
              <div className="space-y-2 pt-1">
                {scopedAbsencesToday.length > 0 && (
                  <div className="p-3 rounded-2xl bg-red-50/80 border border-red-200/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-red-900">
                      {lang === 'ar' ? 'غياب اليوم:' : 'Absent Today:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {scopedAbsencesToday.map((a) => (
                        <span
                          key={a.id}
                          className="px-3 py-1 rounded-full bg-white border border-red-200 text-xs font-semibold text-red-700"
                        >
                          {getLocalizedName(profMap.get(a.teacher_id), lang)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {scopedDutiesThisWeek.slice(0, 4).map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-2xl bg-white/85 border border-slate-200/70 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-3 py-1 rounded-full meis-pill-dark text-[11px] font-semibold shrink-0">
                        {getLocalizedName(dutyMap.get(d.duty_type_id), lang)}
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {getLocalizedName(profMap.get(d.teacher_id), lang)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {d.location_text} · {d.start_date}
                    </span>
                  </div>
                ))}

                {scopedAbsencesToday.length === 0 && scopedDutiesThisWeek.length === 0 && (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    {lang === 'ar'
                      ? 'لا توجد غيابات اليوم أو مناوبات مجدولة هذا الأسبوع.'
                      : 'No absences today or duty events scheduled this week.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Division Bell Schedule */}
        <div className="lg:col-span-5 meis-card rounded-3xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200/70">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full meis-accent-pill flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'ar' ? 'جدول الجرس المباشر' : 'Live Division Bell Schedule'}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === 'ar' ? 'توقيت الرياض (UTC+3)' : 'Asia/Riyadh (UTC+3)'}
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full meis-pill-dark text-[11px] font-bold whitespace-nowrap">
              {activeBellLower?.isActive
                ? activeBellLower.label
                : activeBellUpper?.label || (lang === 'ar' ? 'خارج الدوام' : 'Off Hours')}
            </span>
          </div>

          <div className="mt-4 space-y-4 flex-1 max-h-[300px] overflow-y-auto pe-1">
            {visibleDivisions.map((div) => {
              const divSlots = timeslots
                .filter((t) => t.division_id === div.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              const divBell = getActiveTimeslotLabel(timeslots, div.id, now, lang);
              return (
                <div key={div.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800">
                      {getLocalizedName(div, lang)}
                    </p>
                    <span className="text-[11px] font-semibold meis-accent-text">
                      {divBell.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {divSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 ${
                          slot.is_break
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-white/90 border-slate-200/80 text-slate-800'
                        }`}
                      >
                        <span className="font-semibold">{getLocalizedName(slot, lang)}</span>
                        <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
                          {slot.start_time.slice(0, 5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {settingsModalOpen && <ProfileSettingsModal onClose={() => setSettingsModalOpen(false)} />}
    </div>
  );
};
