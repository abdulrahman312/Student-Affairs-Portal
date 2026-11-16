import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, MapPin, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { DutyAssignment } from '../types/database';
import { getLocalizedName, tr } from '../utils/i18n';
import { getRiyadhParts } from '../utils/riyadhTime';
import { filterTeachersInScope, getRoleScope, isDateInRange } from '../utils/schoolRules';

export const DutyModule: React.FC = () => {
  const {
    lang,
    userProfile,
    divisions,
    grades,
    sections,
    classSections,
    staffAssignments,
    students,
    dutyTypes,
    profiles,
  } = useApp();
  const riyadhToday = getRiyadhParts(new Date()).dateStr;

  const [duties, setDuties] = useState<DutyAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [teacherId, setTeacherId] = useState('');
  const [dutyTypeId, setDutyTypeId] = useState('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(riyadhToday);
  const [endDate, setEndDate] = useState(riyadhToday);
  const [locationText, setLocationText] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeRole = userProfile?.active_role || 'teacher';
  const canAssign = activeRole !== 'teacher';

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
    () => filterTeachersInScope({ profiles, scope, staffAssignments }),
    [profiles, scope, staffAssignments]
  );

  const loadDuties = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('duty_assignments')
      .select('*')
      .order('start_date', { ascending: false });
    if (data) setDuties(data as DutyAssignment[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadDuties();
  }, []);

  useEffect(() => {
    if (!dutyTypeId && dutyTypes.length > 0) setDutyTypeId(dutyTypes[0].id);
    if (!teacherId && teachersList.length > 0) setTeacherId(teachersList[0].id);
  }, [dutyTypes, teachersList, dutyTypeId, teacherId]);

  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const dutyTypeMap = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes]);

  const myActiveDutiesToday = useMemo(() => {
    if (!userProfile) return [];
    return duties.filter(
      (d) => d.teacher_id === userProfile.id && isDateInRange(riyadhToday, d.start_date, d.end_date)
    );
  }, [duties, userProfile, riyadhToday]);

  const visibleDuties = useMemo(() => {
    if (!canAssign) return duties.filter((d) => d.teacher_id === userProfile?.id);
    if (scope.isUnrestricted) return duties;
    const allowedTeacherIds = new Set(teachersList.map((t) => t.id));
    return duties.filter(
      (d) => allowedTeacherIds.has(d.teacher_id) || d.assigned_by === userProfile?.id
    );
  }, [duties, canAssign, userProfile, scope.isUnrestricted, teachersList]);

  const handleAssignDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setErrorMsg(null);

    const effectiveEnd = dateMode === 'single' ? startDate : endDate;
    if (!teacherId || !dutyTypeId || !locationText.trim()) {
      setErrorMsg(
        lang === 'ar'
          ? 'يرجى تحديد المعلم ونوع المناوبة وموقع المناوبة'
          : 'Please select teacher, duty type, and enter duty location'
      );
      return;
    }
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
      const { error } = await supabase.from('duty_assignments').insert({
        teacher_id: teacherId,
        duty_type_id: dutyTypeId,
        start_date: startDate,
        end_date: effectiveEnd,
        location_text: locationText.trim(),
        assigned_by: userProfile.id,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setLocationText('');
      await loadDuties();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDuty = async (id: string) => {
    await supabase.from('duty_assignments').delete().eq('id', id);
    await loadDuties();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {lang === 'ar' ? 'المناوبات اليومية للمعلمين' : 'Teacher Duty Assignments'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {lang === 'ar'
            ? 'تكليف المعلمين بمناوبات الفسحة والصلاة والانصراف بتاريخ محدد أو نطاق تاريخي.'
            : 'Assign Lunch Break, Salah Break, and Home Time duties for single dates or date ranges.'}
        </p>
      </div>

      {/* Teacher's Highlighted Active Duties Today */}
      {myActiveDutiesToday.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5">
          <h2 className="text-sm font-bold text-emerald-950 mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-700" />
            <span>
              {lang === 'ar' ? 'مناوباتك النشطة اليوم' : 'Your Active Duty Assignments Today'}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myActiveDutiesToday.map((d) => {
              const dt = dutyTypeMap.get(d.duty_type_id);
              return (
                <div key={d.id} className="p-3.5 rounded-xl bg-white border border-emerald-200">
                  <p className="text-sm font-bold text-slate-900">{getLocalizedName(dt, lang)}</p>
                  <p className="text-xs text-slate-700 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{d.location_text}</span>
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-1 tabular-nums">
                    {d.start_date === d.end_date ? d.start_date : `${d.start_date} → ${d.end_date}`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Assign Duty Form */}
      {canAssign && (
        <section className="meis-glass rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            {lang === 'ar' ? 'تكليف بمناوبة جديدة' : 'Assign New Duty'}
          </h2>
          <form onSubmit={handleAssignDuty} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'المعلم' : 'Teacher'}
              </label>
              <select
                required
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {getLocalizedName(t, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'نوع المناوبة' : 'Duty Type'}
              </label>
              <select
                required
                value={dutyTypeId}
                onChange={(e) => setDutyTypeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                {dutyTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>
                    {getLocalizedName(dt, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'نمط التاريخ' : 'Schedule'}
              </label>
              <select
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value as 'single' | 'range')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="single">{lang === 'ar' ? 'تاريخ واحد' : 'Single Date'}</option>
                <option value="range">{lang === 'ar' ? 'نطاق تاريخ' : 'Date Range'}</option>
              </select>
            </div>

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
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
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
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>
            )}

            <div className={dateMode === 'range' ? 'sm:col-span-2 lg:col-span-4' : 'sm:col-span-2 lg:col-span-4'}>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'موقع المناوبة' : 'Duty Location'}
              </label>
              <input
                type="text"
                required
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'مثال: ممر الدور الثاني، البوابة الرئيسية 2، ساحة الابتدائية...'
                    : 'e.g., 2nd Floor Corridor, Main Gate 2, Lower Grade Courtyard...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                <span>{saving ? tr('loading', lang) : lang === 'ar' ? 'إسناد المناوبة' : 'Assign Duty'}</span>
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}
        </section>
      )}

      {/* Duties Table */}
      <section className="meis-glass rounded-2xl p-5">
        <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-200/80">
          {canAssign
            ? lang === 'ar'
              ? 'سجل المناوبات المجدولة'
              : 'All Scheduled Duty Assignments'
            : lang === 'ar'
              ? 'جدول مناوباتي'
              : 'My Duty Schedule'}
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'المعلم' : 'Teacher'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'نوع المناوبة' : 'Duty Type'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'الموقع' : 'Location'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'التاريخ' : 'Dates'}
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">
                  {lang === 'ar' ? 'الحالة' : 'Status'}
                </th>
                {canAssign && <th className="py-2.5 px-3 text-end font-semibold" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    {tr('loading', lang)}
                  </td>
                </tr>
              ) : visibleDuties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    {lang === 'ar' ? 'لا توجد مناوبات مسجلة حالياً.' : 'No duty assignments found.'}
                  </td>
                </tr>
              ) : (
                visibleDuties.map((d) => {
                  const teacher = profMap.get(d.teacher_id);
                  const dt = dutyTypeMap.get(d.duty_type_id);
                  const activeToday = isDateInRange(riyadhToday, d.start_date, d.end_date);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {getLocalizedName(teacher, lang)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{getLocalizedName(dt, lang)}</td>
                      <td className="py-2.5 px-3 text-slate-700">{d.location_text}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-600">
                        {d.start_date === d.end_date
                          ? d.start_date
                          : `${d.start_date} → ${d.end_date}`}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-semibold">
                        {activeToday ? (
                          <span className="text-emerald-700">
                            {lang === 'ar' ? 'نشطة اليوم' : 'Active Today'}
                          </span>
                        ) : d.start_date > riyadhToday ? (
                          <span className="text-sky-700">
                            {lang === 'ar' ? 'قادمة' : 'Upcoming'}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {lang === 'ar' ? 'منتهية' : 'Completed'}
                          </span>
                        )}
                      </td>
                      {canAssign && (
                        <td className="py-2.5 px-3 text-end">
                          <button
                            type="button"
                            aria-label="Delete duty assignment"
                            onClick={() => void handleDeleteDuty(d.id)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
