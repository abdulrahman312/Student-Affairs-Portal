import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3, Megaphone, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { Notice, NoticePriority } from '../types/database';
import { getLocalizedName, getLocalizedNotice } from '../utils/i18n';
import { getRiyadhParts } from '../utils/riyadhTime';
import { getRoleScope, isDateInRange } from '../utils/schoolRules';

export const ActiveNoticeBanner: React.FC<{ onOpenManager?: () => void }> = ({
  onOpenManager,
}) => {
  const {
    lang,
    notices,
    divisions,
    grades,
    sections,
    classSections,
    staffAssignments,
    students,
    userProfile,
  } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const todayRiyadh = useMemo(() => getRiyadhParts(new Date()).dateStr, []);
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

  const activeNotices = useMemo(() => {
    return notices.filter((n) => {
      if (!isDateInRange(todayRiyadh, n.start_date, n.end_date)) return false;
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
  }, [notices, todayRiyadh, scope]);

  const canPublish =
    userProfile?.active_role === 'principal' ||
    userProfile?.active_role === 'academic_supervisor' ||
    userProfile?.active_role === 'admin';

  if (activeNotices.length === 0) {
    return (
      <section
        aria-label={lang === 'ar' ? 'لوحة الإعلانات النشطة' : 'Active Notice Board'}
        className="meis-card rounded-3xl px-4 py-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full meis-accent-pill flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900">
              {lang === 'ar' ? 'لوحة الإعلانات النشطة' : 'Active Notice Board'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {lang === 'ar'
                ? 'لا توجد إعلانات نشطة مجدولة لهذا اليوم.'
                : 'No active notices scheduled for today.'}
            </p>
          </div>
        </div>
        {canPublish && onOpenManager && (
          <button
            type="button"
            onClick={onOpenManager}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full meis-pill-dark text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'نشر إعلان' : 'Publish Notice'}</span>
          </button>
        )}
      </section>
    );
  }

  const safeIdx = activeIndex % activeNotices.length;
  const current = activeNotices[safeIdx];
  const localized = getLocalizedNotice(current, lang);
  const divName = current.target_division_id
    ? getLocalizedName(
        divisions.find((d) => d.id === current.target_division_id),
        lang
      )
    : lang === 'ar'
      ? 'جميع المراحل'
      : 'All Divisions';

  const priorityStyles: Record<NoticePriority, string> = {
    urgent: 'bg-red-50/90 border-red-200 text-red-950',
    important: 'bg-amber-50/90 border-amber-200 text-amber-950',
    normal: 'meis-card text-slate-900',
  };

  const priorityPillStyle: Record<NoticePriority, string> = {
    urgent: 'bg-red-100 text-red-800 border-red-200',
    important: 'bg-amber-100 text-amber-800 border-amber-200',
    normal: 'meis-accent-pill',
  };

  const priorityLabel: Record<NoticePriority, { ar: string; en: string }> = {
    urgent: { ar: 'عاجل', en: 'Urgent' },
    important: { ar: 'مهم', en: 'Important' },
    normal: { ar: 'إعلان', en: 'Notice' },
  };

  return (
    <section
      aria-label={lang === 'ar' ? 'لوحة الإعلانات النشطة' : 'Active Notice Board'}
      className={`rounded-3xl border px-4 py-3.5 sm:px-5 sm:py-4 backdrop-blur-md transition-colors ${priorityStyles[current.priority]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-white/90 border border-white shadow-xs flex items-center justify-center shrink-0 mt-0.5">
            <Megaphone className="w-4 h-4 text-slate-900" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold mb-1">
              <span
                className={`px-2.5 py-0.5 rounded-full border font-bold ${priorityPillStyle[current.priority]}`}
              >
                {priorityLabel[current.priority][lang]}
              </span>
              <span className="opacity-75">·</span>
              <span className="opacity-80">{divName}</span>
              <span className="opacity-75">·</span>
              <span className="tabular-nums font-mono opacity-80">
                {current.start_date === current.end_date
                  ? current.start_date
                  : `${current.start_date} → ${current.end_date}`}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">{localized.title}</h2>
            <p className="text-xs sm:text-sm opacity-90 mt-0.5 leading-relaxed line-clamp-2">
              {localized.content}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeNotices.length > 1 && (
            <>
              <div className="flex items-center gap-0.5 bg-white/80 rounded-full p-0.5 border border-white">
                <button
                  type="button"
                  aria-label="Previous notice"
                  onClick={() =>
                    setActiveIndex((i) => (i - 1 + activeNotices.length) % activeNotices.length)
                  }
                  className="p-1.5 rounded-full hover:bg-white cursor-pointer"
                >
                  {lang === 'ar' ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronLeft className="w-3.5 h-3.5" />
                  )}
                </button>
                <span className="text-[11px] font-bold px-1.5 tabular-nums">
                  {safeIdx + 1}/{activeNotices.length}
                </span>
                <button
                  type="button"
                  aria-label="Next notice"
                  onClick={() => setActiveIndex((i) => (i + 1) % activeNotices.length)}
                  className="p-1.5 rounded-full hover:bg-white cursor-pointer"
                >
                  {lang === 'ar' ? (
                    <ChevronLeft className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-white text-[11px] font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
              >
                {showAll
                  ? lang === 'ar'
                    ? 'طي'
                    : 'Collapse'
                  : lang === 'ar'
                    ? `عرض الكل (${activeNotices.length})`
                    : `All (${activeNotices.length})`}
              </button>
            </>
          )}

          {canPublish && onOpenManager && (
            <button
              type="button"
              onClick={onOpenManager}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full meis-pill-dark text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إدارة' : 'Manage'}</span>
            </button>
          )}
        </div>
      </div>

      {showAll && activeNotices.length > 1 && (
        <div className="mt-3 pt-3 border-t border-slate-900/10 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pe-1">
          {activeNotices.map((n, idx) => {
            const loc = getLocalizedNotice(n, lang);
            const div = divisions.find((d) => d.id === n.target_division_id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setActiveIndex(idx);
                  setShowAll(false);
                }}
                className={`text-start p-3 rounded-2xl bg-white/85 hover:bg-white border transition-colors cursor-pointer space-y-1 ${
                  idx === safeIdx ? 'border-slate-900/30 shadow-xs' : 'border-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded-full border font-bold ${priorityPillStyle[n.priority]}`}
                  >
                    {priorityLabel[n.priority][lang]}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {div ? getLocalizedName(div, lang) : lang === 'ar' ? 'الجميع' : 'All'}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 truncate">{loc.title}</p>
                <p className="text-[11px] text-slate-600 line-clamp-2">{loc.content}</p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export const NoticeBoardManager: React.FC = () => {
  const { lang, notices, divisions, profiles, userProfile, refreshMasterData } = useApp();
  const todayRiyadh = getRiyadhParts(new Date()).dateStr;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [contentAr, setContentAr] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [priority, setPriority] = useState<NoticePriority>('normal');
  const [targetDivisionId, setTargetDivisionId] = useState<string>('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(todayRiyadh);
  const [endDate, setEndDate] = useState(todayRiyadh);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreate = () => {
    setEditingNotice(null);
    setTitleAr('');
    setTitleEn('');
    setContentAr('');
    setContentEn('');
    setPriority('normal');
    setTargetDivisionId('');
    setDateMode('single');
    setStartDate(todayRiyadh);
    setEndDate(todayRiyadh);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEdit = (n: Notice) => {
    setEditingNotice(n);
    setTitleAr(n.title_ar);
    setTitleEn(n.title_en);
    setContentAr(n.content_ar);
    setContentEn(n.content_en);
    setPriority(n.priority);
    setTargetDivisionId(n.target_division_id || '');
    setDateMode(n.start_date === n.end_date ? 'single' : 'range');
    setStartDate(n.start_date);
    setEndDate(n.end_date);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const effectiveTitleEn = titleEn.trim() || titleAr.trim();
    const effectiveTitleAr = titleAr.trim() || titleEn.trim();
    const effectiveContentEn = contentEn.trim() || contentAr.trim();
    const effectiveContentAr = contentAr.trim() || contentEn.trim();

    if (!effectiveTitleEn || !effectiveContentEn) {
      setErrorMsg(
        lang === 'ar' ? 'يرجى إدخال عنوان ونص الإعلان' : 'Please enter notice title and message'
      );
      return;
    }

    const effectiveEnd = dateMode === 'single' ? startDate : endDate;
    if (effectiveEnd < startDate) {
      setErrorMsg(
        lang === 'ar'
          ? 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية'
          : 'End date must be on or after start date'
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title_en: effectiveTitleEn,
        title_ar: effectiveTitleAr,
        content_en: effectiveContentEn,
        content_ar: effectiveContentAr,
        priority,
        target_division_id: targetDivisionId || null,
        start_date: startDate,
        end_date: effectiveEnd,
        published_by: userProfile?.id || null,
      };

      const { error } = editingNotice
        ? await supabase.from('notices').update(payload).eq('id', editingNotice.id)
        : await supabase.from('notices').insert(payload);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      await refreshMasterData();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('notices').delete().eq('id', id);
    await refreshMasterData();
  };

  const priorityPillStyle: Record<NoticePriority, string> = {
    urgent: 'bg-red-100 text-red-800 border-red-200',
    important: 'bg-amber-100 text-amber-800 border-amber-200',
    normal: 'meis-accent-pill',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'ar' ? 'إدارة لوحة الإعلانات' : 'Notice Board Management'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'ar'
              ? 'نشر وتعديل الإعلانات المدرسية حسب المرحلة ونطاق التاريخ.'
              : 'Publish, edit, or schedule announcements across divisions and date ranges.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full meis-pill-dark text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'نشر إعلان جديد' : 'Publish Notice'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {notices.length === 0 ? (
          <div className="meis-card rounded-3xl p-10 text-center text-sm text-slate-500">
            {lang === 'ar' ? 'لا توجد إعلانات منشورة حتى الآن.' : 'No notices published yet.'}
          </div>
        ) : (
          notices.map((n) => {
            const localized = getLocalizedNotice(n, lang);
            const activeToday = isDateInRange(todayRiyadh, n.start_date, n.end_date);
            const publisher = profiles.find((p) => p.id === n.published_by);
            const div = divisions.find((d) => d.id === n.target_division_id);
            return (
              <div
                key={n.id}
                className="meis-card rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase ${priorityPillStyle[n.priority]}`}
                    >
                      {n.priority}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {div ? getLocalizedName(div, lang) : lang === 'ar' ? 'جميع المراحل' : 'All Divisions'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {n.start_date} → {n.end_date}
                    </span>
                    {activeToday && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="meis-accent-text font-bold">
                          {lang === 'ar' ? 'نشط اليوم' : 'Active Today'}
                        </span>
                      </>
                    )}
                    {publisher && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{getLocalizedName(publisher, lang)}</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{localized.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{localized.content}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`Edit ${localized.title}`}
                    onClick={() => openEdit(n)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'تعديل' : 'Edit'}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${localized.title}`}
                    onClick={() => void handleDelete(n.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] border border-white max-w-2xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
              <h2 className="text-lg font-bold text-slate-900">
                {editingNotice
                  ? lang === 'ar'
                    ? 'تعديل الإعلان'
                    : 'Edit Notice'
                  : lang === 'ar'
                    ? 'نشر إعلان جديد'
                    : 'Publish New Notice'}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'العنوان (عربي)' : 'Title (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'العنوان (إنجليزي)' : 'Title (English)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'نص الإعلان (عربي)' : 'Message (Arabic)'}
                  </label>
                  <textarea
                    rows={3}
                    value={contentAr}
                    onChange={(e) => setContentAr(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'نص الإعلان (إنجليزي)' : 'Message (English)'}
                  </label>
                  <textarea
                    rows={3}
                    dir="ltr"
                    value={contentEn}
                    onChange={(e) => setContentEn(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'الأهمية' : 'Priority'}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as NoticePriority)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="normal">{lang === 'ar' ? 'عادي' : 'Normal'}</option>
                    <option value="important">{lang === 'ar' ? 'مهم' : 'Important'}</option>
                    <option value="urgent">{lang === 'ar' ? 'عاجل' : 'Urgent'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'المرحلة المستهدفة' : 'Target Division'}
                  </label>
                  <select
                    value={targetDivisionId}
                    onChange={(e) => setTargetDivisionId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">{lang === 'ar' ? 'جميع المراحل' : 'All Divisions'}</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getLocalizedName(d, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'نمط التاريخ' : 'Schedule Type'}
                  </label>
                  <select
                    value={dateMode}
                    onChange={(e) => setDateMode(e.target.value as 'single' | 'range')}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="single">{lang === 'ar' ? 'يوم واحد' : 'Single Date'}</option>
                    <option value="range">{lang === 'ar' ? 'نطاق تاريخ' : 'Date Range'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {dateMode === 'single'
                      ? lang === 'ar'
                        ? 'التاريخ'
                        : 'Date'
                      : lang === 'ar'
                        ? 'من تاريخ'
                        : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>
                {dateMode === 'range' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {lang === 'ar' ? 'إلى تاريخ' : 'End Date'}
                    </label>
                    <input
                      type="date"
                      dir="ltr"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 rounded-full meis-pill-dark text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving
                    ? lang === 'ar'
                      ? 'جارٍ الحفظ...'
                      : 'Saving...'
                    : lang === 'ar'
                      ? 'حفظ الإعلان'
                      : 'Save Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
