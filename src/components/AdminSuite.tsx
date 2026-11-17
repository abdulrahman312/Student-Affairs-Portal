import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Check,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { Profile, Student, UserRole } from '../types/database';
import { getLocalizedDisplayName, getLocalizedName, ROLE_LABELS, tr } from '../utils/i18n';
import {
  buildStaffAssignmentRows,
  matchesBilingualSearch,
  parseStudentExcelRows,
  validateRoleConfiguration,
  type ParsedStudentRow,
} from '../utils/schoolRules';
import { TimetableSubstitutionModule } from './TimetableSubstitutionModule';
import { NoticeBoardManager } from './NoticeBoardSection';

type AdminTab = 'users' | 'students' | 'master' | 'records';
type MasterTableKey =
  | 'settings'
  | 'divisions'
  | 'grades'
  | 'sections'
  | 'class_sections'
  | 'subjects'
  | 'timeslots'
  | 'behavior_categories'
  | 'duty_types';

const ALL_ROLES: UserRole[] = [
  'teacher',
  'supervisor',
  'academic_supervisor',
  'principal',
  'admin',
];

export const AdminSuite: React.FC = () => {
  const {
    lang,
    userProfile,
    realAdminProfile,
    schoolSettings,
    divisions,
    grades,
    sections,
    classSections,
    subjects,
    timeslots,
    behaviorCategories,
    dutyTypes,
    profiles,
    students,
    staffAssignments,
    refreshMasterData,
    impersonateProfile,
  } = useApp();

  const [tab, setTab] = useState<AdminTab>('users');

  // ==================== TAB 1: USERS & DUMMY ACCOUNTS ====================
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editUserNameAr, setEditUserNameAr] = useState('');
  const [editUserNameEn, setEditUserNameEn] = useState('');
  const [editUserRoles, setEditUserRoles] = useState<UserRole[]>(['teacher']);
  const [editUserSubject, setEditUserSubject] = useState('');
  const [editUserDivision, setEditUserDivision] = useState('');
  const [editUserClasses, setEditUserClasses] = useState<string[]>([]);

  const [dummyModalOpen, setDummyModalOpen] = useState(false);
  const [dummyEmail, setDummyEmail] = useState('');
  const [dummyPassword, setDummyPassword] = useState('123456');
  const [dummyNameAr, setDummyNameAr] = useState('');
  const [dummyNameEn, setDummyNameEn] = useState('');
  const [dummyRoles, setDummyRoles] = useState<UserRole[]>(['teacher']);
  const [dummySubject, setDummySubject] = useState('');
  const [dummyDivision, setDummyDivision] = useState('');
  const [dummyClasses, setDummyClasses] = useState<string[]>([]);
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [editUserError, setEditUserError] = useState<string | null>(null);
  const [editUserSaving, setEditUserSaving] = useState(false);
  const [dummyError, setDummyError] = useState<string | null>(null);
  const [dummySaving, setDummySaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  const [deletingUserLoading, setDeletingUserLoading] = useState(false);

  const groupedClassSections = useMemo(() => {
    return grades
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((grade) => ({
        grade,
        items: classSections.filter((cs) => cs.grade_id === grade.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [grades, classSections]);

  const openEditUser = (p: Profile) => {
    setEditingUser(p);
    setEditUserError(null);
    setEditUserNameAr(p.name_ar);
    setEditUserNameEn(p.name_en);
    setEditUserRoles(p.roles || ['teacher']);
    setEditUserSubject(p.primary_subject_id || '');
    setEditUserDivision(p.division_id || '');
    setEditUserClasses(
      Array.from(
        new Set(staffAssignments.filter((a) => a.user_id === p.id).map((a) => a.class_section_id))
      )
    );
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError(null);

    const validationError = validateRoleConfiguration({
      roles: editUserRoles,
      primarySubjectId: editUserSubject,
      divisionId: editUserDivision,
      classSectionIds: editUserClasses,
      lang,
    });
    if (validationError) {
      setEditUserError(validationError);
      return;
    }

    setEditUserSaving(true);
    try {
      const nextActiveRole = editUserRoles.includes(editingUser.active_role)
        ? editingUser.active_role
        : editUserRoles[0];
      const normalizedSubjectId = editUserRoles.includes('teacher')
        ? editUserSubject || null
        : null;
      const assignmentRows = buildStaffAssignmentRows({
        userId: editingUser.id,
        roles: editUserRoles,
        classSectionIds: editUserClasses,
        primarySubjectId: normalizedSubjectId,
      });

      const { data: prevAssignments } = await supabase
        .from('staff_class_assignments')
        .select('user_id, class_section_id, subject_id, assignment_type')
        .eq('user_id', editingUser.id);

      const { error: delErr } = await supabase
        .from('staff_class_assignments')
        .delete()
        .eq('user_id', editingUser.id);
      if (delErr) {
        setEditUserError(delErr.message);
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
          setEditUserError(
            assignErr?.message ||
              (lang === 'ar'
                ? 'تعذر حفظ الفصول المسندة، يرجى المحاولة مرة أخرى.'
                : 'Failed to save assigned class sections.')
          );
          return;
        }
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          name_ar: editUserNameAr.trim(),
          name_en: editUserNameEn.trim(),
          roles: editUserRoles,
          active_role: nextActiveRole,
          primary_subject_id: normalizedSubjectId,
          division_id: editUserDivision || null,
          is_onboarded: true,
        })
        .eq('id', editingUser.id);

      if (profErr) {
        await supabase.from('staff_class_assignments').delete().eq('user_id', editingUser.id);
        if (prevAssignments && prevAssignments.length > 0) {
          await supabase.from('staff_class_assignments').insert(prevAssignments);
        }
        setEditUserError(profErr.message);
        return;
      }

      setEditingUser(null);
      await refreshMasterData();
    } finally {
      setEditUserSaving(false);
    }
  };

  const handleCreateDummy = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionMsg(null);
    setDummyError(null);
    if (!dummyEmail.trim() || !dummyPassword.trim()) {
      setDummyError(
        lang === 'ar' ? 'يرجى إدخال البريد وكلمة المرور' : 'Please enter email and password'
      );
      return;
    }

    const validationError = validateRoleConfiguration({
      roles: dummyRoles,
      primarySubjectId: dummySubject,
      divisionId: dummyDivision,
      classSectionIds: dummyClasses,
      lang,
    });
    if (validationError) {
      setDummyError(validationError);
      return;
    }

    setDummySaving(true);
    try {
      const newId = crypto.randomUUID();
      const normalizedSubjectId = dummyRoles.includes('teacher') ? dummySubject || null : null;
      const { error } = await supabase.from('profiles').insert({
        id: newId,
        email: dummyEmail.trim().toLowerCase(),
        name_ar: dummyNameAr.trim() || dummyNameEn.trim(),
        name_en: dummyNameEn.trim() || dummyNameAr.trim(),
        roles: dummyRoles,
        active_role: dummyRoles[0],
        primary_subject_id: normalizedSubjectId,
        division_id: dummyDivision || null,
        is_onboarded: true,
        is_dummy: true,
        dummy_password: dummyPassword,
      });

      if (error) {
        setDummyError(error.message);
        return;
      }

      const assignmentRows = buildStaffAssignmentRows({
        userId: newId,
        roles: dummyRoles,
        classSectionIds: dummyClasses,
        primarySubjectId: normalizedSubjectId,
      });
      if (assignmentRows.length > 0) {
        const { data: insertedRows, error: assignErr } = await supabase
          .from('staff_class_assignments')
          .insert(assignmentRows)
          .select('id');
        if (assignErr || !insertedRows || insertedRows.length !== assignmentRows.length) {
          await supabase.from('staff_class_assignments').delete().eq('user_id', newId);
          await supabase.from('profiles').delete().eq('id', newId);
          setDummyError(
            assignErr?.message ||
              (lang === 'ar'
                ? 'تعذر حفظ الفصول المحددة للحساب، تم التراجع عن الإنشاء.'
                : 'Failed to save class assignments; account creation was rolled back.')
          );
          return;
        }
      }

      setDummyModalOpen(false);
      setDummyEmail('');
      setDummyNameAr('');
      setDummyNameEn('');
      setDummyClasses([]);
      setUserActionMsg({
        type: 'ok',
        text:
          lang === 'ar'
            ? 'تم إنشاء الحساب التجريبي بنجاح ويمكن تسجيل الدخول به فوراً.'
            : 'Dummy test account created and ready for instant login or impersonation.',
      });
      await refreshMasterData();
    } finally {
      setDummySaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const targetId = deletingUser.id;
    if (targetId === userProfile?.id || targetId === realAdminProfile?.id) return;

    setDeletingUserLoading(true);
    setUserActionMsg(null);
    try {
      await supabase.from('staff_class_assignments').delete().eq('user_id', targetId);
      await supabase.from('timetable_slots').delete().eq('teacher_id', targetId);
      await supabase
        .from('substitutions')
        .delete()
        .or(
          `original_teacher_id.eq.${targetId},substitute_teacher_id.eq.${targetId},assigned_by.eq.${targetId}`
        );
      await supabase
        .from('teacher_absences')
        .delete()
        .or(`teacher_id.eq.${targetId},marked_by.eq.${targetId}`);
      await supabase
        .from('duty_assignments')
        .delete()
        .or(`teacher_id.eq.${targetId},assigned_by.eq.${targetId}`);
      await supabase.from('behavior_logs').delete().eq('teacher_id', targetId);
      await supabase.from('performance_comments').delete().eq('teacher_id', targetId);

      const { data: userReqs } = await supabase
        .from('performance_requests')
        .select('id')
        .eq('requested_by', targetId);
      if (userReqs && userReqs.length > 0) {
        const reqIds = userReqs.map((r: { id: string }) => r.id);
        await supabase.from('performance_comments').delete().in('request_id', reqIds);
        await supabase.from('performance_requests').delete().in('id', reqIds);
      }

      await supabase.from('notices').update({ published_by: null }).eq('published_by', targetId);

      const { error: delProfErr } = await supabase.from('profiles').delete().eq('id', targetId);
      if (delProfErr) {
        setUserActionMsg({ type: 'err', text: delProfErr.message });
        return;
      }

      setUserActionMsg({
        type: 'ok',
        text:
          lang === 'ar'
            ? `تم حذف المستخدم (${deletingUser.email}) وجميع بياناته من النظام بنجاح.`
            : `User (${deletingUser.email}) and their associated records were completely deleted.`,
      });
      setDeletingUser(null);
      await refreshMasterData();
    } finally {
      setDeletingUserLoading(false);
    }
  };

  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return profiles;
    return profiles.filter((p) =>
      matchesBilingualSearch(userSearch, p.email, p.name_en, p.name_ar)
    );
  }, [profiles, userSearch]);

  // ==================== TAB 2: STUDENTS & EXCEL IMPORTER ====================
  const [studentSearch, setStudentSearch] = useState('');
  const [studentGradeFilter, setStudentGradeFilter] = useState('');
  const [studentSectionFilter, setStudentSectionFilter] = useState('');
  const [parsedExcel, setParsedExcel] = useState<{
    validRows: ParsedStudentRow[];
    errors: { rowNumber: number; reason: string }[];
  } | null>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const [studentModal, setStudentModal] = useState<Partial<Student> | null>(null);

  const classMap = useMemo(() => new Map(classSections.map((c) => [c.id, c])), [classSections]);

  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      ['Arabic Name', 'English Name', 'ID/Iqama', 'Father Mobile', 'Grade', 'Section'],
      ['أحمد خالد المنصور', 'Ahmed Khaled Al-Mansour', '2499900001', '966551112233', 'Grade 5', 'C'],
      ['يوسف عمر السالم', 'Youssef Omar Al-Salem', '2499900002', '966509998877', 'Grade 7', 'D'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'MEIS_Students_Template.xlsx');
  };

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 });
    const result = parseStudentExcelRows(rawRows, grades, sections, classSections);
    setParsedExcel(result);
    e.target.value = '';
  };

  const handleConfirmUpsertStudents = async () => {
    if (!parsedExcel || parsedExcel.validRows.length === 0) return;
    setImportingExcel(true);
    try {
      const payload = parsedExcel.validRows.map((r) => ({
        iqama_id: r.iqama_id,
        name_ar: r.name_ar,
        name_en: r.name_en,
        father_mobile: r.father_mobile,
        grade_id: r.grade_id,
        section_id: r.section_id,
        class_section_id: r.class_section_id,
      }));
      const { error } = await supabase
        .from('students')
        .upsert(payload, { onConflict: 'iqama_id' });
      if (error) {
        setImportStatus(error.message);
        return;
      }
      setImportStatus(
        lang === 'ar'
          ? `تم استيراد/تحديث ${payload.length} طالب بنجاح.`
          : `Successfully upserted ${payload.length} students.`
      );
      setParsedExcel(null);
      await refreshMasterData();
    } finally {
      setImportingExcel(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentModal) return;
    const cs = classSections.find((c) => c.id === studentModal.class_section_id);
    const payload = {
      iqama_id: (studentModal.iqama_id || '').trim(),
      name_ar: (studentModal.name_ar || '').trim(),
      name_en: (studentModal.name_en || '').trim(),
      father_mobile: (studentModal.father_mobile || '').trim(),
      grade_id: cs?.grade_id || studentModal.grade_id || '',
      section_id: cs?.section_id || studentModal.section_id || '',
      class_section_id: studentModal.class_section_id || '',
    };

    if (!payload.iqama_id || !payload.class_section_id) return;

    if (studentModal.id) {
      await supabase.from('students').update(payload).eq('id', studentModal.id);
    } else {
      await supabase.from('students').upsert(payload, { onConflict: 'iqama_id' });
    }
    setStudentModal(null);
    await refreshMasterData();
  };

  const handleDeleteStudent = async (id: string) => {
    await supabase.from('students').delete().eq('id', id);
    await refreshMasterData();
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (studentGradeFilter && s.grade_id !== studentGradeFilter) return false;
      if (studentSectionFilter && s.section_id !== studentSectionFilter) return false;
      return matchesBilingualSearch(studentSearch, s.iqama_id, s.name_ar, s.name_en);
    });
  }, [students, studentSearch, studentGradeFilter, studentSectionFilter]);

  // ==================== TAB 3: MASTER DATA & SETTINGS ====================
  const [masterSub, setMasterSub] = useState<MasterTableKey>('settings');

  // School settings form
  const [setNameEn, setSetNameEn] = useState(schoolSettings?.school_name_en || '');
  const [setNameAr, setSetNameAr] = useState(schoolSettings?.school_name_ar || '');
  const [setLogoUrl, setSetLogoUrl] = useState(schoolSettings?.school_logo_url || '');
  const [setDomain, setSetDomain] = useState(schoolSettings?.allowed_email_domain || 'meis.sch.sa');
  const [setMaxSubs, setSetMaxSubs] = useState(
    String(schoolSettings?.max_monthly_substitutions ?? 8)
  );
  const [setThreshold, setSetThreshold] = useState(
    String(schoolSettings?.high_behavior_threshold ?? 3)
  );
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  // Quick Add Forms for Master Tables
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newExtra1, setNewExtra1] = useState(''); // division_id / grade_id / severity_points / start_time
  const [newExtra2, setNewExtra2] = useState(''); // section_id / end_time / period_number
  const [newBool, setNewBool] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolSettings) return;
    await supabase
      .from('school_settings')
      .update({
        school_name_en: setNameEn.trim(),
        school_name_ar: setNameAr.trim(),
        school_logo_url: setLogoUrl.trim(),
        allowed_email_domain: setDomain.trim(),
        max_monthly_substitutions: Number(setMaxSubs) || 8,
        high_behavior_threshold: Number(setThreshold) || 3,
      })
      .eq('id', schoolSettings.id);
    await refreshMasterData();
    setSettingsSavedMsg(lang === 'ar' ? 'تم حفظ الإعدادات وتحديث النظام.' : 'Settings saved.');
  };

  const handleAddMasterRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterSub === 'divisions') {
      await supabase.from('divisions').insert({
        code: newCode.trim().toUpperCase(),
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        sort_order: divisions.length + 1,
        is_active: true,
      });
    } else if (masterSub === 'grades') {
      const gNum = Number(newCode) || grades.length + 1;
      await supabase.from('grades').insert({
        division_id: newExtra1 || divisions[0]?.id,
        grade_number: gNum,
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        sort_order: gNum,
      });
    } else if (masterSub === 'sections') {
      await supabase.from('sections').insert({
        code: newCode.trim().toUpperCase(),
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        sort_order: sections.length + 1,
      });
    } else if (masterSub === 'class_sections') {
      const g = grades.find((x) => x.id === (newExtra1 || grades[0]?.id));
      const s = sections.find((x) => x.id === (newExtra2 || sections[0]?.id));
      if (!g || !s) return;
      await supabase.from('class_sections').insert({
        grade_id: g.id,
        section_id: s.id,
        display_name_en: `${g.name_en} - ${s.code}`,
        display_name_ar: `${g.name_ar} - ${s.code}`,
        is_active: true,
      });
    } else if (masterSub === 'subjects') {
      await supabase.from('subjects').insert({
        code: newCode.trim().toUpperCase(),
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        in_lower_grades: true,
        in_upper_grades: true,
        sort_order: subjects.length + 1,
      });
    } else if (masterSub === 'timeslots') {
      await supabase.from('timeslots').insert({
        division_id: newExtra1 || divisions[0]?.id,
        period_number: newBool ? null : Number(newCode) || 1,
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        start_time: newExtra2 || '07:45:00',
        end_time: newCode.includes(':') ? newCode : null,
        is_break: newBool,
        sort_order: timeslots.length + 1,
      });
    } else if (masterSub === 'behavior_categories') {
      await supabase.from('behavior_categories').insert({
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        severity_points: Number(newCode) || 1,
        sort_order: behaviorCategories.length + 1,
        is_active: true,
      });
    } else if (masterSub === 'duty_types') {
      await supabase.from('duty_types').insert({
        name_en: newNameEn.trim(),
        name_ar: newNameAr.trim(),
        sort_order: dutyTypes.length + 1,
      });
    }

    setNewNameEn('');
    setNewNameAr('');
    setNewCode('');
    await refreshMasterData();
  };

  const handleDeleteMasterRow = async (table: MasterTableKey, id: string) => {
    await supabase.from(table).delete().eq('id', id);
    await refreshMasterData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {lang === 'ar' ? 'مركز إدارة النظام الكامل' : 'System Administration Suite'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'ar'
              ? 'تحكم كامل بالمستخدمين والأدوار، استيراد الطلاب من Excel، الجداول المرجعية، والسجلات العامة.'
              : '100% live control over staff multi-roles, dummy accounts, .xlsx student imports, academic structure, and global records.'}
          </p>
        </div>

        <div className="inline-flex flex-wrap p-1 bg-slate-200/70 rounded-xl gap-1">
          {(
            [
              ['users', lang === 'ar' ? 'المستخدمون والأدوار' : 'Users & Dummy'],
              ['students', lang === 'ar' ? 'الطلاب و Excel' : 'Students & .xlsx'],
              ['master', lang === 'ar' ? 'الهيكل والإعدادات' : 'Master Data'],
              ['records', lang === 'ar' ? 'الجداول والإعلانات' : 'Timetable & Notices'],
            ] as [AdminTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                tab === id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== TAB 1: USERS & DUMMY ACCOUNTS ==================== */}
      {tab === 'users' && (
        <section className="meis-glass rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute top-3 start-3.5" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'بحث بالاسم أو البريد الإلكتروني...'
                    : 'Search staff by name or email...'
                }
                className="w-full ps-10 pe-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setDummyError(null);
                setDummyEmail('');
                setDummyPassword('123456');
                setDummyNameAr('');
                setDummyNameEn('');
                setDummyRoles(['teacher']);
                setDummySubject(subjects[0]?.id || '');
                setDummyDivision('');
                setDummyClasses([]);
                setDummyModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {lang === 'ar' ? 'إنشاء حساب اختبار تجريبي' : 'Create Dummy Test Account'}
              </span>
            </button>
          </div>

          {userActionMsg && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                userActionMsg.type === 'err'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {userActionMsg.text}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 px-3 text-start font-semibold">
                    {lang === 'ar' ? 'الاسم' : 'Staff Name'}
                  </th>
                  <th className="py-2.5 px-3 text-start font-semibold">
                    {lang === 'ar' ? 'البريد' : 'Email'}
                  </th>
                  <th className="py-2.5 px-3 text-start font-semibold">
                    {lang === 'ar' ? 'الأدوار' : 'Roles'}
                  </th>
                  <th className="py-2.5 px-3 text-start font-semibold">
                    {lang === 'ar' ? 'النوع' : 'Account'}
                  </th>
                  <th className="py-2.5 px-3 text-end font-semibold">
                    {lang === 'ar' ? 'إجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProfiles.map((p) => {
                  const isSelf = p.id === userProfile?.id || p.id === realAdminProfile?.id;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {getLocalizedName(p, lang)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{p.email}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-700">
                        {p.roles.map((r) => ROLE_LABELS[r]?.[lang] || r).join(' · ')}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {p.is_dummy ? (
                          <span className="text-amber-700 font-semibold">
                            {lang === 'ar' ? 'حساب تجريبي' : 'Dummy'}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">
                            {lang === 'ar' ? 'رسمي' : 'Official'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-end">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void impersonateProfile(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'تقمص الدور' : 'Impersonate'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditUser(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{tr('edit', lang)}</span>
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              aria-label={`Delete ${p.email}`}
                              onClick={() => setDeletingUser(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{tr('delete', lang)}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== TAB 2: STUDENTS & EXCEL IMPORTER ==================== */}
      {tab === 'students' && (
        <div className="space-y-6">
          <section className="meis-glass rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'ar'
                    ? 'استيراد الطلاب الجماعي عبر Excel (.xlsx)'
                    : 'Bulk Student Excel (.xlsx) Importer'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'ar'
                    ? 'الترتيب الإلزامي للأعمدة الستة: الاسم العربي، الاسم الإنجليزي، رقم الإقامة/الهوية، جوال ولي الأمر، الصف، الشعبة.'
                    : 'Exact 6-column order: Arabic Name, English Name, ID/Iqama, Father Mobile, Grade, Section (Upserts by ID/Iqama).'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSampleExcel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ar' ? 'تحميل قالب Excel نموذجي' : 'Download Sample Excel Template'}
                  </span>
                </button>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'رفع ملف Excel' : 'Upload .xlsx File'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => void handleExcelFile(e)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {importStatus && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                {importStatus}
              </div>
            )}

            {parsedExcel && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-bold text-slate-800">
                    {lang === 'ar'
                      ? `صفوف صالحة للاستيراد: ${parsedExcel.validRows.length} · أخطاء: ${parsedExcel.errors.length}`
                      : `Valid rows: ${parsedExcel.validRows.length} · Errors: ${parsedExcel.errors.length}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setParsedExcel(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      {tr('cancel', lang)}
                    </button>
                    <button
                      type="button"
                      disabled={importingExcel || parsedExcel.validRows.length === 0}
                      onClick={() => void handleConfirmUpsertStudents()}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {importingExcel
                        ? tr('loading', lang)
                        : lang === 'ar'
                          ? 'تأكيد الاستيراد والحفظ'
                          : 'Confirm Upsert to Database'}
                    </button>
                  </div>
                </div>
                {parsedExcel.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-xs text-red-700 space-y-1">
                    {parsedExcel.errors.map((err, i) => (
                      <p key={i}>
                        Row {err.rowNumber}: {err.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Full Student CRUD Table */}
          <section className="meis-glass rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'قائمة الطلاب المسجلين' : 'Students Directory'} ({filteredStudents.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setStudentModal({
                    iqama_id: '',
                    name_ar: '',
                    name_en: '',
                    father_mobile: '9665',
                    class_section_id: classSections[0]?.id || '',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إضافة طالب' : 'Add Student'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث بالاسم أو الإقامة...' : 'Search name or Iqama...'}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              />
              <select
                value={studentGradeFilter}
                onChange={(e) => setStudentGradeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">{lang === 'ar' ? 'جميع الصفوف' : 'All Grades'}</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {getLocalizedName(g, lang)}
                  </option>
                ))}
              </select>
              <select
                value={studentSectionFilter}
                onChange={(e) => setStudentSectionFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              >
                <option value="">{lang === 'ar' ? 'جميع الشعب' : 'All Sections'}</option>
                {sections.map((s) => (
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
                    <th className="py-2 px-3 text-start font-semibold">ID / Iqama</th>
                    <th className="py-2 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الاسم العربي' : 'Arabic Name'}
                    </th>
                    <th className="py-2 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الاسم الإنجليزي' : 'English Name'}
                    </th>
                    <th className="py-2 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'الفصل' : 'Class'}
                    </th>
                    <th className="py-2 px-3 text-start font-semibold">
                      {lang === 'ar' ? 'جوال الأب' : 'Father Mobile'}
                    </th>
                    <th className="py-2 px-3 text-end font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-xs">{st.iqama_id}</td>
                      <td className="py-2 px-3">{st.name_ar}</td>
                      <td className="py-2 px-3" dir="ltr">
                        {st.name_en}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {getLocalizedDisplayName(classMap.get(st.class_section_id), lang)}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs" dir="ltr">
                        {st.father_mobile}
                      </td>
                      <td className="py-2 px-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setStudentModal(st)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteStudent(st.id)}
                            className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================== TAB 3: MASTER DATA & SETTINGS ==================== */}
      {tab === 'master' && (
        <div className="meis-glass rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap gap-1.5 pb-4 border-b border-slate-200">
            {(
              [
                ['settings', lang === 'ar' ? 'إعدادات المدرسة' : 'School Settings'],
                ['divisions', lang === 'ar' ? 'المراحل' : 'Divisions'],
                ['grades', lang === 'ar' ? 'الصفوف' : 'Grades'],
                ['sections', lang === 'ar' ? 'الشعب' : 'Sections'],
                ['class_sections', lang === 'ar' ? 'الفصول' : 'Class Sections'],
                ['subjects', lang === 'ar' ? 'المواد' : 'Subjects'],
                ['timeslots', lang === 'ar' ? 'أوقات الحصص' : 'Bell Timeslots'],
                ['behavior_categories', lang === 'ar' ? 'فئات السلوك' : 'Behavior Categories'],
                ['duty_types', lang === 'ar' ? 'أنواع المناوبات' : 'Duty Types'],
              ] as [MasterTableKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMasterSub(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  masterSub === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {masterSub === 'settings' ? (
            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  School Name (English)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={setNameEn}
                  onChange={(e) => setSetNameEn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم المدرسة (عربي)
                </label>
                <input
                  type="text"
                  value={setNameAr}
                  onChange={(e) => setSetNameAr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allowed Email Domain
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={setDomain}
                  onChange={(e) => setSetDomain(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  School Logo URL
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={setLogoUrl}
                  onChange={(e) => setSetLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ar' ? 'حد الانتظار الشهري للمعلم' : 'Max Monthly Substitutions'}
                </label>
                <input
                  type="number"
                  value={setMaxSubs}
                  onChange={(e) => setSetMaxSubs(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ar' ? 'حد التنبيه السلوكي' : 'High Behavior Alert Threshold'}
                </label>
                <input
                  type="number"
                  value={setThreshold}
                  onChange={(e) => setSetThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between pt-2">
                {settingsSavedMsg ? (
                  <span className="text-xs font-semibold text-emerald-700">{settingsSavedMsg}</span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer"
                >
                  {tr('save', lang)}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Quick Add Bar */}
              <form onSubmit={handleAddMasterRow} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                {masterSub !== 'class_sections' && (
                  <>
                    <input
                      type="text"
                      required
                      value={newNameAr}
                      onChange={(e) => setNewNameAr(e.target.value)}
                      placeholder={lang === 'ar' ? 'الاسم العربي' : 'Arabic Name'}
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={newNameEn}
                      onChange={(e) => setNewNameEn(e.target.value)}
                      placeholder="English Name"
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                  </>
                )}

                {(masterSub === 'divisions' ||
                  masterSub === 'sections' ||
                  masterSub === 'subjects' ||
                  masterSub === 'grades' ||
                  masterSub === 'behavior_categories' ||
                  masterSub === 'timeslots') && (
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder={
                      masterSub === 'behavior_categories'
                        ? 'Severity Points (1-5)'
                        : masterSub === 'grades'
                          ? 'Grade Number'
                          : masterSub === 'timeslots'
                            ? 'Period # or End HH:MM:SS'
                            : 'Code'
                    }
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                )}

                {(masterSub === 'grades' ||
                  masterSub === 'class_sections' ||
                  masterSub === 'timeslots') && (
                  <select
                    value={newExtra1}
                    onChange={(e) => setNewExtra1(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    {masterSub === 'class_sections'
                      ? grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {getLocalizedName(g, lang)}
                          </option>
                        ))
                      : divisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {getLocalizedName(d, lang)}
                          </option>
                        ))}
                  </select>
                )}

                {masterSub === 'class_sections' && (
                  <select
                    value={newExtra2}
                    onChange={(e) => setNewExtra2(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {getLocalizedName(s, lang)}
                      </option>
                    ))}
                  </select>
                )}

                {masterSub === 'timeslots' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={newExtra2}
                      onChange={(e) => setNewExtra2(e.target.value)}
                      placeholder="Start 07:45:00"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs w-full"
                    />
                    <label className="inline-flex items-center gap-1 text-xs shrink-0">
                      <input
                        type="checkbox"
                        checked={newBool}
                        onChange={(e) => setNewBool(e.target.checked)}
                      />
                      Break
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  + {tr('add', lang)}
                </button>
              </form>

              {/* Master Table Listing */}
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {masterSub === 'divisions' &&
                  divisions.map((d) => (
                    <MasterRow
                      key={d.id}
                      title={`${d.name_en} / ${d.name_ar}`}
                      meta={d.code}
                      onDelete={() => void handleDeleteMasterRow('divisions', d.id)}
                    />
                  ))}
                {masterSub === 'grades' &&
                  grades.map((g) => (
                    <MasterRow
                      key={g.id}
                      title={`${g.name_en} / ${g.name_ar}`}
                      meta={`#${g.grade_number}`}
                      onDelete={() => void handleDeleteMasterRow('grades', g.id)}
                    />
                  ))}
                {masterSub === 'sections' &&
                  sections.map((s) => (
                    <MasterRow
                      key={s.id}
                      title={`${s.name_en} / ${s.name_ar}`}
                      meta={s.code}
                      onDelete={() => void handleDeleteMasterRow('sections', s.id)}
                    />
                  ))}
                {masterSub === 'class_sections' &&
                  classSections.map((cs) => (
                    <MasterRow
                      key={cs.id}
                      title={`${cs.display_name_en} / ${cs.display_name_ar}`}
                      meta={cs.is_active ? 'Active' : 'Inactive'}
                      onDelete={() => void handleDeleteMasterRow('class_sections', cs.id)}
                    />
                  ))}
                {masterSub === 'subjects' &&
                  subjects.map((sub) => (
                    <MasterRow
                      key={sub.id}
                      title={`${sub.name_en} / ${sub.name_ar}`}
                      meta={sub.code}
                      onDelete={() => void handleDeleteMasterRow('subjects', sub.id)}
                    />
                  ))}
                {masterSub === 'timeslots' &&
                  timeslots.map((ts) => (
                    <MasterRow
                      key={ts.id}
                      title={`${ts.name_en} / ${ts.name_ar}`}
                      meta={`${ts.start_time} - ${ts.end_time || ''}`}
                      onDelete={() => void handleDeleteMasterRow('timeslots', ts.id)}
                    />
                  ))}
                {masterSub === 'behavior_categories' &&
                  behaviorCategories.map((b) => (
                    <MasterRow
                      key={b.id}
                      title={`${b.name_en} / ${b.name_ar}`}
                      meta={`Severity: ${b.severity_points}`}
                      onDelete={() => void handleDeleteMasterRow('behavior_categories', b.id)}
                    />
                  ))}
                {masterSub === 'duty_types' &&
                  dutyTypes.map((dt) => (
                    <MasterRow
                      key={dt.id}
                      title={`${dt.name_en} / ${dt.name_ar}`}
                      meta={`Order ${dt.sort_order}`}
                      onDelete={() => void handleDeleteMasterRow('duty_types', dt.id)}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 4: GLOBAL TIMETABLE & NOTICES ==================== */}
      {tab === 'records' && (
        <div className="space-y-8">
          <TimetableSubstitutionModule />
          <NoticeBoardManager />
        </div>
      )}

      {/* Edit Staff User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{editingUser.email}</h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={editUserNameAr}
                  onChange={(e) => setEditUserNameAr(e.target.value)}
                  placeholder="Arabic Name"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={editUserNameEn}
                  onChange={(e) => setEditUserNameEn(e.target.value)}
                  placeholder="English Name"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {lang === 'ar' ? 'الأدوار الممنوحة (متعدد)' : 'Assigned Roles (Multi-Role)'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => {
                    const checked = editUserRoles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setEditUserRoles((prev) =>
                            prev.includes(r)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== r)
                                : prev
                              : [...prev, r]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          checked
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {ROLE_LABELS[r][lang]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={editUserSubject}
                  onChange={(e) => setEditUserSubject(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">{lang === 'ar' ? 'بدون مادة محددة' : 'No Primary Subject'}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getLocalizedName(s, lang)}
                    </option>
                  ))}
                </select>
                <select
                  value={editUserDivision}
                  onChange={(e) => setEditUserDivision(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">{lang === 'ar' ? 'جميع المراحل' : 'No Division Lock'}</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {getLocalizedName(d, lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {lang === 'ar'
                      ? 'الفصول المسندة (تحدد الصفوف والطلاب الظاهرين للمعلم / المشرف)'
                      : 'Assigned Class Sections (controls visible grades & students for Teacher/Supervisor)'}
                  </p>
                  <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                    {editUserClasses.length} {lang === 'ar' ? 'محدد' : 'selected'}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  {groupedClassSections.map(({ grade, items }) => {
                    const itemIds = items.map((i) => i.id);
                    const allSelected = itemIds.every((id) => editUserClasses.includes(id));
                    return (
                      <div key={grade.id} className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-800">
                            {getLocalizedName(grade, lang)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditUserClasses((prev) =>
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
                            const active = editUserClasses.includes(cs.id);
                            return (
                              <button
                                key={cs.id}
                                type="button"
                                onClick={() =>
                                  setEditUserClasses((prev) =>
                                    prev.includes(cs.id)
                                      ? prev.filter((x) => x !== cs.id)
                                      : [...prev, cs.id]
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                                  active
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-700 border-slate-200'
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

              {editUserError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {editUserError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={editUserSaving}
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  {tr('cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={editUserSaving}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {editUserSaving ? tr('loading', lang) : tr('save', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Dummy Test Account Modal */}
      {dummyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'إنشاء حساب اختبار تجريبي (Dummy)' : 'Create Dummy Test Account'}
              </h3>
              <button
                type="button"
                onClick={() => setDummyModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDummy} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={dummyEmail}
                  onChange={(e) => setDummyEmail(e.target.value)}
                  placeholder="test.teacher@meis.sch.sa"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={dummyPassword}
                  onChange={(e) => setDummyPassword(e.target.value)}
                  placeholder="Dummy Password"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  required
                  value={dummyNameAr}
                  onChange={(e) => setDummyNameAr(e.target.value)}
                  placeholder={lang === 'ar' ? 'الاسم العربي' : 'Arabic Name'}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={dummyNameEn}
                  onChange={(e) => setDummyNameEn(e.target.value)}
                  placeholder="English Name"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {lang === 'ar' ? 'الأدوار' : 'Role(s)'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => {
                    const active = dummyRoles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setDummyRoles((prev) =>
                            prev.includes(r)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== r)
                                : prev
                              : [...prev, r]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {ROLE_LABELS[r][lang]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={dummySubject}
                  onChange={(e) => setDummySubject(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">{lang === 'ar' ? 'المادة (للمعلم)' : 'Primary Subject'}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getLocalizedName(s, lang)}
                    </option>
                  ))}
                </select>
                <select
                  value={dummyDivision}
                  onChange={(e) => setDummyDivision(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">{lang === 'ar' ? 'المرحلة' : 'Division'}</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {getLocalizedName(d, lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {groupedClassSections.map(({ grade, items }) => {
                  const itemIds = items.map((i) => i.id);
                  const allSelected = itemIds.every((id) => dummyClasses.includes(id));
                  return (
                    <div key={grade.id} className="p-2 rounded-lg bg-white border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">
                          {getLocalizedName(grade, lang)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDummyClasses((prev) =>
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
                              : 'Clear'
                            : lang === 'ar'
                              ? 'تحديد الصف'
                              : 'Select Grade'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((cs) => {
                          const active = dummyClasses.includes(cs.id);
                          return (
                            <button
                              key={cs.id}
                              type="button"
                              onClick={() =>
                                setDummyClasses((prev) =>
                                  prev.includes(cs.id)
                                    ? prev.filter((x) => x !== cs.id)
                                    : [...prev, cs.id]
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                                active
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-200'
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

              {dummyError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {dummyError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={dummySaving}
                  onClick={() => setDummyModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  {tr('cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={dummySaving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5 inline me-1" />
                  {dummySaving
                    ? tr('loading', lang)
                    : lang === 'ar'
                      ? 'إنشاء الحساب التجريبي'
                      : 'Create Dummy Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Complete Delete User Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-red-700">
                  {lang === 'ar' ? 'تأكيد حذف المستخدم نهائياً' : 'Confirm Complete User Deletion'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">{deletingUser.email}</p>
              </div>
              <button
                type="button"
                aria-label="Close delete confirmation"
                onClick={() => setDeletingUser(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {lang === 'ar'
                ? `هل أنت متأكد من حذف (${getLocalizedName(deletingUser, lang)})؟ سيتم حذف الملف الشخصي والفصول المعينة والجدول والمناوبات وسجلاته من النظام بالكامل ولا يمكن التراجع عن هذا الإجراء.`
                : `Permanently delete ${getLocalizedName(deletingUser, lang)}? This removes their profile, class assignments, timetable slots, duty assignments, absences/substitutions, and associated records from the system.`}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingUserLoading}
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                {tr('cancel', lang)}
              </button>
              <button
                type="button"
                disabled={deletingUserLoading}
                onClick={() => void handleDeleteUser()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {deletingUserLoading
                    ? tr('loading', lang)
                    : lang === 'ar'
                      ? 'حذف نهائي من النظام'
                      : 'Delete Permanently'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Student Modal */}
      {studentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {studentModal.id
                ? lang === 'ar'
                  ? 'تعديل بيانات الطالب'
                  : 'Edit Student'
                : lang === 'ar'
                  ? 'إضافة طالب جديد'
                  : 'Add Student'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <input
                type="text"
                required
                dir="ltr"
                value={studentModal.iqama_id || ''}
                onChange={(e) => setStudentModal({ ...studentModal, iqama_id: e.target.value })}
                placeholder="ID / Iqama"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <input
                type="text"
                required
                value={studentModal.name_ar || ''}
                onChange={(e) => setStudentModal({ ...studentModal, name_ar: e.target.value })}
                placeholder={lang === 'ar' ? 'الاسم العربي' : 'Arabic Name'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <input
                type="text"
                required
                dir="ltr"
                value={studentModal.name_en || ''}
                onChange={(e) => setStudentModal({ ...studentModal, name_en: e.target.value })}
                placeholder="English Name"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <input
                type="text"
                required
                dir="ltr"
                value={studentModal.father_mobile || ''}
                onChange={(e) =>
                  setStudentModal({ ...studentModal, father_mobile: e.target.value })
                }
                placeholder="Father Mobile (9665...)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <select
                required
                value={studentModal.class_section_id || ''}
                onChange={(e) =>
                  setStudentModal({ ...studentModal, class_section_id: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {classSections.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {getLocalizedDisplayName(cs, lang)}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStudentModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  {tr('cancel', lang)}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  {tr('save', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const MasterRow: React.FC<{ title: string; meta: string; onDelete: () => void }> = ({
  title,
  meta,
  onDelete,
}) => (
  <div className="py-2.5 px-2 flex items-center justify-between gap-3 text-xs">
    <div>
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="text-slate-500 font-mono">{meta}</p>
    </div>
    <button
      type="button"
      onClick={onDelete}
      className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);
