// From a CV in a PDF to a CV tailored to one offer: the tour at the top of the root README.
// Needs a model (Claude Code): tailoring and the second round each take most of a minute.
import path from "node:path"

/** A fresh account: the run starts at the first screen after sign-in. */
export const email = "alex@example.com"
/** cv: the CV as a PDF (alex-rivera-cv.html printed). offer: a public link to a job posting. */
export const needs = ["cv", "offer"]

export async function prepare({ goto }) {
  await goto("/start")
}

export async function run({ p, out, args, facts, mark, pause, click, nudge, scrollTo, goto }) {
  // 1. Upload the CV
  mark("start")
  await pause(900)
  const [chooser] = await Promise.all([
    p.waitForEvent("filechooser"),
    click(p.getByRole("button", { name: "Upload a CV or LinkedIn PDF" })),
  ])
  await chooser.setFiles(args.cv)
  mark("uploaded")
  await p.getByText("Here's how we see you").waitFor({ timeout: 120000 })
  mark("review")
  await pause(1600)
  mark("reviewShown")
  await p.getByRole("button", { name: "Save profile" }).click()
  await p.waitForURL((u) => !String(u).includes("/start"), { timeout: 30000 })

  // 2. A CV from the profile
  await goto("/cv")
  await scrollTo(p.getByRole("button", { name: "From profile" }), 420)
  mark("cvList")
  await pause(500)
  await click(p.getByRole("button", { name: "From profile" }))
  mark("cvClicked")
  await p.waitForURL(/\/cv\/[^/]+/, { timeout: 60000 })
  await p.waitForLoadState("networkidle")
  await p
    .getByRole("button", { name: "Got it" })
    .click({ timeout: 8000 })
    .catch(() => {})
  await nudge()
  await pause(700)
  mark("editor")
  await pause(1300)
  await click(p.locator("button", { hasText: "Colour band" }).first(), 0.5, 0.3)
  await pause(1900)
  mark("editorDone")

  // 3. An offer by its link
  await goto("/offers")
  const url = p.locator("main input[type=url]")
  await scrollTo(url, 330)
  mark("offers")
  await click(url, 0.2)
  await p.keyboard.type(args.offer, { delay: 14 })
  await pause(300)
  await click(p.getByRole("button", { name: "Read the offer" }))
  mark("offerReading")
  await p.getByRole("heading", { name: "Senior Frontend Engineer" }).waitFor({ timeout: 60000 })
  await p.waitForLoadState("networkidle")
  await nudge()
  mark("offerRead")
  await pause(1800)
  mark("offerShown")

  // 4. Tailor the CV
  await click(p.getByRole("link", { name: "Tailor CV and letter" }).first())
  await p.getByRole("button", { name: "Tailor CV", exact: true }).waitFor({ timeout: 30000 })
  await nudge()
  await pause(400)
  mark("tailorStart")
  await pause(700)
  await click(p.getByRole("button", { name: "Tailor CV", exact: true }))
  mark("tailorRunning")
  await p.waitForURL(/\/match/, { timeout: 600000 })
  await p.waitForLoadState("networkidle")
  await nudge()
  mark("match")
  facts.round1 = (await p.locator("main").innerText()).slice(0, 900)
  await pause(1700)
  mark("matchShown")

  // 5. What matches and what is missing
  await scrollTo(p.getByRole("heading", { name: "The offer's requirements" }), 90)
  await pause(1200)
  const missing = p.locator("li.mt-req", { hasText: /Playwright/ }).first()
  await scrollTo(missing, 260)
  await pause(900)
  mark("requirements")

  // 6. The person answers
  await click(missing.getByRole("button", { name: "Add a comment" }))
  await pause(300)
  await missing.locator("textarea").click()
  await p.keyboard.type(
    "Playwright: I wrote the end-to-end tests for the booking flow at Brightlane, since 2023.",
    { delay: 16 }
  )
  await pause(350)
  await click(missing.getByRole("button", { name: "Save" }))
  await missing.locator("textarea").waitFor({ state: "detached", timeout: 10000 })
  await pause(700)
  mark("commented")
  const question = p
    .locator("section, div")
    .filter({ has: p.getByRole("heading", { name: "Add numbers you know" }) })
    .last()
    .locator("li", { hasText: /page load times/ })
    .first()
  facts.question = (await question.count()) > 0
  if (facts.question) {
    await scrollTo(question, 260)
    await pause(500)
    await click(question.getByRole("button", { name: "Answer" }))
    await pause(300)
    await question.locator("textarea").click()
    await p.keyboard.type(
      "LCP on the booking pages went from 4.2 s to 1.8 s. I tracked Core Web Vitals and cut the bundle size.",
      { delay: 16 }
    )
    await pause(350)
    await click(question.getByRole("button", { name: "Save" }))
    await question.locator("textarea").waitFor({ state: "detached", timeout: 10000 })
    await pause(700)
  }
  mark("answered")

  // 7. The next round
  await pause(400)
  await click(p.getByRole("button", { name: "Improve the CV and check again" }))
  mark("round2Running")
  await p.getByText(/Round 2 in progress/).waitFor({ timeout: 20000 })
  for (let i = 0; i < 400; i++) {
    await pause(1000)
    const text = await p
      .locator("main")
      .innerText()
      .catch(() => "")
    if (/Round 2/.test(text) && !/in progress/.test(text)) break
  }
  await p.waitForLoadState("networkidle")
  await p.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }))
  await pause(1200)
  mark("round2")
  facts.round2 = (await p.locator("main").innerText()).slice(0, 900)
  await pause(2600)
  mark("round2Shown")

  // 8. The finished CV
  await click(p.getByRole("link", { name: "Open the CV" }))
  await p.waitForURL(/\/cv\/[^/]+/, { timeout: 60000 })
  await p.waitForLoadState("networkidle")
  await p
    .getByRole("button", { name: "Got it" })
    .click({ timeout: 3000 })
    .catch(() => {})
  await nudge()
  await pause(600)
  mark("tailoredCv")
  await pause(1800)
  const download = p.waitForEvent("download", { timeout: 60000 }).catch(() => null)
  await click(p.getByRole("button", { name: "Download PDF" }))
  const file = await download
  if (file) {
    facts.pdf = file.suggestedFilename()
    await file.saveAs(path.join(out, facts.pdf))
  }
  await pause(1500)
  mark("end")
}
