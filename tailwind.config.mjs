/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC",
        obsidian: "#020617",
        yorkGold: "#F59E0B",
        forestGreen: "#064E3B",
        heading: "#0F172A",
        body: "#475569",
        slateDeep: "#0f172a",
        surgicalTeal: "#00ff88",
        surgicalTealDark: "#0d4d2d",
        neonGreen: "#00ff88",
        neonGreenDark: "#0d4d2d",
        brandGreen: "#10b981",
        brandGreenSoft: "#34d399",
        yorkYellow: "#d4a853",
        yorkYellowSoft: "#e8c97a",
        accent: "var(--accent)",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Playfair Display", "serif"],
        body: ["var(--font-inter)", "Inter", "Geist", "system-ui", "sans-serif"],
      },
      borderRadius: {
        premium: "0.75rem",
        "premium-lg": "1rem",
        "premium-xl": "1.25rem",
      },
      boxShadow: {
        "surgical-card": "0 8px 30px rgb(0 0 0 / 0.04)",
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 10px 40px -10px rgba(0, 0, 0, 0.06)",
        "card-hover": "0 8px 32px -8px rgba(15, 23, 42, 0.12)",
        elevated: "0 8px 30px -8px rgba(0, 0, 0, 0.08), 0 20px 60px -20px rgba(0, 0, 0, 0.06)",
        "glow-teal": "0 0 24px -4px rgba(0, 255, 136, 0.4)",
        frost: "0 25px 50px -12px rgba(148, 163, 184, 0.25)",
        "frost-sm": "0 4px 12px -2px rgba(148, 163, 184, 0.15)",
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      transitionDuration: { "250": "250ms" },
    },
  },
  plugins: [],
};
