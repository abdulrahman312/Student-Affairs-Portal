import type { Language, Timeslot } from '../types/database';
import { getLocalizedName } from './i18n';

export const RIYADH_TZ = 'Asia/Riyadh';

export function getRiyadhParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekdayIndex: number; // 0 = Sun .. 6 = Sat
  dateStr: string;      // YYYY-MM-DD
  monthStr: string;     // YYYY-MM
  timeMinutes: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour === '24' ? '0' : map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekdayIndex: weekdayMap[map.weekday] ?? 0,
    dateStr: `${year}-${mm}-${dd}`,
    monthStr: `${year}-${mm}`,
    timeMinutes: hour * 60 + minute,
  };
}

export function formatRiyadhClock(now: Date, lang: Language): { dateText: string; timeText: string } {
  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const dateText = new Intl.DateTimeFormat(locale, {
    timeZone: RIYADH_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(now);

  const timeText = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  return { dateText, timeText };
}

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const segments = timeStr.split(':').map(Number);
  if (segments.length < 2 || Number.isNaN(segments[0]) || Number.isNaN(segments[1])) return null;
  return segments[0] * 60 + segments[1];
}

export function getActiveTimeslotLabel(
  timeslots: Timeslot[],
  divisionId: string,
  now: Date,
  lang: Language
): { label: string; isBreak: boolean; isActive: boolean } {
  const riyadh = getRiyadhParts(now);
  // Weekend in Saudi Arabia: Friday (5) and Saturday (6)
  if (riyadh.weekdayIndex === 5 || riyadh.weekdayIndex === 6) {
    return {
      label: lang === 'ar' ? 'عطلة نهاية الأسبوع' : 'Weekend',
      isBreak: false,
      isActive: false,
    };
  }

  const divSlots = timeslots
    .filter((t) => t.division_id === divisionId)
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const slot of divSlots) {
    const start = parseTimeToMinutes(slot.start_time);
    const end = parseTimeToMinutes(slot.end_time);
    if (start === null) continue;
    if (end === null) {
      // e.g. Home Time marker
      if (riyadh.timeMinutes >= start && riyadh.timeMinutes <= start + 30) {
        return { label: getLocalizedName(slot, lang), isBreak: true, isActive: true };
      }
      continue;
    }
    if (riyadh.timeMinutes >= start && riyadh.timeMinutes < end) {
      return {
        label: getLocalizedName(slot, lang),
        isBreak: slot.is_break,
        isActive: true,
      };
    }
  }

  return {
    label: lang === 'ar' ? 'خارج الدوام' : 'Off Hours',
    isBreak: false,
    isActive: false,
  };
}

export function getIsoWeekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysToDateStr(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns Sunday..Saturday bounds for the Saudi school week containing `anchorDateStr`.
 * `weekEndThu` is Thursday (Sun + 4), `weekEndSat` is Saturday (Sun + 6).
 */
export function getSchoolWeekBounds(anchorDateStr: string): {
  weekStart: string;
  weekEndThu: string;
  weekEndSat: string;
} {
  const dow = getIsoWeekdayFromDateStr(anchorDateStr); // 0 = Sun .. 6 = Sat
  const weekStart = addDaysToDateStr(anchorDateStr, -dow);
  return {
    weekStart,
    weekEndThu: addDaysToDateStr(weekStart, 4),
    weekEndSat: addDaysToDateStr(weekStart, 6),
  };
}

export interface MonthFilterOption {
  monthStr: string; // YYYY-MM
  labelEn: string;
  labelAr: string;
  isCurrent: boolean;
}

export function getRecentMonths(now: Date = new Date(), count = 12): MonthFilterOption[] {
  const { year, month } = getRiyadhParts(now);
  const results: MonthFilterOption[] = [];

  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(year, month - 1 - i, 15));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;
    const labelEn = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(dt);
  const labelAr = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(dt);

    results.push({
      monthStr,
      labelEn,
      labelAr,
      isCurrent: i === 0,
    });
  }

  return results;
}


