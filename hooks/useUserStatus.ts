"use client";

import { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, getProfileStatus, initializeUserAsset } from "@/lib/supabase";

export type UserStatus = {
  user: User | null;
  session: Session | null;
  isPaid: boolean;
  loading: boolean;
  /** True when is_paid in DB; unlocks Executive PDF globally. */
  canAccessExecutivePdf: boolean;
  /** True when is_paid in DB; unlocks Proposal features globally. */
  canAccessProposal: boolean;
};

/**
 * Auth hook: on login, ensures a user_assets row exists and fetches is_paid.
 * When is_paid is true, Executive PDF and Proposal are unlocked app-wide.
 * RLS ensures users only see their own resume_surgeon.user_assets row.
 */
export function useUserStatus(): UserStatus {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPaidStatus = useCallback(async (uid: string) => {
    await initializeUserAsset(uid);
    const status = await getProfileStatus(uid);
    setIsPaid(status.is_paid);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setIsPaid(false);
        setLoading(false);
        return;
      }
      fetchPaidStatus(s.user.id).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setIsPaid(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        fetchPaidStatus(s.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchPaidStatus]);

  return {
    user,
    session,
    isPaid,
    loading,
    canAccessExecutivePdf: isPaid,
    canAccessProposal: isPaid,
  };
}
