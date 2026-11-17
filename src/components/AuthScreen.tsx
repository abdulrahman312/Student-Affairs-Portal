import React, { useState } from 'react';
import { Clock, Globe, GraduationCap, Lock, Mail, ShieldCheck, Sparkles, UserPlus, LogIn } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLocalizedName } from '../utils/i18n';

const MEIS_CREST = '/src/assets/images/meis_school_crest_1794849576691.jpg';

export const AuthScreen: React.FC = () => {
  const { lang, toggleLang, schoolSettings, signInWithEmail, signUpWithEmail, signInWithGoogle } =
    useApp();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const allowedDomain = schoolSettings?.allowed_email_domain || 'meis.sch.sa';
  const schoolName =
    lang === 'ar'
      ? schoolSettings?.school_name_ar || 'مدارس الشرق الأوسط العالمية'
      : schoolSettings?.school_name_en || 'Middle East International School';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const res = await signInWithEmail(email, password);
        if (res.error) setErrorMsg(res.error);
      } else {
        if (!nameEn.trim() || !nameAr.trim()) {
          setErrorMsg(
            lang === 'ar'
              ? 'يرجى إدخال الاسم بالعربية والإنجليزية'
              : 'Please enter your name in both Arabic and English'
          );
          return;
        }
        const res = await signUpWithEmail({ email, password, nameEn, nameAr });
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.needsVerification) {
          setInfoMsg(
            lang === 'ar'
              ? 'تم إنشاء الحساب. يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب.'
              : 'Account created. Please check your inbox to verify your email address.'
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    const res = await signInWithGoogle();
    if (res.error) {
      setErrorMsg(res.error);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen meis-mesh-bg flex flex-col justify-between p-4 sm:p-8">
      {/* Top Floating Pill Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-sm min-w-0">
          {!imgFailed ? (
            <img
              src={MEIS_CREST}
              alt="Middle East International School Crest"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-8 h-8 rounded-full object-cover border border-sky-100 bg-white shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full meis-pill-dark flex items-center justify-center font-bold text-xs shrink-0">
              M
            </div>
          )}
          <span className="text-sm font-bold text-slate-900 truncate">{schoolName}</span>
        </div>

        <button
          type="button"
          onClick={toggleLang}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/85 backdrop-blur-md border border-white/90 shadow-sm text-xs sm:text-sm font-semibold text-slate-800 hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 meis-accent-text" />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </header>

      {/* Main Split Bento Card */}
      <main className="max-w-5xl w-full mx-auto my-8 meis-shell rounded-[2.25rem] p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Vertical Light Blue Gradient Brand Card */}
        <section className="lg:col-span-5 meis-portrait-surface rounded-[1.75rem] p-7 sm:p-8 flex flex-col justify-between border border-white/80 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/95 p-2 shadow-sm border border-white mb-6">
              {!imgFailed ? (
                <img
                  src={MEIS_CREST}
                  alt="MEIS Crest"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl meis-accent-solid flex items-center justify-center font-bold">
                  MEIS
                </div>
              )}
            </div>

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/80 border border-white text-xs font-semibold text-slate-800 mb-4">
              <Sparkles className="w-3.5 h-3.5 meis-accent-text shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'البوابة الموحدة للشؤون الأكاديمية والطلابية'
                  : 'Unified Academic & Student Affairs Portal'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 text-balance mb-3">
              {schoolName}
            </h1>
            <p className="text-sm text-slate-700 leading-relaxed mb-6">
              {lang === 'ar'
                ? 'منصة متكاملة للهيئة التعليمية والإدارية لإدارة السلوك الطلابي، تقارير الأداء، الجداول وحصص الانتظار، والمناوبات اليومية.'
                : 'A serene executive workspace for behavior tracking, academic performance reports, period-based substitutions, and daily break duties.'}
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap gap-2 pt-5 border-t border-slate-900/10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 border border-white text-xs font-semibold text-slate-800 font-mono">
              <Mail className="w-3.5 h-3.5 meis-accent-text" />
              <span>@{allowedDomain}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 border border-white text-xs font-semibold text-slate-800 font-mono">
              <Clock className="w-3.5 h-3.5 meis-accent-text" />
              <span>Asia/Riyadh (UTC+3)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 border border-white text-xs font-semibold text-slate-800">
              <GraduationCap className="w-3.5 h-3.5 meis-accent-text" />
              <span>
                {getLocalizedName(
                  { name_ar: 'الصفوف 4–12', name_en: 'Grades 4–12' },
                  lang
                )}
              </span>
            </span>
          </div>
        </section>

        {/* Right Frosted-Glass Auth Card */}
        <section className="lg:col-span-7 meis-card rounded-[1.75rem] p-6 sm:p-9 flex flex-col justify-center">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {mode === 'signin'
                  ? lang === 'ar'
                    ? 'تسجيل الدخول إلى البوابة'
                    : 'Sign In to Portal'
                  : lang === 'ar'
                    ? 'إنشاء حساب موظف جديد'
                    : 'Create Staff Account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'ar'
                  ? `مخصص لمنسوبي المدرسة عبر البريد الرسمي (@${allowedDomain})`
                  : `Restricted to official school staff (@${allowedDomain})`}
              </p>
            </div>

            <div className="inline-flex p-1 bg-slate-100/90 border border-slate-200/70 rounded-full shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap cursor-pointer ${
                  mode === 'signin'
                    ? 'meis-pill-dark shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'دخول' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap cursor-pointer ${
                  mode === 'signup'
                    ? 'meis-pill-dark shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'تسجيل جديد' : 'Sign Up'}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogle}
            className="w-full py-3 px-5 rounded-full border border-slate-200/90 bg-white/95 hover:bg-white text-slate-800 text-sm font-semibold flex items-center justify-center gap-2.5 shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>
              {lang === 'ar' ? 'المتابعة باستخدام حساب Google المدرسي' : 'Continue with Google'}
            </span>
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-slate-200/80" />
            <span className="text-xs text-slate-400 font-medium">
              {lang === 'ar' ? 'أو عبر البريد الإلكتروني' : 'OR WITH EMAIL'}
            </span>
            <div className="h-px flex-1 bg-slate-200/80" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="signup-name-ar" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {lang === 'ar' ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)'}
                  </label>
                  <input
                    id="signup-name-ar"
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="أحمد محمد"
                    className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/90 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="signup-name-en" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {lang === 'ar' ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)'}
                  </label>
                  <input
                    id="signup-name-en"
                    type="text"
                    required
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Ahmed Mohammed"
                    className="w-full px-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/90 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'البريد الإلكتروني الرسمي' : 'Official School Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute top-3.5 start-4" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`name@${allowedDomain}`}
                  className="w-full ps-11 pe-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/90 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                {lang === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute top-3.5 start-4" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-11 pe-4 py-2.5 rounded-2xl border border-slate-200/90 bg-white/90 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-red-50/95 border border-red-200 text-xs font-medium text-red-700"
              >
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50/95 border border-emerald-200 text-xs font-medium text-emerald-800">
                {infoMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-6 rounded-full meis-pill-dark text-sm font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
            >
              {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>
                {submitting
                  ? lang === 'ar'
                    ? 'جارٍ المعالجة...'
                    : 'Processing...'
                  : mode === 'signin'
                    ? lang === 'ar'
                      ? 'تسجيل الدخول'
                      : 'Sign In'
                    : lang === 'ar'
                      ? 'إنشاء الحساب'
                      : 'Create Account'}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200/70 flex items-center gap-2.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 meis-accent-text shrink-0" />
            <span>
              {lang === 'ar'
                ? 'يدعم النظام الدخول بحسابات الاختبار التجريبية المُنشأة من مدير النظام.'
                : 'Supports instant sign-in with Admin-provisioned dummy test accounts.'}
            </span>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-500">
        {schoolName} · {lang === 'ar' ? 'الرياض · المملكة العربية السعودية' : 'Riyadh · Kingdom of Saudi Arabia'}
      </footer>
    </div>
  );
};
