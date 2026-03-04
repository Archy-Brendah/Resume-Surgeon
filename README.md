# Resume Surgeon

**Precision AI resume surgery** — sharpen bullets, match to job descriptions, cover letters, LinkedIn content, and more. Sold as a **service**; source code is private and not for sale.

**Created and made by [Cadu Systems](https://cadusystems.com).**

---

## About the app

Resume Surgeon is a career toolkit that helps users optimize resumes, cover letters, and LinkedIn for specific roles. It uses AI (Gemini + Groq) for rewriting and analysis, Supabase for auth and data, and IntaSend for payments (M-Pesa and Card). The UI is built with Next.js, Tailwind, and Framer Motion (Deep Slate & Surgical Teal theme).

---

## Modules & features

| Module | Features |
|--------|----------|
| **Resume / Builder** | Executive-style resume template, live preview. **Sharpen with AI** on bullets (STAR, JD-aligned). **Recruiter’s 6-Second Audit**: impact score, vitals (contact, metrics, action verbs), doctor’s note. Target job field for matching. |
| **Surgical Matcher** | Paste a job description; get **match %**, keywords found/missing, **gap report** (critical / optimization / bonus). **Tailor resume** — AI rewrites 3–4 bullets to fit the JD. Match breakdown (skills, experience, tone). |
| **Cover Letter** | AI cover letter from resume + JD. Tone: confident, professional, creative, or humble. Hook–Proof–CTA structure. |
| **Proposals** | **Freelancer**: scope, pain points, pricing. **Firm (B2B)**: company logo, brand color, Challenger-style proposal. |
| **LinkedIn Surgeon** | 3 headlines, story-driven About (Hook–Value–CTA), featured projects. **Banner generator** (canvas, Surgical Teal). Consistency score vs resume. |
| **Follow-Up Kit** | Three follow-up emails: 48h nudge, 7-day value-add, 14-day close. Generated from JD + resume. |
| **LinkedIn DM** | Short DMs (≈200 chars) for Recruiter, Peer (referral), and Hiring Manager. |
| **Job Tracker** | Log applications: company, role, status (Applied / Interview / Offer / Rejected), date. |
| **Interview Prep** | 10 questions (Expert, Cultural fit, Story, Visionary). STAR answer scripts, recruiter motive, strategy. Elevator pitch. Practice mode (hide answers). |
| **Surgical Share** | Public profile at `/view/[username]`. Share link, recruiter actions (Copy Email, LinkedIn, Download PDF when paid). Optional no-index for privacy. |
| **Auth & payments** | Supabase auth (email, magic link, Google). IntaSend: M-Pesa STK push, Card checkout. Executive Pass and **Surgical Units (SU)** refill packs. Success email (Resend) after payment. |
| **Stealth / Humanize** | Toggle to make AI output less “AI-sounding” (varied length, fewer stock phrases). |

---

## Quick start

- Copy `.env.example` to `.env.local` and add your keys (Supabase, IntaSend, Resend, AI).
- `npm install` → `npm run dev`. Open [http://localhost:3000](http://localhost:3000).
- Deploy to Vercel: connect the repo, add the same env vars in Project Settings, then deploy.

Do **not** commit `.env` or `.env.local`; they are in `.gitignore`.
