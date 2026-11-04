"use client"

import { Moon, Sun } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "@newrole/ui/Button"
import { useLocaleToggle, useThemeToggle } from "./SiteHeader"

export function FooterSwitches() {
  const { t } = useCopy()
  const theme = useThemeToggle()
  const switchLocale = useLocaleToggle()
  return (
    <div className="row">
      <Button
        variant="outline"
        size="sm"
        onClick={() => switchLocale()}
        aria-label={t("lang.switch")}
      >
        {t("lang.code")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        iconOnly
        aria-label={theme.dark ? t("theme.light") : t("theme.dark")}
        onClick={theme.toggle}
        icon={theme.dark ? <Sun /> : <Moon />}
      />
    </div>
  )
}
