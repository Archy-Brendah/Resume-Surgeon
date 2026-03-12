"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useReactToPrint } from "react-to-print";
import { Loader2, FileText, Check, Shield, CheckCircle2, AlertTriangle, FileDown } from "lucide-react";
import type { TenderRequirement } from "@/app/actions/scan-tender";
import { matchTenderRequirements, type TenderMatchItem } from "@/app/actions/match-tender-requirements";
import type { ComplianceMatrixRow } from "@/app/actions/generate-compliance-matrix";
import { generateSurgicalMatrix, type SurgicalMatrixRow } from "@/app/actions/matrix";
import { analyzeTenderCompliance, getValidMandatoryDocs, type PreliminaryCheckItem, type TechnicalMatchItem, type ValidDoc } from "@/app/actions/compliance";
import type { ComplianceItem } from "@/app/api/tender-compliance/route";
import { getCost } from "@/lib/su-costs";

type TenderScannerProps = {
  session: { access_token: string } | null;
  isBetaTester?: boolean;
  aiCredits?: number;
  onRefillRequest?: () => void;
  onCreditsRefetch?: () => void;
  onUpdateProposalWithFixes?: (items: ComplianceItem[]) => void;
  onAddMatchToProposal?: (match: TenderMatchItem) => void;
  onMatchesReady?: (matches: TenderMatchItem[]) => void;
  onAddAllMatches?: (matches: TenderMatchItem[]) => void;
  onComplianceMatrixReady?: (matrix: ComplianceMatrixRow[]) => void;
  onSurgicalMatrixReady?: (matrix: SurgicalMatrixRow[]) => void;
  onReadinessReady?: (preliminaryCheck: PreliminaryCheckItem[]) => void;
  proposalExists?: boolean;
  /** Pre-loaded from Step 1 tender PDF upload — no duplicate upload needed */
  initialRequirements?: TenderRequirement[];
  initialTenderText?: string;
};

