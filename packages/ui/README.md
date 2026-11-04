# @newrole/ui

newrole.it's design system for React and Next.js: deep ink neutrals, one violet for action, light and dark.

- `styles.css`: tokens, base, typography, layout, buttons, chips, fields, cards, badges, tabs, overlays, toasts, banners, skeletons, dropzone, and their reduced-motion rules. Load it after Tailwind's base (`@tailwind base`) and before your pages' CSS.
- `Button`, `primitives` (Badge, Field, Banner, EmptyState, Segmented…), `interactive` (Modal, popovers, `ToastProvider` and `useToast`, Dropzone, CopyButton, ScoreRing…).
- `locale`: `LocaleProvider` and `useLocale`, the one language context every package reads; `i18n` (`fmt`, `makeTranslator`); `copy`, the components' own strings; `time` (`relativeTime`).

Fonts are the app's: the CSS reads `--font-onest` and `--font-geist-mono` (newrole.it sets them with `next/font`).
