"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import {
  ArrowRight,
  Building2,
  CheckCheck,
  CloudOff,
  FileUp,
  Heart,
  Info,
  SearchX,
  SquareTerminal,
  WifiOff,
  X,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, pluralKind, type CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Modal, useIsMobile, useToast } from "src/app/components/ds/interactive"
import { Banner, EmptyState, Skeleton } from "src/app/components/ds/primitives"
import getOfferDetail from "src/app/feedback/queries/getOfferDetail"
import getPreferenceSummary from "src/app/feedback/queries/getPreferenceSummary"
import watchCompany from "src/app/companies/mutations/watchCompany"
import type { OfferDetail } from "src/server/preferences/detail"
import type { PreferenceSummary } from "src/server/preferences/model"
import type { FeedbackPrompt, RankedOffer } from "src/server/preferences/types"
import type { FeedbackAspect } from "src/shared/feedback-aspects"
import { loadMoreFeed } from "../actions"
import type { FeedCard, FeedChunk } from "../feed-data"
import { filtersQuery, hasActiveFilters, type FeedFilters } from "../feed-filters"
import type { FeedTab, Verdict } from "../types"
import { useFeedback } from "../useFeedback"
import { FilterBar } from "./FilterBar"
import { AppliedStrip, CompactPrompt, LikePanel, LikedStrip, PassStrip } from "./Feedback"
import { OfferCard } from "./OfferCard"
import { OfferDetailView } from "./OfferDetail"
import { ShortcutsDialog } from "./Shortcuts"
import { SimilarRow } from "./Similar"
import { TastePanel, TasteStrip } from "./Taste"

type Phase = "idle" | "liking" | "liked" | "passing" | "applied" | "gone"
type SimilarState = {
  anchorId: string
  title: string
  company: string
  companyId: string | null
  basis: string | null
  offers: RankedOffer[]
  loading: boolean
}
type UndoStep = { jobId: string; prev: Verdict | null; prevPhase: Phase }

const SKIPS_KEY = "nr.like-skips"
const COACH_KEY = "nr.coach-done"
const CC_KEY = "nr.cc-seen"

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0) || 0
  } catch {
    return 0
  }
}
function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export type FeedProps = {
  tab: FeedTab
  filters: FeedFilters
  initial: FeedChunk
  totalOpen: number
  cities: { city: string; count: number }[]
  hasSession: boolean
  signedIn: boolean
  summary: PreferenceSummary | null
  watched: { count: number; fresh: number }
  welcome: boolean
  similarTo: { id: string; title: string; company: string; basis: string; offers: RankedOffer[] } | null
  initialOffer: string | null
}

