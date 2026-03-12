"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { matchTenderToPortfolio, type PortfolioMatchItem } from "@/app/actions/matcher";
import type { ComplianceMatrixRow } from "@/app/actions/generate-compliance-matrix";
import { getCost } from "@/lib/su-costs";

type ComplianceDashboardProps = {
  session: { access_token: string } | null;
  isBetaTester?: boolean;
  aiCredits?: number;
  onRefillRequest?: () => void;
  onCreditsRefetch?: () => void;
  /** Pre-filled from tender document (Step 1). Used automatically when provided. */
  initialRequirements?: string[];
  /** Optional: reuse results from the Compliance Matrix to avoid extra AI calls. */
  initialMatrix?: ComplianceMatrixRow[] | null;
  /** Callback when portfolio match results are ready (for proposal PDF). */
  onPortfolioMatchesReady?: (items: PortfolioMatchItem[]) => void;
  /** Apply portfolio match evidence/fixes to the proposal. */
  onApplyToProposal?: (items: PortfolioMatchItem[]) => void;
  proposalExists?: boolean;
};

export function ComplianceDashboard({
  session,
  isBetaTester = false,
  aiCredits = 0,
  onRefillRequest,
  onCreditsRefetch,
  initialRequirements = [],
  initialMatrix = null,
  onPortfolioMatchesReady,
  onApplyToProposal,
  proposalExists = false,
}: ComplianceDashboardProps) {
  const [requirementsText, setRequirementsText] = useState(
    initialRequirements.length > 0 ? initialRequirements.join("\n") : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PortfolioMatchItem[]>([]);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialRequirements.length > 0 && !requirementsText.trim()) {
      setRequirementsText(initialRequirements.join("\n"));
    }
  }, [initialRequirements, requirementsText]);

  const cost = getCost("TENDER_COMPLIANCE");
  const insufficientSu = !isBetaTester && aiCredits < cost;

  const handleRunAnalysis = async () => {
    if (!session) {
      setError("Sign in required.");
      return;
    }
    const requirements = requirementsText
      .split(/\n|•|–|—/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (requirements.length === 0) {
      setError("Enter at least one tender requirement (one per line or bullet).");
      return;
    }

    // If we already have a Compliance Matrix for the same requirements, reuse it instead of calling AI again.
    const initialKey = initialRequirements.join("\n").trim();
    const currentKey = requirementsText.trim();
    if (initialMatrix && initialMatrix.length > 0 && initialKey && currentKey === initialKey) {
      const derived: PortfolioMatchItem[] = initialMatrix.map((row) => ({
        requirement: row.requirement,
        status: row.compliance_status === "Full" ? "Matched" : "Gap",
        evidence: row.project_reference
          ? `Implementation Case Study: ${row.project_reference}. ${row.proof_summary}`
          : row.proof_summary,
        suggested_fix: row.compliance_status === "Full" ? "" : row.proof_summary,
        result: row.proof_summary,
      }));
      setItems(derived);
      onPortfolioMatchesReady?.(derived);
      setError(null);
      return;
    }

    if (insufficientSu) {
      onRefillRequest?.();
      return;
    }
    const key = currentKey;
    if (key && key === lastKey && items.length > 0) {
      setError(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await matchTenderToPortfolio(requirements);
      if (result.success) {
        setItems(result.items);
        setLastKey(key || null);
        onPortfolioMatchesReady?.(result.items);
        onCreditsRefetch?.();
      } else {
        if (result.code === "CREDITS_REQUIRED") {
          onRefillRequest?.();
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const matchedCount = items.filter((i) => i.status === "Matched").length;
  const totalCount = items.length;
  const matchScore = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

  const statusStyles = {
    Matched: "bg-emerald-500/15 text-[#0c0a09] border border-emerald-500/40",
    Gap: "bg-amber-500/15 text-[#0c0a09] border border-amber-500/40",
  };

  return (
    <div className="surgical-card space-y-4 p-4">
      <div>
        <h3 className="text-lg font-bold text-[#1c1917]">Compliance Dashboard</h3>
        <p className="text-sm text-[#292524] mt-1">
          Tender requirements are filled from the uploaded tender document. Run Portfolio Match to compare against your Firm Profile past projects and get a Surgical Match Score.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium uppercase tracking-wider text-slate-600">Tender Requirements</label>
        <textarea
          rows={6}
          placeholder="Paste requirements (one per line or bullet)..."
          value={requirementsText}
          onChange={(e) => setRequirementsText(e.target.value)}
          className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <button
        type="button"
        onClick={handleRunAnalysis}
        disabled={loading || !session || insufficientSu}
        className="w-full rounded-lg btn-primary-surgical px-4 py-3 text-base font-semibold disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing…
          </span>
        ) : (
          `Run Portfolio Match (${cost} SU)`
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p>{error}</p>
          {(error.toLowerCase().includes("firm profile") || error.toLowerCase().includes("past project")) && (
            <Link
              href="/dashboard/firm-profile"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg btn-secondary-surgical px-3 py-2 text-sm font-medium"
            >
              Add or update in Firm Profile →
            </Link>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#475569] mb-1">Match Score</p>
            <p className="text-3xl font-bold text-[#020617]">{matchScore}%</p>
            <p className="text-xs text-[#475569] mt-1">
              {matchedCount} of {totalCount} requirements matched
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#475569]">Requirement</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#475569] w-24">Status</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#475569]">Evidence / Fix</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-[#475569]">{item.requirement}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${statusStyles[item.status]}`}
                      >
                        {item.status === "Matched" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {item.status === "Matched" && item.evidence && (
                          <p className="text-xs text-[#475569] leading-relaxed">{item.evidence}</p>
                        )}
                        {item.status === "Gap" && item.suggested_fix && (
                          <div className="rounded-lg border-l-2 border-[#10B881]/60 bg-[#10B881]/5 px-3 py-2">
                            <span className="text-xs text-[#475569] leading-relaxed">{item.suggested_fix}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-[#475569]">
              {proposalExists
                ? "Click below to rewrite Section II of your current proposal with this evidence and suggested fixes."
                : "Generate a proposal in Step 5 first, then come back here to apply this analysis to Section II."}
            </p>
            <button
              type="button"
              onClick={() => onApplyToProposal?.(items)}
              disabled={!proposalExists}
              title={!proposalExists ? "Generate a proposal in Step 5 first, then come back to apply" : "Rewrite Section II with this evidence and fixes"}
              className="w-full rounded-lg border-2 border-emerald-600 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {proposalExists ? "Apply analysis to current proposal (Section II)" : "Generate proposal in Step 5 first to apply"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
