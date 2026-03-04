"use client";

import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AuthState = {
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
};

/**
 * Tracks the current Supabase auth session. Use in protected pages to redirect
 * unauthenticated users (e.g. /builder, /proposals). Middleware also enforces
 * route protection server-side.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    session,
    loading,
    isAuthenticated: !!session,
  };
}
