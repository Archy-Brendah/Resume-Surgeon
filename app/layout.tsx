import type { Metadata } from "next";
import "./globals.css";
import { Inter, Montserrat, Playfair_Display } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resume Surgeon",
  description: "Precision resume surgery with AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${montserrat.variable}`}
    >
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased app-bg">
        {children}
      </body>
    </html>
  );
}

