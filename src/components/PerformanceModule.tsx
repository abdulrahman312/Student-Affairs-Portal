import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileDown,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type {
  PerformanceComment,
  PerformanceRequest,
  Student,
  TimetableSlot,
} from '../types/database';
import { getLocalizedDisplayName, getLocalizedName, tr } from '../utils/i18n';
import { exportPerformanceReportPdf } from '../utils/pdfExport';
import { getRiyadhParts } from '../utils/riyadhTime';
import { buildWhatsAppUrl, getRoleScope } from '../utils/schoolRules';

export const PerformanceModule: React.FC = () => {
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
    students,
    staffAssignments,
  } = useApp();

  const [requests, setRequests] = useState<PerformanceRequest[]>([]);
  const [comments, setComments] = useState<PerformanceComment[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Request Form State
  const [searchIqama, setSearchIqama] = useState('');
  const [reqGradeId, setReqGradeId] = useState('');
  const [reqSectionId, setReqSectionId] = useState('');
  const [reqStudentId, setReqStudentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Teacher comment drafts
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  // Preview modal
  const [previewReq, setPreviewReq] = useState<PerformanceRequest | null>(null);

  const activeRole = userProfile?.active_role || 'teacher';
  const canRequest =
    activeRole === 'principal' ||
    activeRole === 'academic_supervisor' ||
    activeRole === 'admin';
  const canViewTracker = canRequest || activeRole === 'supervisor';

  const loadData = async () => {
    setLoading(true);
    const [reqRes, comRes, ttRes] = await Promise.all([
      supabase.from('performance_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('performance_comments').select('*'),
      supabase.from('timetable_slots').select('*'),
    ]);
    if (reqRes.data) setRequests(reqRes.data as PerformanceRequest[]);
    if (comRes.data) {
      const list = comRes.data as PerformanceComment[];
      setComments(list);
      const nextDrafts: Record<string, string> = {};
      for (const c of list) {
        nextDrafts[c.id] = c.comment_text || '';
      }
      setDrafts(nextDrafts);
    }
    if (ttRes.data) setTimetableSlots(ttRes.data as TimetableSlot[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
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

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);
  const subMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const matchingRequestStudents = useMemo(() => {
    const q = searchIqama.trim().toLowerCase();
    const activeGrade = reqGradeId && scope.gradeIds.has(reqGradeId) ? reqGradeId : '';
    const activeSection = reqSectionId && scope.sectionIds.has(reqSectionId) ? reqSectionId : '';
    return scope.students.filter((s) => {
      if (activeGrade && s.grade_id !== activeGrade) return false;
      if (activeSection && s.section_id !== activeSection) return false;
      if (!q) return true;
      return (
        s.iqama_id.toLowerCase().includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.name_ar.toLowerCase().includes(q)
      );
    });
  }, [scope, searchIqama, reqGradeId, reqSectionId]);

  const handleRequestReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !reqStudentId) return;
    setStatusMsg(null);
    setCreating(true);

    try {
      const student = studentMap.get(reqStudentId);
      if (!student) return;

      const todayStr = getRiyadhParts(new Date()).dateStr;
      const { data: reqData, error: reqErr } = await supabase
        .from('performance_requests')
        .insert({
          student_id: student.id,
          requested_by: userProfile.id,
          request_date: todayStr,
          status: 'pending',
        })
        .select()
        .single();

      if (reqErr || !reqData) {
        setStatusMsg({ type: 'err', text: reqErr?.message || 'Failed to create request' });
        return;
      }

      // Find teachers assigned to student.class_section_id from staff_class_assignments or timetable_slots
      const teacherSubjects = new Map<string, { teacher_id: string; subject_id: string }>();

      for (const a of staffAssignments) {
        if (a.class_section_id !== student.class_section_id) continue;
        const prof = profMap.get(a.user_id);
        const subId = a.subject_id || prof?.primary_subject_id;
        if (subId && prof?.roles.includes('teacher')) {
          teacherSubjects.set(`${subId}:${a.user_id}`, {
            teacher_id: a.user_id,
            subject_id: subId,
          });
        }
      }

      for (const tt of timetableSlots) {
        if (tt.class_section_id !== student.class_section_id) continue;
        if (tt.subject_id && tt.teacher_id) {
          teacherSubjects.set(`${tt.subject_id}:${tt.teacher_id}`, {
            teacher_id: tt.teacher_id,
            subject_id: tt.subject_id,
          });
        }
      }

      if (teacherSubjects.size > 0) {
        const commentRows = [...teacherSubjects.values()].map((item) => ({
          request_id: (reqData as PerformanceRequest).id,
          subject_id: item.subject_id,
          teacher_id: item.teacher_id,
          comment_text: null,
          is_submitted: false,
        }));
        const { error: comErr } = await supabase.from('performance_comments').insert(commentRows);
        if (comErr) {
          setStatusMsg({ type: 'err', text: comErr.message });
          await loadData();
          return;
        }
        setStatusMsg({
          type: 'ok',
          text:
            lang === 'ar'
              ? `تم إرسال الطلب وإشعار ${commentRows.length} معلم بنجاح.`
              : `Performance report requested and ${commentRows.length} subject teachers notified.`,
        });
      } else {
        setStatusMsg({
          type: 'ok',
          text:
            lang === 'ar'
              ? 'تم إنشاء الطلب، ولكن لا يوجد معلمون معيّنون لهذا الفصل حالياً.'
              : 'Request created, though no teachers are currently assigned to this class section.',
        });
      }

      setReqStudentId('');
      await loadData();
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    await supabase.from('performance_comments').delete().eq('request_id', id);
    await supabase.from('performance_requests').delete().eq('id', id);
    if (previewReq?.id === id) setPreviewReq(null);
    await loadData();
  };

  const handleSubmitTeacherComment = async (comment: PerformanceComment) => {
    const text = (drafts[comment.id] || '').trim();
    if (!text) return;
    setSavingCommentId(comment.id);
    try {
      const { error } = await supabase
        .from('performance_comments')
        .update({
          comment_text: text,
          is_submitted: true,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', comment.id);
      if (error) {
        setStatusMsg({ type: 'err', text: error.message });
        return;
      }

      const siblingComments = comments.filter((c) => c.request_id === comment.request_id);
      const allDone =
        siblingComments.length > 0 &&
        siblingComments.every((c) => (c.id === comment.id ? true : c.is_submitted));
      if (allDone) {
        await supabase
          .from('performance_requests')
          .update({ status: 'completed' })
          .eq('id', comment.request_id);
      }

      await loadData();
    } finally {
      setSavingCommentId(null);
    }
  };

  const myTeacherComments = useMemo(() => {
    if (!userProfile) return [];
    return comments.filter((c) => c.teacher_id === userProfile.id);
  }, [comments, userProfile]);

  const pendingTeacherComments = useMemo(
    () => myTeacherComments.filter((c) => !c.is_submitted),
    [myTeacherComments]
  );

  const scopedStudentIds = useMemo(
    () => new Set(scope.students.map((s) => s.id)),
    [scope.students]
  );

  const scopedRequests = useMemo(() => {
    if (scope.isUnrestricted) return requests;
    return requests.filter((r) => scopedStudentIds.has(r.student_id));
  }, [requests, scope.isUnrestricted, scopedStudentIds]);

  const handleDownloadPdf = async (req: PerformanceRequest) => {
    const st = studentMap.get(req.student_id);
    if (!st) return;
    const reqComments = comments.filter((c) => c.request_id === req.id);
    await exportPerformanceReportPdf({
      request: req,
      student: st,
      classSection: classMap.get(st.class_section_id),
      comments: reqComments,
      subjects,
      profiles,
      settings: schoolSettings,
    });
  };

  const buildReportWhatsAppMsg = (student: Student) => {
    if (lang === 'ar') {
      return `السلام عليكم ولي أمر الطالب ${student.name_ar}، نود إعلامكم بأن تقرير الأداء الأكاديمي الخاص بالطالب جاهز لدى إدارة ${schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية'}.`;
    }
    return `Dear Parent of ${student.name_en}, the Academic Performance Report for your son is ready at ${schoolSettings?.school_name_en || 'Middle East International School'}.`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {lang === 'ar' ? 'تقارير الأداء الأكاديمي' : 'Student Performance Reports'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {lang === 'ar'
            ? 'طلب تقارير الأداء، إشعار معلمي المواد تلقائياً، وتصدير تقرير PDF الرسمي باللغة الإنجليزية.'
            : 'Request student evaluations, collect subject-teacher paragraphs, and export strictly English 2-column PDF reports.'}
        </p>
      </div>

      {/* Teacher Pending Comments Queue */}
      {(activeRole === 'teacher' || myTeacherComments.length > 0) && (
        <section className="meis-glass rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar'
                  ? 'تقارير الأداء المطلوبة مني'
                  : 'Pending Student Performance Reports'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {pendingTeacherComments.length}{' '}
                {lang === 'ar' ? 'تقييم بانتظار الإرسال' : 'pending evaluations'}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {myTeacherComments.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                {lang === 'ar'
                  ? 'لا توجد طلبات تقارير أداء مطلوبة منك حالياً.'
                  : 'No performance report comments assigned to you right now.'}
              </p>
            ) : (
              myTeacherComments.map((c) => {
                const req = requests.find((r) => r.id === c.request_id);
                const st = req ? studentMap.get(req.student_id) : undefined;
                const cs = st ? classMap.get(st.class_section_id) : undefined;
                const sub = subMap.get(c.subject_id);
                return (
                  <div
                    key={c.id}
                    className={`p-4 rounded-xl border ${
                      c.is_submitted
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {st ? getLocalizedName(st, lang) : 'Student'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getLocalizedDisplayName(cs, lang)} · {getLocalizedName(sub, lang)} ·{' '}
                          <span className="font-mono">{req?.request_date}</span>
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          c.is_submitted ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {c.is_submitted
                            ? lang === 'ar'
                              ? 'تم الإرسال'
                              : 'Submitted'
                            : lang === 'ar'
                              ? 'مطلوب التقييم'
                              : 'Pending'}
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea
                        rows={2}
                        value={drafts[c.id] || ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                        placeholder={
                          lang === 'ar'
                            ? 'اكتب فقرة تقييمية عن مستوى الطالب في مادتك (يفضل بالإنجليزية لظهورها في ملف PDF)...'
                            : 'Write a 1-paragraph academic evaluation for this student (English recommended for PDF)...'
                        }
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingCommentId === c.id || !(drafts[c.id] || '').trim()}
                        onClick={() => void handleSubmitTeacherComment(c)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {c.is_submitted
                            ? lang === 'ar'
                              ? 'تحديث'
                              : 'Update'
                            : tr('submit', lang)}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Request New Performance Report (Principal, Academic Supervisor, Admin) */}
      {canRequest && (
        <section className="meis-glass rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-3">
            {lang === 'ar' ? 'طلب تقرير أداء طالب جديد' : 'Request New Student Performance Report'}
          </h2>
          <form onSubmit={handleRequestReport} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-3 start-3" />
              <input
                type="text"
                value={searchIqama}
                onChange={(e) => setSearchIqama(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث بالاسم أو الإقامة...' : 'Search ID/Iqama or name...'}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <select
              value={scope.gradeIds.has(reqGradeId) ? reqGradeId : ''}
              onChange={(e) => {
                setReqGradeId(e.target.value);
                setReqStudentId('');
              }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
            >
              <option value="">{lang === 'ar' ? 'جميع الصفوف' : 'All Grades'}</option>
              {scope.grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {getLocalizedName(g, lang)}
                </option>
              ))}
            </select>

            <select
              value={scope.sectionIds.has(reqSectionId) ? reqSectionId : ''}
              onChange={(e) => {
                setReqSectionId(e.target.value);
                setReqStudentId('');
              }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
            >
              <option value="">{lang === 'ar' ? 'جميع الشعب' : 'All Sections'}</option>
              {scope.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {getLocalizedName(s, lang)}
                </option>
              ))}
            </select>

            <select
              required
              value={reqStudentId}
              onChange={(e) => setReqStudentId(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
            >
              <option value="">{lang === 'ar' ? '-- اختر الطالب --' : '-- Select Student --'}</option>
              {matchingRequestStudents.map((st) => (
                <option key={st.id} value={st.id}>
                  {getLocalizedName(st, lang)} ({st.iqama_id})
                </option>
              ))}
            </select>

            <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-3">
              {statusMsg ? (
                <p
                  className={`text-xs font-semibold ${
                    statusMsg.type === 'err' ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {statusMsg.text}
                </p>
              ) : (
                <span className="text-xs text-slate-500">
                  {lang === 'ar'
                    ? 'يتم إشعار جميع معلمي مواد الفصل تلقائياً عند إنشاء الطلب.'
                    : 'All teachers assigned to the student’s class section are notified automatically.'}
                </span>
              )}
              <button
                type="submit"
                disabled={creating || !reqStudentId}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {creating
                    ? tr('loading', lang)
                    : lang === 'ar'
                      ? 'إرسال طلب التقرير'
                      : 'Request Report'}
                </span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Active & Completed Requests Tracker (Principal, Academic Supervisor, Supervisor, Admin) */}
      {canViewTracker && (
        <section className="meis-glass rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-200/80">
            {lang === 'ar' ? 'متابعة تقارير الأداء المطلوبة' : 'Requested Reports Progress'}
          </h2>

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-xs text-slate-500 py-6 text-center">{tr('loading', lang)}</p>
            ) : scopedRequests.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                {lang === 'ar' ? 'لم يتم طلب أي تقارير أداء بعد.' : 'No performance reports requested yet.'}
              </p>
            ) : (
              scopedRequests.map((req) => {
                const st = studentMap.get(req.student_id);
                const cs = st ? classMap.get(st.class_section_id) : undefined;
                const reqComments = comments.filter((c) => c.request_id === req.id);
                const submittedCount = reqComments.filter((c) => c.is_submitted).length;
                const totalCount = reqComments.length;

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl bg-white border border-slate-200/80 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">
                        {st ? getLocalizedName(st, lang) : 'Student'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {getLocalizedDisplayName(cs, lang)} ·{' '}
                        <span className="font-mono">{st?.iqama_id}</span> ·{' '}
                        <span className="font-mono tabular-nums">{req.request_date}</span> ·{' '}
                        <strong className="text-emerald-700 tabular-nums">
                          {lang === 'ar'
                            ? `تم تعبئة ${submittedCount} من ${totalCount} مواد`
                            : `${submittedCount} of ${totalCount} subjects submitted`}
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewReq(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'معاينة' : 'Preview'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تحميل PDF' : 'Download PDF Report'}</span>
                      </button>
                      {st && (
                        <a
                          href={buildWhatsAppUrl(st.father_mobile, buildReportWhatsAppMsg(st))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{tr('whatsappFather', lang)}</span>
                        </a>
                      )}
                      {canRequest && (
                        <button
                          type="button"
                          aria-label="Delete report request"
                          onClick={() => void handleDeleteRequest(req.id)}
                          className="p-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
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
      )}

      {/* Preview Modal */}
      {previewReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {(() => {
              const st = studentMap.get(previewReq.student_id);
              const cs = st ? classMap.get(st.class_section_id) : undefined;
              const reqComments = comments.filter((c) => c.request_id === previewReq.id);
              return (
                <>
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {st?.name_en || 'Student Performance Report'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        ID/Iqama: <span className="font-mono">{st?.iqama_id}</span> ·{' '}
                        {cs?.display_name_en} · Date: {previewReq.request_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf(previewReq)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        <FileDown className="w-4 h-4" />
                        <span>Download PDF Report</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Close preview"
                        onClick={() => setPreviewReq(null)}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm border border-blue-200 rounded-xl overflow-hidden" dir="ltr">
                      <thead className="bg-blue-50 text-blue-950 border-b border-blue-200 text-xs">
                        <tr>
                          <th className="py-2.5 px-4 text-left w-48 font-bold">Subject Name</th>
                          <th className="py-2.5 px-4 text-left font-bold">Teacher&apos;s Comment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reqComments.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="py-6 px-4 text-center text-xs text-slate-500">
                              No subject evaluations assigned yet.
                            </td>
                          </tr>
                        ) : (
                          reqComments.map((c) => {
                            const sub = subMap.get(c.subject_id);
                            const teacher = c.teacher_id ? profMap.get(c.teacher_id) : undefined;
                            return (
                              <tr key={c.id}>
                                <td className="py-3 px-4 font-bold text-slate-900 align-top">
                                  {sub?.name_en || 'Subject'}
                                </td>
                                <td className="py-3 px-4 text-slate-700 align-top">
                                  {c.is_submitted && c.comment_text ? (
                                    <>
                                      <p>{c.comment_text}</p>
                                      <p className="text-xs text-slate-500 mt-1.5 font-semibold">
                                        — {teacher?.name_en || 'Teacher'}
                                      </p>
                                    </>
                                  ) : (
                                    <span className="text-xs text-amber-700 font-semibold">
                                      Pending submission ({teacher?.name_en || 'Assigned Teacher'})
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
