import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Briefcase, Smartphone } from "lucide-react";

// Title kept under 60 chars for SEO (55 chars)
export const metadata: Metadata = {
  title: "ATS Resume & Tender Proposal Builder Kenya | M-Pesa Integrated",
  description:
    "Win more jobs and tenders in Kenya. AI-powered ATS resumes and professional technical proposals. Pay instantly via M-Pesa. Optimized for Safaricom & Govt bids.",
  keywords: [
    "ATS Resume Kenya",
    "M-Pesa CV builder",
    "Kenya Government Tender Proposal Template",
    "Nairobi Freelance Proposal AI",
    "Kenya tender compliance",
    "M-Pesa resume builder",
    "Kenyan CV maker",
    "Safaricom proposal",
  ],
  openGraph: {
    title: "ATS Resume & Tender Proposal Builder Kenya | M-Pesa Integrated",
    description:
      "Win more jobs and tenders in Kenya. AI-powered ATS resumes and professional technical proposals. Pay instantly via M-Pesa. Optimized for Safaricom & Govt bids.",
    type: "website",
  },
};

const features = [
  {
    icon: FileSearch,
    title: "Tender Scanner",
    description: "Upload a PDF, find compliance gaps in seconds.",
    alt: "ATS resume scanner Kenya",
  },
  {
    icon: Briefcase,
    title: "Portfolio Manager",
    description: "Save your firm's wins once, use them forever.",
    alt: "Portfolio manager Kenya icon",
  },
  {
    icon: Smartphone,
    title: "M-Pesa Micro-payments",
    description: "No monthly subs. Pay only for the documents you need.",
    alt: "M-Pesa payment icon",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen app-bg">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-[#1c1917] sm:text-5xl lg:text-6xl">
            The Surgical Edge for Your Next Big Career or Business Move in{" "}
            <span className="text-neonGreenDark">Kenya</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#292524] sm:text-xl">
            The only M-Pesa integrated Resume & Proposal builder designed for the Kenyan market.
            Optimized for Safaricom, Government Tenders, and Global Freelancing.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl btn-primary-surgical px-8 py-4 text-base font-semibold shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-500/30"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl btn-secondary-surgical px-8 py-4 text-base font-medium"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="border-t border-stone-200/60 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-center text-2xl font-semibold text-[#1c1917] sm:text-3xl">
            Built for Kenyan Professionals
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-[#292524]">
            Everything you need to land tenders and freelance gigs—without the hassle.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl glass-card p-6 transition hover:shadow-elevated"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-500/20"
                  role="img"
                  aria-label={feature.alt}
                >
                  <feature.icon className="h-6 w-6 text-neonGreenDark" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-[#0c0a09]">{feature.title}</h3>
                <p className="mt-2 text-[#44403c]">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200/60 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl glass-card px-8 py-14 text-center">
          <h2 className="font-display text-2xl font-semibold text-[#1c1917] sm:text-3xl">
            Ready to win more?
          </h2>
          <p className="mt-3 text-base text-[#292524]">
            Join professionals across Kenya who use Resume Surgeon to land tenders and jobs.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-flex items-center justify-center rounded-xl btn-primary-surgical px-8 py-4 text-base font-semibold"
          >
            Start for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 px-4 py-8 text-center text-base text-[#292524]">
        <Link href="/login" className="hover:text-neonGreenDark">
          Sign In
        </Link>
        {" · "}
        <Link href="/signup" className="hover:text-neonGreenDark">
          Sign Up
        </Link>
      </footer>
    </div>
  );
}
