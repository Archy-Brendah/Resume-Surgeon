import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slateDeep: "#0f172a",
        surgicalTeal: "#2dd4bf",
        accent: "var(--accent)",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Playfair Display", "serif"],
        body: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "premium": "0.75rem",
        "premium-lg": "1rem",
        "premium-xl": "1.25rem",
      },
      boxShadow: {
        "card": "0 4px 24px -4px rgba(0, 0, 0, 0.4)",
        "card-hover": "0 8px 32px -8px rgba(0, 0, 0, 0.5)",
        "glow-teal": "0 0 24px -4px rgba(45, 212, 191, 0.25)",
        "inner-subtle": "inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
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

export default config;

