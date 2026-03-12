"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { ComplianceItem } from "@/app/api/tender-compliance/route";
import { getCost } from "@/lib/su-costs";

type TenderComplianceProps = {
  session: { access_token: string } | null;
  isBetaTester?: boolean;
  aiCredits?: number;
  onRefillRequest?: () => void;
  onCreditsRefetch?: () => void;
  onUpdateProposalWithFixes?: (items: ComplianceItem[]) => void;
  proposalExists?: boolean;
  /** Pre-filled from Step 1 tender PDF — used automatically when provided */
  initialTenderText?: string;
  /** Pre-filled from Firm Profile — used automatically when provided */
  initialFirmCapability?: string;
};

export function TenderCompliance({
  session,
  isBetaTester = false,
  aiCredits = 0,
  onRefillRequest,
  onCreditsRefetch,
  onUpdateProposalWithFixes,
  proposalExists = false,
  initialTenderText = "",
  initialFirmCapability = "",
}: TenderComplianceProps) {
  const [tenderRequirements, setTenderRequirements] = useState("");
  const [firmCapability, setFirmCapability] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialTenderText.trim() && !tenderRequirements.trim()) {
      setTenderRequirements(initialTenderText.trim());
    }
  }, [initialTenderText, tenderRequirements]);

  useEffect(() => {
    if (initialFirmCapability.trim() && !firmCapability.trim()) {
      setFirmCapability(initialFirmCapability.trim());
    }
  }, [initialFirmCapability, firmCapability]);

  const cost = getCost("TENDER_COMPLIANCE");
  const insufficientSu = !isBetaTester && aiCredits < cost;

  const handleRunCheck = async () => {
    if (!session) {
      setError("Sign in required.");
      return;
    }
    if (!tenderRequirements.trim() || !firmCapability.trim()) {
      setError("Both Tender Requirements and Firm Capability are required.");
      return;
    }
    setError(null);
    const key = `${tenderRequirements.trim()}||${firmCapability.trim()}`;
    if (key && key === lastKey && items.length > 0) {
      return;
    }
    if (insufficientSu) {
      onRefillRequest?.();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tender-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tenderRequirements: tenderRequirements.trim(),
          firmProfile: firmCapability.trim(),
        }),
      });
      const data = (await res.json()) as { items?: ComplianceItem[]; error?: string; code?: string };
      if (res.status === 402) {
        onRefillRequest?.();
        return;
      }
      if (!res.ok) {
        setError(data?.error || "Compliance check failed. Try again.");
        return;
      }
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      setLastKey(key || null);
      onCreditsRefetch?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run compliance check.");
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    Compliant: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    Partial: { bg: "bg-amber-50", text: "text-[#B45309]", dot: "bg-[#B45309]" },
    Gap: { bg: "bg-amber-50", text: "text-[#B45309]", dot: "bg-[#B45309]" },
  };

  return (
    <div className="surgical-card space-y-4 p-4">
      <div>
        <h3 className="text-lg font-bold text-[#1c1917]">Tender Compliance & Gap Finder</h3>
        <p className="text-sm text-[#292524] mt-1">
          Tender and firm profile are filled from Step 1 and your Firm Profile. Run Analysis to identify gaps and compliance status.
        </p>
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium uppercase tracking-wider text-slate-600">Tender Requirements</label>
        <textarea
          rows={6}
          placeholder="Paste PDF content or tender document text here..."
          value={tenderRequirements}
          onChange={(e) => setTenderRequirements(e.target.value)}
          className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium uppercase tracking-wider text-slate-600">Firm Capability</label>
        <textarea
          rows={6}
          placeholder="Paste or type your firm's capabilities, certifications, experience..."
          value={firmCapability}
          onChange={(e) => setFirmCapability(e.target.value)}
          className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
      <button
        type="button"
        onClick={handleRunCheck}
        disabled={loading || !session || insufficientSu}
          className="w-full rounded-lg btn-primary-surgical px-4 py-3 text-base font-semibold disabled:opacity-50"
      >
        {loading ? "Running Analysis…" : `Run Analysis (${cost} SU)`}
      </button>
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p>{error}</p>
          {(error.toLowerCase().includes("firm") || error.toLowerCase().includes("capability")) && (
            <Link
              href="/dashboard/firm-profile"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg btn-secondary-surgical px-3 py-2 text-sm font-medium"
            >
              Update Firm Profile →
            </Link>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Requirement</th>
              <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500 w-28">Status</th>
              <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item, i) => {
                const config = statusConfig[item.status];
                return (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-[#475569]">{item.requirement}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} aria-hidden />
                      {item.status === "Gap" || item.status === "Partial" ? "Gap / Missing" : item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2 rounded-lg border-l-2 border-emerald-300 bg-emerald-50 px-3 py-2">
                      <Info className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" aria-hidden />
                      <span className="text-xs text-slate-700 leading-relaxed">{item.fix}</span>
                    </div>
                  </td>
                </tr>
              );
              })
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[#475569] text-xs">
                  Run Analysis to see compliance results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-600">
            {proposalExists
              ? "Click below to rewrite Section II of your current proposal with these compliance fixes."
              : "Generate a proposal in Step 5 first, then come back here to apply this analysis to Section II."}
          </p>
          <button
            type="button"
            onClick={() => onUpdateProposalWithFixes?.(items)}
            disabled={!proposalExists}
            title={!proposalExists ? "Generate a proposal in Step 5 first, then come back to apply" : "Rewrite Section II with these compliance results"}
            className="w-full rounded-lg border-2 border-emerald-500 bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {proposalExists ? "Apply analysis to current proposal (Section II)" : "Generate proposal in Step 5 first to apply"}
          </button>
        </div>
      )}
    </div>
  );
}
