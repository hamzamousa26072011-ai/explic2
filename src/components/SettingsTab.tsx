import React, { useEffect, useState } from 'react';
import { Copy, Check, Mail, User, Cloud } from 'lucide-react';
import { ThemeMode, UserProfileState } from '../types';

interface SettingsTabProps {
  theme: ThemeMode;
  profile: UserProfileState;
  onUpdateProfile: (updates: Partial<UserProfileState>) => void;
  onGoogleLogin: () => Promise<void>;
  onEmailAuth: (params: {
    mode: 'login' | 'register';
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  theme,
  profile,
  onUpdateProfile,
  onGoogleLogin,
  onEmailAuth,
}) => {
  const isLight = theme === 'warm';

  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    setDisplayName(profile.displayName || '');
  }, [profile.displayName]);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authStatusMsg, setAuthStatusMsg] = useState<string | null>(null);

  const handleSaveIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      displayName: displayName.trim(),
      gradeYear: '',
      targetSession: '',
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) return;
    try {
      await onEmailAuth({
        mode: authMode,
        email: emailInput.trim(),
        password: passwordInput,
        displayName: displayName.trim(),
      });
      setAuthStatusMsg('Connected to Cloud Workspace.');
    } catch (err: any) {
      setAuthStatusMsg(err?.message || 'Authentication failed.');
    }
  };

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Minimalist Page Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className={`text-xs ${mutedText}`}>
          Manage your scholar profile and Google Workspace synchronization.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Card 1: Scholar Profile (Zero personal data, zero academic level / target exam fields) */}
        <section className={`rounded-2xl border p-6 space-y-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isLight ? 'bg-slate-100 text-slate-900' : 'bg-white/5 text-white'
                }`}
              >
                <User className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Scholar Profile</h2>
                <p className={`text-[11px] ${mutedText}`}>
                  Scholar identity &amp; code
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(profile.friendCode).catch(() => {});
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 1800);
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono-tabular flex items-center gap-1.5 transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100'
                  : 'border-white/10 bg-[#090D16] hover:bg-white/5'
              }`}
              title="Copy 5-Digit Scholar Code"
            >
              <span>#{profile.friendCode}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3 opacity-60" />
              )}
            </button>
          </div>

          <form onSubmit={handleSaveIdentity} className="space-y-4 text-xs">
            <div>
              <label
                htmlFor="settings-display-name"
                className={`block font-medium mb-1.5 ${mutedText}`}
              >
                Display Name
              </label>
              <input
                id="settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter a display name"
                className={`w-full rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                className={`w-full py-2.5 px-4 rounded-xl font-semibold transition-all ${primaryBtn}`}
              >
                {savedNotice ? 'Changes Saved' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* Card 2: Cloud Account & Google Workspace Sync */}
        <section className={`rounded-2xl border p-6 space-y-5 ${cardSurface}`}>
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isLight ? 'bg-slate-100 text-slate-900' : 'bg-white/5 text-white'
              }`}
            >
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Cloud &amp; Google Sync</h2>
              <p className={`text-[11px] ${mutedText}`}>
                Connect Classroom, Calendar &amp; Cloud Sync
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <button
              type="button"
              onClick={onGoogleLogin}
              className={`w-full py-2.5 px-4 rounded-xl border font-semibold flex items-center justify-center gap-2.5 transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#0F172A]'
                  : 'border-white/10 bg-white text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              Continue with Google Workspace
            </button>

            <div className="relative flex py-1 items-center">
              <div className="grow border-t border-current/10" />
              <span className={`shrink mx-3 text-[11px] ${mutedText}`}>
                or email sync
              </span>
              <div className="grow border-t border-current/10" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`font-medium flex items-center gap-1.5 ${mutedText}`}>
                  <Mail className="w-3.5 h-3.5" />
                  Email Account
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode(authMode === 'login' ? 'register' : 'login')
                  }
                  className="underline font-medium"
                >
                  {authMode === 'login' ? 'Create account' : 'Sign in instead'}
                </button>
              </div>

              <input
                type="email"
                aria-label="Email address"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email address"
                className={`w-full rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
              />
              <input
                type="password"
                aria-label="Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Password"
                className={`w-full rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
              />

              <button
                type="submit"
                className={`w-full py-2.5 rounded-xl font-semibold border transition-colors ${
                  isLight
                    ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                {authMode === 'login' ? 'Sign In' : 'Register Account'}
              </button>

              {authStatusMsg && (
                <div className="text-[11px] text-emerald-500 font-medium">
                  {authStatusMsg}
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};
