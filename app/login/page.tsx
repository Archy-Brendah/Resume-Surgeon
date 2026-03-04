"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors } from "lucide-react";
import { supabase } from "@/lib/supabase";

function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
function getRedirectUrl(): string {
  return `${getOrigin()}/`;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (searchParams.get("reset") === "success") {
      setSuccess("Your password has been reset. Sign in with your new password.");
    }
  }, [searchParams]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (data.session) {
        await fetch("/api/auth/ensure-user-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        });
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError("Enter your email to receive a magic link.");
      return;
    }
    setError(null);
    setSuccess(null);
    setMagicLoading(true);
    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: getRedirectUrl() },
      });
      if (magicError) throw magicError;
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send magic link.");
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email to receive a password reset link.");
      return;
    }
    setError(null);
    setSuccess(null);
    setForgotLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getOrigin()}/login?reset=success`,
      });
      if (resetError) throw resetError;
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setSuccess(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getRedirectUrl() },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  if (magicSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center app-bg px-4 font-body">
        <div className="w-full max-w-sm rounded-2xl glass-auth-card border border-white/10 p-8 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Scissors className="h-8 w-8 text-surgicalTeal" aria-hidden />
            <h1 className="text-xl font-medium text-slate-50">Resume Surgeon</h1>
          </div>
          <p className="text-sm font-medium text-slate-200 mb-1">Check your email</p>
          <p className="text-xs text-slate-500 mb-6">
            We sent a sign-in link to <span className="text-slate-300">{email}</span>. Click the link to sign in securely.
          </p>
          <button
            type="button"
            onClick={() => setMagicSent(false)}
            className="text-sm text-surgicalTeal hover:underline focus:outline-none focus:ring-2 focus:ring-surgicalTeal/30 rounded"
          >
            Use password instead
          </button>
        </div>
      </div>
    );
  }

  if (forgotSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center app-bg px-4 font-body">
        <div className="w-full max-w-sm rounded-2xl glass-auth-card border border-white/10 p-8 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Scissors className="h-8 w-8 text-surgicalTeal" aria-hidden />
            <h1 className="text-xl font-medium text-slate-50">Resume Surgeon</h1>
          </div>
          <p className="text-sm font-medium text-slate-200 mb-1">Check your email</p>
          <p className="text-xs text-slate-500 mb-6">
            We sent a password reset link to <span className="text-slate-300">{email}</span>. Click the link to set a new password.
          </p>
          <button
            type="button"
            onClick={() => { setForgotSent(false); setForgotMode(false); }}
            className="text-sm text-surgicalTeal hover:underline focus:outline-none focus:ring-2 focus:ring-surgicalTeal/30 rounded"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (forgotMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center app-bg px-4 font-body">
        <div className="w-full max-w-sm rounded-2xl glass-auth-card border border-white/10 p-8 shadow-card">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Scissors className="h-8 w-8 text-surgicalTeal" aria-hidden />
            <h1 className="text-xl font-medium text-slate-50">Resume Surgeon</h1>
          </div>
          <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">
            Reset password
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Enter the email address for your account and we&apos;ll send you a link to reset your password.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="forgot-email" className="block text-xs text-slate-400 mb-1.5">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none focus:ring-2 focus:ring-surgicalTeal/20"
              />
            </div>
            {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full rounded-xl border border-surgicalTeal/60 bg-surgicalTeal/10 py-2.5 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50 transition-colors"
            >
              {forgotLoading ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => { setForgotMode(false); setError(null); }}
            className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center app-bg px-4 font-body">
      <div className="w-full max-w-sm rounded-2xl glass-auth-card border border-white/10 p-8 shadow-card">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Scissors className="h-8 w-8 text-surgicalTeal" aria-hidden />
          <h1 className="text-xl font-medium text-slate-50">Resume Surgeon</h1>
        </div>
        <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">
          Sign in
        </h2>

        {success && (
          <p className="mb-4 text-xs text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2" role="status">
            {success}
          </p>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs text-slate-400 mb-1.5">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none focus:ring-2 focus:ring-surgicalTeal/20"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-slate-400 mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none focus:ring-2 focus:ring-surgicalTeal/20"
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(null); setSuccess(null); }}
                className="text-[10px] text-slate-500 hover:text-surgicalTeal transition-colors focus:outline-none focus:ring-2 focus:ring-surgicalTeal/30 rounded"
              >
                Forgot password?
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-surgicalTeal/60 bg-surgicalTeal/10 py-2.5 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="relative my-4">
          <span className="absolute inset-0 flex items-center" aria-hidden>
            <span className="w-full border-t border-white/10" />
          </span>
          <span className="relative flex justify-center text-xs text-slate-500 bg-transparent">
            or
          </span>
        </div>

        <button
          type="button"
          disabled={magicLoading || !email.trim()}
          onClick={handleMagicLink}
          className="w-full rounded-xl border border-white/10 bg-slate-800/40 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 transition-colors"
        >
          {magicLoading ? "Sending…" : "Send Magic Link"}
        </button>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mt-3 w-full rounded-xl border border-white/10 bg-slate-800/40 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/60 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-surgicalTeal hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
