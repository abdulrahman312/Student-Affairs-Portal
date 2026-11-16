import React, { useState } from 'react';
import { Globe, Lock, Mail, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
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
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!imgFailed ? (
            <img
              src={MEIS_CREST}
              alt="Middle East International School Crest"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 bg-white"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
              MEIS
            </div>
          )}
          <div>
            <p className="text-base font-bold text-slate-900 leading-tight">{schoolName}</p>
            <p className="text-xs text-slate-500">
              {lang === 'ar' ? 'الرياض · المملكة العربية السعودية' : 'Riyadh · Kingdom of Saudi Arabia'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleLang}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl meis-glass text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-emerald-600" />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </div>

      <main className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Institutional Context Panel */}
        <section className="lg:col-span-5 rounded-2xl p-8 flex flex-col justify-between bg-slate-900 text-white border border-slate-800 shadow-lg">
          <div>
            <div className="w-16 h-16 rounded-2xl bg-white p-1.5 mb-6">
              {!imgFailed ? (
                <img
                  src={MEIS_CREST}
                  alt="MEIS Crest"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white">
                  MEIS
                </div>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance mb-3">
              {schoolName}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              {lang === 'ar'
                ? 'المنصة الموحدة للهيئة التعليمية والإدارية لإدارة سلوك الطلاب، تقارير الأداء الأكاديمي، الجداول وحصص الانتظار، والمناوبات اليومية.'
                : 'Unified Academic & Student Affairs Portal for behavior tracking, academic performance reports, period-based substitutions, and daily break duties.'}
            </p>
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>{lang === 'ar' ? 'النطاق الرسمي المعتمد' : 'Official Email Domain'}</span>
              <span className="font-mono text-emerald-400">@{allowedDomain}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{lang === 'ar' ? 'المنطقة الزمنية' : 'School Timezone'}</span>
              <span className="font-mono text-slate-200">Asia/Riyadh (UTC+3)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{lang === 'ar' ? 'المراحل الدراسية' : 'Academic Divisions'}</span>
              <span className="text-slate-200">
                {getLocalizedName(
                  { name_ar: 'الابتدائية العليا · المتوسطة والثانوية', name_en: 'Lower (4-6) · Upper (7-12)' },
                  lang
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Right Auth Form Card */}
        <section className="lg:col-span-7 meis-glass rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
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

            <div className="inline-flex p-1 bg-slate-100 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm'
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
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
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
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
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">
              {lang === 'ar' ? 'أو عبر البريد الإلكتروني' : 'OR WITH EMAIL'}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="signup-name-ar" className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)'}
                  </label>
                  <input
                    id="signup-name-ar"
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="أحمد محمد"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="signup-name-en" className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'ar' ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)'}
                  </label>
                  <input
                    id="signup-name-en"
                    type="text"
                    required
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Ahmed Mohammed"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'البريد الإلكتروني الرسمي' : 'Official School Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute top-3 start-3.5" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`name@${allowedDomain}`}
                  className="w-full ps-10 pe-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute top-3 start-3.5" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-10 pe-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                {infoMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
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

          <div className="mt-5 pt-4 border-t border-slate-200/80 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {lang === 'ar'
                ? 'يدعم النظام الدخول بحسابات الاختبار التجريبية المُنشأة من مدير النظام.'
                : 'Supports instant sign-in with Admin-provisioned dummy test accounts.'}
            </span>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-400">
        {schoolName} · {lang === 'ar' ? 'الرياض' : 'Riyadh'}
      </footer>
    </div>
  );
};
