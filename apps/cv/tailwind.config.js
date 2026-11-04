/** @type {import('tailwindcss').Config} */
// Only Tailwind's base (preflight): components use @newrole/ui/styles.css, as in newrole.it.
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
  corePlugins: { preflight: true },
  plugins: [],
}
