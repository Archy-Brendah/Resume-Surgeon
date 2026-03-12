"use client";

import { useRef } from "react";
import { Copy, Download, Linkedin } from "lucide-react";

export type ViewProfile = {
  fullName?: string;
  targetRole?: string;
  email?: string;
  profileUrl?: string;
  experience?: string;
  sharpened?: string;
  skills?: string;
  education?: string;
  projects?: string;
  certification?: string;
  is_paid: boolean;
  noindex: boolean;
};

export function ViewResume({ profile }: { profile: ViewProfile }) {
  const printRef = useRef<HTMLDivElement>(null);

  const name = profile.fullName || "Candidate";
  const title = profile.targetRole || "Professional";
  const email = profile.email || "";
  const linkedin = profile.profileUrl?.trim() || "";
  const body = profile.sharpened || profile.experience || "";
  const skills = profile.skills || "";
  const education = profile.education || "";
  const projects = profile.projects || "";
  const certification = profile.certification || "";
  const bullets = body ? body.split("\n").filter((l) => l.trim()) : [];

  const handleCopyEmail = () => {
    if (email) navigator.clipboard.writeText(email);
  };

  const handlePrint = () => {
    if (!profile.is_paid) return;
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>${name} – Executive Resume</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
          .exec-name { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 28pt; }
          .exec-section-header { font-family: 'Playfair Display', serif; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10pt; }
          .exec-divider { height: 1px; background: linear-gradient(90deg, #00ff88, transparent); margin: 8px 0; }
          ul { list-style: none; padding: 0; }
          li { display: flex; gap: 8px; margin-bottom: 6px; }
          .bullet { color: #00ff88; }
        </style>
      </head><body>
        ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6 pb-4 border-b border-slate-700">
          <a
            href="/"
            className="text-[11px] uppercase tracking-wider text-slate-500 hover:text-neonGreen transition-colors"
          >
            Resume Surgeon
          </a>
          <span className="text-slate-600">·</span>
          <button
            type="button"
            onClick={handleCopyEmail}
            disabled={!email}
            className="inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-3 py-1.5 text-xs font-medium text-neonGreen hover:bg-surgicalTeal/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Email
          </button>
          {linkedin && (
            <a
              href={linkedin.startsWith("http") ? linkedin : `https://${linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-3 py-1.5 text-xs font-medium text-neonGreen hover:bg-surgicalTeal/20"
            >
              <Linkedin className="h-3.5 w-3.5" />
              Open LinkedIn
            </a>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={!profile.is_paid}
            className="inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-3 py-1.5 text-xs font-medium text-neonGreen hover:bg-surgicalTeal/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            Download Official PDF
          </button>
          {!profile.is_paid && (
            <span className="text-[10px] text-slate-500">PDF available for Executive Pass members</span>
          )}
        </div>

        <div
          ref={printRef}
          className="rounded-2xl border border-surgicalTeal/30 bg-slate-800/50 p-6 sm:p-8 shadow-2xl print:shadow-none print:border-0 print:bg-white print:text-slate-900"
        >
          <div className="text-center pb-5 mb-5 border-b border-slate-600/60">
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-50 mb-1">{name}</h1>
            <p className="text-sm uppercase tracking-widest text-neonGreen mb-4">{title}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-400">
              {email && <span>{email}</span>}
              {email && linkedin && <span className="text-neonGreen">•</span>}
              {linkedin && <span>{linkedin}</span>}
            </div>
          </div>

          <div className="space-y-5">
            {(bullets.length > 0 || body.trim()) && (
              <div className="space-y-2">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-neonGreen">Experience</h3>
                <div className="h-px bg-gradient-to-r from-surgicalTeal/50 to-transparent mb-2" />
                {bullets.length > 0 ? (
                  <ul className="space-y-2">
                    {bullets.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-neonGreen mt-1.5 shrink-0">—</span>
                        <span className="leading-relaxed">{line.trim()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 whitespace-pre-line">{body}</p>
                )}
              </div>
            )}

            {skills && (
              <div className="space-y-2">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-neonGreen">Skills</h3>
                <div className="h-px bg-gradient-to-r from-surgicalTeal/50 to-transparent mb-2" />
                <p className="text-sm text-slate-300 leading-relaxed">{skills}</p>
              </div>
            )}

            {education && (
              <div className="space-y-2">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-neonGreen">Education</h3>
                <div className="h-px bg-gradient-to-r from-surgicalTeal/50 to-transparent mb-2" />
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{education}</p>
              </div>
            )}

            {projects && (
              <div className="space-y-2">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-neonGreen">Projects</h3>
                <div className="h-px bg-gradient-to-r from-surgicalTeal/50 to-transparent mb-2" />
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{projects}</p>
              </div>
            )}

            {certification && (
              <div className="space-y-2">
                <h3 className="font-display text-xs uppercase tracking-[0.2em] text-neonGreen">Certifications</h3>
                <div className="h-px bg-gradient-to-r from-surgicalTeal/50 to-transparent mb-2" />
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{certification}</p>
              </div>
            )}

            {!body && !skills && !education && !projects && !certification && (
              <p className="text-sm text-slate-500 italic">No content shared yet.</p>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          Optimized by Resume Surgeon
        </p>
      </div>
    </div>
  );
}
