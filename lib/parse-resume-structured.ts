/**
 * Parses raw resume text into structured fields for the app:
 * fullName, email, targetRole, profileUrl (LinkedIn), experience, skills,
 * projects, certifications.
 */

export type ParsedResume = {
  fullName: string;
  email: string;
  targetRole: string;
  profileUrl: string;
  experience: string;
  skills: string;
  education: string;
  projects: string;
  certifications: string;
};

const SECTION_HEADERS = [
  "experience",
  "work experience",
  "professional experience",
  "employment",
  "career",
  "work history",
  "employment history",
  "relevant experience",
  "skills",
  "skills & expertise",
  "technical skills",
  "key skills",
  "core competencies",
  "competencies",
  "expertise",
  "proficiencies",
  "technologies",
  "tools",
  "qualifications",
  "education",
  "academic",
  "certifications",
  "certification",
  "licenses",
  "projects",
  "key projects",
  "summary",
  "professional summary",
  "objective",
  "contact",
  "contact information",
  "linkedin",
  "linked in",
] as const;

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isSectionHeader(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (lower.length > 50) return false;
  const normalized = lower.replace(/\s+/g, " ");
  return SECTION_HEADERS.some((h) => normalized === h || normalized.startsWith(h + ":"));
}

/** Extract first email from text */
function extractEmail(text: string): string {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return match ? match[0] : "";
}

/** Extract first LinkedIn profile URL */
function extractLinkedInUrl(text: string): string {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i
  );
  return match ? match[0] : "";
}

