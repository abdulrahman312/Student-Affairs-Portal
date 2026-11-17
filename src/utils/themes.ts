import type { Language } from '../types/database';

export type PortalThemeId =
  | 'ocean-blue'
  | 'royal-navy'
  | 'forest-emerald'
  | 'regal-maroon'
  | 'royal-amethyst';

export interface PortalThemePreset {
  id: PortalThemeId;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  swatches: [string, string, string];
}

export const PORTAL_THEME_STORAGE_KEY = 'meis_ui_theme';
export const DEFAULT_PORTAL_THEME: PortalThemeId = 'ocean-blue';

export const PORTAL_THEMES: PortalThemePreset[] = [
  {
    id: 'ocean-blue',
    nameEn: 'Ocean Blue',
    nameAr: 'الأزرق المحيطي',
    descriptionEn: 'MEIS default sky & ice-blue glass with sapphire highlights',
    descriptionAr: 'الهوية الافتراضية للمدرسة بتدرجات السماوي والثلجي',
    swatches: ['#e0f2fe', '#0284c7', '#0f172a'],
  },
  {
    id: 'royal-navy',
    nameEn: 'Royal Navy',
    nameAr: 'الأزرق الملكي',
    descriptionEn: 'Intelligent marine-blue accents with crisp silver-blue surfaces',
    descriptionAr: 'تدرجات كحلية أنيقة مع لمسات زرقاء ملكية',
    swatches: ['#dbeafe', '#1d4ed8', '#172554'],
  },
  {
    id: 'forest-emerald',
    nameEn: 'Forest Emerald',
    nameAr: 'الزمردي الطبيعي',
    descriptionEn: 'Serene mint & teal light gradients with deep emerald pills',
    descriptionAr: 'خلفيات نعناعية هادئة مع أزرار زمردية عميقة',
    swatches: ['#d1fae5', '#047857', '#064e3b'],
  },
  {
    id: 'regal-maroon',
    nameEn: 'Regal Maroon',
    nameAr: 'العنابي الوقور',
    descriptionEn: 'Soft blush-ice backdrops paired with rich burgundy accents',
    descriptionAr: 'خلفيات وردية جليدية ناعمة مع لمسات عنابية راقية',
    swatches: ['#ffe4e6', '#9f1239', '#4c0519'],
  },
  {
    id: 'royal-amethyst',
    nameEn: 'Royal Amethyst',
    nameAr: 'الأرجواني الملكي',
    descriptionEn: 'Soft lavender-ice gradients with sophisticated deep violet accents',
    descriptionAr: 'تدرجات لافندر جليدية مع مؤشرات بنفسجية ملكية',
    swatches: ['#ede9fe', '#6d28d9', '#2e1065'],
  },
];

export function isValidPortalTheme(value: string | null | undefined): value is PortalThemeId {
  return PORTAL_THEMES.some((t) => t.id === value);
}

export function getThemeLabel(theme: PortalThemePreset, lang: Language): string {
  return lang === 'ar' ? theme.nameAr : theme.nameEn;
}
