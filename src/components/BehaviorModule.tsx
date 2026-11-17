import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileDown,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { BehaviorLog, Student } from '../types/database';
import { getLocalizedDisplayName, getLocalizedName, tr } from '../utils/i18n';
import {
  exportBehaviorReportPdf,
  exportClassBehaviorRangePdf,
  exportTeacherBehaviorRangePdf,
} from '../utils/pdfExport';
import { getRiyadhParts } from '../utils/riyadhTime';
import {
  buildWhatsAppUrl,
  computeBehaviorWatchlist,
  filterBehaviorLogsForReport,
  getBehaviorLevel,
  getRoleScope,
  matchesBilingualSearch,
  type WatchlistTimeframe,
} from '../utils/schoolRules';

export const BehaviorModule: React.FC = () => {
  const {
    lang,
    userProfile,
    schoolSettings,
    divisions,
    grades,
    sections,
    classSections,
    subjects,
    behaviorCategories,
    profiles,
    students,
    staffAssignments,
  } = useApp();

  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Record Incident Form State
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordClassId, setRecordClassId] = useState('');
  const [recordStudentSearch, setRecordStudentSearch] = useState('');
  const [recordStudentId, setRecordStudentId] = useState('');
  const [recordCategoryId, setRecordCategoryId] = useState('');
  const [recordPeriod, setRecordPeriod] = useState<string>('');
  const [recordNotes, setRecordNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Watchlist & Search State
  const [timeframe, setTimeframe] = useState<WatchlistTimeframe>('today');
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGradeId, setFilterGradeId] = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [expandedSearchStudentId, setExpandedSearchStudentId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const riyadhParts = getRiyadhParts(new Date());
  const riyadhToday = riyadhParts.dateStr;
  const riyadhMonthStart = `${riyadhParts.monthStr}-01`;

  // Date-Range Report & Export State
  const [reportFromDate, setReportFromDate] = useState<string>(riyadhMonthStart);
  const [reportToDate, setReportToDate] = useState<string>(riyadhToday);
  const [reportClassId, setReportClassId] = useState<string>('');
  const [exportingRangePdf, setExportingRangePdf] = useState(false);

  const threshold = schoolSettings?.high_behavior_threshold ?? 3;
  const activeRole = userProfile?.active_role || 'teacher';
  const canSupervise = activeRole !== 'teacher';

  const loadLogs = async () => {
    setLoading(true);
    try {
      const pageSize = 1000;
      const all: BehaviorLog[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('behavior_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as BehaviorLog[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setLogs(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

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

  const availableRecordClasses = scope.classSections;

  // Ensure supervisors/principals/admins default to their first scoped class for Class Behavior Report
  useEffect(() => {
    if (canSupervise && availableRecordClasses.length > 0) {
      const exists = availableRecordClasses.some((c) => c.id === reportClassId);
      if (!exists) {
        setReportClassId(availableRecordClasses[0].id);
      }
    }
  }, [canSupervise, availableRecordClasses, reportClassId]);

  const studentsInSelectedClass = useMemo(() => {
    const base = recordClassId
      ? scope.classSectionIds.has(recordClassId)
        ? scope.students.filter((s) => s.class_section_id === recordClassId)
        : []
      : scope.students;
    if (!recordStudentSearch.trim()) return base;
    return base.filter((s) =>
      matchesBilingualSearch(recordStudentSearch, s.name_en, s.name_ar, s.iqama_id)
    );
  }, [scope, recordClassId, recordStudentSearch]);

  const activeCategories = useMemo(
    () => behaviorCategories.filter((c) => c.is_active),
    [behaviorCategories]
  );

  // Maps for quick lookup
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const studentClassMap = useMemo(
    () => new Map(students.map((s) => [s.id, s.class_section_id])),
    [students]
  );
  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const catMap = useMemo(
    () => new Map(behaviorCategories.map((c) => [c.id, c])),
    [behaviorCategories]
  );
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const scopedLogs = useMemo(() => {
    if (!userProfile) return [];
    // Teachers strictly see ONLY behavior logs recorded by themselves (not by other teachers)
    if (activeRole === 'teacher') {
      return logs.filter((l) => l.teacher_id === userProfile.id);
    }
    if (scope.isUnrestricted) return logs;
    return logs.filter((l) => scope.classSectionIds.has(l.class_section_id));
  }, [logs, userProfile, activeRole, scope]);

  const todaysFeed = useMemo(() => {
    const todayLogs = scopedLogs.filter(
      (l) => getRiyadhParts(new Date(l.created_at)).dateStr === riyadhToday
    );
    if (!feedSearchQuery.trim()) return todayLogs;
    return todayLogs.filter((log) => {
      const st = studentMap.get(log.student_id);
      const teacher = profMap.get(log.teacher_id);
      const cat = catMap.get(log.behavior_category_id);
      return matchesBilingualSearch(
        feedSearchQuery,
        st?.name_en,
        st?.name_ar,
        st?.iqama_id,
        teacher?.name_en,
        teacher?.name_ar,
        cat?.name_en,
        cat?.name_ar,
        log.notes
      );
    });
  }, [scopedLogs, riyadhToday, feedSearchQuery, studentMap, profMap, catMap]);

  const watchlist = useMemo(() => {
    return computeBehaviorWatchlist({
      logs: scopedLogs,
      students: scope.students,
      timeframe,
      riyadhToday,
      threshold,
    });
  }, [scopedLogs, scope.students, timeframe, riyadhToday, threshold]);

  const filteredStudents = useMemo(() => {
    const activeGradeFilter =
      filterGradeId && scope.gradeIds.has(filterGradeId) ? filterGradeId : '';
    const activeSectionFilter =
      filterSectionId && scope.sectionIds.has(filterSectionId) ? filterSectionId : '';
    return scope.students.filter((s) => {
      if (activeGradeFilter && s.grade_id !== activeGradeFilter) return false;
      if (activeSectionFilter && s.section_id !== activeSectionFilter) return false;
      return matchesBilingualSearch(searchQuery, s.iqama_id, s.name_en, s.name_ar);
    });
  }, [scope, searchQuery, filterGradeId, filterSectionId]);

  const scopedLogsByStudent = useMemo(() => {
    const map = new Map<string, BehaviorLog[]>();
    for (const log of scopedLogs) {
      const list = map.get(log.student_id) || [];
      list.push(log);
      map.set(log.student_id, list);
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      map.set(key, list);
    }
    return map;
  }, [scopedLogs]);

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudent) return [];
    return scopedLogsByStudent.get(selectedStudent.id) || [];
  }, [scopedLogsByStudent, selectedStudent]);

  const reportLogs = useMemo(() => {
    if (!userProfile) return [];
    if (activeRole === 'teacher') {
      return filterBehaviorLogsForReport({
        logs: scopedLogs,
        fromDate: reportFromDate,
        toDate: reportToDate,
        teacherOnlyId: userProfile.id,
        classSectionId: reportClassId || undefined,
        studentClassMap,
      });
    }
    if (!reportClassId) return [];
    return filterBehaviorLogsForReport({
      logs: scopedLogs,
      fromDate: reportFromDate,
      toDate: reportToDate,
      classSectionId: reportClassId,
      studentClassMap,
    });
  }, [
    userProfile,
    activeRole,
    scopedLogs,
    reportFromDate,
    reportToDate,
    reportClassId,
    studentClassMap,
  ]);

  const reportClassStudents = useMemo(() => {
    if (!canSupervise || !reportClassId) return [];
    return scope.students
      .filter((s) => s.class_section_id === reportClassId)
      .slice()
      .sort((a, b) => getLocalizedName(a, lang).localeCompare(getLocalizedName(b, lang)));
  }, [canSupervise, reportClassId, scope.students, lang]);

  const reportClassStudentRows = useMemo(() => {
    if (!canSupervise) return [];
    const byStudent = new Map<string, BehaviorLog[]>();
    for (const l of reportLogs) {
      const arr = byStudent.get(l.student_id) || [];
      arr.push(l);
      byStudent.set(l.student_id, arr);
    }
    return reportClassStudents.map((st) => {
      const stLogs = byStudent.get(st.id) || [];
      const teacherCounts = new Map<string, number>();
      for (const l of stLogs) {
        const t = profMap.get(l.teacher_id);
        const tName = t ? getLocalizedName(t, lang) : 'Staff';
        teacherCounts.set(tName, (teacherCounts.get(tName) || 0) + 1);
      }
      return {
        student: st,
        logs: stLogs,
        count: stLogs.length,
        level: getBehaviorLevel(stLogs.length),
        teacherSummary: [...teacherCounts.entries()].sort((a, b) => b[1] - a[1]),
      };
    });
  }, [canSupervise, reportLogs, reportClassStudents, profMap, lang]);

  const selectedStudentBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of selectedStudentLogs) {
      const cat = catMap.get(l.behavior_category_id);
      const label = cat ? getLocalizedName(cat, lang) : '-';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [selectedStudentLogs, catMap, lang]);

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setFormMsg(null);

    if ((!recordClassId && !recordStudentId) || !recordStudentId || !recordCategoryId) {
      setFormMsg({
        type: 'err',
        text:
          lang === 'ar'
            ? 'يرجى تحديد الفصل والطالب ونوع المخالفة السلوكية'
            : 'Please select class, student, and behavior category',
      });
      return;
    }

    setSubmitting(true);
    try {
      const targetStudent = studentMap.get(recordStudentId);
      const effectiveClassId = recordClassId || targetStudent?.class_section_id || '';
      const { error } = await supabase.from('behavior_logs').insert({
        student_id: recordStudentId,
        teacher_id: userProfile.id,
        class_section_id: effectiveClassId,
        subject_id: userProfile.primary_subject_id || null,
        behavior_category_id: recordCategoryId,
        period_number: recordPeriod ? Number(recordPeriod) : null,
        notes: recordNotes.trim() || null,
      });

      if (error) {
        setFormMsg({ type: 'err', text: error.message });
        return;
      }

      setRecordStudentId('');
      setRecordCategoryId('');
      setRecordPeriod('');
      setRecordNotes('');
      setFormMsg({
        type: 'ok',
        text:
          lang === 'ar'
            ? 'تم تسجيل الملاحظة السلوكية بنجاح'
            : 'Behavior incident recorded successfully',
      });
      await loadLogs();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    setDeleteError(null);
    setDeletingLogId(id);
    try {
      const { error } = await supabase.from('behavior_logs').delete().eq('id', id);
      if (error) {
        setDeleteError(error.message);
        return;
      }
      setConfirmDeleteLogId(null);
      await loadLogs();
    } finally {
      setDeletingLogId(null);
    }
  };

  const handleExportPdf = async (student: Student) => {
    setExportingPdf(true);
    try {
      const stLogs = scopedLogs.filter((l) => l.student_id === student.id);
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
      setExportingPdf(false);
    }
  };

  const handleExportRangePdf = async () => {
    if (!userProfile) return;
    setExportingRangePdf(true);
    try {
      if (activeRole === 'teacher') {
        const classLabel = reportClassId
          ? classMap.get(reportClassId)?.display_name_en || 'Selected Class'
          : 'All Assigned Classes';
        await exportTeacherBehaviorRangePdf({
          teacher: userProfile,
          fromDate: reportFromDate,
          toDate: reportToDate,
          classFilterLabel: classLabel,
          logs: reportLogs,
          students,
          classSections,
          categories: behaviorCategories,
          subjects,
          settings: schoolSettings,
        });
      } else {
        const targetClass = classMap.get(reportClassId);
        if (!targetClass) return;
        await exportClassBehaviorRangePdf({
          classSection: targetClass,
          fromDate: reportFromDate,
          toDate: reportToDate,
          generatedBy: userProfile,
          classStudents: reportClassStudents,
          logs: reportLogs,
          categories: behaviorCategories,
          subjects,
          profiles,
          settings: schoolSettings,
        });
      }
    } finally {
      setExportingRangePdf(false);
    }
  };

  const buildParentBehaviorMessage = (student: Student, categoryName?: string) => {
    const school = schoolSettings?.school_name_en || 'Middle East International School';
    if (lang === 'ar') {
      return `السلام عليكم ولي أمر الطالب ${student.name_ar}، نود إشعاركم من ${schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية'} بخصوص متابعة السلوك المدرسي${categoryName ? ` (${categoryName})` : ''}. نأمل تعاونكم لما فيه مصلحة الطالب.`;
    }
    return `Dear Parent of ${student.name_en}, greetings from ${school}. We are reaching out regarding a student behavior note${categoryName ? ` (${categoryName})` : ''}. Thank you for your continued cooperation.`;
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900">
            {lang === 'ar' ? 'إدارة السلوك الطلابي' : 'Student Behavior & Watchlist'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'ar'
              ? 'تسجيل الملاحظات السلوكية، متابعة الحالات المتكررة، وإشعار أولياء الأمور.'
              : 'Record behavioral incidents, track high-frequency watchlists, and export English PDF reports.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowRecordForm((v) => !v);
            setFormMsg(null);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full meis-pill-dark text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تسجيل مخالفة سلوكية' : 'Record Behavior Incident'}</span>
        </button>
      </div>

      {/* Record Behavior Form */}
      {showRecordForm && (
        <section className="meis-card rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'تسجيل ملاحظة سلوكية جديدة' : 'New Behavior Incident Entry'}
            </h2>
            {!scope.isUnrestricted && availableRecordClasses.length === 0 && (
              <span className="text-xs font-semibold text-amber-700 px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
                {lang === 'ar'
                  ? 'لا توجد فصول معينة لحسابك بعد — تواصل مع مدير النظام.'
                  : 'No class sections assigned to your account yet.'}
              </span>
            )}
          </div>

          <form onSubmit={handleRecordSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'الفصل الدراسي' : 'Class Section'}
              </label>
              <select
                value={recordClassId}
                onChange={(e) => {
                  setRecordClassId(e.target.value);
                  setRecordStudentId('');
                }}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="">{lang === 'ar' ? 'كل الفصول المسندة' : 'All Assigned Classes'}</option>
                {availableRecordClasses.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {getLocalizedDisplayName(cs, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'بحث واختيار الطالب (عربي / إنجليزي)' : 'Search & Select Student (EN/AR)'}
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3.5" />
                  <input
                    type="text"
                    value={recordStudentSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRecordStudentSearch(val);
                    }}
                    placeholder={
                      lang === 'ar' ? 'ابحث باسم الطالب أو الإقامة...' : 'Search student EN / AR / ID...'
                    }
                    className="w-full ps-9 pe-3.5 py-2 rounded-full border border-slate-200/80 bg-white/90 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                  />
                </div>
                <select
                  required
                  value={recordStudentId}
                  onChange={(e) => {
                    const stId = e.target.value;
                    setRecordStudentId(stId);
                    const st = studentMap.get(stId);
                    if (st && !recordClassId) setRecordClassId(st.class_section_id);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value="">
                    {lang === 'ar' ? '-- اختر الطالب --' : '-- Select Student --'}
                  </option>
                  {studentsInSelectedClass.map((st) => (
                    <option key={st.id} value={st.id}>
                      {getLocalizedName(st, lang)} ({st.iqama_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'نوع السلوك' : 'Behavior Category'}
              </label>
              <select
                required
                value={recordCategoryId}
                onChange={(e) => setRecordCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="">
                  {lang === 'ar' ? '-- اختر السلوك --' : '-- Select Behavior --'}
                </option>
                {activeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getLocalizedName(cat, lang)} ({cat.severity_points})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'رقم الحصة (اختياري)' : 'Period Number (Optional)'}
              </label>
              <select
                value={recordPeriod}
                onChange={(e) => setRecordPeriod(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              >
                <option value="">{lang === 'ar' ? 'غير محدد' : 'Not specified'}</option>
                {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                  <option key={p} value={p}>
                    {lang === 'ar' ? `الحصة ${p}` : `Period ${p}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'ملاحظات إضافية (اختياري)' : 'Notes (Optional)'}
              </label>
              <input
                type="text"
                value={recordNotes}
                onChange={(e) => setRecordNotes(e.target.value)}
                placeholder={lang === 'ar' ? 'تفاصيل مختصرة...' : 'Brief incident context...'}
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap shadow-sm"
              >
                {submitting ? tr('loading', lang) : tr('submit', lang)}
              </button>
            </div>
          </form>

          {formMsg && (
            <div
              className={`mt-4 px-4 py-3 rounded-2xl text-xs font-semibold border ${
                formMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {formMsg.text}
            </div>
          )}
        </section>
      )}

      {/* Supervisor / Principal Watchlist & Today's Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Watchlist Leaderboard */}
        {canSupervise && (
          <section className="lg:col-span-5 meis-card rounded-3xl p-5 sm:p-6 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'ar' ? 'قائمة المتابعة السلوكية' : 'High Negative Behavior Watchlist'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'ar'
                    ? `حد التنبيه: ${threshold} مخالفات فأكثر`
                    : `Alert threshold: ${threshold}+ incidents`}
                </p>
              </div>
              <div className="inline-flex p-1 bg-white/80 border border-slate-200/70 rounded-full gap-0.5">
                {(['today', 'week', 'month', 'all'] as WatchlistTimeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                      timeframe === tf
                        ? 'meis-pill-dark shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tf === 'today' && (lang === 'ar' ? 'اليوم' : 'Today')}
                    {tf === 'week' && (lang === 'ar' ? 'الأسبوع' : 'Week')}
                    {tf === 'month' && (lang === 'ar' ? 'الشهر' : 'Month')}
                    {tf === 'all' && (lang === 'ar' ? 'الكل' : 'All')}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2.5 flex-1">
              {loading ? (
                <p className="text-xs text-slate-500 py-6 text-center">{tr('loading', lang)}</p>
              ) : watchlist.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  {lang === 'ar'
                    ? 'لا توجد مخالفات مسجلة في هذه الفترة.'
                    : 'No behavior incidents recorded in this period.'}
                </p>
              ) : (
                watchlist.slice(0, 8).map((entry) => {
                  const cs = classMap.get(entry.student.class_section_id);
                  return (
                    <div
                      key={entry.student.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                        entry.exceedsThreshold
                          ? 'bg-red-50/80 border-red-200/90'
                          : 'bg-white/85 border-slate-200/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(entry.student)}
                        className="text-start min-w-0 flex-1 cursor-pointer"
                      >
                        <p className="text-sm font-bold text-slate-900 truncate hover:underline">
                          {getLocalizedName(entry.student, lang)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {getLocalizedDisplayName(cs, lang)} ·{' '}
                          <span className="font-mono">{entry.student.iqama_id}</span>
                        </p>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                            entry.exceedsThreshold
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {entry.exceedsThreshold && <AlertTriangle className="w-3.5 h-3.5" />}
                          <span>{entry.incidentCount}</span>
                        </span>
                        <a
                          href={buildWhatsAppUrl(
                            entry.student.father_mobile,
                            buildParentBehaviorMessage(entry.student)
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp parent of ${entry.student.name_en}`}
                          className="p-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Today's Live Behavior Feed */}
        <section
          className={`${canSupervise ? 'lg:col-span-7' : 'lg:col-span-12'} meis-card rounded-3xl p-5 sm:p-6`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/70">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'سجل مخالفات اليوم' : "Today's Behavior Feed"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {riyadhToday} · {todaysFeed.length}{' '}
                {lang === 'ar' ? 'مخالفة مسجلة' : 'logged today'}
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3.5" />
              <input
                type="text"
                value={feedSearchQuery}
                onChange={(e) => setFeedSearchQuery(e.target.value)}
                placeholder={
                  lang === 'ar' ? 'بحث بالطالب أو المعلم...' : 'Search student or teacher (EN/AR)...'
                }
                className="w-full ps-9 pe-3.5 py-2 rounded-full border border-slate-200/80 bg-white/90 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2.5 max-h-[420px] overflow-y-auto pe-1">
            {loading ? (
              <p className="text-xs text-slate-500 py-8 text-center">{tr('loading', lang)}</p>
            ) : todaysFeed.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center">
                {lang === 'ar'
                  ? 'لا توجد مخالفات سلوكية مسجلة اليوم.'
                  : 'No behavior incidents recorded today.'}
              </p>
            ) : (
              todaysFeed.map((log) => {
                const st = studentMap.get(log.student_id);
                const cat = catMap.get(log.behavior_category_id);
                const cs = classMap.get(log.class_section_id);
                const teacher = profMap.get(log.teacher_id);
                const sub = log.subject_id ? subMap.get(log.subject_id) : undefined;
                const timeText = new Intl.DateTimeFormat('en-US', {
                  timeZone: 'Asia/Riyadh',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                }).format(new Date(log.created_at));

                return (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-2xl bg-white/85 border border-slate-200/70 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-mono tabular-nums text-slate-700">{timeText}</span>
                        <span aria-hidden="true">·</span>
                        <span>{getLocalizedDisplayName(cs, lang)}</span>
                        {log.period_number && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="px-2 py-0.5 rounded-full meis-accent-pill text-[11px] font-semibold">
                              {lang === 'ar' ? `حصة ${log.period_number}` : `P${log.period_number}`}
                            </span>
                          </>
                        )}
                        {sub && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{getLocalizedName(sub, lang)}</span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => st && setSelectedStudent(st)}
                        className="text-sm font-bold text-slate-900 hover:underline text-start cursor-pointer"
                      >
                        {st ? getLocalizedName(st, lang) : 'Student'}
                      </button>
                      <p className="text-xs font-semibold text-red-700 mt-0.5">
                        {cat ? getLocalizedName(cat, lang) : '-'}
                        {teacher && (
                          <span className="text-slate-500 font-normal">
                            {' '}
                            · {getLocalizedName(teacher, lang)}
                          </span>
                        )}
                      </p>
                      {log.notes && <p className="text-xs text-slate-600 mt-1">{log.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {st && (
                        <a
                          href={buildWhatsAppUrl(
                            st.father_mobile,
                            buildParentBehaviorMessage(st, cat ? getLocalizedName(cat, lang) : undefined)
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{tr('whatsappFather', lang)}</span>
                        </a>
                      )}
                      {(activeRole === 'admin' || log.teacher_id === userProfile?.id) && (
                        <button
                          type="button"
                          disabled={deletingLogId === log.id}
                          aria-label="Delete behavior incident"
                          onClick={() => void handleDeleteLog(log.id)}
                          className="p-2 rounded-full border border-slate-200/80 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Student Search & Full Behavior Directory */}
      <section className="meis-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/70">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'بحث وملفات سلوك الطلاب' : 'Student Search & Behavior Profiles'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'ar'
                ? 'ابحث بالاسم أو رقم الإقامة أو الصف، وافتح سجل أي طالب لعرض جميع المخالفات (بما فيها الأيام السابقة) وحذفها أو تصديرها.'
                : 'Search by ID/Iqama, name, or Grade & Section to view all recorded behavior (including previous days) and delete or export entries.'}
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {lang === 'ar'
              ? `عدد الطلاب المطابقين: ${filteredStudents.length}`
              : `Matching students: ${filteredStudents.length}`}
          </span>
        </div>

        {deleteError && (
          <div className="mt-4 px-4 py-3 rounded-2xl text-xs font-semibold border bg-red-50 border-red-200 text-red-700 flex items-center justify-between gap-2">
            <span>{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="p-1 rounded-full hover:bg-red-100 cursor-pointer"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 my-4">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-3 start-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'ابحث برقم الإقامة أو الاسم العربي أو الإنجليزي...'
                  : 'Search by ID/Iqama, Arabic name, or English name...'
              }
              className="w-full ps-10 pe-4 py-2.5 rounded-full border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>

          <select
            aria-label={lang === 'ar' ? 'تصفية حسب الصف' : 'Filter by Grade'}
            value={scope.gradeIds.has(filterGradeId) ? filterGradeId : ''}
            onChange={(e) => setFilterGradeId(e.target.value)}
            className="px-4 py-2.5 rounded-full border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            <option value="">{lang === 'ar' ? 'جميع الصفوف' : 'All Assigned Grades'}</option>
            {scope.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {getLocalizedName(g, lang)}
              </option>
            ))}
          </select>

          <select
            aria-label={lang === 'ar' ? 'تصفية حسب الشعبة' : 'Filter by Section'}
            value={scope.sectionIds.has(filterSectionId) ? filterSectionId : ''}
            onChange={(e) => setFilterSectionId(e.target.value)}
            className="px-4 py-2.5 rounded-full border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            <option value="">{lang === 'ar' ? 'جميع الشعب' : 'All Assigned Sections'}</option>
            {scope.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {getLocalizedName(s, lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 text-xs text-slate-500">
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'رقم الإقامة / الهوية' : 'ID / Iqama'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'اسم الطالب' : 'Student Name'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'الفصل' : 'Class'}
                </th>
                <th className="py-2.5 px-3 text-end font-semibold">
                  {lang === 'ar' ? 'المخالفات' : 'Incidents'}
                </th>
                <th className="py-2.5 px-3 text-end font-semibold">
                  {lang === 'ar' ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.slice(0, searchQuery || filterGradeId || filterSectionId ? 100 : 50).map((st) => {
                const stLogs = scopedLogsByStudent.get(st.id) || [];
                const count = stLogs.length;
                const cs = classMap.get(st.class_section_id);
                const isExpanded = expandedSearchStudentId === st.id;
                return (
                  <React.Fragment key={st.id}>
                    <tr className={`transition-colors ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-white/60'}`}>
                      <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-600">
                        {st.iqama_id}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSearchStudentId((prev) => (prev === st.id ? null : st.id))
                          }
                          className="inline-flex items-center gap-1.5 text-start hover:underline cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <span>{getLocalizedName(st, lang)}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {getLocalizedDisplayName(cs, lang)}
                      </td>
                      <td className="py-3 px-3 text-end tabular-nums font-bold">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSearchStudentId((prev) => (prev === st.id ? null : st.id))
                          }
                          className={`inline-flex items-center justify-center gap-1 min-w-[36px] px-2.5 py-0.5 rounded-full text-xs cursor-pointer ${
                            count >= threshold
                              ? 'bg-red-100 text-red-700 hover:bg-red-200/70'
                              : count > 0
                                ? 'bg-amber-50 text-amber-800 border border-amber-200/70 hover:bg-amber-100/70'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                          }`}
                        >
                          <span>{count}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-end">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSearchStudentId((prev) => (prev === st.id ? null : st.id))
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isExpanded
                                ? lang === 'ar'
                                  ? 'إخفاء السجل'
                                  : 'Hide Records'
                                : lang === 'ar'
                                  ? 'عرض السجل'
                                  : 'All Records'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(st)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200/80 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <User className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'الملف السلوكي' : 'View Profile'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/75">
                        <td colSpan={5} className="px-4 py-3.5">
                          {stLogs.length === 0 ? (
                            <p className="text-xs text-slate-500 py-2 text-center">
                              {lang === 'ar'
                                ? 'لا توجد مخالفات سلوكية مسجلة لهذا الطالب.'
                                : 'No behavior incidents recorded for this student.'}
                            </p>
                          ) : (
                            <div className="rounded-2xl border border-slate-200/80 bg-white overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-slate-500">
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'التاريخ' : 'Date'}
                                    </th>
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'الوقت' : 'Time'}
                                    </th>
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'الحصة' : 'Period'}
                                    </th>
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'السلوك' : 'Behavior'}
                                    </th>
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'المعلم' : 'Teacher'}
                                    </th>
                                    <th className="py-2 px-3 text-start font-semibold">
                                      {lang === 'ar' ? 'ملاحظات' : 'Notes'}
                                    </th>
                                    <th className="py-2 px-3 text-end font-semibold">
                                      {lang === 'ar' ? 'حذف' : 'Delete'}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {stLogs.map((l) => {
                                    const dt = new Date(l.created_at);
                                    const datePart = getRiyadhParts(dt).dateStr;
                                    const timePart = new Intl.DateTimeFormat('en-US', {
                                      timeZone: 'Asia/Riyadh',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    }).format(dt);
                                    const canDelete =
                                      activeRole === 'admin' || l.teacher_id === userProfile?.id;
                                    const isConfirming = confirmDeleteLogId === l.id;
                                    const isDeleting = deletingLogId === l.id;
                                    return (
                                      <tr key={l.id} className="hover:bg-slate-50/70">
                                        <td className="py-2 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                          {datePart}
                                        </td>
                                        <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                          {timePart}
                                        </td>
                                        <td className="py-2 px-3 tabular-nums text-slate-600">
                                          {l.period_number ? `P${l.period_number}` : '-'}
                                        </td>
                                        <td className="py-2 px-3 font-semibold text-red-700">
                                          {getLocalizedName(catMap.get(l.behavior_category_id), lang)}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600">
                                          {getLocalizedName(profMap.get(l.teacher_id), lang)}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600">
                                          {l.notes || '—'}
                                        </td>
                                        <td className="py-2 px-3 text-end whitespace-nowrap">
                                          {canDelete ? (
                                            isConfirming ? (
                                              <span className="inline-flex items-center gap-1.5">
                                                <button
                                                  type="button"
                                                  disabled={isDeleting}
                                                  onClick={() => void handleDeleteLog(l.id)}
                                                  className="px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                                                >
                                                  {isDeleting
                                                    ? tr('loading', lang)
                                                    : lang === 'ar'
                                                      ? 'تأكيد الحذف'
                                                      : 'Confirm'}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={isDeleting}
                                                  onClick={() => setConfirmDeleteLogId(null)}
                                                  className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-semibold cursor-pointer"
                                                >
                                                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                                </button>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                aria-label="Delete behavior incident"
                                                onClick={() => setConfirmDeleteLogId(l.id)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200/80 bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 cursor-pointer"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                                              </button>
                                            )
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    {lang === 'ar' ? 'لا يوجد طلاب مطابقون للبحث.' : 'No matching students found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Date-Range Behavior Report & PDF Export */}
      <section className="meis-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/70">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {activeRole === 'teacher'
                ? lang === 'ar'
                  ? 'تقرير السلوك الخاص بي حسب الفترة وتصدير PDF'
                  : 'My Recorded Behavior Report & PDF Export'
                : lang === 'ar'
                  ? 'تقرير سلوك الفصل الكامل حسب الفترة وتصدير PDF'
                  : 'Class Behavior Date-Range Report & PDF Export'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeRole === 'teacher'
                ? lang === 'ar'
                  ? 'يعرض فقط المخالفات التي قمت بتسجيلها شخصياً خلال الفترة المحددة.'
                  : 'Displays and exports exclusively behavior incidents recorded by you within the selected date range.'
                : lang === 'ar'
                  ? 'تقرير شامل للفصل يوضح جميع المخالفات المسجلة لكل طالب من مختلف المعلمين مع تنسيق جاهز للطباعة.'
                  : 'Generates a complete class report showing incidents recorded for each student across all teachers.'}
            </p>
          </div>

          <button
            type="button"
            disabled={exportingRangePdf || (!canSupervise ? false : !reportClassId)}
            onClick={() => void handleExportRangePdf()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full meis-pill-dark text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0 shadow-sm"
          >
            <FileDown className="w-4 h-4" />
            <span>
              {exportingRangePdf
                ? tr('loading', lang)
                : lang === 'ar'
                  ? 'تحميل تقرير PDF (إنجليزي)'
                  : 'Download PDF Report'}
            </span>
          </button>
        </div>

        {/* Date Range + Class Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="report-from-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
              {lang === 'ar' ? 'من تاريخ' : 'From Date'}
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute top-3 start-3.5 pointer-events-none" />
              <input
                id="report-from-date"
                type="date"
                dir="ltr"
                value={reportFromDate}
                onChange={(e) => setReportFromDate(e.target.value)}
                className="w-full ps-10 pe-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-to-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
              {lang === 'ar' ? 'إلى تاريخ' : 'To Date'}
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute top-3 start-3.5 pointer-events-none" />
              <input
                id="report-to-date"
                type="date"
                dir="ltr"
                value={reportToDate}
                onChange={(e) => setReportToDate(e.target.value)}
                className="w-full ps-10 pe-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-class-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
              {canSupervise
                ? lang === 'ar'
                  ? 'الفصل الدراسي (مطلوب لتقرير الفصل)'
                  : 'Class Section (Entire Class)'
                : lang === 'ar'
                  ? 'تصفية حسب الفصل (اختياري)'
                  : 'Filter by Class (Optional)'}
            </label>
            <select
              id="report-class-select"
              value={reportClassId}
              onChange={(e) => setReportClassId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200/80 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            >
              {!canSupervise && (
                <option value="">
                  {lang === 'ar' ? 'جميع فصولي المسندة' : 'All My Classes'}
                </option>
              )}
              {availableRecordClasses.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {getLocalizedDisplayName(cs, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Report Preview Table */}
        {activeRole === 'teacher' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 px-1 tabular-nums">
              <span>
                {lang === 'ar' ? 'إجمالي السجلات التي قمت بتسجيلها:' : 'Incidents recorded by you:'}{' '}
                <strong className="text-slate-900">{reportLogs.length}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {lang === 'ar' ? 'الفترة:' : 'Range:'}{' '}
                <span dir="ltr" className="font-mono font-semibold text-slate-800">
                  {reportFromDate} → {reportToDate}
                </span>
              </span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/75">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-xs text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'التاريخ' : 'Date'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الطالب' : 'Student'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الفصل' : 'Class'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الحصة' : 'Period'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'السلوك' : 'Behavior'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'ملاحظات' : 'Notes'}
                    </th>
                    <th className="py-2.5 px-3 text-end font-semibold">
                      {lang === 'ar' ? 'حذف' : 'Delete'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        {lang === 'ar'
                          ? 'لم تقم بتسجيل أي مخالفات سلوكية في هذه الفترة.'
                          : 'You have not recorded any behavior incidents in this date range.'}
                      </td>
                    </tr>
                  ) : (
                    reportLogs.map((l) => {
                      const st = studentMap.get(l.student_id);
                      const cs = classMap.get(l.class_section_id || st?.class_section_id || '');
                      const cat = catMap.get(l.behavior_category_id);
                      const dateStr = getRiyadhParts(new Date(l.created_at)).dateStr;
                      const isConfirming = confirmDeleteLogId === l.id;
                      const isDeleting = deletingLogId === l.id;
                      return (
                        <tr key={l.id} className="hover:bg-white/80">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                            {dateStr}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {st ? getLocalizedName(st, lang) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {getLocalizedDisplayName(cs, lang)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-slate-600">
                            {l.period_number ? `P${l.period_number}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-red-700">
                            {cat ? getLocalizedName(cat, lang) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{l.notes || '—'}</td>
                          <td className="py-2.5 px-3 text-end whitespace-nowrap">
                            {l.teacher_id === userProfile?.id && (
                              isConfirming ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => void handleDeleteLog(l.id)}
                                    className="px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                                  >
                                    {isDeleting
                                      ? tr('loading', lang)
                                      : lang === 'ar'
                                        ? 'تأكيد'
                                        : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteLogId(null)}
                                    className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-semibold cursor-pointer"
                                  >
                                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label="Delete behavior incident"
                                  onClick={() => setConfirmDeleteLogId(l.id)}
                                  className="p-1.5 rounded-full border border-slate-200/80 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 px-1 tabular-nums">
              <span>
                {lang === 'ar' ? 'عدد طلاب الفصل:' : 'Class Students:'}{' '}
                <strong className="text-slate-900">{reportClassStudentRows.length}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {lang === 'ar' ? 'إجمالي المخالفات في الفترة:' : 'Total Class Incidents:'}{' '}
                <strong className="text-slate-900">{reportLogs.length}</strong>
              </span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/75">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-xs text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-start font-semibold">#</th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'اسم الطالب' : 'Student Name'}
                    </th>
                    <th className="py-2.5 px-3 text-center font-semibold">
                      {lang === 'ar' ? 'العدد' : 'Count'}
                    </th>
                    <th className="py-2.5 px-3 text-center font-semibold">
                      {lang === 'ar' ? 'المستوى' : 'Level'}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'سُجلت بواسطة (المعلمون)' : 'Recorded By (Teachers)'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportClassStudentRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        {lang === 'ar'
                          ? 'اختر فصلاً لعرض تقرير الطلاب.'
                          : 'Select a class section to preview the class report.'}
                      </td>
                    </tr>
                  ) : (
                    reportClassStudentRows.map((row, idx) => (
                      <tr key={row.student.id} className="hover:bg-white/80">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {getLocalizedName(row.student, lang)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold tabular-nums text-slate-900">
                          {row.count}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.level === 'green' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                              {lang === 'ar' ? 'أخضر' : 'Green'}
                            </span>
                          )}
                          {row.level === 'orange' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold">
                              {lang === 'ar' ? 'برتقالي' : 'Orange'}
                            </span>
                          )}
                          {row.level === 'red' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                              {lang === 'ar' ? 'أحمر' : 'Red'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-700">
                          {row.teacherSummary.length === 0 ? (
                            <span className="text-slate-400">
                              {lang === 'ar' ? 'لا توجد مخالفات' : 'No incidents'}
                            </span>
                          ) : (
                            row.teacherSummary
                              .map(([tName, c]) => `${tName} (${c})`)
                              .join(' · ')
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Student Comprehensive Behavior Profile Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] border border-white max-w-4xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200/80">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {getLocalizedName(selectedStudent, lang)}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-mono">{selectedStudent.iqama_id}</span> ·{' '}
                  {getLocalizedDisplayName(classMap.get(selectedStudent.class_section_id), lang)} ·{' '}
                  <span dir="ltr" className="font-mono">
                    +{selectedStudent.father_mobile}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={buildWhatsAppUrl(
                    selectedStudent.father_mobile,
                    buildParentBehaviorMessage(selectedStudent)
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{tr('whatsappFather', lang)}</span>
                </a>
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleExportPdf(selectedStudent)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full meis-pill-dark text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{tr('exportPdfEnglish', lang)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Close student profile"
                  onClick={() => {
                    setSelectedStudent(null);
                    setConfirmDeleteLogId(null);
                  }}
                  className="p-2 rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {deleteError && (
              <div className="mt-4 px-4 py-3 rounded-2xl text-xs font-semibold border bg-red-50 border-red-200 text-red-700 flex items-center justify-between gap-2">
                <span>{deleteError}</span>
                <button
                  type="button"
                  onClick={() => setDeleteError(null)}
                  className="p-1 rounded-full hover:bg-red-100 cursor-pointer"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
              <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80">
                <p className="text-xs text-slate-500 font-semibold">
                  {lang === 'ar' ? 'إجمالي المخالفات' : 'Total Incidents'}
                </p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                  {selectedStudentLogs.length}
                </p>
              </div>
              <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80">
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  {lang === 'ar' ? 'التوزيع حسب نوع السلوك' : 'Breakdown by Behavior Type'}
                </p>
                {selectedStudentBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {lang === 'ar' ? 'سجل نظيف بدون مخالفات' : 'Clean behavior record'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                    {selectedStudentBreakdown.map(([label, count]) => (
                      <span
                        key={label}
                        className="px-3 py-1 rounded-full bg-white border border-slate-200/80"
                      >
                        {label}: <strong className="tabular-nums">{count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chronological Log */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'التاريخ' : 'Date'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'الوقت' : 'Time'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'الحصة' : 'Period'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'السلوك' : 'Behavior'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'المعلم' : 'Teacher'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'المادة' : 'Subject'}
                    </th>
                    <th className="py-2 px-2 text-start font-semibold">
                      {lang === 'ar' ? 'ملاحظات' : 'Notes'}
                    </th>
                    <th className="py-2 px-2 text-end font-semibold">
                      {lang === 'ar' ? 'حذف' : 'Delete'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedStudentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                        {lang === 'ar'
                          ? 'لا توجد مخالفات مسجلة لهذا الطالب.'
                          : 'No behavior incidents recorded for this student.'}
                      </td>
                    </tr>
                  ) : (
                    selectedStudentLogs.map((l) => {
                      const dt = new Date(l.created_at);
                      const datePart = getRiyadhParts(dt).dateStr;
                      const timePart = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Riyadh',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      }).format(dt);
                      const canDelete =
                        activeRole === 'admin' || l.teacher_id === userProfile?.id;
                      const isConfirming = confirmDeleteLogId === l.id;
                      const isDeleting = deletingLogId === l.id;
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-2 font-mono tabular-nums whitespace-nowrap">
                            {datePart}
                          </td>
                          <td className="py-2.5 px-2 font-mono tabular-nums whitespace-nowrap">
                            {timePart}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums">
                            {l.period_number ? `P${l.period_number}` : '-'}
                          </td>
                          <td className="py-2.5 px-2 font-semibold text-red-700">
                            {getLocalizedName(catMap.get(l.behavior_category_id), lang)}
                          </td>
                          <td className="py-2.5 px-2">
                            {getLocalizedName(profMap.get(l.teacher_id), lang)}
                          </td>
                          <td className="py-2.5 px-2">
                            {l.subject_id ? getLocalizedName(subMap.get(l.subject_id), lang) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600">{l.notes || '—'}</td>
                          <td className="py-2.5 px-2 text-end whitespace-nowrap">
                            {canDelete ? (
                              isConfirming ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => void handleDeleteLog(l.id)}
                                    className="px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                                  >
                                    {isDeleting
                                      ? tr('loading', lang)
                                      : lang === 'ar'
                                        ? 'تأكيد'
                                        : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteLogId(null)}
                                    className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-semibold cursor-pointer"
                                  >
                                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label="Delete behavior incident"
                                  onClick={() => setConfirmDeleteLogId(l.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200/80 bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                                </button>
                              )
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
