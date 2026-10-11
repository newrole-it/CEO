/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        raised: "var(--color-bg-raised)",
        fg: "var(--color-fg)",
        muted: "var(--color-fg-muted)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-text)",
        mono: "var(--font-mono)",
      },
      borderRadius: { xs: "6px", sm: "8px", md: "12px", lg: "16px", xl: "24px" },
      screens: { nav: "900px" },
    },
  },
  plugins: [],
}
