// The camera for demo videos of newrole.it: a headless Chrome with a drawn mouse pointer, every frame
// Chrome paints saved with its time, and named moments ("marks") that build.mjs cuts between.
// A video's own steps live in its scenario file (videos/<name>/scenario.mjs); see README.md here.
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"

const W = 1280
const H = 704

const INIT = `
(() => {
  const css = "nextjs-portal{display:none!important}" +
    "#demo-cursor{position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;pointer-events:none;" +
    "background:url(\\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M3 2l15 8.5-6.6 1.6L8.6 19z' fill='%2315161d' stroke='white' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E\\") no-repeat}" +
    "#demo-cursor.down::after{content:'';position:absolute;left:-13px;top:-13px;width:30px;height:30px;border-radius:50%;background:rgba(91,61,245,.35)}"
  const place = () => {
    if (!document.documentElement || document.getElementById("demo-cursor")) return
    const style = document.createElement("style"); style.textContent = css; document.documentElement.appendChild(style)
    const c = document.createElement("div"); c.id = "demo-cursor"; document.documentElement.appendChild(c)
    const move = (x, y) => { c.style.transform = "translate(" + x + "px," + y + "px)"; try { sessionStorage.setItem("demo-cursor", x + "," + y) } catch {} }
    try { const [x, y] = (sessionStorage.getItem("demo-cursor") || "640,360").split(",").map(Number); move(x, y) } catch {}
    addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true)
    addEventListener("mousedown", () => c.classList.add("down"), true)
    addEventListener("mouseup", () => setTimeout(() => c.classList.remove("down"), 180), true)
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", place); else place()
})()
`

/**
 * Records one scenario. `scenario` exports `run(camera)` and, optionally, `prepare(camera)` for steps
 * off camera and `email` for the account. Writes frames/*.jpg, frames.json, marks.json and facts.json
 * into `out`, after every mark, so a run that fails late keeps what it has.
 */
export async function record({ base, out, scenario, args }) {
  fs.mkdirSync(path.join(out, "frames"), { recursive: true })
  const browser = await chromium.launch({ channel: "chrome" })
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    locale: "en-GB",
    acceptDownloads: true,
  })
  await ctx.addInitScript(INIT)
  const p = await ctx.newPage()
  const marks = {}
  const frames = []
  const facts = {}
  const save = () => {
    fs.writeFileSync(path.join(out, "frames.json"), JSON.stringify(frames))
    fs.writeFileSync(path.join(out, "marks.json"), JSON.stringify(marks, null, 2))
    fs.writeFileSync(path.join(out, "facts.json"), JSON.stringify(facts, null, 2))
  }
  const mark = (name) => {
    marks[name] = Date.now() / 1000
    console.log("mark", name)
    save()
  }
  const pause = (ms) => p.waitForTimeout(ms)
  let pos = { x: 640, y: 360 }
  const moveTo = async (locator, dx = 0.5, dy = 0.5) => {
    await locator.scrollIntoViewIfNeeded()
    let box = await locator.boundingBox()
    // The match page keeps a "Next round" bar over the bottom of the window: stay clear of it.
    if (box.y + box.height > H - 250) {
      await p.evaluate(
        (dy) => scrollBy({ top: dy, behavior: "smooth" }),
        box.y + box.height - (H - 290)
      )
      await pause(650)
      box = await locator.boundingBox()
    }
    pos = { x: box.x + box.width * dx, y: box.y + box.height * dy }
    await p.mouse.move(pos.x, pos.y, { steps: 22 })
    await pause(180)
  }
  const click = async (locator, dx, dy) => {
    await moveTo(locator, dx, dy)
    await p.mouse.down()
    await pause(90)
    await p.mouse.up()
  }
  // A new page draws the pointer where it last was only after the mouse moves.
  const nudge = async () => {
    await p.mouse.move(pos.x + 1, pos.y)
    await p.mouse.move(pos.x, pos.y)
  }
  const scrollTo = async (locator, offset = 140) => {
    await locator.evaluate(
      (el, o) =>
        scrollTo({ top: el.getBoundingClientRect().top + scrollY - o, behavior: "smooth" }),
      offset
    )
    await pause(900)
  }
  const goto = async (pathname) => {
    await p.goto(base + pathname, { waitUntil: "networkidle" })
    await nudge()
  }
  const camera = { p, base, out, args, facts, mark, pause, moveTo, click, nudge, scrollTo, goto }

  // Off camera: locally an email opens the account.
  if (scenario.email) {
    await p.goto(base + "/login", { waitUntil: "networkidle" })
    await p.fill("input[type=email]", args.email ?? scenario.email)
    await p.click("button[type=submit]")
    await p.waitForURL(/setup|start|offers|cv/, { timeout: 30000 })
  }
  if (scenario.prepare) await scenario.prepare(camera)

  const cdp = await ctx.newCDPSession(p)
  let n = 0
  cdp.on("Page.screencastFrame", (f) => {
    const file = `frames/${String(n++).padStart(5, "0")}.jpg`
    fs.writeFile(path.join(out, file), Buffer.from(f.data, "base64"), () => {})
    frames.push({ file, t: f.metadata.timestamp })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, everyNthFrame: 1 })
  await pause(600)
  try {
    await scenario.run(camera)
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {})
    await pause(500)
    save()
    console.log("frames", frames.length)
    await browser.close()
  }
}