/** Heuristic: does this line look like a person's full name (2–4 words, no symbols)? */
function looksLikeName(line: string): boolean {
  const t = normalizeLine(line);
  if (t.length < 3 || t.length > 60) return false;
  if (/@|https?:\/\//.test(t)) return false;
  if (/^\d|^\W/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const allLetters = words.every((w) => /^[A-Za-z\-.'\u00C0-\u024F]+$/.test(w));
  return allLetters;
}

/** Heuristic: does this line look like a job title / target role (short, no long sentences)? */
function looksLikeRole(line: string): boolean {
  const t = normalizeLine(line);
  if (t.length < 2 || t.length > 80) return false;
  if (/@|linkedin\.com/.test(t)) return false;
  if (t.split(/\s+/).length > 10) return false;
  return true;
}

/** Map header line (lowercase) to section key */
function sectionKeyForLine(line: string): string | null {
  const lower = line.toLowerCase().replace(/\s+/g, " ").trim();
  const bare = lower.replace(/[:\s]+$/, "");
  const experiencePattern = /^(experience|work experience|professional experience|employment|career|work history|employment history|relevant experience)$/;
  const skillsPattern = /^(skills|skills & expertise|technical skills|key skills|core competencies|expertise|competencies|proficiencies|technologies|tools|qualifications)$/;
  if (experiencePattern.test(bare)) return "experience";
  if (skillsPattern.test(bare)) return "skills";
  if (/^(projects|key projects)$/.test(bare)) return "projects";
  if (/^(certifications|certification|licenses)$/.test(bare)) return "certifications";
  if (/^(education|academic)$/.test(bare)) return "education";
  if (/^(summary|professional summary|objective)$/.test(bare)) return "summary";
  if (/^(experience|work experience|professional experience|employment|career|work history|employment history|relevant experience)\b/.test(lower)) return "experience";
  if (/^(skills|skills & expertise|technical skills|key skills|core competencies|expertise|competencies|proficiencies|technologies|tools|qualifications)\b/.test(lower)) return "skills";
  if (/^(projects|key projects)\b/.test(lower)) return "projects";
  if (/^(certifications|certification|licenses)\b/.test(lower)) return "certifications";
  if (/^(education|academic)\b/.test(lower)) return "education";
  if (/^(summary|professional summary|objective)\b/.test(lower)) return "summary";
  return null;
}

/**
 * Normalize raw text into lines. Some PDFs merge content with spaces instead of newlines;
 * split long lines on double space so section headers can be detected.
 */
function toLines(raw: string): string[] {
  const byNewline = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: string[] = [];
  for (const line of byNewline) {
    if (line.length > 180) {
      const parts = line.split(/\s{2,}/);
      result.push(...parts.map((p) => p.trim()).filter(Boolean));
    } else {
      result.push(line);
    }
  }
  return result;
}

/**
 * Split resume text into sections by common headers.
 * Returns a map of section key -> content (trimmed).
 */
function splitSections(raw: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = toLines(raw);
  let currentKey: string | null = null;
  const currentLines: string[] = [];

  function flush() {
    if (currentKey && currentLines.length > 0) {
      const existing = sections.get(currentKey) ?? "";
      sections.set(currentKey, (existing + "\n" + currentLines.join("\n")).trim());
    }
  }

  for (const line of lines) {
    const matched = sectionKeyForLine(line);
    if (matched) {
      flush();
      currentKey = matched;
      const afterColon = line.replace(/^[^:]*:\s*/i, "").trim();
      currentLines.length = 0;
      if (afterColon) currentLines.push(afterColon);
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Fallback: find content after a section keyword (e.g. "experience", "skills") when
 * section headers were not detected (e.g. PDF with no newlines between sections).
 */
function extractAfterKeyword(raw: string, keyword: string, nextKeywords: string[]): string {
  const lower = raw.toLowerCase();
  const idx = lower.search(new RegExp(`\\b${keyword}\\b`));
  if (idx === -1) return "";
  const start = idx + keyword.length;
  let end = raw.length;
  for (const next of nextKeywords) {
    const nextIdx = lower.indexOf(next, start);
    if (nextIdx !== -1 && nextIdx < end) end = nextIdx;
  }
  return raw.slice(start, end).replace(/\s+/g, " ").trim();
}

/**
 * Parse raw resume text into structured fields.
 * Used for both PDF and TXT uploads so the app can map data to the right inputs.
 */
export function parseResumeStructured(rawText: string): ParsedResume {
  const raw = rawText.replace(/\r\n/g, "\n").trim();
  const email = extractEmail(raw);
  const profileUrl = extractLinkedInUrl(raw);

  const sections = splitSections(raw);
  let experience = (sections.get("experience") ?? "").trim();
  let skills = (sections.get("skills") ?? "").trim();
  const education = (sections.get("education") ?? "").trim();
  const projects = (sections.get("projects") ?? "").trim();
  const certifications = (sections.get("certifications") ?? "").trim();

  const nextSectionKeywords = ["skills", "education", "summary", "experience", "projects", "certifications", "employment", "work experience", "technical skills", "key skills", "objective", "contact"];
  if (!experience && raw.length > 30) {
    const fallback = extractAfterKeyword(raw, "experience", nextSectionKeywords);
    if (fallback.length > 10) experience = fallback.trim();
  }
  if (!experience && raw.length > 200) {
    const lower = raw.toLowerCase();
    const eduIdx = lower.search(/\beducation\b/);
    const sumIdx = lower.search(/\bsummary\b/);
    let end = raw.length;
    if (eduIdx !== -1 && eduIdx < end) end = eduIdx;
    if (sumIdx !== -1 && sumIdx < end) end = sumIdx;
    const before = raw.slice(0, end).replace(/\s+/g, " ").trim();
    if (before.length > 20) experience = before.trim();
  }
  if (!skills && raw.length > 30) {
    const fallback = extractAfterKeyword(raw, "skills", nextSectionKeywords);
    if (fallback.length > 2) skills = fallback.trim();
  }
  if (!skills && raw.length > 50) {
    const lines = toLines(raw);
    for (const line of lines) {
      const t = line.trim();
      if (t.length < 10 || t.length > 500) continue;
      const hasCommas = (t.match(/,/g)?.length ?? 0) >= 2;
      const hasBullets = /^[\s•·\-*]\s|\s[\s•·\-*]\s/.test(t) || /^[•·\-*]\s/.test(t);
      const looksLikeSkillList = hasCommas || hasBullets;
      if (looksLikeSkillList && !/@|http|\.(com|org|edu)\b/i.test(t)) {
        skills = t;
        break;
      }
    }
  }

  const lines = toLines(raw);
  let fullName = "";
  let targetRole = "";

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (!fullName && looksLikeName(line)) {
      fullName = normalizeLine(line);
      continue;
    }
    if (fullName && !targetRole && looksLikeRole(line) && !isSectionHeader(line) && !/@|linkedin\.com|http/.test(line)) {
      targetRole = normalizeLine(line);
      break;
    }
  }

  return {
    fullName,
    email,
    targetRole,
    profileUrl,
    experience: experience.trim(),
    skills: skills.trim(),
    education,
    projects,
    certifications,
  };
}