export function TenderScanner({
  session,
  isBetaTester = false,
  aiCredits = 0,
  onRefillRequest,
  onCreditsRefetch,
  onUpdateProposalWithFixes,
  onAddMatchToProposal,
  onMatchesReady,
  onAddAllMatches,
  onComplianceMatrixReady,
  onSurgicalMatrixReady,
  onReadinessReady,
  proposalExists = false,
  initialRequirements = [],
  initialTenderText = "",
}: TenderScannerProps) {
  const [requirements, setRequirements] = useState<TenderRequirement[]>([]);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchItems, setMatchItems] = useState<TenderMatchItem[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());
  const [pendingApprovalIds, setPendingApprovalIds] = useState<Set<number>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [tenderText, setTenderText] = useState("");
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessReport, setReadinessReport] = useState<{
    readiness_score: number;
    preliminary_check: PreliminaryCheckItem[];
    technical_match: TechnicalMatchItem[];
    disqualification_warnings: string[];
  } | null>(null);
  const [complianceStatement, setComplianceStatement] = useState<{ company_name: string; validDocs: ValidDoc[] } | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const complianceStatementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialRequirements.length > 0) {
      setRequirements(initialRequirements);
      setCheckedIds(new Set(initialRequirements.map((_, i) => i)));
      setTenderText(initialTenderText);
      setReadinessReport(null);
      setMatchItems([]);
    }
  }, [initialRequirements, initialTenderText]);

  const handlePrintComplianceStatement = useReactToPrint({
    contentRef: complianceStatementRef,
    documentTitle: "Compliance Statement",
    pageStyle: `
      @page { size: A4; margin: 0.75in; }
      body { margin: 0; }
    `,
  });

  const cost = getCost("TENDER_COMPLIANCE");
  const readinessCost = getCost("TENDER_READINESS");
  const insufficientSu = !isBetaTester && aiCredits < cost;
  const insufficientReadinessSu = !isBetaTester && aiCredits < readinessCost;
  const [lastComplianceKey, setLastComplianceKey] = useState<string | null>(null);
  const [lastReadinessKey, setLastReadinessKey] = useState<string | null>(null);

  const runMatchStrategy = async () => {
    if (!session) {
      setError("Sign in required.");
      return;
    }
    if (insufficientSu) {
      onRefillRequest?.();
      return;
    }
    if (requirements.length === 0) {
      setError("Scan a tender PDF first.");
      return;
    }
    setError(null);
    // Avoid re-running if requirements haven't changed and we already have results
    const key = requirements.map((r) => `${r.requirement}|${r.type ?? ""}`).join("||");
    if (key && key === lastComplianceKey && matchItems.length > 0) {
      return;
    }
    setMatching(true);
    try {
      const result = await generateSurgicalMatrix(requirements);
      if (result.success) {
        const surgical = result.matrix;
        const derivedCompliance: ComplianceMatrixRow[] = surgical.map((row) => ({
          requirement: row.requirement,
          compliance_status: row.status === "Compliant" ? "Full" : "Partial",
          proof_summary: row.proof,
          project_reference: row.ref_project,
        }));
        const derivedMatches: TenderMatchItem[] = surgical.map((row) => ({
          requirement: row.requirement,
          matched_project: row.ref_project ? `Implementation Case Study: ${row.ref_project}` : "",
          confidence: row.status === "Compliant" ? 100 : 50,
          gap_fix: row.proof,
          result: row.proof,
        }));
        setMatchItems(derivedMatches);
        setLastComplianceKey(key || null);
        setApprovedIds(new Set());
        setPendingApprovalIds(new Set());
        onMatchesReady?.(derivedMatches);
        onComplianceMatrixReady?.(derivedCompliance);
        onSurgicalMatrixReady?.(surgical);
        onCreditsRefetch?.();
      } else {
        if (result.code === "CREDITS_REQUIRED") {
          onRefillRequest?.();
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to match requirements.");
    } finally {
      setMatching(false);
    }
  };

  const handleToggleInclude = (index: number) => {
    setPendingApprovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAddToProposal = (match: TenderMatchItem, index: number) => {
    onAddMatchToProposal?.(match);
    setApprovedIds((prev) => new Set(prev).add(index));
    setPendingApprovalIds((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleGenerateComplianceStatement = async () => {
    if (!session) {
      setError("Sign in required.");
      return;
    }
    setStatementLoading(true);
    setError(null);
    try {
      const result = await getValidMandatoryDocs();
      if (result.success) {
        setComplianceStatement({ company_name: result.company_name, validDocs: result.validDocs });
        setTimeout(() => handlePrintComplianceStatement?.(), 200);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate compliance statement.");
    } finally {
      setStatementLoading(false);
    }
  };

  const runReadinessAnalysis = async () => {
    if (!session) {
      setError("Sign in required.");
      return;
    }
    if (insufficientReadinessSu) {
      onRefillRequest?.();
      return;
    }
    if (!tenderText) {
      setError("Scan a tender PDF first to run readiness analysis.");
      return;
    }
    setError(null);
    // Avoid re-running if tender text hasn't changed and we already have a report
    const key = tenderText.trim();
    if (key && key === lastReadinessKey && readinessReport) {
      return;
    }
    setReadinessLoading(true);
    setReadinessReport(null);
    try {
      const result = await analyzeTenderCompliance(tenderText);
      if (result.success) {
        setReadinessReport({
          readiness_score: result.readiness_score,
          preliminary_check: result.preliminary_check,
          technical_match: result.technical_match,
          disqualification_warnings: result.disqualification_warnings,
        });
        setLastReadinessKey(key || null);
        onReadinessReady?.(result.preliminary_check);
        onCreditsRefetch?.();
      } else {
        if (result.code === "CREDITS_REQUIRED") {
          onRefillRequest?.();
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Readiness analysis failed.");
    } finally {
      setReadinessLoading(false);
    }
  };

  const toggleCheck = (idx: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const hasTenderData = initialRequirements.length > 0;

  return (
    <div className="surgical-card space-y-4 p-4">
      <div>
        <h3 className="text-sm font-bold text-[#020617]">Tender Scanner</h3>
        <p className="text-[11px] text-[#475569] mt-0.5">
          {hasTenderData
            ? "Using the tender PDF from Step 1. Check compliance and readiness below."
            : "Upload your tender PDF in Step 1 first — it will appear here automatically."}
        </p>
      </div>

      {!hasTenderData && (
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-4 py-6 text-center">
          <FileText className="h-8 w-8 text-slate-500 mx-auto mb-2" aria-hidden />
          <p className="text-sm text-slate-600">Go to Step 1 and upload your tender PDF to use Tender Scanner.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <p>{error}</p>
          {error.toLowerCase().includes("firm profile") && (
            <Link
              href="/dashboard/firm-profile"
              className="mt-2 inline-block font-medium text-emerald-600 hover:underline"
            >
              Go to Firm Profile →
            </Link>
          )}
        </div>
      )}

      {requirements.length > 0 && (
        <>
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">
              Extracted Requirements
            </label>
            <ul className="space-y-2 rounded-lg border border-slate-200/80 bg-white/70 p-3">
              {requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleCheck(i)}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      checkedIds.has(i)
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-400 bg-transparent hover:border-slate-500"
                    }`}
                    aria-pressed={checkedIds.has(i)}
                    aria-label={checkedIds.has(i) ? "Uncheck" : "Check"}
                  >
                    {checkedIds.has(i) ? <Check className="h-3 w-3" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-800">{r.requirement}</span>
                    <span
                      className={`ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        r.type === "legal"
                          ? "bg-[var(--york-yellow)]/15 text-[#020617]"
                          : "bg-[#10B881]/15 text-[#020617]"
                      }`}
                    >
                      {r.type === "legal" ? <Shield className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
                      {r.type}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                1. Compliance for Proposal
              </p>
              <button
                type="button"
                onClick={runMatchStrategy}
                disabled={matching || !session || insufficientSu}
                className="w-full rounded-lg btn-primary-surgical px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {matching ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building Strategy…
                  </span>
                ) : (
                  `Build Compliance Matrix (${cost} SU)`
                )}
              </button>
              <p className="text-[11px] text-slate-600">
                Maps each tender requirement to your past projects and builds the compliance table and case studies for Section II.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                2. Readiness &amp; Disqualification Risk
              </p>
              <button
                type="button"
                onClick={runReadinessAnalysis}
                disabled={readinessLoading || !session || insufficientReadinessSu || !tenderText}
                className="w-full rounded-lg btn-secondary-surgical px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {readinessLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing…
                  </span>
                ) : (
                  `Run Readiness & Risk Check (${readinessCost} SU)`
                )}
              </button>
              <p className="text-[11px] text-slate-600">
                Checks mandatory documents, technical fit, and disqualification risks before you submit.
              </p>
            </div>
          </div>
        </>
      )}

      {readinessReport && (
        <div className="surgical-card space-y-4 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Readiness Report</h3>

          {readinessReport.preliminary_check.some((p) => p.critical && p.status === "Missing") && (
            <div className="flex items-center gap-2 rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3 text-red-800 animate-flash-red">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="font-semibold">HIGH DISQUALIFICATION RISK</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-slate-700"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray={`${readinessReport.readiness_score}, 100`}
                  strokeLinecap="round"
                  className={
                    readinessReport.readiness_score >= 70
                      ? "text-emerald-500"
                      : readinessReport.readiness_score >= 40
                        ? "text-amber-500"
                        : "text-red-500"
                  }
                />
              </svg>
              <span className="absolute text-2xl font-bold text-slate-900">
                {readinessReport.readiness_score}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 mb-2">Readiness Score (0–100)</p>
              <p className="text-sm text-slate-700">
                {readinessReport.readiness_score >= 70
                  ? "Strong compliance. Review gaps before submission."
                  : readinessReport.readiness_score >= 40
                    ? "Moderate risk. Address missing documents and technical gaps."
                    : "High risk. Resolve critical issues to avoid disqualification."}
              </p>
            </div>
          </div>

          {readinessReport.preliminary_check.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Preliminary Requirements
              </h4>
              <ul className="space-y-2">
                {readinessReport.preliminary_check.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span
                      className={`inline-flex w-20 shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                        p.status === "Found"
                          ? "bg-emerald-50 text-emerald-800"
                          : p.status === "Expired"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.critical && (
                      <span className="text-[10px] text-red-600 font-medium">Critical</span>
                    )}
                    <span className="text-slate-700">{p.requirement}</span>
                  </li>
                ))}
              </ul>
              {(readinessReport.preliminary_check.some((p) => p.status === "Missing" || p.status === "Expired")) && (
                <Link
                  href="/dashboard/firm-profile"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/60 bg-surgicalTeal/10 px-3 py-2 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20"
                >
                  Update missing or expired docs in Firm Profile →
                </Link>
              )}
            </div>
          )}

          {readinessReport.technical_match.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Technical Match
              </h4>
              <ul className="space-y-3">
                {readinessReport.technical_match.map((t, i) => (
                  <li key={i} className="rounded-lg border border-slate-200/80 bg-white/70 p-3 text-sm">
                    <p className="font-medium text-slate-800">{t.spec}</p>
                    {t.proof && <p className="mt-1 text-slate-600">Proof: {t.proof}</p>}
                    {t.gap_fix && (
                      <p className="mt-1 text-surgicalTeal">Gap fix: {t.gap_fix}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {readinessReport.disqualification_warnings.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-2">
                Disqualification Warnings
              </h4>
              <div className="space-y-2">
                {readinessReport.disqualification_warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateComplianceStatement}
            disabled={statementLoading || !session}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-3 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
          >
            {statementLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" />
                Generate Compliance Statement
              </>
            )}
          </button>
        </div>
      )}

      {/* Hidden printable compliance statement */}
      {complianceStatement && (
        <div ref={complianceStatementRef} className="fixed left-[9999px] top-0 w-[210mm] bg-white text-slate-900 p-8 print:static print:left-0 print:w-auto">
          <div className="border-2 border-slate-300 rounded-lg p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Compliance Statement</h1>
            <p className="text-sm text-slate-600 mb-6">
              Mandatory documents checklist
            </p>
            <p className="text-base font-semibold text-slate-800 mb-2">{complianceStatement.company_name}</p>
            <p className="text-sm text-slate-600 mb-6">
              Date: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div className="border-t border-slate-200 pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">Valid Documents</h2>
              {complianceStatement.validDocs.length > 0 ? (
                <ul className="space-y-2">
                  {complianceStatement.validDocs.map((doc, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[#020617] text-xs font-bold">✓</span>
                      <span className="font-medium text-slate-800">{doc.doc_name}</span>
                      {doc.expiry_date && (
                        <span className="text-slate-500">Valid until: {doc.expiry_date}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 italic">No valid documents on file. Update your Firm Profile to add mandatory documents.</p>
              )}
            </div>
            <p className="mt-8 text-xs text-slate-500">
              This statement confirms the above documents are current and valid as of the date stated.
            </p>
          </div>
        </div>
      )}

      {matchItems.length > 0 && onUpdateProposalWithFixes && (
        <div className="surgical-card space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Strategy Dashboard</h3>
          <p className="text-[11px] text-slate-500">
            Match each tender requirement to your past projects. Check items you want to include, then add them to your proposal.
          </p>
          <div className="space-y-4">
            {matchItems.map((match, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200/80 bg-white/70 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{match.requirement}</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${
                      match.confidence >= 70
                        ? "bg-emerald-600/20 text-emerald-400"
                        : match.confidence >= 40
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-red-600/20 text-red-400"
                    }`}
                  >
                    {match.confidence}% match
                  </span>
                </div>
                {match.matched_project ? (
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="text-slate-500">Matched project:</span> {match.matched_project}
                  </p>
                ) : null}
                {match.gap_fix && (
                  <div className="flex items-start gap-2 rounded-lg border-l-2 border-surgicalTeal/60 bg-surgicalTeal/5 px-3 py-2">
                    <span className="text-xs text-slate-700 leading-relaxed">{match.gap_fix}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pendingApprovalIds.has(i) || approvedIds.has(i)}
                      onChange={() => approvedIds.has(i) ? null : handleToggleInclude(i)}
                      disabled={approvedIds.has(i)}
                      className="h-4 w-4 rounded border-slate-400 bg-white text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <span className="text-xs text-slate-700">
                      {approvedIds.has(i) ? "Added to proposal" : "Include in proposal"}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddToProposal(match, i)}
                    disabled={!proposalExists || approvedIds.has(i) || !pendingApprovalIds.has(i)}
                    title={
                      approvedIds.has(i)
                        ? "Already added"
                        : !proposalExists
                          ? "Generate a proposal first"
                          : !pendingApprovalIds.has(i)
                            ? "Check 'Include in proposal' first"
                            : undefined
                    }
                    className="flex items-center gap-2 rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approvedIds.has(i) ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Added
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Add to Proposal
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {matchItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-600">
            {proposalExists
              ? "Click below to rewrite Section II of your current proposal with all compliance matches and fixes."
              : "Generate a proposal in Step 5 first, then come back here to apply this analysis to Section II."}
          </p>
          <button
            type="button"
            onClick={() => {
              onUpdateProposalWithFixes?.(
                matchItems.map((m) => ({
                  requirement: m.requirement,
                  status: m.confidence >= 70 ? "Compliant" : m.confidence >= 40 ? "Partial" : "Gap",
                  fix: m.matched_project || m.gap_fix || "Add relevant experience.",
                }))
              );
              onAddAllMatches?.(matchItems);
            }}
            disabled={!proposalExists}
            title={!proposalExists ? "Generate a proposal in Step 5 first, then come back to apply" : "Rewrite Section II with all compliance matches and fixes"}
            className="w-full rounded-lg border-2 border-emerald-600 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {proposalExists ? "Apply analysis to current proposal (Section II)" : "Generate proposal in Step 5 first to apply"}
          </button>
        </div>
      )}
    </div>
  );
}
