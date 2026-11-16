import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
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
import { exportBehaviorReportPdf } from '../utils/pdfExport';
import { getRiyadhParts } from '../utils/riyadhTime';
import {
  buildWhatsAppUrl,
  computeBehaviorWatchlist,
  getRoleScope,
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
  const [recordStudentId, setRecordStudentId] = useState('');
  const [recordCategoryId, setRecordCategoryId] = useState('');
  const [recordPeriod, setRecordPeriod] = useState<string>('');
  const [recordNotes, setRecordNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Watchlist & Search State
  const [timeframe, setTimeframe] = useState<WatchlistTimeframe>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGradeId, setFilterGradeId] = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const riyadhToday = getRiyadhParts(new Date()).dateStr;
  const threshold = schoolSettings?.high_behavior_threshold ?? 3;
  const activeRole = userProfile?.active_role || 'teacher';
  const canSupervise = activeRole !== 'teacher';

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('behavior_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLogs(data as BehaviorLog[]);
    setLoading(false);
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

  const studentsInSelectedClass = useMemo(() => {
    if (!recordClassId || !scope.classSectionIds.has(recordClassId)) return [];
    return scope.students.filter((s) => s.class_section_id === recordClassId);
  }, [scope, recordClassId]);

  const activeCategories = useMemo(
    () => behaviorCategories.filter((c) => c.is_active),
    [behaviorCategories]
  );

  // Maps for quick lookup
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const catMap = useMemo(
    () => new Map(behaviorCategories.map((c) => [c.id, c])),
    [behaviorCategories]
  );
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const scopedLogs = useMemo(() => {
    if (!userProfile || scope.isUnrestricted) return logs;
    if (activeRole === 'teacher') {
      return logs.filter(
        (l) =>
          scope.classSectionIds.has(l.class_section_id) ||
          (scope.classSectionIds.size === 0 && l.teacher_id === userProfile.id)
      );
    }
    return logs.filter((l) => scope.classSectionIds.has(l.class_section_id));
  }, [logs, userProfile, activeRole, scope]);

  const todaysFeed = useMemo(() => {
    return scopedLogs.filter(
      (l) => getRiyadhParts(new Date(l.created_at)).dateStr === riyadhToday
    );
  }, [scopedLogs, riyadhToday]);

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
    const q = searchQuery.trim().toLowerCase();
    const activeGradeFilter =
      filterGradeId && scope.gradeIds.has(filterGradeId) ? filterGradeId : '';
    const activeSectionFilter =
      filterSectionId && scope.sectionIds.has(filterSectionId) ? filterSectionId : '';
    return scope.students.filter((s) => {
      if (activeGradeFilter && s.grade_id !== activeGradeFilter) return false;
      if (activeSectionFilter && s.section_id !== activeSectionFilter) return false;
      if (!q) return true;
      return (
        s.iqama_id.toLowerCase().includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.name_ar.toLowerCase().includes(q)
      );
    });
  }, [scope, searchQuery, filterGradeId, filterSectionId]);

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudent) return [];
    return logs
      .filter((l) => l.student_id === selectedStudent.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [logs, selectedStudent]);

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

    if (!recordClassId || !recordStudentId || !recordCategoryId) {
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
      const { error } = await supabase.from('behavior_logs').insert({
        student_id: recordStudentId,
        teacher_id: userProfile.id,
        class_section_id: recordClassId,
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
    await supabase.from('behavior_logs').delete().eq('id', id);
    await loadLogs();
  };

  const handleExportPdf = async (student: Student) => {
    setExportingPdf(true);
    try {
      const stLogs = logs.filter((l) => l.student_id === student.id);
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
          <h1 className="text-2xl font-bold text-slate-900">
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
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تسجيل مخالفة سلوكية' : 'Record Behavior Incident'}</span>
        </button>
      </div>

      {/* Record Behavior Form */}
      {showRecordForm && (
        <section className="meis-glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'تسجيل ملاحظة سلوكية جديدة' : 'New Behavior Incident Entry'}
            </h2>
            {!scope.isUnrestricted && availableRecordClasses.length === 0 && (
              <span className="text-xs font-semibold text-amber-700">
                {lang === 'ar'
                  ? 'لا توجد فصول معينة لحسابك بعد — تواصل مع مدير النظام.'
                  : 'No class sections assigned to your account yet.'}
              </span>
            )}
          </div>

          <form onSubmit={handleRecordSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'الفصل الدراسي' : 'Class Section'}
              </label>
              <select
                required
                value={recordClassId}
                onChange={(e) => {
                  setRecordClassId(e.target.value);
                  setRecordStudentId('');
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">{lang === 'ar' ? '-- اختر الفصل --' : '-- Select Class --'}</option>
                {availableRecordClasses.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {getLocalizedDisplayName(cs, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'الطالب' : 'Student'}
              </label>
              <select
                required
                disabled={!recordClassId}
                value={recordStudentId}
                onChange={(e) => setRecordStudentId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm disabled:bg-slate-100"
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'نوع السلوك' : 'Behavior Category'}
              </label>
              <select
                required
                value={recordCategoryId}
                onChange={(e) => setRecordCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'رقم الحصة (اختياري)' : 'Period Number (Optional)'}
              </label>
              <select
                value={recordPeriod}
                onChange={(e) => setRecordPeriod(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'ملاحظات إضافية (اختياري)' : 'Notes (Optional)'}
              </label>
              <input
                type="text"
                value={recordNotes}
                onChange={(e) => setRecordNotes(e.target.value)}
                placeholder={lang === 'ar' ? 'تفاصيل مختصرة...' : 'Brief incident context...'}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting ? tr('loading', lang) : tr('submit', lang)}
              </button>
            </div>
          </form>

          {formMsg && (
            <div
              className={`mt-4 p-3 rounded-xl text-xs font-semibold border ${
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
          <section className="lg:col-span-5 meis-glass rounded-2xl p-5 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/80">
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
              <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                {(['today', 'week', 'month', 'all'] as WatchlistTimeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      timeframe === tf
                        ? 'bg-white text-slate-900 shadow-xs'
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
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        entry.exceedsThreshold
                          ? 'bg-red-50/70 border-red-200'
                          : 'bg-white border-slate-200/80'
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
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${
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
                          className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
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
          className={`${canSupervise ? 'lg:col-span-7' : 'lg:col-span-12'} meis-glass rounded-2xl p-5`}
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'سجل مخالفات اليوم' : "Today's Behavior Feed"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {riyadhToday} · {todaysFeed.length}{' '}
                {lang === 'ar' ? 'مخالفة مسجلة' : 'logged today'}
              </p>
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
                    className="p-3.5 rounded-xl bg-white border border-slate-200/80 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-mono tabular-nums text-slate-700">{timeText}</span>
                        <span aria-hidden="true">·</span>
                        <span>{getLocalizedDisplayName(cs, lang)}</span>
                        {log.period_number && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{tr('whatsappFather', lang)}</span>
                        </a>
                      )}
                      {(activeRole === 'admin' || log.teacher_id === userProfile?.id) && (
                        <button
                          type="button"
                          aria-label="Delete behavior incident"
                          onClick={() => void handleDeleteLog(log.id)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
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
      <section className="meis-glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === 'ar' ? 'بحث وملفات سلوك الطلاب' : 'Student Search & Behavior Profiles'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === 'ar'
                ? 'ابحث برقم الهوية/الإقامة أو الاسم أو الفصل لعرض السجل الكامل وتصدير PDF.'
                : 'Search by ID/Iqama or student name, or filter by Grade & Section.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 my-4">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-3 start-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'ابحث برقم الإقامة أو الاسم العربي أو الإنجليزي...'
                  : 'Search by ID/Iqama, Arabic name, or English name...'
              }
              className="w-full ps-10 pe-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>

          <select
            aria-label={lang === 'ar' ? 'تصفية حسب الصف' : 'Filter by Grade'}
            value={scope.gradeIds.has(filterGradeId) ? filterGradeId : ''}
            onChange={(e) => setFilterGradeId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
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
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
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
              <tr className="border-b border-slate-200 text-xs text-slate-500">
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
              {filteredStudents.slice(0, 30).map((st) => {
                const count = logs.filter((l) => l.student_id === st.id).length;
                const cs = classMap.get(st.class_section_id);
                return (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-600">
                      {st.iqama_id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {getLocalizedName(st, lang)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {getLocalizedDisplayName(cs, lang)}
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-bold">
                      <span className={count >= threshold ? 'text-red-600' : 'text-slate-700'}>
                        {count}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(st)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'الملف السلوكي' : 'View Profile'}</span>
                      </button>
                    </td>
                  </tr>
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

      {/* Student Comprehensive Behavior Profile Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-4xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{tr('whatsappFather', lang)}</span>
                </a>
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleExportPdf(selectedStudent)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{tr('exportPdfEnglish', lang)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Close student profile"
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">
                  {lang === 'ar' ? 'إجمالي المخالفات' : 'Total Incidents'}
                </p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                  {selectedStudentLogs.length}
                </p>
              </div>
              <div className="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  {lang === 'ar' ? 'التوزيع حسب نوع السلوك' : 'Breakdown by Behavior Type'}
                </p>
                {selectedStudentBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {lang === 'ar' ? 'سجل نظيف بدون مخالفات' : 'Clean behavior record'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                    {selectedStudentBreakdown.map(([label, count]) => (
                      <span key={label}>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedStudentLogs.map((l) => {
                    const dt = new Date(l.created_at);
                    const datePart = getRiyadhParts(dt).dateStr;
                    const timePart = new Intl.DateTimeFormat('en-US', {
                      timeZone: 'Asia/Riyadh',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    }).format(dt);
                    return (
                      <tr key={l.id}>
                        <td className="py-2 px-2 font-mono tabular-nums">{datePart}</td>
                        <td className="py-2 px-2 font-mono tabular-nums">{timePart}</td>
                        <td className="py-2 px-2 tabular-nums">
                          {l.period_number ? `P${l.period_number}` : '-'}
                        </td>
                        <td className="py-2 px-2 font-semibold text-red-700">
                          {getLocalizedName(catMap.get(l.behavior_category_id), lang)}
                        </td>
                        <td className="py-2 px-2">
                          {getLocalizedName(profMap.get(l.teacher_id), lang)}
                        </td>
                        <td className="py-2 px-2">
                          {l.subject_id ? getLocalizedName(subMap.get(l.subject_id), lang) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
