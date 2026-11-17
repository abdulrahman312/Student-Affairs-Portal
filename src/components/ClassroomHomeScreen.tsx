import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  LogIn,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { BehaviorLog } from '../types/database';
import { getLocalizedDisplayName, getLocalizedName } from '../utils/i18n';
import { formatRiyadhClock, getRecentMonths, getRiyadhParts } from '../utils/riyadhTime';
import { getMonthlyClassBehaviorRows, type BehaviorLevel } from '../utils/schoolRules';

const MEIS_CREST = '/src/assets/images/meis_school_crest_1794849576691.jpg';
const LAST_CLASS_STORAGE_KEY = 'meis_classroom_last_class_id';

interface ClassroomHomeScreenProps {
  onOpenAuth: () => void;
}

export const ClassroomHomeScreen: React.FC<ClassroomHomeScreenProps> = ({ onOpenAuth }) => {
  const {
    lang,
    toggleLang,
    schoolSettings,
    grades,
    classSections,
    behaviorCategories,
    subjects,
    profiles,
    students,
    masterLoading,
    refreshMasterData,
  } = useApp();

  const [now, setNow] = useState<Date>(() => new Date());
  const monthOptions = useMemo(() => getRecentMonths(now, 12), [now]);
  const currentMonthStr = monthOptions[0]?.monthStr || getRiyadhParts(now).monthStr;

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return localStorage.getItem(LAST_CLASS_STORAGE_KEY) || '';
  });
  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(() => new Set());
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeClassSections = useMemo(
    () => classSections.filter((cs) => cs.is_active),
    [classSections]
  );

  useEffect(() => {
    if (activeClassSections.length === 0) return;
    const exists = activeClassSections.some((cs) => cs.id === selectedClassId);
    if (!exists) {
      const firstId = activeClassSections[0].id;
      setSelectedClassId(firstId);
      localStorage.setItem(LAST_CLASS_STORAGE_KEY, firstId);
    }
  }, [activeClassSections, selectedClassId]);

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    localStorage.setItem(LAST_CLASS_STORAGE_KEY, classId);
    setExpandedStudentIds(new Set());
  };

  const handleSelectMonth = (monthStr: string) => {
    setSelectedMonth(monthStr);
    setExpandedStudentIds(new Set());
  };

  const fetchMonthlyLogs = useCallback(async (targetMonthStr: string) => {
    const [yearStr, monthNumStr] = targetMonthStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthNumStr);
    if (!year || !month) return;

    // Query with +-1 day buffer around month boundaries to capture Asia/Riyadh (UTC+3) timestamps accurately
    const startUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - 24 * 60 * 60 * 1000).toISOString();
    const endUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0) + 24 * 60 * 60 * 1000).toISOString();

    const pageSize = 1000;
    const all: BehaviorLog[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('behavior_logs')
        .select('*')
        .gte('created_at', startUtc)
        .lte('created_at', endUtc)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      all.push(...(data as BehaviorLog[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    setLogs(all);
    setLastUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingLogs(true);
    void fetchMonthlyLogs(selectedMonth).finally(() => {
      if (active) setLoadingLogs(false);
    });
    return () => {
      active = false;
    };
  }, [selectedMonth, fetchMonthlyLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchMonthlyLogs(selectedMonth), refreshMasterData()]);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleExpandedStudent = (studentId: string) => {
    setExpandedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const catMap = useMemo(
    () => new Map(behaviorCategories.map((c) => [c.id, c])),
    [behaviorCategories]
  );
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const classMap = useMemo(
    () => new Map(classSections.map((c) => [c.id, c])),
    [classSections]
  );

  const groupedClassOptions = useMemo(() => {
    return grades
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((grade) => ({
        grade,
        items: activeClassSections.filter((cs) => cs.grade_id === grade.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [grades, activeClassSections]);

  const rows = useMemo(
    () =>
      getMonthlyClassBehaviorRows({
        students,
        logs,
        classSectionId: selectedClassId,
        monthStr: selectedMonth,
        lang,
      }),
    [students, logs, selectedClassId, selectedMonth, lang]
  );

  const levelSummary = useMemo(() => {
    let green = 0;
    let orange = 0;
    let red = 0;
    let totalIncidents = 0;
    for (const r of rows) {
      totalIncidents += r.count;
      if (r.level === 'green') green += 1;
      else if (r.level === 'orange') orange += 1;
      else red += 1;
    }
    return { green, orange, red, totalIncidents };
  }, [rows]);

  const schoolName =
    lang === 'ar'
      ? schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية'
      : schoolSettings?.school_name_en || 'Middle East International School';

  const selectedClassObj = classMap.get(selectedClassId);
  const selectedMonthObj = monthOptions.find((m) => m.monthStr === selectedMonth);
  const riyadhFormatted = useMemo(() => formatRiyadhClock(now, lang), [now, lang]);
  const updatedTimeText = useMemo(() => {
    if (!lastUpdatedAt) return null;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(lastUpdatedAt);
  }, [lastUpdatedAt]);

  const renderLevelBadge = (level: BehaviorLevel) => {
    if (level === 'green') {
      return (
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
          <span>{lang === 'ar' ? 'أخضر · منضبط' : 'Green · Clear'}</span>
        </span>
      );
    }
    if (level === 'orange') {
      return (
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" aria-hidden="true" />
          <span>{lang === 'ar' ? 'برتقالي · متابعة' : 'Orange · Attention'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-800 text-xs font-bold whitespace-nowrap">
        <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" aria-hidden="true" />
        <span>{lang === 'ar' ? 'أحمر · خطر' : 'Red · Critical'}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen meis-mesh-bg flex flex-col p-3 sm:p-5 lg:p-6">
      <div className="max-w-[1440px] w-full mx-auto meis-shell rounded-[2rem] sm:rounded-[2.5rem] flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Header (3 clean zones) */}
        <header className="px-4 sm:px-6 lg:px-8 py-4 border-b border-white/70 flex flex-wrap items-center justify-between gap-4">
          {/* Zone 1: School Crest + Wordmark */}
          <div className="inline-flex items-center gap-3 min-w-0">
            {!imgFailed ? (
              <img
                src={MEIS_CREST}
                alt="Middle East International School Crest"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-10 h-10 rounded-full object-cover border border-white bg-white shadow-xs shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full meis-pill-dark flex items-center justify-center font-bold text-xs shrink-0">
                M
              </div>
            )}
            <span className="text-sm sm:text-base font-extrabold text-slate-900 truncate whitespace-nowrap">
              {schoolName}
            </span>
          </div>

          {/* Zone 2: Live Riyadh Clock & Language Switch */}
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 meis-accent-text shrink-0" />
              <span dir="ltr">{riyadhFormatted.timeText}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="whitespace-nowrap">{riyadhFormatted.dateText}</span>
          </div>

          {/* Zone 3: Language Toggle + Staff Sign In Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/90 border border-white shadow-xs hover:bg-white text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 meis-accent-text" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full meis-pill-dark text-xs sm:text-sm font-semibold shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تسجيل دخول الموظفين' : 'Staff Sign In'}</span>
            </button>
          </div>
        </header>

        {/* Main Classroom Display Workspace */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
          {/* Title & Classroom Controls Row */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 text-balance">
                {lang === 'ar' ? 'لوحة متابعة السلوك الصفي' : 'Classroom Behavior Display'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                {lang === 'ar'
                  ? 'عرض مباشر لطلاب الفصل ومستويات السلوك للشهر المحدد. لتسجيل مخالفة جديدة، يُرجى تسجيل الدخول من هاتفك.'
                  : 'Live monthly behavior monitor for any classroom screen. Teachers sign in from mobile to record new incidents.'}
              </p>
            </div>

            {/* Class Selector + Month Filter + Refresh Button */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Class Dropdown */}
              <div className="flex items-center gap-2 bg-white/90 border border-white rounded-full px-3.5 py-2 shadow-xs">
                <Users className="w-4 h-4 meis-accent-text shrink-0" />
                <label htmlFor="classroom-class-select" className="sr-only">
                  {lang === 'ar' ? 'اختر الفصل' : 'Select Class'}
                </label>
                <select
                  id="classroom-class-select"
                  value={selectedClassId}
                  onChange={(e) => handleSelectClass(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer pe-1 max-w-[200px]"
                >
                  {groupedClassOptions.length === 0 ? (
                    <option value="">
                      {masterLoading
                        ? lang === 'ar'
                          ? 'جارٍ التحميل...'
                          : 'Loading classes...'
                        : lang === 'ar'
                          ? 'لا توجد فصول'
                          : 'No classes'}
                    </option>
                  ) : (
                    groupedClassOptions.map(({ grade, items }) => (
                      <optgroup key={grade.id} label={getLocalizedName(grade, lang)}>
                        {items.map((cs) => (
                          <option key={cs.id} value={cs.id}>
                            {getLocalizedDisplayName(cs, lang)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
              </div>

              {/* Month Filter (Current Month & Previous Months) */}
              <div className="flex items-center gap-2 bg-white/90 border border-white rounded-full px-3.5 py-2 shadow-xs">
                <Calendar className="w-4 h-4 meis-accent-text shrink-0" />
                <label htmlFor="classroom-month-select" className="sr-only">
                  {lang === 'ar' ? 'تصفية حسب الشهر' : 'Filter by Month'}
                </label>
                <select
                  id="classroom-month-select"
                  value={selectedMonth}
                  onChange={(e) => handleSelectMonth(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer pe-1"
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.monthStr} value={opt.monthStr}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                      {opt.isCurrent
                        ? lang === 'ar'
                          ? ' (الشهر الحالي)'
                          : ' (Current Month)'
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Small Refresh Button */}
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing || loadingLogs}
                aria-label={lang === 'ar' ? 'تحديث بيانات السلوك' : 'Refresh behavior records'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/95 hover:bg-white border border-slate-200/90 shadow-xs text-xs sm:text-sm font-semibold text-slate-800 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 meis-accent-text ${refreshing || loadingLogs ? 'animate-spin' : ''}`}
                />
                <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Unboxed Class & Status Metadata Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs sm:text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-bold text-slate-900">
                {selectedClassObj ? getLocalizedDisplayName(selectedClassObj, lang) : '—'}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                {selectedMonthObj
                  ? lang === 'ar'
                    ? selectedMonthObj.labelAr
                    : selectedMonthObj.labelEn
                  : selectedMonth}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="tabular-nums">
                {rows.length} {lang === 'ar' ? 'طالب' : 'students'}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="tabular-nums">
                {levelSummary.totalIncidents}{' '}
                {lang === 'ar' ? 'مخالفة مسجلة' : 'monthly incidents'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold tabular-nums">
              <span className="text-emerald-700">
                {lang === 'ar' ? `أخضر (0): ${levelSummary.green}` : `Green (0): ${levelSummary.green}`}
              </span>
              <span className="text-orange-700">
                {lang === 'ar'
                  ? `برتقالي (1–5): ${levelSummary.orange}`
                  : `Orange (1–5): ${levelSummary.orange}`}
              </span>
              <span className="text-red-700">
                {lang === 'ar' ? `أحمر (>5): ${levelSummary.red}` : `Red (>5): ${levelSummary.red}`}
              </span>
              {updatedTimeText && (
                <>
                  <span aria-hidden="true" className="text-slate-300 hidden sm:inline">·</span>
                  <span dir="ltr" className="font-mono text-[11px] text-slate-500 hidden sm:inline">
                    {updatedTimeText}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Main Student Behavior Table Card */}
          <section className="meis-card rounded-3xl overflow-hidden">
            {masterLoading || loadingLogs ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-[2.5px] border-slate-800 border-t-transparent animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-600">
                  {lang === 'ar' ? 'جارٍ تحميل سجل الفصل...' : 'Loading classroom behavior list...'}
                </p>
              </div>
            ) : !selectedClassId || rows.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  {lang === 'ar'
                    ? 'لا يوجد طلاب مسجلون في هذا الفصل حالياً.'
                    : 'No students found in this class section.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-white/60 text-xs text-slate-600">
                      <th className="py-3.5 px-4 text-start font-bold w-14">#</th>
                      <th className="py-3.5 px-4 text-start font-bold">
                        {lang === 'ar' ? 'اسم الطالب' : 'Student Name'}
                      </th>
                      <th className="py-3.5 px-4 text-center font-bold w-48">
                        {lang === 'ar' ? 'المخالفات (الشهر)' : 'Incidents (Month)'}
                      </th>
                      <th className="py-3.5 px-4 text-end font-bold w-48">
                        {lang === 'ar' ? 'المستوى' : 'Level'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {rows.map((row, idx) => {
                      const isExpanded = expandedStudentIds.has(row.student.id);
                      const hasIncidents = row.count > 0;
                      return (
                        <React.Fragment key={row.student.id}>
                          <tr
                            className={`transition-colors ${
                              row.level === 'red'
                                ? 'bg-red-50/45 hover:bg-red-50/75'
                                : row.level === 'orange'
                                  ? 'bg-orange-50/30 hover:bg-orange-50/55'
                                  : 'hover:bg-white/65'
                            }`}
                          >
                            <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-sm sm:text-base font-bold text-slate-900">
                                {getLocalizedName(row.student, lang)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => hasIncidents && toggleExpandedStudent(row.student.id)}
                                disabled={!hasIncidents}
                                aria-expanded={hasIncidents ? isExpanded : undefined}
                                aria-label={
                                  hasIncidents
                                    ? lang === 'ar'
                                      ? `عرض تفاصيل مخالفات ${row.student.name_ar}`
                                      : `Show recorded behaviors for ${row.student.name_en}`
                                    : undefined
                                }
                                className={`inline-flex items-center justify-center gap-1.5 min-w-[68px] px-3 py-1.5 rounded-full text-sm font-extrabold tabular-nums transition-colors ${
                                  hasIncidents
                                    ? 'bg-white border border-slate-200/90 text-slate-900 hover:bg-slate-50 shadow-2xs cursor-pointer'
                                    : 'text-slate-500 cursor-default'
                                }`}
                              >
                                <span>{row.count}</span>
                                {hasIncidents &&
                                  (isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  ))}
                              </button>
                            </td>
                            <td className="py-3.5 px-4 text-end">{renderLevelBadge(row.level)}</td>
                          </tr>

                          {/* Expandable List of Recorded Behaviors + Teacher Names */}
                          {isExpanded && hasIncidents && (
                            <tr className="bg-slate-50/90">
                              <td colSpan={4} className="px-4 sm:px-8 py-3.5 border-t border-slate-200/70">
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-slate-700">
                                    {lang === 'ar'
                                      ? `السجل التفصيلي للمخالفات (${row.count}):`
                                      : `Recorded Behavior Details (${row.count}):`}
                                  </p>
                                  <div className="divide-y divide-slate-200/70 rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
                                    {row.logs.map((log) => {
                                      const cat = catMap.get(log.behavior_category_id);
                                      const teacher = profMap.get(log.teacher_id);
                                      const subject = log.subject_id
                                        ? subMap.get(log.subject_id)
                                        : undefined;
                                      const dt = new Date(log.created_at);
                                      const riyadhDate = getRiyadhParts(dt).dateStr;
                                      const riyadhTime = new Intl.DateTimeFormat('en-US', {
                                        timeZone: 'Asia/Riyadh',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true,
                                      }).format(dt);

                                      return (
                                        <div
                                          key={log.id}
                                          className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                                        >
                                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="font-bold text-red-700">
                                              {cat ? getLocalizedName(cat, lang) : 'Behavior'}
                                            </span>
                                            <span aria-hidden="true" className="text-slate-300">·</span>
                                            <span className="font-semibold text-slate-800">
                                              {lang === 'ar' ? 'المعلم:' : 'Teacher:'}{' '}
                                              {teacher ? getLocalizedName(teacher, lang) : 'Staff'}
                                            </span>
                                            {subject && (
                                              <>
                                                <span aria-hidden="true" className="text-slate-300">·</span>
                                                <span className="text-slate-600">
                                                  {getLocalizedName(subject, lang)}
                                                </span>
                                              </>
                                            )}
                                            {log.notes && (
                                              <>
                                                <span aria-hidden="true" className="text-slate-300">·</span>
                                                <span className="text-slate-500">{log.notes}</span>
                                              </>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                                            {log.period_number && (
                                              <span>
                                                {lang === 'ar'
                                                  ? `حصة ${log.period_number}`
                                                  : `P${log.period_number}`}
                                              </span>
                                            )}
                                            <span>{riyadhDate}</span>
                                            <span dir="ltr">{riyadhTime}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        {/* Quiet Footer with Secondary Staff Sign-In Trigger */}
        <footer className="px-4 sm:px-6 lg:px-8 py-3.5 border-t border-white/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {schoolName} · {lang === 'ar' ? 'الرياض · توقيت الرياض' : 'Riyadh · Asia/Riyadh'}
          </span>
          <button
            type="button"
            onClick={onOpenAuth}
            className="font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
          >
            {lang === 'ar'
              ? 'تسجيل دخول المعلمين والإدارة'
              : 'Teacher & Administration Sign In'}
          </button>
        </footer>
      </div>
    </div>
  );
};
