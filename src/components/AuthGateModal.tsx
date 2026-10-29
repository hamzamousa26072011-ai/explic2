import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User as UserIcon,
  KeyRound,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { ThemeMode } from '../types';

interface AuthGateModalProps {
  isOpen: boolean;
  theme: ThemeMode;
  canDismiss?: boolean;
  onClose?: () => void;
  onGoogleSignIn: () => Promise<void>;
  onCompleteTwoStepAuth: (params: {
    email: string;
    displayName: string;
    password?: string;
    mode: 'login' | 'register';
  }) => Promise<void>;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  theme,
  canDismiss = false,
  onClose,
  onGoogleSignIn,
  onCompleteTwoStepAuth,
}) => {
  const isLight = theme === 'warm';

  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [step, setStep] = useState<'credentials' | 'verify_otp'>('credentials');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [dispatchedCodePreview, setDispatchedCodePreview] = useState<
    string | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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
          : 'Google Sign-In could not be completed. Please use Email Two-Step Verification below.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleRequestOtpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.trim().length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: displayName.trim() || cleanEmail.split('@')[0],
          mode: authMode,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code.');
      }

      setDispatchedCodePreview(data.verificationCodePreview || null);
      setStatusMessage(
        data.message || `Verification code sent to ${cleanEmail}.`
      );
      setStep('verify_otp');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not send verification code. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: displayName.trim() || cleanEmail.split('@')[0],
          mode: authMode,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend verification code.');
      }
      setDispatchedCodePreview(data.verificationCodePreview || null);
      setStatusMessage(`A fresh 6-digit code was sent to ${cleanEmail}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to resend code.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpAndComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = otpCode.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.verified) {
        throw new Error(
          data.error || 'Invalid verification code. Please check and try again.'
        );
      }

      await onCompleteTwoStepAuth({
        email: cleanEmail,
        displayName:
          displayName.trim() || data.displayName || cleanEmail.split('@')[0],
        password,
        mode: authMode,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Verification failed. Please check the 6-digit code.'
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
        className={`relative w-full max-w-md rounded-3xl border p-6 sm:p-8 space-y-6 my-auto ${cardSurface}`}
      >
        {canDismiss && onClose && (
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
        )}

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2
            id="auth-gate-modal-title"
            className="text-xl font-bold tracking-tight"
          >
            {step === 'verify_otp'
              ? 'Two-Step Email Verification'
              : 'Sign In to Unlock Explic AI'}
          </h2>
          <p className={`text-xs leading-relaxed ${mutedText}`}>
            {step === 'verify_otp'
              ? `Enter the 6-digit security code sent to ${email} to verify your account and unlock all AI facilities.`
              : 'Sign in with Google or create an account with Two-Step Email Verification to access the Principal AI Examiner and Smart AI Daily Planner.'}
          </p>
        </div>

        {step === 'credentials' ? (
          <>
            {/* Mode Switcher Tabs: Sign Up (2-Step Verification) vs Sign In */}
            <div
              className={`grid grid-cols-2 p-1 rounded-xl border text-xs font-semibold ${
                isLight
                  ? 'bg-[#F8FAFC] border-[#E2E8F0]'
                  : 'bg-[#090D16] border-white/10'
              }`}
            >
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
                Sign Up (2-Step Verify)
              </button>
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
                Sign In with Email
              </button>
            </div>

            {/* Option 1: Sign in with Google */}
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
                Or Email + 2-Step Code
              </span>
              <div className="border-t border-current/10 w-full" />
            </div>

            {/* Step 1 Form: Email & Password */}
            <form onSubmit={handleRequestOtpCode} className="space-y-3.5 text-xs">
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label
                    htmlFor="auth-name-input"
                    className="block font-semibold"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
                    <input
                      id="auth-name-input"
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name..."
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border outline-none transition-colors ${inputSurface}`}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label
                  htmlFor="auth-email-input"
                  className="block font-semibold"
                >
                  Email Address (for verification code)
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
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <button
                id="auth-send-otp-btn"
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${primaryBtn}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending Verification Code...
                  </>
                ) : (
                  <>
                    <span>Send 6-Digit Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          /* Step 2 Form: Enter 6-Digit Verification Code */
          <form
            onSubmit={handleVerifyOtpAndComplete}
            className="space-y-4 text-xs"
          >
            {statusMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
                {dispatchedCodePreview && (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-500/20">
                    <span>
                      Email Code Dispatched:{' '}
                      <strong className="font-mono-tabular tracking-widest text-sm">
                        {dispatchedCodePreview}
                      </strong>
                    </span>
                    <button
                      id="auth-autofill-otp-btn"
                      type="button"
                      onClick={() => setOtpCode(dispatchedCodePreview)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      Use Code
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auth-otp-input" className="block font-semibold">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="Enter 6-digit code (e.g. 482910)"
                  className={`w-full pl-10 pr-3.5 py-3 rounded-xl border font-mono-tabular text-base tracking-widest outline-none transition-colors ${inputSurface}`}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
                {errorMessage}
              </div>
            )}

            <button
              id="auth-verify-otp-btn"
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className={`w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${primaryBtn}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Code...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Verify Code &amp; Unlock All AI Facilities</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setErrorMessage(null);
                }}
                className={`hover:underline font-medium ${mutedText}`}
              >
                &larr; Change Email
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 font-semibold text-indigo-500 hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resend Code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
