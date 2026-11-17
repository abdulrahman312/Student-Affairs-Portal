import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  BehaviorCategory,
  ClassSection,
  Division,
  DutyType,
  Grade,
  Language,
  Notice,
  Profile,
  SchoolSettings,
  Section,
  StaffClassAssignment,
  Student,
  Subject,
  Timeslot,
  UserRole,
} from '../types/database';
import { isAllowedSchoolEmail } from '../utils/schoolRules';

const DUMMY_PROFILE_KEY = 'meis_dummy_profile_id';
const IMPERSONATE_PROFILE_KEY = 'meis_impersonated_profile_id';
const LANG_KEY = 'meis_language';
const ALL_ROLES: UserRole[] = [
  'admin',
  'teacher',
  'supervisor',
  'academic_supervisor',
  'principal',
];
const SUPER_ADMIN_EMAIL = 'abdulrahman@meis.sch.sa';

interface AppContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  authLoading: boolean;
  masterLoading: boolean;
  userProfile: Profile | null;
  realAdminProfile: Profile | null;
  isImpersonating: boolean;
  schoolSettings: SchoolSettings | null;
  divisions: Division[];
  grades: Grade[];
  sections: Section[];
  classSections: ClassSection[];
  subjects: Subject[];
  timeslots: Timeslot[];
  behaviorCategories: BehaviorCategory[];
  dutyTypes: DutyType[];
  profiles: Profile[];
  students: Student[];
  staffAssignments: StaffClassAssignment[];
  notices: Notice[];
  refreshMasterData: () => Promise<void>;
  refreshCurrentProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    nameEn: string;
    nameAr: string;
  }) => Promise<{ error: string | null; needsVerification?: boolean }>;
  switchActiveRole: (role: UserRole) => Promise<void>;
  impersonateProfile: (profileId: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'en' ? 'en' : 'ar';
  });

  const [authLoading, setAuthLoading] = useState(true);
  const [masterLoading, setMasterLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [realAdminProfile, setRealAdminProfile] = useState<Profile | null>(null);

  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [behaviorCategories, setBehaviorCategories] = useState<BehaviorCategory[]>([]);
  const [dutyTypes, setDutyTypes] = useState<DutyType[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<StaffClassAssignment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(LANG_KEY, next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const refreshMasterData = useCallback(async () => {
    setMasterLoading(true);
    try {
      const fetchAllStudents = async (): Promise<Student[]> => {
        const pageSize = 1000;
        const all: Student[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('students')
            .select('*')
            .order('name_en')
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) break;
          all.push(...(data as Student[]));
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [
        settingsRes,
        divRes,
        gradeRes,
        secRes,
        csRes,
        subRes,
        tsRes,
        behRes,
        dutyRes,
        profRes,
        allStudents,
        scaRes,
        notRes,
      ] = await Promise.all([
        supabase.from('school_settings').select('*').limit(1).maybeSingle(),
        supabase.from('divisions').select('*').order('sort_order'),
        supabase.from('grades').select('*').order('sort_order'),
        supabase.from('sections').select('*').order('sort_order'),
        supabase.from('class_sections').select('*').order('display_name_en'),
        supabase.from('subjects').select('*').order('sort_order'),
        supabase.from('timeslots').select('*').order('sort_order'),
        supabase.from('behavior_categories').select('*').order('sort_order'),
        supabase.from('duty_types').select('*').order('sort_order'),
        supabase.from('profiles').select('*').order('name_en'),
        fetchAllStudents(),
        supabase.from('staff_class_assignments').select('*'),
        supabase.from('notices').select('*').order('created_at', { ascending: false }),
      ]);

      const fetchedGrades = (gradeRes.data || []) as Grade[];
      const fetchedSections = (secRes.data || []) as Section[];
      const fetchedClassSections = (csRes.data || []) as ClassSection[];
      const gradeOrderMap = new Map(fetchedGrades.map((g) => [g.id, g.sort_order]));
      const sectionOrderMap = new Map(fetchedSections.map((s) => [s.id, s.sort_order]));
      const sortedClassSections = fetchedClassSections.slice().sort((a, b) => {
        const ga = gradeOrderMap.get(a.grade_id) ?? 999;
        const gb = gradeOrderMap.get(b.grade_id) ?? 999;
        if (ga !== gb) return ga - gb;
        const sa = sectionOrderMap.get(a.section_id) ?? 999;
        const sb = sectionOrderMap.get(b.section_id) ?? 999;
        if (sa !== sb) return sa - sb;
        return a.display_name_en.localeCompare(b.display_name_en);
      });

      if (settingsRes.data) setSchoolSettings(settingsRes.data as SchoolSettings);
      if (divRes.data) setDivisions(divRes.data as Division[]);
      setGrades(fetchedGrades);
      setSections(fetchedSections);
      setClassSections(sortedClassSections);
      if (subRes.data) setSubjects(subRes.data as Subject[]);
      if (tsRes.data) setTimeslots(tsRes.data as Timeslot[]);
      if (behRes.data) setBehaviorCategories(behRes.data as BehaviorCategory[]);
      if (dutyRes.data) setDutyTypes(dutyRes.data as DutyType[]);
      if (profRes.data) setProfiles(profRes.data as Profile[]);
      setStudents(allStudents);
      if (scaRes.data) setStaffAssignments(scaRes.data as StaffClassAssignment[]);
      if (notRes.data) setNotices(notRes.data as Notice[]);
    } finally {
      setMasterLoading(false);
    }
  }, []);

  const ensureSuperAdminRoles = useCallback(async (profile: Profile): Promise<Profile> => {
    if (profile.email.toLowerCase() !== SUPER_ADMIN_EMAIL) return profile;
    const missing = ALL_ROLES.some((r) => !profile.roles.includes(r));
    if (!missing) return profile;

    const updatedRoles = ALL_ROLES;
    const { data } = await supabase
      .from('profiles')
      .update({
        roles: updatedRoles,
        active_role: profile.active_role || 'admin',
        is_onboarded: true,
      })
      .eq('id', profile.id)
      .select()
      .single();

    return (data as Profile) || { ...profile, roles: updatedRoles, is_onboarded: true };
  }, []);

  const resolveProfileSession = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setAuthLoading(true);
    try {
      const impersonateId = localStorage.getItem(IMPERSONATE_PROFILE_KEY);
      const dummyId = localStorage.getItem(DUMMY_PROFILE_KEY);

      // 1. Check Supabase Auth session first
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user;

      let baseProfile: Profile | null = null;

      if (authUser) {
        const email = (authUser.email || '').toLowerCase();
        // Check if profile exists by id or email
        const { data: existingById } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        if (existingById) {
          baseProfile = await ensureSuperAdminRoles(existingById as Profile);
        } else {
          const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', email)
            .maybeSingle();

          if (existingByEmail) {
            baseProfile = await ensureSuperAdminRoles(existingByEmail as Profile);
          } else {
            // Create new profile for OAuth/email user
            const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
            const fullName =
              (authUser.user_metadata?.full_name as string) ||
              (authUser.user_metadata?.name as string) ||
              email.split('@')[0];
            const nameAr = (authUser.user_metadata?.name_ar as string) || fullName;

            const { data: created } = await supabase
              .from('profiles')
              .insert({
                id: authUser.id,
                email,
                name_en: fullName,
                name_ar: nameAr,
                roles: isSuperAdmin ? ALL_ROLES : ['teacher'],
                active_role: isSuperAdmin ? 'admin' : 'teacher',
                is_onboarded: isSuperAdmin,
                is_dummy: false,
              })
              .select()
              .single();

            if (created) baseProfile = created as Profile;
          }
        }
      } else if (dummyId) {
        const { data: dummyProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', dummyId)
          .maybeSingle();
        if (dummyProfile) {
          baseProfile = await ensureSuperAdminRoles(dummyProfile as Profile);
        } else {
          localStorage.removeItem(DUMMY_PROFILE_KEY);
        }
      }

      if (baseProfile && impersonateId && baseProfile.roles.includes('admin')) {
        const { data: targetProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', impersonateId)
          .maybeSingle();
        if (targetProfile) {
          setRealAdminProfile(baseProfile);
          setUserProfile(targetProfile as Profile);
          return;
        } else {
          localStorage.removeItem(IMPERSONATE_PROFILE_KEY);
        }
      }

      setRealAdminProfile(null);
      setUserProfile(baseProfile);
    } finally {
      if (!silent) setAuthLoading(false);
    }
  }, [ensureSuperAdminRoles]);

  const refreshCurrentProfile = useCallback(async () => {
    await resolveProfileSession({ silent: true });
  }, [resolveProfileSession]);

  useEffect(() => {
    void refreshMasterData();
    void resolveProfileSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event) => {
      void resolveProfileSession();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshMasterData, resolveProfileSession]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error ? error.message : null };
  }, []);

  const signInWithEmail = useCallback(
    async (emailInput: string, password: string) => {
      const email = emailInput.trim().toLowerCase();
      if (!email || !password) {
        return {
          error:
            lang === 'ar'
              ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور'
              : 'Please enter both email and password',
        };
      }

      // 1. Check Instant Dummy Account Login in public.profiles
      const { data: dummyMatch } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', email)
        .eq('is_dummy', true)
        .maybeSingle();

      if (dummyMatch) {
        if ((dummyMatch as Profile).dummy_password === password) {
          localStorage.setItem(DUMMY_PROFILE_KEY, dummyMatch.id);
          localStorage.removeItem(IMPERSONATE_PROFILE_KEY);
          const ensured = await ensureSuperAdminRoles(dummyMatch as Profile);
          setUserProfile(ensured);
          setRealAdminProfile(null);
          return { error: null };
        } else {
          return {
            error:
              lang === 'ar'
                ? 'كلمة مرور الحساب التجريبي غير صحيحة'
                : 'Incorrect dummy account password',
          };
        }
      }

      // 2. Enforce official school email domain for regular accounts
      const allowedDomain = schoolSettings?.allowed_email_domain || 'meis.sch.sa';
      if (!isAllowedSchoolEmail(email, allowedDomain)) {
        return {
          error:
            lang === 'ar'
              ? `يُسمح فقط بالبريد الرسمي المنتهي بـ @${allowedDomain}`
              : `Only official school emails ending with @${allowedDomain} are permitted`,
        };
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message };
      }

      await resolveProfileSession();
      await refreshMasterData();
      return { error: null };
    },
    [ensureSuperAdminRoles, lang, refreshMasterData, resolveProfileSession, schoolSettings]
  );

  const signUpWithEmail = useCallback(
    async (params: { email: string; password: string; nameEn: string; nameAr: string }) => {
      const email = params.email.trim().toLowerCase();
      const allowedDomain = schoolSettings?.allowed_email_domain || 'meis.sch.sa';

      if (!isAllowedSchoolEmail(email, allowedDomain)) {
        return {
          error:
            lang === 'ar'
              ? `يجب أن ينتهي البريد الإلكتروني بـ @${allowedDomain}`
              : `Email must end with @${allowedDomain}`,
        };
      }

      if (params.password.length < 6) {
        return {
          error:
            lang === 'ar'
              ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل'
              : 'Password must be at least 6 characters',
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: params.password,
        options: {
          data: {
            full_name: params.nameEn.trim(),
            name_ar: params.nameAr.trim(),
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        return { error: error.message };
      }

      const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          name_en: params.nameEn.trim() || email.split('@')[0],
          name_ar: params.nameAr.trim() || params.nameEn.trim(),
          roles: isSuperAdmin ? ALL_ROLES : ['teacher'],
          active_role: isSuperAdmin ? 'admin' : 'teacher',
          is_onboarded: isSuperAdmin,
          is_dummy: false,
        });
      }

      if (!data.session) {
        return { error: null, needsVerification: true };
      }

      await resolveProfileSession();
      await refreshMasterData();
      return { error: null, needsVerification: false };
    },
    [lang, refreshMasterData, resolveProfileSession, schoolSettings]
  );

  const switchActiveRole = useCallback(
    async (role: UserRole) => {
      if (!userProfile || !userProfile.roles.includes(role)) return;
      setUserProfile({ ...userProfile, active_role: role });
      await supabase
        .from('profiles')
        .update({ active_role: role })
        .eq('id', userProfile.id);
    },
    [userProfile]
  );

  const impersonateProfile = useCallback(
    async (profileId: string) => {
      const adminSource = realAdminProfile || userProfile;
      if (!adminSource?.roles.includes('admin')) return;
      localStorage.setItem(IMPERSONATE_PROFILE_KEY, profileId);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();
      if (data) {
        setRealAdminProfile(adminSource);
        setUserProfile(data as Profile);
      }
    },
    [realAdminProfile, userProfile]
  );

  const exitImpersonation = useCallback(async () => {
    localStorage.removeItem(IMPERSONATE_PROFILE_KEY);
    if (realAdminProfile) {
      setUserProfile(realAdminProfile);
      setRealAdminProfile(null);
    } else {
      await resolveProfileSession();
    }
  }, [realAdminProfile, resolveProfileSession]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DUMMY_PROFILE_KEY);
    localStorage.removeItem(IMPERSONATE_PROFILE_KEY);
    setUserProfile(null);
    setRealAdminProfile(null);
    await supabase.auth.signOut();
  }, []);

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        authLoading,
        masterLoading,
        userProfile,
        realAdminProfile,
        isImpersonating: Boolean(realAdminProfile),
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
        notices,
        refreshMasterData,
        refreshCurrentProfile,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        switchActiveRole,
        impersonateProfile,
        exitImpersonation,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
