"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { PairContext } from "@newrole/cv-core/views"
import { AddLetter } from "./AddLetter"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"

/**
 * Above a general CV or its general letter: the switch between the two, adding the letter when
 * the CV has none, and what to check in a letter the model wrote.
 */
export function PairBar({
  id,
  pair,
  flush,
}: {
  id: string
  pair: PairContext
  flush: () => Promise<boolean>
}) {
  const { t } = useCvCopy()
  const router = useRouter()
  const backend = useCvBackend()
  const { cvId, letterId, notes } = pair
  const letters = backend.letters
  const toCheck = letterId === id ? (notes?.unverified ?? []) : []
  return (
    <>
      <div className="cvt-bar">
        <nav className="tabs" aria-label={t("tl.gl.bar")}>
          <Link
            className="tab"
            href={backend.routes.document(cvId)}
            aria-current={cvId === id ? "page" : undefined}
          >
            {t("tl.bar.cv")}
          </Link>
          {letterId ? (
            <Link
              className="tab"
              href={backend.routes.document(letterId)}
              aria-current={letterId === id ? "page" : undefined}
            >
              {t("tl.bar.letter")}
            </Link>
          ) : null}
        </nav>
        {!letterId && letters ? (
          <AddLetter
            variant="soft"
            align="left"
            create={async (input) => {
              await flush()
              return letters.create({ cvId, ...input })
            }}
            onCreated={(letter) => router.push(backend.routes.document(letter))}
          />
        ) : null}
        <span className="cvt-bar__for">{t("tl.gl.barNote")}</span>
      </div>
      {toCheck.length ? (
        <div className="cvt-notice cvt-pair-check" role="status">
          <p>{t("tl.gl.check")}</p>
          <ul className="cvt-terms">
            {toCheck.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
