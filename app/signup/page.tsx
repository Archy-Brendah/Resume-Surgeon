"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scissors } from "lucide-react";
import { supabase } from "@/lib/supabase";

function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
function getRedirectUrl(): string {
  return `${getOrigin()}/`;
}

/**
 * Signup page — Surgical Auth: Deep Slate, Surgical Teal, glassmorphism, Inter.
 * On success, a Supabase trigger creates a row in resume_surgeon.user_assets
 * with user_id = new user, is_paid = false, tier = 'free'.
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (data.user && !data.session) {
        setConfirmSent(true);
      } else if (data.session) {
        await fetch("/api/auth/ensure-user-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        });
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getRedirectUrl() },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-up failed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  if (confirmSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center app-bg px-4 font-body">
        <div className="w-full max-w-sm rounded-2xl glass-auth-card border border-white/10 p-8 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Scissors className="h-8 w-8 text-surgicalTeal" aria-hidden />
            <h1 className="text-xl font-medium text-slate-50">Resume Surgeon</h1>
          </div>
          <p className="text-sm font-medium text-slate-200 mb-1">Confirm your email</p>
          <p className="text-xs text-slate-500 mb-6">
            We sent a confirmation link to <span className="text-slate-300">{email}</span>. Click it to activate your account. Your profile will be created automatically with a free tier.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-surgicalTeal hover:underline focus:outline-none focus:ring-2 focus:ring-surgicalTeal/30 rounded"
          >
            Back to sign in
          </Link>
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
          Create account
        </h2>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={googleLoading}
          className="w-full rounded-xl border border-white/10 bg-slate-800/40 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? "Connecting…" : "Continue with Google"}
        </button>

        <div className="relative my-4">
          <span className="absolute inset-0 flex items-center" aria-hidden>
            <span className="w-full border-t border-white/10" />
          </span>
          <span className="relative flex justify-center text-xs text-slate-500 bg-transparent">
            or sign up with email
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-email" className="block text-xs text-slate-400 mb-1.5">
              Email
            </label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password" className="block text-xs text-slate-400 mb-1.5">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none focus:ring-2 focus:ring-surgicalTeal/20"
            />
          </div>
          {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-surgicalTeal/60 bg-surgicalTeal/10 py-2.5 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-surgicalTeal hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
