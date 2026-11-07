"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { Trash2 } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import deleteCandidateFact from "./mutations/deleteCandidateFact"

/** A fact as the page passes it: the date as an ISO string. */
export type FactRow = {
  id: string
  text: string
  topic: string | null
  job: { id: string; title: string; company: string } | null
  createdAt: string
}

/**
 * What the person said about themselves on points of a match (src/server/profile/facts.ts). Every
 * model that writes for them reads these; removing one keeps it out of what comes next.
 */
export function FactList({ initial }: { initial: FactRow[] }) {
  const { t } = useCopy()
  const toast = useToast()
  const [facts, setFacts] = useState(initial)
  const [remove, { isPending }] = useMutation(deleteCandidateFact)

  if (!facts.length) return null

  async function drop(id: string) {
    try {
      await remove({ id })
      setFacts((current) => current.filter((fact) => fact.id !== id))
      toast.show({ message: t("mt.facts.removed") })
    } catch {
      toast.show({ message: t("mt.facts.err"), tone: "danger" })
    }
  }

  return (
    <section className="card card--pad stack-sm" aria-labelledby="pr-facts">
      <h2 className="t-h3" id="pr-facts">
        {t("mt.facts.title")}
      </h2>
      <p className="t-sm muted">{t("mt.facts.sub")}</p>
      <ul className="pr-facts">
        {facts.map((fact) => (
          <li key={fact.id}>
            <div className="pr-facts__body">
              <p>{fact.text}</p>
              {fact.topic ? (
                <span className="t-caption muted">
                  {t("mt.facts.topic", { topic: fact.topic })}
                </span>
              ) : null}
              {fact.job ? (
                <Link className="link link--quiet t-caption" href={`/offers/${fact.job.id}/match`}>
                  {t("mt.facts.job", { title: fact.job.title, company: fact.job.company })}
                </Link>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="danger-ghost"
              icon={<Trash2 />}
              disabled={isPending}
              aria-label={t("mt.facts.removeOf", { text: fact.text.slice(0, 80) })}
              onClick={() => void drop(fact.id)}
            >
              {t("mt.facts.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
