/**
 * Strings of the shared components (interactive.tsx, primitives.tsx) and the relative times in
 * time.ts. An app spreads these into its own dictionary. Polish uses the informal "Ty".
 */

export const uiPl = {
  "common.close": "Zamknij",
  "common.copy": "Kopiuj",
  "common.copied": "Skopiowano ✓",
  "common.cancel": "Anuluj",
  "common.save": "Zapisz",
  "common.loading": "Wczytuję…",
  "common.retry": "Spróbuj ponownie",
  "common.newTab": "(otwiera się w nowej karcie)",
  "common.more": "+{n} więcej",
  "common.or": "albo",
  "common.yesterday": "wczoraj",
  "common.daysAgo": "{n} dni temu",
  "common.hoursAgo": "{n} h temu",
  "common.minutesAgo": "{n} min temu",
  "common.justNow": "przed chwilą",
  "common.over30": "> 30 dni",
  "card.score": "Dopasowanie {n} na 100",
  "f.remove": "Usuń {item}",
}

export type UiCopyKey = keyof typeof uiPl

export const uiEn: Record<UiCopyKey, string> = {
  "common.close": "Close",
  "common.copy": "Copy",
  "common.copied": "Copied ✓",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.newTab": "(opens in a new tab)",
  "common.more": "+{n} more",
  "common.or": "or",
  "common.yesterday": "yesterday",
  "common.daysAgo": "{n} days ago",
  "common.hoursAgo": "{n} h ago",
  "common.minutesAgo": "{n} min ago",
  "common.justNow": "just now",
  "common.over30": "> 30 days",
  "card.score": "Match {n} out of 100",
  "f.remove": "Remove {item}",
}
