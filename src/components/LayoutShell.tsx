import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
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

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    {
      id: 'dashboard',
      label: tr('navDashboard', lang),
      icon: <LayoutDashboard className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'behavior',
      label: tr('navBehavior', lang),
      icon: <AlertTriangle className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'performance',
      label: tr('navPerformance', lang),
      icon: <FileSpreadsheet className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'timetable',
      label:
        activeRole === 'teacher' || activeRole === 'admin'
          ? tr('navTimetable', lang)
          : lang === 'ar'
            ? 'الغياب والانتظار'
            : 'Absences & Substitutions',
      icon: <CalendarClock className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'duties',
      label: tr('navDuties', lang),
      icon: <ClipboardCheck className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'notices',
      label: tr('navNotices', lang),
      icon: <Megaphone className="w-4 h-4" />,
      visible:
        activeRole === 'principal' ||
        activeRole === 'academic_supervisor' ||
        activeRole === 'admin',
    },
    {
      id: 'admin',
      label: tr('navAdmin', lang),
      icon: <Settings className="w-4 h-4" />,
      visible: activeRole === 'admin',
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen meis-mesh-bg flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:start-0 bg-white/90 backdrop-blur-md border-e border-slate-200/80 z-30">
        <div className="p-5 border-b border-slate-200/80 flex items-center gap-3">
          {!imgFailed ? (
            <img
              src={MEIS_CREST}
              alt="MEIS Crest"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
              MEIS
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{schoolName}</p>
            <p className="text-xs text-slate-500 truncate">{tr('appSubtitle', lang)}</p>
          </div>
        </div>

        <nav aria-label="Main Navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200/80 space-y-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">
              {getLocalizedName(userProfile, lang)}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {ROLE_LABELS[activeRole]?.[lang]} · {userProfile.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <UserCog className="w-3.5 h-3.5 text-emerald-700" />
            <span>{tr('profileSettings', lang)}</span>
          </button>
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{tr('signOut', lang)}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative w-72 max-w-[82vw] bg-white h-full shadow-xl flex flex-col z-10">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900 truncate">{schoolName}</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <UserCog className="w-4 h-4 text-emerald-700" />
                <span>{tr('profileSettings', lang)}</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-red-700 bg-red-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{tr('signOut', lang)}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ps-64 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Impersonation Banner */}
        {isImpersonating && realAdminProfile && (
          <div className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
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
              className="px-3 py-1 rounded-lg bg-white text-amber-900 font-bold hover:bg-amber-50 cursor-pointer whitespace-nowrap"
            >
              {lang === 'ar' ? 'العودة لحساب المدير' : 'Return to Admin'}
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left Zone: Mobile menu + Riyadh Live Clock & Bell Status */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
                  <span dir="ltr" className="font-mono text-emerald-700">
                    {riyadhFormatted.timeText}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="truncate text-slate-700 font-semibold">
                    {riyadhFormatted.dateText}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>
                    {tr('lowerDivisionShort', lang)}:{' '}
                    <strong className="text-slate-800">{lowerStatus.label}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {tr('upperDivisionShort', lang)}:{' '}
                    <strong className="text-slate-800">{upperStatus.label}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Right Zone: Role Switcher + Language Toggle */}
            <div className="flex items-center gap-2.5 shrink-0">
              {userProfile.roles.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-slate-500 hidden sm:block" />
                  <select
                    aria-label={tr('activeRole', lang)}
                    value={activeRole}
                    onChange={(e) => void switchActiveRole(e.target.value as UserRole)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 leading-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                  >
                    {userProfile.roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]?.[lang] || r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={toggleLang}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>{tr('switchLanguage', lang)}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Quick Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around"
      >
        {visibleNavItems.slice(0, 5).map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                active ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};
