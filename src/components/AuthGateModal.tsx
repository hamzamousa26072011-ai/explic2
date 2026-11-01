import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  X,
  Loader2,
  UserCheck,
} from 'lucide-react';
import { ThemeMode } from '../types';

interface AuthGateModalProps {
  isOpen: boolean;
  theme: ThemeMode;
  onClose: () => void;
  onContinueAsGuest: () => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailAuth: (params: {
    mode: 'login' | 'register';
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  theme,
  onClose,
  onContinueAsGuest,
  onGoogleSignIn,
  onEmailAuth,
}) => {
  const isLight = theme === 'warm';

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleClick = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Google Sign-In could not be completed. Please sign in with your email below.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.trim().length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (authMode === 'register' && !displayName.trim()) {
      setErrorMessage('Please enter your display name to sign up.');
      return;
    }

    setIsLoading(true);
    try {
      await onEmailAuth({
        mode: authMode,
        email: cleanEmail,
        password,
        displayName:
          displayName.trim() ||
          (authMode === 'register' ? cleanEmail.split('@')[0] : undefined),
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your email and password.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-2xl'
    : 'bg-[#111827] border-white/15 text-[#F8FAFC] shadow-2xl';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-modal-title"
    >
      <div
        className={`relative w-full max-w-md rounded-3xl border p-6 sm:p-8 space-y-5 my-auto ${cardSurface}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign-in modal"
          className={`absolute top-5 right-5 p-2 rounded-xl border transition-colors ${
            isLight
              ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
              : 'border-white/10 hover:bg-white/5'
          }`}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="space-y-2 text-center">
          <div
            className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl border mx-auto ${
              isLight
                ? 'bg-white border-[#DCE3EC] shadow-xs'
                : 'bg-[#090D16] border-white/15'
            }`}
          >
            <svg
              viewBox="0 0 64 64"
              className="w-6 h-6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M44 16H20V48H44"
                stroke={isLight ? '#1E293B' : '#F8FAFC'}
                strokeWidth="4.4"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
              <path
                d="M20 32H28.5L32.5 35.6L36.5 32H42.5"
                stroke={isLight ? '#1E293B' : '#F8FAFC'}
                strokeWidth="4.2"
                strokeLinecap="square"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2
            id="auth-gate-modal-title"
            className="text-xl font-bold tracking-tight"
          >
            {authMode === 'login'
              ? 'Sign In to Explic'
              : 'Create Your Explic Account'}
          </h2>
          <p className={`text-xs leading-relaxed ${mutedText}`}>
            Sign in with Google or your email account to use AI features and
            automatically save all your study progress, tasks, and profile for
            next time.
          </p>
        </div>

        {/* Option 1: Continue with Google */}
        <button
          id="auth-google-signin-btn"
          type="button"
          onClick={handleGoogleClick}
          disabled={isGoogleLoading || isLoading}
          className={`w-full py-3 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2.5 transition-all ${
            isLight
              ? 'bg-white border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#0F172A]'
              : 'bg-[#090D16] border-white/15 hover:bg-white/5 text-white'
          }`}
        >
          {isGoogleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.98-2.18-6.96-5.12H1.05v3.14C3.06 21.2 7.22 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.04 14.03c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.33H1.05C.38 8.04 0 9.97 0 12s.38 3.96 1.05 5.67l3.99-3.64z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.5-3.5C18.07 1.14 15.3 0 12 0 7.22 0 3.06 2.8 1.05 6.33l3.99 3.14c.98-2.94 3.72-5.12 6.96-5.12z"
              />
            </svg>
          )}
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-current/10 w-full" />
          <span
            className={`px-3 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap shrink-0 ${
              isLight ? 'bg-white' : 'bg-[#111827]'
            } ${mutedText}`}
          >
            Or with email
          </span>
          <div className="border-t border-current/10 w-full" />
        </div>

        {/* Mode Switcher Tabs: Sign In vs Sign Up */}
        <div
          className={`grid grid-cols-2 p-1 rounded-xl border text-xs font-semibold ${
            isLight
              ? 'bg-[#F8FAFC] border-[#E2E8F0]'
              : 'bg-[#090D16] border-white/10'
          }`}
        >
          <button
            id="auth-tab-signin"
            type="button"
            onClick={() => {
              setAuthMode('login');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              authMode === 'login'
                ? isLight
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'bg-[#1E293B] text-white'
                : mutedText
            }`}
          >
            Sign In
          </button>
          <button
            id="auth-tab-signup"
            type="button"
            onClick={() => {
              setAuthMode('register');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              authMode === 'register'
                ? isLight
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'bg-[#1E293B] text-white'
                : mutedText
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailFormSubmit} className="space-y-3.5 text-xs">
          {authMode === 'register' && (
            <div className="space-y-1">
              <label htmlFor="auth-name-input" className="block font-semibold">
                Display Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  id="auth-name-input"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border outline-none transition-colors ${inputSurface}`}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="auth-email-input" className="block font-semibold">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border outline-none transition-colors ${inputSurface}`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-password-input"
              className="block font-semibold"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                id="auth-password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border outline-none transition-colors ${inputSurface}`}
              />
            </div>
          </div>

          {errorMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium ${
                errorMessage.includes('Authorized domains') ||
                errorMessage.includes('authorization required')
                  ? isLight
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                  : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
              }`}
            >
              {errorMessage.includes('Authorized domains') ||
              errorMessage.includes('authorization required') ? (
                <div className="space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Firebase Setup: Authorize Custom Domain</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    To sign in with Google directly on <strong>explic.online</strong>:
                  </p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[11px]">
                    <li>Open <strong>Firebase Console</strong> &rarr; Project <strong>explic-718f0</strong></li>
                    <li>Navigate to <strong>Authentication</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Authorized domains</strong></li>
                    <li>Click <strong>Add domain</strong>, type <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono">explic.online</code>, and Save.</li>
                  </ol>
                  <p className="text-[11px] pt-1 opacity-90">
                    &rarr; You can sign in or create an account with <strong>Email &amp; Password</strong> below right now!
                  </p>
                </div>
              ) : (
                errorMessage
              )}
            </div>
          )}

          <button
            id="auth-submit-email-btn"
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className={`w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${primaryBtn}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {authMode === 'login'
                    ? 'Signing In...'
                    : 'Creating Account...'}
                </span>
              </>
            ) : (
              <>
                <span>
                  {authMode === 'login' ? 'Sign In' : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Option 3: Continue as Guest */}
        <div className="pt-2 border-t border-current/10">
          <button
            id="auth-continue-guest-btn"
            type="button"
            onClick={onContinueAsGuest}
            className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              isLight
                ? 'border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-[#475569]'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-[#94A3B8]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Continue as Guest</span>
          </button>
        </div>
      </div>
    </div>
  );
};
