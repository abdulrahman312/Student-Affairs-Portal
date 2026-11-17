import type { Language, UserRole } from '../types/database';

export function getLocalizedName(
  item: { name_ar?: string | null; name_en?: string | null } | null | undefined,
  lang: Language
): string {
  if (!item) return '';
  return lang === 'ar'
    ? item.name_ar || item.name_en || ''
    : item.name_en || item.name_ar || '';
}

export function getLocalizedDisplayName(
  item: { display_name_ar?: string | null; display_name_en?: string | null } | null | undefined,
  lang: Language
): string {
  if (!item) return '';
  return lang === 'ar'
    ? item.display_name_ar || item.display_name_en || ''
    : item.display_name_en || item.display_name_ar || '';
}

export function getLocalizedNotice(
  notice: {
    title_ar?: string | null;
    title_en?: string | null;
    content_ar?: string | null;
    content_en?: string | null;
  },
  lang: Language
): { title: string; content: string } {
  return {
    title: lang === 'ar' ? notice.title_ar || notice.title_en || '' : notice.title_en || notice.title_ar || '',
    content: lang === 'ar' ? notice.content_ar || notice.content_en || '' : notice.content_en || notice.content_ar || '',
  };
}

export const ROLE_LABELS: Record<UserRole, { ar: string; en: string }> = {
  teacher: { ar: 'معلم', en: 'Teacher' },
  supervisor: { ar: 'مشرف إداري', en: 'Supervisor' },
  academic_supervisor: { ar: 'مشرف أكاديمي', en: 'Academic Supervisor' },
  principal: { ar: 'مدير المرحلة', en: 'Principal' },
  admin: { ar: 'مدير النظام', en: 'System Admin' },
};

export const DAY_NAMES: Record<number, { ar: string; en: string }> = {
  0: { ar: 'الأحد', en: 'Sunday' },
  1: { ar: 'الإثنين', en: 'Monday' },
  2: { ar: 'الثلاثاء', en: 'Tuesday' },
  3: { ar: 'الأربعاء', en: 'Wednesday' },
  4: { ar: 'الخميس', en: 'Thursday' },
};

export const UI_TEXT = {
  appSubtitle: { ar: 'البوابة الذكية لإدارة المدرسة', en: 'Smart School Management Portal' },
  riyadhTime: { ar: 'توقيت الرياض', en: 'Riyadh Time' },
  lowerDivisionShort: { ar: 'الابتدائية العليا', en: 'Lower (4-6)' },
  upperDivisionShort: { ar: 'المتوسطة والثانوية', en: 'Upper (7-12)' },
  outsideSchoolHours: { ar: 'خارج الدوام الدراسي', en: 'Outside School Hours' },
  switchLanguage: { ar: 'English', en: 'العربية' },
  signOut: { ar: 'تسجيل الخروج', en: 'Sign Out' },
  activeRole: { ar: 'الدور النشط', en: 'Active Role' },
  navDashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  navBehavior: { ar: 'سلوك الطلاب', en: 'Student Behavior' },
  navPerformance: { ar: 'تقارير الأداء', en: 'Performance Reports' },
  navTimetable: { ar: 'الجدول والانتظار', en: 'Timetable & Substitutions' },
  navDuties: { ar: 'المناوبات', en: 'Teacher Duties' },
  navNotices: { ar: 'لوحة الإعلانات', en: 'Notice Board' },
  navAdmin: { ar: 'إدارة النظام', en: 'Admin Suite' },
  loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  delete: { ar: 'حذف', en: 'Delete' },
  edit: { ar: 'تعديل', en: 'Edit' },
  add: { ar: 'إضافة', en: 'Add' },
  search: { ar: 'بحث', en: 'Search' },
  submit: { ar: 'إرسال', en: 'Submit' },
  close: { ar: 'إغلاق', en: 'Close' },
  whatsappFather: { ar: 'واتساب ولي الأمر', en: 'WhatsApp Father' },
  exportPdfEnglish: { ar: 'تصدير PDF (إنجليزي)', en: 'Export Report (PDF)' },
  profileSettings: { ar: 'إعدادات الحساب', en: 'Profile Settings' },
} as const;

export function tr(key: keyof typeof UI_TEXT, lang: Language): string {
  return UI_TEXT[key][lang];
}
