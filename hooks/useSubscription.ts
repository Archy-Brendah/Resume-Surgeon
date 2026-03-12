"use client";

import { useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, getProfileStatus, type ProfileStatus } from "@/lib/supabase";

export type SubscriptionState = {
  user: User | null;
  session: Session | null;
  isPaid: boolean;
  tier: string;
  aiCredits: number;
  /** Total Surgical Units ever purchased from payments. */
  totalCreditsPurchased: number;
  /** When true, user has unlimited SU and bypasses credit modals (beta/admin). */
  isBetaTester: boolean;
  loading: boolean;
  /** True when user can access Executive PDF and other paid features (is_paid OR is_beta_tester). */
  canAccessExecutivePdf: boolean;
  /** True when user can access Firm Proposal features. */
  canAccessFirmProposal: boolean;
  refetchProfile: () => Promise<void>;
};

const DEFAULT_TIER = "free";

/**
 * Tracks the current user's payment status from resume_surgeon.user_assets.
 * When is_paid is true, unlocks Executive PDF and Firm Proposal across the app.
 */
export function useSubscription(): SubscriptionState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileStatus>({
    is_paid: false,
    tier: DEFAULT_TIER,
    ai_credits: 0,
    total_credits_purchased: 0,
    is_beta_tester: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    const status = await getProfileStatus(uid);
    setProfile({
      is_paid: status.is_paid,
      tier: status.tier ?? DEFAULT_TIER,
      ai_credits: status.ai_credits ?? 0,
      total_credits_purchased: status.total_credits_purchased ?? 0,
      is_beta_tester: status.is_beta_tester ?? false,
    });
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile({ is_paid: false, tier: DEFAULT_TIER, ai_credits: 0, total_credits_purchased: 0, is_beta_tester: false });
        setLoading(false);
        return;
      }
      (async () => {
        try {
          await fetch("/api/auth/ensure-user-asset", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${s.access_token}`,
            },
          });
        } catch {
          // ignore; profile still fetched below
        }
        await fetchProfile(s.user.id);
      })().finally(() => setLoading(false));
    }).catch(() => {
      setProfile({ is_paid: false, tier: DEFAULT_TIER, ai_credits: 0, total_credits_purchased: 0, is_beta_tester: false });
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile({ is_paid: false, tier: DEFAULT_TIER, ai_credits: 0, total_credits_purchased: 0, is_beta_tester: false });
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        fetchProfile(s.user.id);
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") refetchProfile();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchProfile, refetchProfile]);

  const isPaid = profile.is_paid;
  const tier = profile.tier ?? DEFAULT_TIER;
  const aiCredits = (profile as { ai_credits?: number }).ai_credits ?? 0;
  const totalCreditsPurchased = (profile as { total_credits_purchased?: number }).total_credits_purchased ?? 0;
  const isBetaTester = (profile as { is_beta_tester?: boolean }).is_beta_tester ?? false;

  return {
    user,
    session,
    isPaid,
    tier,
    aiCredits,
    totalCreditsPurchased,
    isBetaTester,
    loading,
    canAccessExecutivePdf: isPaid || isBetaTester,
    canAccessFirmProposal: isPaid || isBetaTester,
    refetchProfile,
  };
}
