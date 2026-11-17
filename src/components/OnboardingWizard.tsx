import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Globe, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types/database';
import { getLocalizedDisplayName, getLocalizedName, ROLE_LABELS } from '../utils/i18n';
import { buildStaffAssignmentRows, validateRoleConfiguration } from '../utils/schoolRules';

const ONBOARDABLE_ROLES: Exclude<UserRole, 'admin'>[] = [
  'teacher',
  'supervisor',
  'academic_supervisor',
  'principal',
];

export const OnboardingWizard: React.FC = () => {
  const {
    lang,
    toggleLang,
    userProfile,
    divisions,
    grades,
    classSections,
    subjects,
    refreshCurrentProfile,
    refreshMasterData,
    signOut,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<Exclude<UserRole, 'admin'>>('teacher');
  const [nameAr, setNameAr] = useState(userProfile?.name_ar || '');
  const [nameEn, setNameEn] = useState(userProfile?.name_en || '');
  const [primarySubjectId, setPrimarySubjectId] = useState<string>(subjects[0]?.id || '');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(divisions[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!primarySubjectId && subjects.length > 0) {
      setPrimarySubjectId(subjects[0].id);
    }
  }, [primarySubjectId, subjects]);

  useEffect(() => {
    if (!selectedDivisionId && divisions.length > 0) {
      setSelectedDivisionId(divisions[0].id);
    }
  }, [selectedDivisionId, divisions]);

  const groupedClasses = useMemo(() => {
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

  const toggleClassId = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    setErrorMsg(null);
    if (step === 2 && (!nameAr.trim() || !nameEn.trim())) {
      setErrorMsg(
        lang === 'ar'
          ? 'يرجى إدخال الاسم بالعربية والإنجليزية'
          : 'Please enter both Arabic and English names'
      );
      return;
    }
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  };

  const handleFinish = async () => {
    setErrorMsg(null);

    const validationError = validateRoleConfiguration({
      roles: [selectedRole],
      primarySubjectId,
      divisionId: selectedDivisionId,
      classSectionIds: selectedClassIds,
      lang,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSaving(true);
    try {
      const assignmentRows = buildStaffAssignmentRows({
        userId: userProfile.id,
        roles: [selectedRole],
        classSectionIds: selectedClassIds,
        primarySubjectId: selectedRole === 'teacher' ? primarySubjectId : null,
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
                ? 'تعذر حفظ الفصول المحددة، يرجى المحاولة مرة أخرى.'
                : 'Could not verify saved class assignments. Please try again.')
          );
          return;
        }
      }

      const updatePayload = {
        name_ar: nameAr.trim(),
        name_en: nameEn.trim(),
        roles: [selectedRole],
        active_role: selectedRole,
        primary_subject_id: selectedRole === 'teacher' ? primarySubjectId : null,
        division_id:
          selectedRole === 'principal' || selectedRole === 'academic_supervisor'
            ? selectedDivisionId
            : null,
        is_onboarded: true,
      };

      const { error: profErr } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userProfile.id);

      if (profErr) {
        await supabase.from('staff_class_assignments').delete().eq('user_id', userProfile.id);
        if (prevAssignments && prevAssignments.length > 0) {
          await supabase.from('staff_class_assignments').insert(prevAssignments);
        }
        setErrorMsg(profErr.message);
        return;
      }

      await refreshMasterData();
      await refreshCurrentProfile();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen meis-mesh-bg flex flex-col justify-center items-center p-4 sm:p-8">
      <div className="max-w-3xl w-full meis-card rounded-[2rem] p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/70">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {lang === 'ar' ? 'إعداد الملف الوظيفي لأول مرة' : 'First-Time Staff Onboarding'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {userProfile.email} ·{' '}
              {lang === 'ar' ? `الخطوة ${step} من 3` : `Step ${step} of 3`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200/80 bg-white/90 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 meis-accent-text" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200/80 bg-white/90 text-xs font-semibold text-slate-600 hover:text-red-600 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'خروج' : 'Sign Out'}</span>
            </button>
          </div>
        </div>

        {/* Stepper Indicator */}
        <div className="grid grid-cols-3 gap-3 my-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-colors ${
                s <= step ? 'meis-accent-bg' : 'bg-slate-200/80'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? '1. اختر دورك الوظيفي في المدرسة' : '1. Select Your School Role'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'ar'
                  ? 'لا يمكن تغيير الدور الوظيفي لاحقاً إلا بواسطة مدير النظام.'
                  : 'Once saved, only a System Admin can modify your assigned role.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {ONBOARDABLE_ROLES.map((role) => {
                const active = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`p-5 rounded-3xl border text-start transition-all cursor-pointer ${
                      active
                        ? 'meis-accent-pill shadow-sm'
                        : 'border-slate-200/80 bg-white/85 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {ROLE_LABELS[role][lang]}
                      </span>
                      {active && (
                        <span className="w-6 h-6 rounded-full meis-accent-solid flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {role === 'teacher' &&
                        (lang === 'ar'
                          ? 'تسجيل السلوك، تعبئة تقارير الأداء، إدارة الجدول الأسبوعي'
                          : 'Log student behavior, submit performance comments, manage timetable')}
                      {role === 'supervisor' &&
                        (lang === 'ar'
                          ? 'متابعة السلوك والانضباط، تعيين حصص الانتظار والمناوبات'
                          : 'Monitor class behavior feed, assign period substitutes and duties')}
                      {role === 'academic_supervisor' &&
                        (lang === 'ar'
                          ? 'الإشراف الأكاديمي على المرحلة، طلب تقارير الأداء ونشر الإعلانات'
                          : 'Division academic oversight, request performance reports, publish notices')}
                      {role === 'principal' &&
                        (lang === 'ar'
                          ? 'إدارة المرحلة الدراسية، المتابعة الشاملة والتقارير الرسمية'
                          : 'Full division leadership, performance reports, behavior & notices')}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? '2. تأكيد الاسم الثنائي اللغة' : '2. Confirm Bilingual Name'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'ar'
                  ? 'يظهر الاسم الإنجليزي في تقارير PDF الرسمية والاسم العربي في الواجهة العربية.'
                  : 'Your English name appears on official PDF exports and Arabic name in the RTL portal.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="onboard-name-ar" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {lang === 'ar' ? 'الاسم بالعربية' : 'Name in Arabic'}
                </label>
                <input
                  id="onboard-name-ar"
                  type="text"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/95 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                />
              </div>
              <div>
                <label htmlFor="onboard-name-en" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {lang === 'ar' ? 'الاسم بالإنجليزية' : 'Name in English'}
                </label>
                <input
                  id="onboard-name-en"
                  type="text"
                  dir="ltr"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/95 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? '3. التعيين الأكاديمي والإداري' : '3. Role-Specific Assignment'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {selectedRole === 'teacher' &&
                  (lang === 'ar'
                    ? 'اختر المادة الأساسية والفصول التي تقوم بتدريسها (عبر الابتدائية العليا أو المتوسطة والثانوية).'
                    : 'Select your primary subject and all class sections you teach across Lower and/or Upper grades.')}
                {selectedRole === 'supervisor' &&
                  (lang === 'ar'
                    ? 'اختر جميع الفصول والشعب التي تشرف عليها.'
                    : 'Select all class sections under your supervision across Lower and/or Upper grades.')}
                {(selectedRole === 'principal' || selectedRole === 'academic_supervisor') &&
                  (lang === 'ar'
                    ? 'اختر المرحلة الدراسية المسؤول عنها.'
                    : 'Select the school division assigned to you.')}
              </p>
            </div>

            {selectedRole === 'teacher' && (
              <div>
                <label htmlFor="onboard-subject" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {lang === 'ar' ? 'المادة الدراسية (مادة واحدة)' : 'Primary Subject (1 Subject)'}
                </label>
                <select
                  id="onboard-subject"
                  value={primarySubjectId}
                  onChange={(e) => setPrimarySubjectId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/95 text-sm text-slate-900"
                >
                  <option value="">
                    {lang === 'ar' ? '-- اختر المادة --' : '-- Select Subject --'}
                  </option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {getLocalizedName(sub, lang)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(selectedRole === 'teacher' || selectedRole === 'supervisor') && (
              <div className="space-y-3 max-h-80 overflow-y-auto pe-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">
                    {lang === 'ar' ? 'الفصول الدراسية المحددة' : 'Assigned Class Sections'}
                  </span>
                  <span className="tabular-nums font-bold meis-accent-text">
                    {selectedClassIds.length} {lang === 'ar' ? 'فصل' : 'selected'}
                  </span>
                </div>
                {groupedClasses.map(({ grade, items }) => {
                  const itemIds = items.map((i) => i.id);
                  const allSelected = itemIds.every((id) => selectedClassIds.includes(id));
                  return (
                    <div key={grade.id} className="p-4 rounded-2xl bg-white/75 border border-slate-200/70">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-xs font-bold text-slate-800">
                          {getLocalizedName(grade, lang)}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClassIds((prev) =>
                              allSelected
                                ? prev.filter((id) => !itemIds.includes(id))
                                : Array.from(new Set([...prev, ...itemIds]))
                            )
                          }
                          className="text-[11px] font-semibold meis-accent-text hover:underline cursor-pointer"
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
                      <div className="flex flex-wrap gap-2">
                        {items.map((cs) => {
                          const checked = selectedClassIds.includes(cs.id);
                          return (
                            <button
                              key={cs.id}
                              type="button"
                              onClick={() => toggleClassId(cs.id)}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                                checked
                                  ? 'meis-pill-dark border-transparent'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
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
            )}

            {(selectedRole === 'principal' || selectedRole === 'academic_supervisor') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {divisions.map((div) => {
                  const active = selectedDivisionId === div.id;
                  return (
                    <button
                      key={div.id}
                      type="button"
                      onClick={() => setSelectedDivisionId(div.id)}
                      className={`p-5 rounded-3xl border text-start cursor-pointer transition-all ${
                        active
                          ? 'meis-accent-pill shadow-sm'
                          : 'border-slate-200/80 bg-white/85 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">
                          {getLocalizedName(div, lang)}
                        </span>
                        {active && (
                          <span className="w-6 h-6 rounded-full meis-accent-solid flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-200/70">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-slate-200/90 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'السابق' : 'Back'}</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full meis-pill-dark text-sm font-semibold cursor-pointer"
            >
              <span>{lang === 'ar' ? 'التالي' : 'Next'}</span>
              {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleFinish}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full meis-accent-solid text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>
                {saving
                  ? lang === 'ar'
                    ? 'جارٍ الحفظ...'
                    : 'Saving...'
                  : lang === 'ar'
                    ? 'إكمال التسجيل والدخول'
                    : 'Complete Setup'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
