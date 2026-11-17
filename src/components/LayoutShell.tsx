import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  ShieldAlert,
  UserCheck,
  UserCog,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types/database';
import { getLocalizedName, ROLE_LABELS, tr } from '../utils/i18n';
import { formatRiyadhClock, getActiveTimeslotLabel } from '../utils/riyadhTime';
import { ProfileSettingsModal } from './ProfileSettingsModal';

export type NavTab =
  | 'dashboard'
  | 'behavior'
  | 'performance'
  | 'timetable'
  | 'duties'
  | 'notices'
  | 'admin';

interface LayoutShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  children: React.ReactNode;
}

const MEIS_CREST = '/src/assets/images/meis_school_crest_1794849576691.jpg';

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activeTab,
  onSelectTab,
  children,
}) => {
  const {
    lang,
    toggleLang,
    userProfile,
    realAdminProfile,
    isImpersonating,
    schoolSettings,
    divisions,
    timeslots,
    switchActiveRole,
    exitImpersonation,
    signOut,
  } = useApp();

  const [now, setNow] = useState<Date>(() => new Date());
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const riyadhFormatted = useMemo(() => formatRiyadhClock(now, lang), [now, lang]);

  const lowerDiv = useMemo(
    () => divisions.find((d) => d.code === 'LOWER') || divisions[0],
    [divisions]
  );
  const upperDiv = useMemo(
    () => divisions.find((d) => d.code === 'UPPER') || divisions[1],
    [divisions]
  );

  const lowerStatus = useMemo(
    () =>
      lowerDiv
        ? getActiveTimeslotLabel(timeslots, lowerDiv.id, now, lang)
        : { label: '-', isBreak: false, isActive: false },
    [timeslots, lowerDiv, now, lang]
  );

  const upperStatus = useMemo(
    () =>
      upperDiv
        ? getActiveTimeslotLabel(timeslots, upperDiv.id, now, lang)
        : { label: '-', isBreak: false, isActive: false },
    [timeslots, upperDiv, now, lang]
  );

  if (!userProfile) return null;

  const activeRole = userProfile.active_role;
  const schoolName =
    lang === 'ar'
      ? schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية'
      : schoolSettings?.school_name_en || 'Middle East International School';

  const navItems: { id: NavTab; label: string; shortLabel: string; icon: React.ReactNode; visible: boolean }[] = [
    {
      id: 'dashboard',
      label: tr('navDashboard', lang),
      shortLabel: tr('navDashboard', lang),
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'behavior',
      label: tr('navBehavior', lang),
      shortLabel: lang === 'ar' ? 'السلوك' : 'Behavior',
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'performance',
      label: tr('navPerformance', lang),
      shortLabel: lang === 'ar' ? 'الأداء' : 'Performance',
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'timetable',
      label:
        activeRole === 'teacher' || activeRole === 'admin'
          ? tr('navTimetable', lang)
          : lang === 'ar'
            ? 'الغياب والانتظار'
            : 'Substitutions',
      shortLabel:
        activeRole === 'teacher' || activeRole === 'admin'
          ? lang === 'ar'
            ? 'الجدول'
            : 'Timetable'
          : lang === 'ar'
            ? 'الانتظار'
            : 'Substitutions',
      icon: <CalendarClock className="w-4 h-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'duties',
      label: tr('navDuties', lang),
      shortLabel: lang === 'ar' ? 'المناوبات' : 'Duties',
      icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'notices',
      label: tr('navNotices', lang),
      shortLabel: lang === 'ar' ? 'الإعلانات' : 'Notices',
      icon: <Megaphone className="w-4 h-4 shrink-0" />,
      visible:
        activeRole === 'principal' ||
        activeRole === 'academic_supervisor' ||
        activeRole === 'admin',
    },
    {
      id: 'admin',
      label: tr('navAdmin', lang),
      shortLabel: lang === 'ar' ? 'الإدارة' : 'Admin',
      icon: <Settings className="w-4 h-4 shrink-0" />,
      visible: activeRole === 'admin',
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen meis-mesh-bg flex flex-col p-2 sm:p-4 lg:p-6 pb-24 xl:pb-8">
      {/* Executive Outer Rounded Shell */}
      <div className="max-w-[1440px] w-full mx-auto meis-shell rounded-[2rem] sm:rounded-[2.5rem] flex-1 flex flex-col overflow-hidden">
        {/* Impersonation Banner */}
        {isImpersonating && realAdminProfile && (
          <div className="bg-amber-500/95 text-white px-5 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'ar'
                  ? `وضع المعاينة: تتصفح النظام الآن بصفتك (${getLocalizedName(userProfile, lang)} - ${ROLE_LABELS[activeRole][lang]})`
                  : `Impersonation Active: Viewing portal as ${getLocalizedName(userProfile, lang)} (${ROLE_LABELS[activeRole][lang]})`}
              </span>
            </div>
            <button
              type="button"
              onClick={exitImpersonation}
              className="px-3.5 py-1 rounded-full bg-white text-amber-900 font-bold hover:bg-amber-50 cursor-pointer whitespace-nowrap"
            >
              {lang === 'ar' ? 'العودة لحساب المدير' : 'Return to Admin'}
            </button>
          </div>
        )}

        {/* Floating Pill Global Top Navigation Bar */}
        <header className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left Side: School Emblem Pill Badge */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileDrawerOpen(true)}
                className="xl:hidden w-10 h-10 rounded-full bg-white/90 border border-white shadow-xs flex items-center justify-center text-slate-700 hover:bg-white cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                className="inline-flex items-center gap-2.5 ps-2 pe-4 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs hover:bg-white transition-colors min-w-0 cursor-pointer"
              >
                {!imgFailed ? (
                  <img
                    src={MEIS_CREST}
                    alt="MEIS Crest"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-8 h-8 rounded-full object-cover border border-slate-100 bg-white shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full meis-pill-dark flex items-center justify-center font-bold text-xs shrink-0">
                    M
                  </div>
                )}
                <span className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[240px]">
                  {schoolName}
                </span>
              </button>
            </div>

            {/* Center: Floating Pill Navigation Tabs */}
            <nav
              aria-label="Main Navigation"
              className="hidden xl:flex items-center gap-1 p-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/90 shadow-xs"
            >
              {visibleNavItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'meis-pill-dark shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    {item.icon}
                    <span>{item.shortLabel}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right Side: Live Riyadh Clock & Period Pill, Role Switcher, Language Toggle, Utility Circular Pills */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Live Riyadh Clock + Current Period Pill */}
              <div
                title={`${riyadhFormatted.dateText} · ${tr('lowerDivisionShort', lang)}: ${lowerStatus.label} · ${tr('upperDivisionShort', lang)}: ${upperStatus.label}`}
                className="hidden md:inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs text-xs"
              >
                <Clock className="w-3.5 h-3.5 meis-accent-text shrink-0" />
                <span dir="ltr" className="font-mono font-bold text-slate-900 tabular-nums">
                  {riyadhFormatted.timeText}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-semibold meis-accent-text truncate max-w-[115px]">
                  {lowerStatus.isActive ? lowerStatus.label : upperStatus.label}
                </span>
              </div>

              {/* Multi-Role Switcher Pill */}
              {userProfile.roles.length > 1 && (
                <div className="inline-flex items-center gap-1.5 ps-3 pe-2 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs">
                  <UserCheck className="w-3.5 h-3.5 meis-accent-text shrink-0" />
                  <select
                    aria-label={tr('activeRole', lang)}
                    value={activeRole}
                    onChange={(e) => void switchActiveRole(e.target.value as UserRole)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pe-1"
                  >
                    {userProfile.roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]?.[lang] || r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bilingual Toggle Pill */}
              <button
                type="button"
                onClick={toggleLang}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs hover:bg-white text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 meis-accent-text" />
                <span>{tr('switchLanguage', lang)}</span>
              </button>

              {/* Profile Settings Circular Pill */}
              <button
                type="button"
                title={tr('profileSettings', lang)}
                aria-label={tr('profileSettings', lang)}
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs hover:bg-white flex items-center justify-center text-slate-700 hover:text-slate-900 cursor-pointer shrink-0"
              >
                <UserCog className="w-4 h-4" />
              </button>

              {/* Sign Out Circular Pill */}
              <button
                type="button"
                title={tr('signOut', lang)}
                aria-label={tr('signOut', lang)}
                onClick={signOut}
                className="w-9 h-9 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-xs hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile/Tablet Compact Clock & Bell Status Strip */}
          <div className="md:hidden mt-2.5 flex flex-wrap items-center justify-between gap-2 px-4 py-2 rounded-2xl bg-white/70 border border-white/80 text-[11px]">
            <div className="flex items-center gap-2 font-semibold text-slate-800 tabular-nums">
              <span dir="ltr" className="font-mono meis-accent-text font-bold">
                {riyadhFormatted.timeText}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="truncate">{riyadhFormatted.dateText}</span>
            </div>
            <div className="text-slate-600 font-semibold">
              {lowerStatus.isActive ? lowerStatus.label : upperStatus.label}
            </div>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</main>
      </div>

      {/* Responsive Mobile/Tablet Slide-Over Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative w-80 max-w-[85vw] bg-white/95 backdrop-blur-xl h-full shadow-2xl flex flex-col z-10 rounded-e-[2rem] border-e border-white">
            <div className="p-5 border-b border-slate-200/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {!imgFailed && (
                  <img
                    src={MEIS_CREST}
                    alt="MEIS Crest"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-9 h-9 rounded-full object-cover border border-slate-100 shrink-0"
                  />
                )}
                <span className="text-sm font-bold text-slate-900 truncate">{schoolName}</span>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-slate-200/70">
              <p className="text-sm font-bold text-slate-900 truncate">
                {getLocalizedName(userProfile, lang)}
              </p>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {ROLE_LABELS[activeRole]?.[lang]} · {userProfile.email}
              </p>
            </div>

            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-semibold cursor-pointer transition-colors ${
                      active
                        ? 'meis-pill-dark shadow-sm'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200/70 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <UserCog className="w-4 h-4 meis-accent-text" />
                <span>{tr('profileSettings', lang)}</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-red-200 text-xs font-semibold text-red-700 bg-red-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{tr('signOut', lang)}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Floating Mobile Bottom Pill Navigation Dock */}
      <nav
        aria-label="Mobile Quick Navigation"
        className="xl:hidden fixed bottom-3 inset-x-3 z-30 rounded-full bg-white/90 backdrop-blur-xl border border-white shadow-lg px-2 py-1.5 flex items-center justify-around"
      >
        {visibleNavItems.slice(0, 5).map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                active ? 'meis-pill-dark' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[64px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};
