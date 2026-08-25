import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Link, Navigate } from 'react-router-dom';
import { User, Mail, Lock, LogOut, Eye, EyeOff, CheckCircle2, AlertCircle, Calendar, ShieldCheck, Package, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getUserDisplayName } from '../lib/authProfile';

export default function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) return <Navigate to="/" replace />;

  const displayName = getUserDisplayName(user);
  const email: string = user.email ?? '';
  const initial: string = (displayName || email).charAt(0).toUpperCase();
  const memberSince: string = new Date(user.created_at).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return <ProfileContent
    userId={user.id}
    displayName={displayName}
    email={email}
    initial={initial}
    memberSince={memberSince}
    signOut={signOut}
  />;
}

// Separate component so hooks run after the early-return guard
function ProfileContent({
  displayName: initialName,
  email,
  initial,
  memberSince,
  signOut,
}: {
  userId: string;
  displayName: string;
  email: string;
  initial: string;
  memberSince: string;
  signOut: () => Promise<void>;
}) {
  const { t } = useLanguage();
  // Name form
  const [nameValue, setNameValue] = useState(initialName);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwStatus, setPwStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pwError, setPwError] = useState<string | null>(null);

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameValue.trim() === initialName) return;
    setNameStatus('saving');
    const { error } = await supabase.auth.updateUser({ data: { full_name: nameValue.trim() } });
    setNameStatus(error ? 'error' : 'saved');
    if (!error) setTimeout(() => setNameStatus('idle'), 3000);
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwError(t("profile.errors.passwordMismatch"));
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError(t("profile.errors.passwordLength"));
      return;
    }
    setPwStatus('saving');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: pwForm.current,
    });
    if (signInError) {
      setPwStatus('error');
      setPwError(t("profile.errors.incorrectPassword"));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pwForm.next });
    if (error) {
      setPwStatus('error');
      setPwError(error.message);
    } else {
      setPwStatus('saved');
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwStatus('idle'), 3000);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

      {/* ── User info hero card ─────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-cream-200 shadow-soft overflow-hidden mb-6">
        {/* Green accent bar */}
        <div className="h-2 gradient-card" />

        <div className="px-6 py-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar */}
          <div className="w-18 h-18 flex-shrink-0">
            <div
              className="w-16 h-16 rounded-2xl bg-forest-700 text-white flex items-center justify-center text-3xl font-bold font-display shadow-green select-none"
              aria-hidden="true"
            >
              {initial}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-forest-900 text-2xl leading-tight truncate">
              {initialName || t("profile.title")}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5 truncate">{email}</p>

            <div className="flex flex-wrap gap-3 mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-jade-700 bg-jade-50 border border-jade-100 rounded-full px-3 py-1">
                <Calendar size={12} />
                {t("profile.memberSince")} {memberSince}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-forest-700 bg-forest-50 border border-forest-100 rounded-full px-3 py-1">
                <ShieldCheck size={12} />
                {t("profile.verifiedAccount")}
              </span>
            </div>
          </div>

          {/* Log out (top-right on desktop) */}
          <button
            onClick={signOut}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-all flex-shrink-0"
          >
            <LogOut size={15} />
            {t("profile.logOut")}
          </button>
        </div>
      </div>

      {/* ── My Orders shortcut ────────────────────────────────────── */}
      <Link
        to="/orders"
        className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4 flex items-center gap-4 hover:border-forest-300 hover:shadow-md transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
          <Package size={18} className="text-forest-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-forest-900 text-sm">{t("profile.myOrders")}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t("profile.myOrdersDesc")}</p>
        </div>
        <ChevronRight size={18} className="text-gray-300 group-hover:text-forest-500 transition-colors flex-shrink-0" />
      </Link>

      {/* ── Update display name ────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <User size={17} className="text-forest-600" />
          <h2 className="font-semibold text-forest-900 text-base">{t("profile.displayName")}</h2>
        </div>
        <form onSubmit={handleNameSave} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("profile.fullName")}
            </label>
            <input
              id="profile-name"
              type="text"
              value={nameValue}
              onChange={(e) => { setNameValue(e.target.value); setNameStatus('idle'); }}
              className="input-field"
              placeholder={t("profile.namePlaceholder")}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={nameStatus === 'saving' || nameValue.trim() === initialName}
              className="btn-primary py-2 px-5 text-sm disabled:opacity-50"
            >
              {nameStatus === 'saving' ? t("profile.saving") : t("profile.saveName")}
            </button>
            {nameStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-sm text-jade-600 font-medium">
                <CheckCircle2 size={15} /> {t("profile.saved")}
              </span>
            )}
            {nameStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={15} /> {t("profile.couldNotSave")}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Email (read-only) ──────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <Mail size={17} className="text-forest-600" />
          <h2 className="font-semibold text-forest-900 text-base">{t("profile.emailAddress")}</h2>
        </div>
        <input
          type="email"
          value={email}
          readOnly
          className="input-field bg-cream-50 cursor-default text-gray-500"
        />
        <p className="text-xs text-gray-400 mt-2">{t("profile.emailHelp")}</p>
      </section>

      {/* ── Change password ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={17} className="text-forest-600" />
          <h2 className="font-semibold text-forest-900 text-base">{t("profile.changePassword")}</h2>
        </div>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          {([
            { id: 'pw-current', label: t("profile.currentPassword"), key: 'current' },
            { id: 'pw-next',    label: t("profile.newPassword"),     key: 'next' },
            { id: 'pw-confirm', label: t("profile.confirmPassword"), key: 'confirm' },
          ] as const).map(({ id, label, key }) => (
            <div key={id}>
              <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
                {label}
              </label>
              <div className="relative">
                <input
                  id={id}
                  type={showPw[key] ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={(e) => { setPwForm({ ...pwForm, [key]: e.target.value }); setPwStatus('idle'); setPwError(null); }}
                  className="input-field pr-11"
                  placeholder={key === 'next' ? t("profile.passwordPlaceholder") : ''}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw({ ...showPw, [key]: !showPw[key] })}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPw[key] ? t("profile.hide") : t("profile.show")}
                >
                  {showPw[key] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          ))}

          {pwError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" /> {pwError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pwStatus === 'saving'}
              className="btn-primary py-2 px-5 text-sm disabled:opacity-50"
            >
              {pwStatus === 'saving' ? t("profile.updating") : t("profile.updatePassword")}
            </button>
            {pwStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-sm text-jade-600 font-medium">
                <CheckCircle2 size={15} /> {t("profile.updated")}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Mobile log out ─────────────────────────────────────────── */}
      <div className="flex justify-end sm:hidden">
        <button
          onClick={signOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-all"
        >
          <LogOut size={16} />
          {t("profile.logOut")}
        </button>
      </div>
    </main>
  );
}