export function Feed(props: FeedProps) {
  const { tab, filters, initial } = props
  const { t, locale } = useCopy()
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const mobile = useIsMobile()
  const feedback = useFeedback()
  const nf = numberFormat(locale)

  const [items, setItems] = useState<FeedCard[]>(initial.offers)
  const [next, setNext] = useState<string | null>(initial.next)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [verdicts, setVerdicts] = useState(new Map<string, Verdict>())
  const [phases, setPhases] = useState(new Map<string, Phase>())
  const [prompts, setPrompts] = useState(new Map<string, FeedbackPrompt | null>())
  const [rows, setRows] = useState<SimilarState[]>([])
  const [active, setActive] = useState(0)
  const [drawer, setDrawer] = useState<string | null>(props.initialOffer)
  const [detail, setDetail] = useState<OfferDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const [drawerLike, setDrawerLike] = useState(false)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const [summary, setSummary] = useState<PreferenceSummary | null>(props.summary)
  const [freshKeys, setFreshKeys] = useState(new Set<string>())
  const [keysOpen, setKeysOpen] = useState(false)
  const [coach, setCoach] = useState(false)
  const [ccCard, setCcCard] = useState(false)
  const [offline, setOffline] = useState(false)
  const [skips, setSkips] = useState(0)
  /** The active-card ring and kbd hints appear once the person uses the keyboard. */
  const [keyboard, setKeyboard] = useState(false)
  const [accountDismissed, setAccountDismissed] = useState(true)
  const likedHere = useMemo(
    () => [...verdicts.values()].filter((verdict) => verdict === "LIKE").length,
    [verdicts]
  )
  useEffect(() => setAccountDismissed(Boolean(readNumber("nr.account-banner"))), [])
  const [watching, setWatching] = useState(new Set<string>())
  const undo = useRef<UndoStep[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  /* ------------------------------------------------------------ one-offs */
  useEffect(() => {
    setSkips(readNumber(SKIPS_KEY))
    setCcCard(!readNumber(CC_KEY))
    if (props.welcome) {
      if (!readNumber(COACH_KEY)) setCoach(true)
      const url = new URL(window.location.href)
      url.searchParams.delete("welcome")
      window.history.replaceState(window.history.state, "", url.toString())
    }
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(
    () => items.filter((item) => (phases.get(item.id) ?? "idle") !== "gone"),
    [items, phases]
  )
  const idle = useMemo(
    () => visible.filter((item) => (phases.get(item.id) ?? "idle") === "idle"),
    [visible, phases]
  )

  const phaseOf = useCallback((id: string): Phase => phases.get(id) ?? "idle", [phases])
  const setPhase = useCallback((id: string, phase: Phase) => {
    setPhases((current) => new Map(current).set(id, phase))
  }, [])
  const setVerdict = useCallback((id: string, verdict: Verdict | null) => {
    setVerdicts((current) => {
      const copy = new Map(current)
      if (verdict) copy.set(id, verdict)
      else copy.delete(id)
      return copy
    })
  }, [])

  const refreshTaste = useCallback(async () => {
    try {
      const before = new Set(summary?.likes.map((item) => item.key) ?? [])
      const fresh = await invoke(getPreferenceSummary, { locale })
      setSummary(fresh)
      setFreshKeys(new Set(fresh.likes.map((item) => item.key).filter((key) => !before.has(key))))
    } catch {}
  }, [locale, summary])

  /* ------------------------------------------------------- active / focus */
  const focusCard = useCallback(
    (index: number) => {
      const target = idle[Math.max(0, Math.min(idle.length - 1, index))]
      if (!target) return
      setActive(idle.indexOf(target))
      const node = cardRefs.current.get(target.id)
      node?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      node?.querySelector<HTMLElement>(".ocard__title a")?.focus({ preventScroll: true })
    },
    [idle]
  )
  const activeOffer = idle[active] ?? null

  /* ------------------------------------------------------------- similar */
  const loadSimilar = useCallback(
    async (offer: FeedCard, aspects?: FeedbackAspect[], saved?: boolean) => {
      const toastId = `sim-${offer.id}`
      if (saved) toast.show({ id: toastId, message: t("toast.saving"), duration: 0 })
      setRows((current) => [
        {
          anchorId: offer.id,
          title: offer.title,
          company: offer.company,
          companyId: offer.companyId,
          basis: null,
          offers: [],
          loading: true,
        },
        ...current.filter((row) => row.anchorId !== offer.id),
      ].slice(0, 2))
      const result = await feedback.similar(offer.id, aspects)
      setRows((current) =>
        current.map((row) =>
          row.anchorId === offer.id
            ? { ...row, loading: false, offers: result?.offers ?? [], basis: result?.basis ?? null }
            : row
        )
      )
      if (saved) {
        const n = result?.offers.length ?? 0
        toast.update(toastId, {
          message: n ? `${t("toast.saving").split(".")[0]}. ${t("toast.found", { n })}` : t("toast.liked"),
          duration: 5000,
          action: n
            ? {
                label: t("toast.show"),
                onClick: () => {
                  const node = document.getElementById(`similar-${offer.id}`)
                  node?.scrollIntoView({ behavior: "smooth", block: "center" })
                  node?.focus({ preventScroll: true })
                },
              }
            : undefined,
        })
      }
    },
    [feedback, t, toast]
  )

  /* ------------------------------------------------------------ verdicts */
  const fail = useCallback(
    (offer: FeedCard, prev: Verdict | null, prevPhase: Phase) => {
      setVerdict(offer.id, prev)
      setPhase(offer.id, prevPhase)
      toast.show({ message: t("err.save"), tone: "danger" })
    },
    [setPhase, setVerdict, t, toast]
  )

  const advanceFrom = useCallback(
    (offer: FeedCard) => {
      const index = idle.findIndex((item) => item.id === offer.id)
      window.setTimeout(() => {
        const node = document.querySelector<HTMLElement>(
          `[data-offer="${idle[index + 1]?.id ?? ""}"] .ocard__title a`
        )
        node?.focus({ preventScroll: true })
      }, 60)
      if (index >= 0) setActive(index)
    },
    [idle]
  )

  const decide = useCallback(
    async (offer: FeedCard, verdict: Verdict, opts: { fromDrawer?: boolean } = {}) => {
      const prev = verdicts.get(offer.id) ?? null
      const prevPhase = phaseOf(offer.id)
      if (prev === verdict) {
        // toggle off
        setVerdict(offer.id, null)
        setPhase(offer.id, "idle")
        try {
          await feedback.clear(offer.id)
        } catch {
          fail(offer, prev, prevPhase)
        }
        return
      }
      undo.current = [...undo.current, { jobId: offer.id, prev, prevPhase }].slice(-30)
      setVerdict(offer.id, verdict)
      if (verdict === "LIKE") {
        setPhase(offer.id, "liking")
        if (!prompts.has(offer.id)) {
          void feedback.prompt(offer.id).then((prompt) =>
            setPrompts((current) => new Map(current).set(offer.id, prompt))
          )
        }
        if (opts.fromDrawer) setDrawerLike(true)
        else if (mobile) setSheetFor(offer.id)
      } else if (verdict === "DISLIKE") {
        setPhase(offer.id, "passing")
        if (!prompts.has(offer.id)) {
          void feedback.prompt(offer.id).then((prompt) =>
            setPrompts((current) => new Map(current).set(offer.id, prompt))
          )
        }
        advanceFrom(offer)
      } else {
        setPhase(offer.id, "applied")
        toast.show({ message: t("toast.applied") })
        window.setTimeout(() => {
          setPhases((current) =>
            current.get(offer.id) === "applied" ? new Map(current).set(offer.id, "gone") : current
          )
        }, 5000)
        advanceFrom(offer)
      }
      try {
        await feedback.save({ jobId: offer.id, verdict })
      } catch {
        fail(offer, prev, prevPhase)
      }
    },
    [advanceFrom, fail, feedback, mobile, phaseOf, prompts, setPhase, setVerdict, t, toast, verdicts]
  )

  const undoLast = useCallback(async () => {
    const step = undo.current.pop()
    if (!step) return
    setVerdict(step.jobId, step.prev)
    setPhase(step.jobId, step.prevPhase === "liking" ? "idle" : step.prevPhase)
    setRows((current) => current.filter((row) => row.anchorId !== step.jobId))
    try {
      if (step.prev) await feedback.save({ jobId: step.jobId, verdict: step.prev })
      else await feedback.clear(step.jobId)
      toast.show({ message: t("toast.undone") })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    }
  }, [feedback, setPhase, setVerdict, t, toast])

  const finishLike = useCallback(
    async (offer: FeedCard, answer: { aspects: FeedbackAspect[]; tags: string[]; note: string | null } | null) => {
      setSheetFor(null)
      setDrawerLike(false)
      setPhase(offer.id, "liked")
      if (answer) {
        setSkips(0)
        writeValue(SKIPS_KEY, "0")
        try {
          await feedback.save({ jobId: offer.id, verdict: "LIKE", ...answer })
        } catch {
          toast.show({ message: t("err.save"), tone: "danger" })
        }
        void loadSimilar(offer, answer.aspects, true)
      } else {
        const count = skips + 1
        setSkips(count)
        writeValue(SKIPS_KEY, String(count))
        toast.show({ message: t("toast.liked"), action: { label: t("act.undo"), onClick: () => void undoLast() } })
        void loadSimilar(offer)
      }
      void refreshTaste()
      advanceFrom(offer)
    },
    [advanceFrom, feedback, loadSimilar, refreshTaste, setPhase, skips, t, toast, undoLast]
  )

  /* -------------------------------------------------------------- drawer */
  const openDrawer = useCallback(
    (id: string) => {
      setDrawer(id)
      setDrawerLike(false)
      const url = new URL(window.location.href)
      url.searchParams.set("offer", id)
      window.history.pushState({ ...window.history.state, nrOffer: id }, "", url.toString())
    },
    []
  )
  const closeDrawer = useCallback(() => {
    setDrawer(null)
    setDrawerLike(false)
    const url = new URL(window.location.href)
    if (url.searchParams.has("offer")) {
      url.searchParams.delete("offer")
      window.history.replaceState(window.history.state, "", url.toString())
    }
  }, [])

  useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get("offer")
      setDrawer(id)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (!drawer) return
    let live = true
    setDetail(null)
    setDetailError(false)
    invoke(getOfferDetail, { jobId: drawer, locale }).then(
      (value) => live && setDetail(value),
      () => live && setDetailError(true)
    )
    return () => {
      live = false
    }
  }, [drawer, locale])

  const drawerIndex = drawer ? visible.findIndex((item) => item.id === drawer) : -1
  const drawerOffer: FeedCard | null =
    drawerIndex >= 0
      ? visible[drawerIndex]
      : detail
        ? ({ ...detail.offer, companyId: null, level: null } as FeedCard)
        : null
  const goDrawer = (delta: number) => {
    const target = visible[drawerIndex + delta]
    if (target) {
      setDrawer(target.id)
      setDrawerLike(false)
      const url = new URL(window.location.href)
      url.searchParams.set("offer", target.id)
      window.history.replaceState(window.history.state, "", url.toString())
    }
  }

  /* ----------------------------------------------------------- keyboard */
  const keyState = useRef({ activeOffer, decide, undoLast, focusCard, active, drawerOffer, drawer, openDrawer, goDrawer })
  keyState.current = { activeOffer, decide, undoLast, focusCard, active, drawerOffer, drawer, openDrawer, goDrawer }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      try {
        if (localStorage.getItem("nr.shortcuts") === "off") return
      } catch {}
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      if (target?.closest(".like-panel")) return
      const state = keyState.current
      const inDrawer = Boolean(state.drawer)
      if (document.querySelector(".modal") && !inDrawer) return
      const key = event.key
      if (key === "?") {
        event.preventDefault()
        setKeysOpen(true)
        return
      }
      if (inDrawer) {
        const offer = state.drawerOffer
        if (!offer) return
        if (key === "k" || key === "K") {
          event.preventDefault()
          void state.decide(offer, "LIKE", { fromDrawer: true })
        } else if (key === "j" || key === "J") {
          event.preventDefault()
          void state.decide(offer, "DISLIKE")
          state.goDrawer(1)
        } else if (key === "a" || key === "A") {
          event.preventDefault()
          void state.decide(offer, "APPLIED")
          state.goDrawer(1)
        }
        return
      }
      const offer = state.activeOffer
      if (["j", "k", "a", "J", "K", "A", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab"].includes(key)) {
        setKeyboard(true)
      }
      if (key === "/") {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (key === "z" || key === "Z") {
        event.preventDefault()
        void state.undoLast()
      } else if (!offer) {
        return
      } else if (key === "k" || key === "K" || key === "ArrowRight") {
        event.preventDefault()
        void state.decide(offer, "LIKE")
      } else if (key === "j" || key === "J" || key === "ArrowLeft") {
        event.preventDefault()
        void state.decide(offer, "DISLIKE")
      } else if (key === "a" || key === "A") {
        event.preventDefault()
        void state.decide(offer, "APPLIED")
      } else if (key === "ArrowDown") {
        event.preventDefault()
        state.focusCard(state.active + 1)
      } else if (key === "ArrowUp") {
        event.preventDefault()
        state.focusCard(state.active - 1)
      } else if (key === "Enter" && event.shiftKey) {
        event.preventDefault()
        if (offer.url) window.open(offer.url, "_blank", "noopener")
      } else if ((key === "Enter" && !target?.closest("button, a")) || key === "o" || key === "O") {
        event.preventDefault()
        state.openDrawer(offer.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ------------------------------------------------------------ more */
  async function more() {
    if (!next) return
    setLoadingMore(true)
    setLoadError(false)
    try {
      const chunk = await loadMoreFeed(tab, filters, next, locale)
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id))
        return [...current, ...chunk.offers.filter((item) => !seen.has(item.id))]
      })
      setNext(chunk.next)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  // infinite scroll with the button as fallback
  const sentinel = useRef<HTMLDivElement>(null)
  const moreRef = useRef(more)
  moreRef.current = more
  useEffect(() => {
    const node = sentinel.current
    if (!node || !next) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingMore && !loadError) void moreRef.current()
      },
      { rootMargin: "600px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [next, loadingMore, loadError])

  async function watch(companyId: string | null, name: string) {
    if (!companyId) return
    setWatching((current) => new Set(current).add(companyId))
    try {
      await invoke(watchCompany, { companyId, source: "user" })
    } catch {
      setWatching((current) => {
        const copy = new Set(current)
        copy.delete(companyId)
        return copy
      })
      toast.show({ message: `${t("err.save")} (${name})`, tone: "danger" })
    }
  }

  /* -------------------------------------------------------------- render */
  const noProfile = tab === "foryou" && !initial.hasProfile && !initial.hasFeedback
  const count = tab === "foryou" ? initial.total ?? 0 : props.totalOpen
  const countKey = (tab === "foryou" ? `feed.count.${pluralKind(count, locale)}` : `feed.countAll.${pluralKind(count, locale)}`) as CopyKey
  const filtered = hasActiveFilters(filters)
  const allDecided = !noProfile && items.length > 0 && visible.length === 0 && !next
  const similarMode = props.similarTo

  const tabsRow = (
    <div className="feed-tabs-row">
      <nav className="tabs" aria-label={t("feed.title")}>
        <Link className="tab" href={filtersQuery(filters, "foryou")} aria-current={tab === "foryou" ? "page" : undefined}>
          {t("feed.title")}
        </Link>
        <Link className="tab" href={filtersQuery(filters, "all")} aria-current={tab === "all" ? "page" : undefined}>
          {t("feed.all")}
        </Link>
      </nav>
      {tab === "foryou" && !noProfile ? (
      <select
        className="select select--sm"
        aria-label={t("feed.sort")}
        value={filters.sort}
        onChange={(event) =>
          router.push(filtersQuery({ ...filters, sort: event.target.value === "new" ? "new" : "fit" }, tab), { scroll: false })
        }
      >
        <option value="fit">{t("feed.sort.fit")}</option>
        <option value="new">{t("feed.sort.new")}</option>
      </select>
      ) : null}
    </div>
  )

  const renderItem = (offer: FeedCard, index: number) => {
    const phase = phaseOf(offer.id)
    const verdict = verdicts.get(offer.id) ?? null
    const row = rows.find((item) => item.anchorId === offer.id)
    const prompt = prompts.get(offer.id) ?? null
    const promptLoading = !prompts.has(offer.id)
    let body: React.ReactNode
    if (phase === "liked") {
      body = (
        <LikedStrip
          title={offer.title}
          company={offer.company}
          onUndo={() => {
            undo.current = undo.current.filter((step) => step.jobId !== offer.id)
            undo.current.push({ jobId: offer.id, prev: null, prevPhase: "idle" })
            void undoLast()
          }}
        />
      )
    } else if (phase === "passing") {
      body = (
        <PassStrip
          title={offer.title}
          prompt={prompt}
          onReason={(aspect, tag) => {
            const prev = undo.current
            void feedback
              .save({ jobId: offer.id, verdict: "DISLIKE", aspects: [aspect], tags: tag ? [tag] : [] })
              .catch(() => {
                undo.current = prev
                toast.show({ message: t("err.save"), tone: "danger" })
              })
            void refreshTaste()
          }}
          onUndo={() => {
            undo.current = undo.current.filter((step) => step.jobId !== offer.id)
            undo.current.push({ jobId: offer.id, prev: null, prevPhase: "idle" })
            void undoLast()
          }}
          onDone={() => setPhase(offer.id, "gone")}
        />
      )
    } else if (phase === "applied") {
      body = (
        <AppliedStrip
          onUndo={() => {
            undo.current = undo.current.filter((step) => step.jobId !== offer.id)
            undo.current.push({ jobId: offer.id, prev: null, prevPhase: "idle" })
            void undoLast()
          }}
        />
      )
    } else {
      const liking = phase === "liking"
      const fatigue = skips >= 3
      body = (
        <OfferCard
          ref={(node) => {
            if (node) cardRefs.current.set(offer.id, node)
            else cardRefs.current.delete(offer.id)
          }}
          offer={offer}
          verdict={verdict}
          active={keyboard && activeOffer?.id === offer.id && !liking}
          showScore={tab === "foryou" || offer.score != null}
          swipe={mobile}
          onOpen={(item) => openDrawer(item.id)}
          onVerdict={(item, next) => void decide(offer, next)}
          onFocusCard={() => {
            const at = idle.findIndex((item) => item.id === offer.id)
            if (at >= 0) setActive(at)
          }}
          onSwipe={(item, direction) => void decide(offer, direction > 0 ? "LIKE" : "DISLIKE")}
        >
          {liking && !mobile && !(drawer === offer.id) ? (
            fatigue ? (
              <CompactPrompt
                prompt={prompt}
                onPick={(chip) => void finishLike(offer, { aspects: [chip.aspect], tags: chip.tag ? [chip.tag] : [], note: null })}
                onMore={() => setSkips(0)}
              />
            ) : (
              <LikePanel
                idPrefix={offer.id}
                prompt={prompt}
                loading={promptLoading}
                onSave={(answer) => void finishLike(offer, answer)}
                onSkip={() => void finishLike(offer, null)}
              />
            )
          ) : null}
        </OfferCard>
      )
    }
    return (
      <li key={offer.id} style={{ listStyle: "none" }} className="stack-sm">
        {body}
        {row && phase === "liked" ? (
          <SimilarRow
            anchorId={row.anchorId}
            title={row.title}
            company={row.company}
            basis={row.basis}
            offers={row.offers}
            loading={row.loading}
            verdicts={verdicts}
            onOpen={openDrawer}
            onVerdict={(target, next) => {
              setVerdict(target.id, next)
              void feedback.save({ jobId: target.id, verdict: next }).catch(() => {
                setVerdict(target.id, null)
                toast.show({ message: t("err.save"), tone: "danger" })
              })
            }}
            onWatch={row.companyId ? () => void watch(row.companyId, row.company) : undefined}
            watching={row.companyId ? watching.has(row.companyId) : false}
          />
        ) : null}
        {index === 4 ? <WatchedCard watched={props.watched} inline /> : null}
      </li>
    )
  }

  const sheetOffer = sheetFor ? items.find((item) => item.id === sheetFor) ?? null : null

  return (
    <div className="feed">
      {offline ? (
        <div className="offline" role="status">
          <WifiOff width={16} height={16} aria-hidden style={{ display: "inline", marginRight: 8, verticalAlign: -3 }} />
          {t("offline")}
        </div>
      ) : null}
      <header className="feed-head">
        <div className="feed-head__top">
          <h1 className="t-h1">{tab === "foryou" ? t("feed.title") : t("feed.all")}</h1>
          {!noProfile ? <span className="feed-head__count">{t(countKey, { n: nf.format(count) })}</span> : null}
        </div>
        {tabsRow}
      </header>
      <FilterBar
        filters={filters}
        tab={tab}
        cities={props.cities}
        onShortcuts={() => setKeysOpen(true)}
        searchRef={searchRef}
      />

      <div className="feed-layout">
        <div className="feed-main stack">
          {tab === "foryou" && !noProfile ? <TasteStrip summary={summary} onChanged={() => void refreshTaste()} /> : null}
          {coach ? (
            <div className="coach" role="status">
              <Heart aria-hidden />
              <p>{t("onb.coach")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCoach(false)
                  writeValue(COACH_KEY, "1")
                }}
              >
                {t("onb.coach.ok")}
              </Button>
            </div>
          ) : null}
          {!props.signedIn && !accountDismissed && (summary?.liked ?? 0) + likedHere >= 3 ? (
            <Banner tone="info" icon={<Heart aria-hidden />}>
              <p>{t("account.banner")}</p>
              <div className="row">
                <ButtonLink href={`/login?returnTo=${encodeURIComponent(pathname)}`} variant="secondary" size="sm">
                  {t("account.banner.email")}
                </ButtonLink>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAccountDismissed(true)
                    writeValue("nr.account-banner", "1")
                  }}
                >
                  {t("common.close")}
                </Button>
              </div>
            </Banner>
          ) : null}
          {props.totalOpen > 0 && props.totalOpen < 1000 ? (
            <Banner tone="info" icon={<Info aria-hidden />}>
              <p>{t("feed.indexing", { n: nf.format(props.totalOpen) })}</p>
            </Banner>
          ) : null}
          {similarMode ? (
            <div className="stack">
              <div className="row">
                <span className="chip chip--on">
                  <span>{t("feed.similarTo", { title: `${similarMode.title} · ${similarMode.company}` })}</span>
                  <Link className="chip__x" href={pathname} aria-label={t("feed.similarClear")}>
                    <X width={14} height={14} aria-hidden />
                  </Link>
                </span>
                {similarMode.basis ? <span className="t-sm muted">{similarMode.basis}</span> : null}
              </div>
              <div className="mini-grid">
                {similarMode.offers.map((offer) => (
                  <SimilarCard key={offer.id} offer={offer} onOpen={openDrawer} />
                ))}
              </div>
            </div>
          ) : noProfile ? (
            <EmptyState icon={<FileUp />} title={t("empty.noProfile.t")} body={t("empty.noProfile.b")}>
              <ButtonLink href="/start" variant="primary" iconRight={<ArrowRight />}>
                {t("empty.noProfile.cta")}
              </ButtonLink>
              <Link className="link" href={filtersQuery(filters, "all")}>
                {t("empty.noProfile.alt")}
              </Link>
            </EmptyState>
          ) : allDecided ? (
            <EmptyState icon={<CheckCheck />} title={t("empty.done.t")} body={t("empty.done.b")}>
              <ButtonLink href="/companies" variant="primary" icon={<Building2 />}>
                {t("empty.done.cta")}
              </ButtonLink>
            </EmptyState>
          ) : items.length === 0 && !next ? (
            <EmptyState icon={<SearchX />} title={t("empty.filters.t")} body={t("empty.filters.b")}>
              {filtered ? (
                <ButtonLink href={tab === "all" ? "/jobs?tab=all" : "/jobs"} variant="outline">
                  {t("filter.clearAll")}
                </ButtonLink>
              ) : null}
              <Link className="link" href="/profile">
                {t("empty.filters.edit")}
              </Link>
            </EmptyState>
          ) : (
            <>
              <ul className="feed-list" aria-label={tab === "foryou" ? t("feed.title") : t("feed.all")}>
                {visible.map(renderItem)}
              </ul>
              {loadingMore ? (
                <div className="feed-list" aria-hidden>
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : null}
              {loadError ? (
                <div className="empty">
                  <span className="empty__icon">
                    <CloudOff aria-hidden />
                  </span>
                  <p role="alert">{t("err.feed")}</p>
                  <Button variant="primary" onClick={() => void more()}>
                    {t("common.retry")}
                  </Button>
                </div>
              ) : null}
              <div ref={sentinel} />
              {next && !loadError ? (
                <div className="feed-more">
                  <Button variant="outline" loading={loadingMore} onClick={() => void more()}>
                    {t("feed.more")}
                  </Button>
                </div>
              ) : !next && items.length ? (
                <p className="t-sm subtle" style={{ textAlign: "center", padding: "16px 0" }}>
                  {t("feed.end")}
                </p>
              ) : null}
            </>
          )}
        </div>
        <aside className="rail" aria-label={t("taste.title")}>
          {props.hasSession ? (
            <TastePanel summary={summary} freshKeys={freshKeys} onChanged={() => void refreshTaste()} />
          ) : null}
          <WatchedCard watched={props.watched} />
          {ccCard ? (
            <Link className="card card--hover rail-link" href="/connect" onClick={() => writeValue(CC_KEY, "1")}>
              <SquareTerminal aria-hidden />
              <span>{t("cc.rail")}</span>
              <ArrowRight width={16} height={16} aria-hidden />
            </Link>
          ) : null}
        </aside>
      </div>

      <Modal
        open={Boolean(drawer)}
        onClose={closeDrawer}
        kind="drawer"
        labelledBy="od-title"
        initialFocus=".od__top button"
      >
        <div style={{ overflowY: "auto", height: "100%" }}>
          <OfferDetailView
            mode="drawer"
            titleId="od-title"
            detail={detail && detail.offer.id === drawer ? detail : null}
            loading={!detail}
            error={detailError}
            verdict={drawer ? verdicts.get(drawer) ?? (detail?.feedback?.verdict as Verdict | undefined) ?? null : null}
            onVerdict={(verdict) => {
              if (!drawerOffer) return
              void decide(drawerOffer, verdict, { fromDrawer: true })
              if (verdict !== "LIKE") goDrawer(1)
            }}
            panel={
              drawerLike && drawerOffer ? (
                <LikePanel
                  idPrefix={`d-${drawerOffer.id}`}
                  prompt={prompts.get(drawerOffer.id) ?? null}
                  loading={!prompts.has(drawerOffer.id)}
                  onSave={(answer) => void finishLike(drawerOffer, answer)}
                  onSkip={() => void finishLike(drawerOffer, null)}
                />
              ) : null
            }
            onClose={closeDrawer}
            onPrev={drawerIndex > 0 ? () => goDrawer(-1) : drawerIndex === -1 ? undefined : null}
            onNext={drawerIndex >= 0 && drawerIndex < visible.length - 1 ? () => goDrawer(1) : drawerIndex === -1 ? undefined : null}
            onOpenOther={(id) => openDrawer(id)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(sheetOffer)}
        onClose={() => sheetOffer && void finishLike(sheetOffer, null)}
        kind="sheet"
        labelledBy={sheetOffer ? `s-${sheetOffer.id}-like-title` : undefined}
      >
        {sheetOffer ? (
          <div className="modal__body" style={{ paddingTop: 12 }}>
            <LikePanel
              idPrefix={`s-${sheetOffer.id}`}
              prompt={prompts.get(sheetOffer.id) ?? null}
              loading={!prompts.has(sheetOffer.id)}
              onSave={(answer) => void finishLike(sheetOffer, answer)}
              onSkip={() => void finishLike(sheetOffer, null)}
            />
          </div>
        ) : null}
      </Modal>

      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
    </div>
  )
}

function SimilarCard({ offer, onOpen }: { offer: RankedOffer; onOpen: (id: string) => void }) {
  const { t } = useCopy()
  return (
    <button type="button" className="mini" onClick={() => onOpen(offer.id)}>
      <span className="mini__top">
        <strong>{offer.company}</strong>
        <span className="score-pill">{offer.score}</span>
      </span>
      <span className="mini__title">{offer.title}</span>
      <span className="mini__facts">{[offer.salary, offer.location].filter(Boolean).join(" · ") || t("pay.none")}</span>
      <span className="t-caption subtle">{offer.reasons[0] ?? ""}</span>
    </button>
  )
}

function WatchedCard({ watched, inline }: { watched: { count: number; fresh: number }; inline?: boolean }) {
  const { t } = useCopy()
  const text = watched.fresh
    ? t("rail.watch.some", { n: watched.fresh })
    : watched.count
      ? t("rail.watch.total", { n: watched.count })
      : t("rail.watch.none")
  return (
    <Link className={`card card--hover rail-link${inline ? " rail-link--inline" : ""}`} href="/companies">
      <Building2 aria-hidden />
      <span>{text}</span>
      <ArrowRight width={16} height={16} aria-hidden />
    </Link>
  )
}

export function CardSkeleton() {
  return (
    <div className="ocard" aria-hidden style={{ cursor: "default" }}>
      <div className="row">
        <Skeleton w={28} h={28} r={8} />
        <Skeleton w={160} h={14} />
      </div>
      <div className="ocard__body">
        <div className="stack-sm">
          <Skeleton w="70%" h={20} />
          <Skeleton w="50%" h={14} />
          <Skeleton w="60%" h={12} />
          <Skeleton w="55%" h={12} />
        </div>
        <Skeleton w={52} h={52} r={999} />
      </div>
      <div className="row" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Skeleton w={110} h={32} r={8} />
        <Skeleton w={130} h={32} r={8} />
      </div>
    </div>
  )
}
