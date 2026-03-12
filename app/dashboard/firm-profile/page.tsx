"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Plus, Trash2, Loader2, ArrowLeft, X, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import { saveFirmProfile, type SaveFirmProfileResult } from "@/app/actions/firm";
import { DocumentChecklist, DEFAULT_DOCS, mergeMandatoryDocsWithDefaults, type MandatoryDoc } from "@/components/DocumentChecklist";

type PastProject = {
  title: string;
  client: string;
  year: string;
  results: string;
};

const emptyProject = (): PastProject => ({
  title: "",
  client: "",
  year: "",
  results: "",
});

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </span>
      ) : (
        "Save Profile"
      )}
    </button>
  );
}

export default function FirmProfilePage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useSubscription();
  const [companyName, setCompanyName] = useState("");
  const [bio, setBio] = useState("");
  const [methodology, setMethodology] = useState("");
  const [mission, setMission] = useState("");
  const [successMetrics, setSuccessMetrics] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [coreServices, setCoreServices] = useState<string[]>([]);
  const [serviceInput, setServiceInput] = useState("");
  const [pastProjects, setPastProjects] = useState<PastProject[]>([emptyProject()]);
  const [mandatoryDocs, setMandatoryDocs] = useState<MandatoryDoc[]>(DEFAULT_DOCS);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    const uid = user?.id;
    if (!uid) return;

    async function fetchProfile() {
      setLoading(true);
      setError(null);
      try {
        const db = supabase.schema("resume_surgeon");
        let data: Record<string, unknown> | null = null;
        let fetchError: { message?: string } | null = null;

        const { data: fullData, error: fullError } = await db
          .from("firm_profiles")
          .select("company_name, bio, core_services, past_projects, mandatory_docs, methodology, mission, success_metrics, team_size")
          .eq("user_id", uid)
          .maybeSingle();

        if (fullError) {
          const { data: fallbackData, error: fallbackError } = await db
            .from("firm_profiles")
            .select("company_name, bio, core_services, past_projects, mandatory_docs")
            .eq("user_id", uid)
            .maybeSingle();
          data = fallbackData as Record<string, unknown> | null;
          fetchError = fallbackError;
        } else {
          data = fullData as Record<string, unknown> | null;
          fetchError = fullError;
        }

        if (fetchError) {
          setError("Failed to load profile.");
          return;
        }

        if (data) {
          setCompanyName((data.company_name as string) ?? "");
          setBio((data.bio as string) ?? "");
          setMethodology((data.methodology as string) ?? "");
          setMission((data.mission as string) ?? "");
          setSuccessMetrics((data.success_metrics as string) ?? "");
          setTeamSize((data.team_size as string) ?? "");
          const rawServices = data.core_services;
          if (Array.isArray(rawServices)) {
            setCoreServices(rawServices.map((s) => String(s ?? "")).filter(Boolean));
          }
          const raw = data.past_projects ?? [];
          if (Array.isArray(raw) && raw.length > 0) {
            const projects = raw.map((p: unknown) => {
              if (p && typeof p === "object" && "title" in p) {
                return {
                  title: String((p as { title?: string }).title ?? ""),
                  client: String((p as { client?: string }).client ?? ""),
                  year: String((p as { year?: string }).year ?? ""),
                  results: String((p as { results?: string }).results ?? ""),
                };
              }
              return emptyProject();
            });
            setPastProjects(projects);
          } else {
            setPastProjects([emptyProject()]);
          }
          const rawDocs = data.mandatory_docs;
          if (Array.isArray(rawDocs) && rawDocs.length > 0) {
            const parsed = rawDocs
              .filter((d): d is Record<string, unknown> => d != null && typeof d === "object")
              .map((d) => ({
                doc_name: String((d as { doc_name?: string }).doc_name ?? ""),
                status: Boolean((d as { status?: boolean }).status),
                expiry_date: (d as { expiry_date?: string | null }).expiry_date && typeof (d as { expiry_date?: string }).expiry_date === "string"
                  ? (d as { expiry_date: string }).expiry_date
                  : null,
              }))
              .filter((d) => d.doc_name);
            setMandatoryDocs(mergeMandatoryDocsWithDefaults(DEFAULT_DOCS, parsed));
          } else {
            setMandatoryDocs(DEFAULT_DOCS);
          }
        }
      } catch {
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [user, authLoading, router]);

  const addProject = () => {
    setPastProjects((prev) => [...prev, emptyProject()]);
  };

  const removeProject = (idx: number) => {
    setPastProjects((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [emptyProject()] : next;
    });
  };

  const updateProject = (idx: number, field: keyof PastProject, value: string) => {
    setPastProjects((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const addService = () => {
    const trimmed = serviceInput.trim();
    if (trimmed && !coreServices.includes(trimmed)) {
      setCoreServices((prev) => [...prev, trimmed]);
      setServiceInput("");
    }
  };

  const removeService = (idx: number) => {
    setCoreServices((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAutoFillFromPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      toast.error("Please select a PDF file.");
      e.target.value = "";
      return;
    }
    const MAX_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Please upload a PDF under 4MB to save server resources.");
      e.target.value = "";
      return;
    }
    if (!session?.access_token) {
      toast.error("Sign in required.");
      e.target.value = "";
      return;
    }
    setImporting(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const promise = (async () => {
      const res = await fetch("/api/firm-profile/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const data = (await res.json()) as {
        company_name?: string;
        bio?: string;
        core_services?: string[];
        past_projects?: Array<{ title: string; client: string; year: string; results: string }>;
        methodology?: string;
        mission?: string;
        success_metrics?: string;
        team_size?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || data.error) {
        const msg = res.status === 402 || data.code === "CREDITS_REQUIRED"
          ? "Insufficient credits. Top up to use Auto-Fill."
          : (data.error ?? "Auto-fill failed.");
        setError(msg);
        throw new Error(msg);
      }
      setCompanyName(data.company_name ?? "");
      setBio(data.bio ?? "");
      if (data.methodology) setMethodology(data.methodology);
      if (data.mission) setMission(data.mission);
      if (data.success_metrics) setSuccessMetrics(data.success_metrics);
      if (data.team_size) setTeamSize(data.team_size);
      const services = data.core_services ?? [];
      if (services.length > 0) {
        setCoreServices(services.map((s) => String(s ?? "").trim()).filter(Boolean));
      }
      const projects = data.past_projects ?? [];
      if (projects.length > 0) {
        setPastProjects(
          projects.map((p) => ({
            title: String(p.title ?? ""),
            client: String(p.client ?? ""),
            year: String(p.year ?? ""),
            results: String(p.results ?? ""),
          }))
        );
      } else {
        setPastProjects([emptyProject()]);
      }
      return data;
    })();
    toast.promise(promise, {
      loading: "Our AI is analyzing your document...",
      success: "Profile auto-filled. Review and save.",
      error: (err) => (err instanceof Error ? err.message : "Auto-fill failed."),
    });
    try {
      await promise;
    } catch {
      // Error already handled by toast.promise
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const [state, formAction] = useActionState(
    async (_prev: SaveFirmProfileResult | null, formData: FormData) => saveFirmProfile(formData),
    null
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success("Profile saved successfully.");
      setError(null);
    } else {
      setError(state.error);
      toast.error(state.error);
    }
  }, [state]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link
          href="/?tab=proposals"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Proposals
        </Link>

        <header className="mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-[#0F172A]">Firm Profile</h1>
            <p className="mt-1 text-sm text-slate-600">
              Update your company details, mandatory documents, and past projects here. Proposals, Readiness Analysis, and Compliance Dashboard use this data — keep it current so your tender submissions are accurate.
            </p>
          </div>
        </header>

        <form action={formAction} className="space-y-6">
          <input type="hidden" name="past_projects" value={JSON.stringify(pastProjects)} />
          <input type="hidden" name="core_services" value={JSON.stringify(coreServices)} />
          <input type="hidden" name="mandatory_docs" value={JSON.stringify(mandatoryDocs)} />
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Layout */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Basic Info - spans full width */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-4">Basic Info</h2>
              <div
                role="button"
                tabIndex={0}
                onClick={() => importInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && importInputRef.current?.click()}
                className="mb-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 transition-colors hover:border-emerald-300/80 hover:bg-emerald-50 cursor-pointer"
              >
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleAutoFillFromPDF}
                  className="hidden"
                  disabled={importing}
                />
                {importing ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mb-3" />
                    <p className="text-sm font-medium text-slate-800">Analyzing your PDF…</p>
                    <p className="text-xs text-slate-500 mt-1">Company profile, services &amp; past projects</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-emerald-600 mb-3" />
                    <p className="text-sm font-medium text-slate-900">Upload PDF to auto-fill</p>
                    <p className="text-xs text-slate-500 mt-1">Company profile, brochure, or capability statement (max 4MB)</p>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-4 text-center">— or enter details manually below —</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="company_name" className="block text-xs font-medium text-slate-600">
                    Company Name
                  </label>
                  <input
                    id="company_name"
                    name="company_name"
                    type="text"
                    placeholder="e.g. Acme Consulting"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="bio" className="block text-xs font-medium text-slate-600">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    rows={4}
                    placeholder="Describe your firm's expertise, certifications, and value proposition..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">Proposal defaults — used to auto-fill tender proposal form when empty</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="methodology" className="block text-xs font-medium text-slate-600">Methodology</label>
                    <input id="methodology" name="methodology" type="text" placeholder="e.g. Agile, phased delivery" value={methodology} onChange={(e) => setMethodology(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="team_size" className="block text-xs font-medium text-slate-600">Team size</label>
                    <input id="team_size" name="team_size" type="text" placeholder="e.g. 15 specialists" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="mission" className="block text-xs font-medium text-slate-600">Mission / objectives</label>
                  <textarea id="mission" name="mission" rows={2} placeholder="Company mission or typical project objectives" value={mission} onChange={(e) => setMission(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="success_metrics" className="block text-xs font-medium text-slate-600">Success metrics</label>
                  <textarea id="success_metrics" name="success_metrics" rows={2} placeholder="How you measure success, typical client outcomes" value={successMetrics} onChange={(e) => setSuccessMetrics(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20" />
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-4">Core Services</h2>
              <p className="text-xs text-slate-500 mb-3">e.g. ICT, Civil Works, Consulting</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {coreServices.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeService(i)}
                      className="rounded-full p-0.5 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a service"
                  value={serviceInput}
                  onChange={(e) => setServiceInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addService())}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={addService}
                  className="rounded-lg border border-emerald-500/70 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Mandatory Documents */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-1">Mandatory Documents</h2>
              <p className="text-xs text-slate-500 mb-4">
                Check each document when obtained and add expiry dates. Used by Readiness Analysis (Step 3) and the proposal Section I checklist.
              </p>
              <DocumentChecklist value={mandatoryDocs} onChange={setMandatoryDocs} />
            </div>

            {/* Past Projects */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">Past Projects</h2>
                <button
                  type="button"
                  onClick={addProject}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Project
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Add projects with client, year, and results. Used by Compliance Dashboard (Step 3) and proposal Section II evidence.
              </p>
              <div className="space-y-4">
                {pastProjects.map((project, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">Project {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeProject(idx)}
                        disabled={pastProjects.length === 1}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        aria-label="Remove project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500">Project Title</label>
                        <input
                          type="text"
                          placeholder="e.g. Digital Transformation for XYZ Corp"
                          value={project.title}
                          onChange={(e) => updateProject(idx, "title", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500">Client</label>
                        <input
                          type="text"
                          placeholder="e.g. XYZ Corp"
                          value={project.client}
                          onChange={(e) => updateProject(idx, "client", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500">Year</label>
                        <input
                          type="text"
                          placeholder="e.g. 2024"
                          value={project.year}
                          onChange={(e) => updateProject(idx, "year", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-[10px] uppercase tracking-wider text-slate-500">Key Result</label>
                        <input
                          type="text"
                          placeholder="e.g. Completed 2 months ahead of schedule"
                          value={project.results}
                          onChange={(e) => updateProject(idx, "results", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
