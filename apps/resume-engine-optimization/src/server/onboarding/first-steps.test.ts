import { describe, expect, it } from "vitest"
import { firstSteps, nextFirstStep, type FirstStepFacts } from "./first-steps"

/** Right after /setup: a profile, nothing else. */
function fresh(overrides: Partial<FirstStepFacts> = {}): FirstStepFacts {
  return { profile: true, offers: [], applications: 0, ...overrides }
}

const offer = (jobId: string, cvId: string | null = null, application: string | null = null) => ({
  jobId,
  cvId,
  application: application ? { id: application } : null,
})

describe("firstSteps", () => {
  it("lists the loop in the order a person does it", () => {
    expect(firstSteps(fresh()).map((step) => step.id)).toEqual([
      "profile",
      "offer",
      "tailor",
      "apply",
    ])
  })

  it("starts with the profile when there is none", () => {
    const steps = firstSteps(fresh({ profile: false }))
    expect(nextFirstStep(steps)).toMatchObject({ id: "profile", href: "/start" })
  })

  it("sends a person with a profile to add an offer", () => {
    const steps = firstSteps(fresh())
    expect(nextFirstStep(steps)).toMatchObject({ id: "offer", href: "/offers" })
    expect(steps.find((step) => step.id === "tailor")?.href).toBe("/offers")
  })

  it("tailors the newest offer that has no CV yet", () => {
    const steps = firstSteps(fresh({ offers: [offer("new"), offer("old", "cv1")] }))
    expect(steps.find((step) => step.id === "tailor")).toMatchObject({
      done: true,
      href: "/cv/cv1",
    })
    const untailored = firstSteps(fresh({ offers: [offer("new"), offer("old")] }))
    expect(nextFirstStep(untailored)).toMatchObject({ id: "tailor", href: "/offers/new/cv" })
  })

  it("sends a tailored offer to its page to record the application", () => {
    const steps = firstSteps(fresh({ offers: [offer("a", "cv1")] }))
    expect(nextFirstStep(steps)).toMatchObject({ id: "apply", href: "/offers/a" })
  })

  it("counts an application from anywhere and is done after it", () => {
    const steps = firstSteps(fresh({ offers: [offer("a", "cv1", "app1")], applications: 1 }))
    expect(steps.every((step) => step.done)).toBe(true)
    expect(nextFirstStep(steps)).toBeNull()
    expect(steps.find((step) => step.id === "apply")?.href).toBe("/applications")
  })
})
