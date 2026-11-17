import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ClassroomHomeScreen } from './components/ClassroomHomeScreen';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { LayoutShell, type NavTab } from './components/LayoutShell';
import { DashboardHome } from './components/DashboardHome';
import { BehaviorModule } from './components/BehaviorModule';
import { PerformanceModule } from './components/PerformanceModule';
import { TimetableSubstitutionModule } from './components/TimetableSubstitutionModule';
import { DutyModule } from './components/DutyModule';
import { NoticeBoardManager } from './components/NoticeBoardSection';
import { AdminSuite } from './components/AdminSuite';

const PortalRouter: React.FC = () => {
  const { authLoading, masterLoading, authError, userProfile, lang } = useApp();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [showAuthScreen, setShowAuthScreen] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setShowAuthScreen(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile) return;
    const role = userProfile.active_role;
    if (activeTab === 'admin' && role !== 'admin') {
      setActiveTab('dashboard');
    }
    if (
      activeTab === 'notices' &&
      role !== 'principal' &&
      role !== 'academic_supervisor' &&
      role !== 'admin'
    ) {
      setActiveTab('dashboard');
    }
  }, [userProfile, activeTab]);

  if (authLoading || (userProfile && !userProfile.is_onboarded && masterLoading)) {
    return (
      <div className="min-h-screen meis-mesh-bg flex items-center justify-center p-6">
        <div className="meis-card rounded-3xl px-9 py-7 text-center">
          <div className="w-9 h-9 rounded-full border-[2.5px] border-slate-900 border-t-transparent animate-spin mx-auto mb-3.5" />
          <p className="text-sm font-semibold text-slate-700">
            {lang === 'ar'
              ? 'جارٍ تحميل بوابة مدارس الشرق الأوسط العالمية...'
              : 'Loading Middle East International School Portal...'}
          </p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    if (showAuthScreen || authError) {
      return <AuthScreen onBack={() => setShowAuthScreen(false)} />;
    }
    return <ClassroomHomeScreen onOpenAuth={() => setShowAuthScreen(true)} />;
  }

  if (!userProfile.is_onboarded) {
    return <OnboardingWizard />;
  }

  return (
    <LayoutShell activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'dashboard' && <DashboardHome onNavigate={setActiveTab} />}
      {activeTab === 'behavior' && <BehaviorModule />}
      {activeTab === 'performance' && <PerformanceModule />}
      {activeTab === 'timetable' && <TimetableSubstitutionModule />}
      {activeTab === 'duties' && <DutyModule />}
      {activeTab === 'notices' && <NoticeBoardManager />}
      {activeTab === 'admin' && userProfile.active_role === 'admin' && <AdminSuite />}
    </LayoutShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <PortalRouter />
    </AppProvider>
  );
}
