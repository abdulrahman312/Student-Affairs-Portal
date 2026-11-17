import React, { useMemo, useState } from 'react';
import { Lock, Save, UserCog, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { getLocalizedDisplayName, getLocalizedName, ROLE_LABELS, tr } from '../utils/i18n';
import { buildStaffAssignmentRows, validateRoleConfiguration } from '../utils/schoolRules';

interface ProfileSettingsModalProps {
  onClose: () => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({ onClose }) => {
  const {
    lang,
    userProfile,
    divisions,
    grades,
    classSections,
    subjects,
    staffAssignments,
    refreshMasterData,
    refreshCurrentProfile,
  } = useApp();

  const initialClassIds = useMemo(() => {
    if (!userProfile) return [];
    return Array.from(
      new Set(
        staffAssignments
          .filter((a) => a.user_id === userProfile.id)
          .map((a) => a.class_section_id)
      )
    );
  }, [userProfile, staffAssignments]);

  const [nameAr, setNameAr] = useState(userProfile?.name_ar || '');
  const [nameEn, setNameEn] = useState(userProfile?.name_en || '');
  const [primarySubjectId, setPrimarySubjectId] = useState(
    userProfile?.primary_subject_id || subjects[0]?.id || ''
  );
  const [divisionId, setDivisionId] = useState(userProfile?.division_id || '');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(initialClassIds);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const groupedClassSections = useMemo(() => {
    return grades
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((grade) => ({
        grade,
        items: classSections.filter((cs) => cs.grade_id === grade.id && cs.is_active),
      }))
      .filter((g) => g.items.length > 0);
  }, [grades, classSections]);

  if (!userProfile) return null;

  const roles = userProfile.roles || [userProfile.active_role];
  const isTeacher = roles.includes('teacher');
  const needsClasses = roles.includes('teacher') || roles.includes('supervisor');
  const needsDivision = roles.includes('principal') || roles.includes('academic_supervisor');

  const toggleClassId = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorMsg(
        lang === 'ar'
          ? 'يرجى إدخال الاسم الكامل بالعربية والإنجليزية'
          : 'Please enter both Arabic and English full names'
      );
      return;
    }

    const validationError = validateRoleConfiguration({
      roles,
      primarySubjectId: isTeacher ? primarySubjectId : '',
      divisionId: needsDivision ? divisionId : '',
      classSectionIds: needsClasses ? selectedClassIds : [],
      lang,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSaving(true);
    try {
      const normalizedSubjectId = isTeacher ? primarySubjectId || null : null;
      const normalizedDivisionId = needsDivision ? divisionId || null : userProfile.division_id;

      if (needsClasses) {
        const assignmentRows = buildStaffAssignmentRows({
          userId: userProfile.id,
          roles,
          classSectionIds: selectedClassIds,
          primarySubjectId: normalizedSubjectId,
        });

        const { data: prevAssignments } = await supabase
          .from('staff_class_assignments')
          .select('user_id, class_section_id, subject_id, assignment_type')
          .eq('user_id', userProfile.id);

        const { error: delErr } = await supabase
          .from('staff_class_assignments')
          .delete()
          .eq('user_id', userProfile.id);

        if (delErr) {
          setErrorMsg(delErr.message);
          return;
        }

        if (assignmentRows.length > 0) {
          const { data: insertedRows, error: assignErr } = await supabase
            .from('staff_class_assignments')
            .insert(assignmentRows)
            .select('id');

          if (assignErr || !insertedRows || insertedRows.length !== assignmentRows.length) {
            if (prevAssignments && prevAssignments.length > 0) {
              await supabase.from('staff_class_assignments').insert(prevAssignments);
            }
            setErrorMsg(
              assignErr?.message ||
                (lang === 'ar'
                  ? 'تعذر حفظ الفصول المسندة، يرجى المحاولة مرة أخرى.'
                  : 'Failed to save assigned class sections. Please try again.')
            );
            return;
          }
        }
      }

      // Update profile details ONLY — roles and active_role remain locked to Admin control
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          name_ar: nameAr.trim(),
          name_en: nameEn.trim(),
          primary_subject_id: normalizedSubjectId,
          division_id: normalizedDivisionId,
        })
        .eq('id', userProfile.id);

      if (profErr) {
        setErrorMsg(profErr.message);
        return;
      }

      await Promise.all([refreshMasterData(), refreshCurrentProfile()]);
      setSuccessMsg(
        lang === 'ar' ? 'تم تحديث بيانات حسابك بنجاح.' : 'Profile settings updated successfully.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'إعدادات الحساب والملف الشخصي' : 'Profile Settings'}
              </h2>
              <p className="text-xs text-slate-500 font-mono">{userProfile.email}</p>
            </div>
          </div>

          <button
            type="button"
            aria-label={tr('close', lang)}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 mt-4">
          {/* Read-only Assigned Roles */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {lang === 'ar'
                  ? 'الأدوار المعينة (مقفلة — تعديل الأدوار متاح لمدير النظام فقط)'
                  : 'Assigned Roles (Locked — only System Admin can modify roles)'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <span
                  key={r}
                  className="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  {ROLE_LABELS[r]?.[lang] || r}
                </span>
              ))}
            </div>
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'الاسم الكامل (بالعربية)' : 'Full Name (Arabic)'}
              </label>
              <input
                type="text"
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'الاسم الكامل (بالإنجليزية)' : 'Full Name (English)'}
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>
          </div>

          {/* Primary Subject (for Teacher) */}
          {isTeacher && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'المادة الأساسية' : 'Primary Subject'}
              </label>
              <select
                required
                value={primarySubjectId}
                onChange={(e) => setPrimarySubjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">
                  {lang === 'ar' ? '-- اختر المادة --' : '-- Select Subject --'}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getLocalizedName(s, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Assigned Division (for Principal / Academic Supervisor) */}
          {needsDivision && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'المرحلة الدراسية المسندة' : 'Assigned Division'}
              </label>
              <select
                required
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">
                  {lang === 'ar' ? '-- اختر المرحلة --' : '-- Select Division --'}
                </option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {getLocalizedName(d, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Assigned Class Sections (for Teacher / Supervisor) */}
          {needsClasses && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">
                  {lang === 'ar'
                    ? 'الفصول الدراسية المسندة إليك'
                    : 'Your Assigned Class Sections'}
                </label>
                <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                  {selectedClassIds.length} {lang === 'ar' ? 'محدد' : 'selected'}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {groupedClassSections.map(({ grade, items }) => {
                  const itemIds = items.map((i) => i.id);
                  const allSelected = itemIds.every((id) => selectedClassIds.includes(id));
                  return (
                    <div
                      key={grade.id}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/80"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800">
                          {getLocalizedName(grade, lang)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClassIds((prev) =>
                              allSelected
                                ? prev.filter((id) => !itemIds.includes(id))
                                : Array.from(new Set([...prev, ...itemIds]))
                            )
                          }
                          className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                        >
                          {allSelected
                            ? lang === 'ar'
                              ? 'إلغاء الصف'
                              : 'Clear Grade'
                            : lang === 'ar'
                              ? 'تحديد كل الصف'
                              : 'Select All Grade'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((cs) => {
                          const active = selectedClassIds.includes(cs.id);
                          return (
                            <button
                              key={cs.id}
                              type="button"
                              onClick={() => toggleClassId(cs.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                                active
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {getLocalizedDisplayName(cs, lang)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              {successMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {tr('close', lang)}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? tr('loading', lang) : tr('save', lang)}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
