// Cuts a take from record.mjs into a video: node build.mjs <take dir> <script.json> <out dir>
// The script names the clips (between two marks, or a card) and each scene's caption. The caption strip
// under the picture lights up word by word, karaoke style. ffmpeg here has no text filter, so Chrome
// draws the cards and the strips, sharp puts every frame together and ffmpeg only encodes.
import { chromium } from "playwright"
import sharp from "sharp"
import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const [take, scriptFile, out] = process.argv.slice(2)
const script = JSON.parse(fs.readFileSync(scriptFile, "utf8"))
const frames = JSON.parse(fs.readFileSync(path.join(take, "frames.json"), "utf8"))
const marks = JSON.parse(fs.readFileSync(path.join(take, "marks.json"), "utf8"))
const FPS = script.fps
// The files are <name>.mp4 and <name>.webp.
const NAME = script.name ?? "demo"
// The clips' lengths in the script are the cut at full speed; `slow` stretches all of them.
const SLOW = script.slow ?? 1
const W = 1280
const SCREEN_H = 704
const STRIP_H = 96
const H = SCREEN_H + STRIP_H

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")

function stripHtml(words, sung) {
  const spans = words
    .map(
      (w, i) =>
        `<span class="${i < sung - 1 ? "sung" : i === sung - 1 ? "now" : ""}">${esc(w)}</span>`
    )
    .join(" ")
  return `<body style="margin:0;width:${W}px;height:${STRIP_H}px;background:#15161d;display:flex;align-items:center;justify-content:center;font:600 31px/1 ${FONT};color:#6f7388;letter-spacing:-.2px">
<style>span{display:inline-block;margin:0 5px}.sung{color:#fff}.now{color:#c8f55a}</style><div>${spans}</div></body>`
}

function cardHtml(card) {
  const lines = card.lines.map((l) => `<p class="${l.kind}">${esc(l.text)}</p>`).join("")
  return `<body style="margin:0;width:${W}px;height:${SCREEN_H}px;background:#15161d;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:${FONT};text-align:center">
<style>p{margin:0}.brand{font:700 30px/1 ${FONT};color:#b9a8ff;margin-bottom:26px}.brand::before{content:"";display:inline-block;width:14px;height:14px;border-radius:50%;background:#c8f55a;margin-right:12px}
.big{font:700 62px/1.12 ${FONT};letter-spacing:-1.5px;max-width:1000px}.sub{font:400 27px/1.4 ${FONT};color:#b6b9c9;margin-top:24px}.accent{font:700 34px/1.2 ${FONT};color:#c8f55a;margin-top:22px}
.code{font:500 21px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;background:#23252f;border:1px solid #363947;border-radius:14px;padding:16px 28px;margin-top:30px;color:#e9eaf2}</style>${lines}</body>`
}

function frameAt(t) {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return frames[lo].file
}

;(async () => {
  fs.mkdirSync(path.join(out, "tmp"), { recursive: true })
  const browser = await chromium.launch({ channel: "chrome" })
  const page = await browser.newPage({ viewport: { width: W, height: SCREEN_H } })
  const shot = async (html, height) => {
    await page.setViewportSize({ width: W, height })
    await page.setContent(html)
    return page.screenshot({ type: "png" })
  }
  const cards = {}
  for (const [name, card] of Object.entries(script.cards))
    cards[name] = await shot(cardHtml(card), SCREEN_H)

  // The timeline: one entry per output frame.
  const timeline = []
  const report = []
  let at = 0
  for (const scene of script.scenes) {
    const sceneStart = at
    const pictures = []
    for (const clip of scene.clips) {
      const real = clip.card ? clip.dur * SLOW : marks[clip.to] - marks[clip.from]
      if (!clip.card && !(real > 0)) throw new Error(`Clip ${clip.from} → ${clip.to} has no length`)
      const dur = clip.dur ? clip.dur * SLOW : real / (clip.speed ?? 1)
      const count = Math.round(dur * FPS)
      for (let i = 0; i < count; i++) {
        pictures.push(
          clip.card
            ? { card: clip.card }
            : { file: frameAt(marks[clip.from] + ((i + 1) / count) * real) }
        )
      }
      at += count / FPS
    }
    const dur = pictures.length / FPS
    const words = scene.caption.split(" ")
    const total = words.reduce((sum, w) => sum + w.length + 1, 0)
    const lead = 0.15
    const sing = Math.max(0.5, dur - lead - 0.55)
    let acc = 0
    const starts = words.map((w) => {
      const s = lead + (acc / total) * sing
      acc += w.length + 1
      return s
    })
    const strips = []
    for (let k = 0; k <= words.length; k++) strips.push(await shot(stripHtml(words, k), STRIP_H))
    pictures.forEach((picture, i) => {
      const t = i / FPS
      let sung = 0
      while (sung < words.length && starts[sung] <= t) sung++
      timeline.push({ ...picture, strip: strips[sung], key: `${scene.id}:${sung}` })
    })
    report.push({
      id: scene.id,
      start: +sceneStart.toFixed(2),
      end: +at.toFixed(2),
      caption: scene.caption,
      words: words.map((w, i) => ({ word: w, at: +(sceneStart + starts[i]).toFixed(2) })),
    })
  }
  await browser.close()
  console.log("length", (timeline.length / FPS).toFixed(2), "s")
  fs.writeFileSync(path.join(out, "captions.json"), JSON.stringify(report, null, 2))

  const mp4 = path.join(out, `${NAME}.mp4`)
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${W}x${H}`,
      "-r",
      String(FPS),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  )
  const small = []
  const every = Math.round(FPS / script.webp.fps)
  let last = null
  let lastKey = ""
  for (let i = 0; i < timeline.length; i++) {
    const f = timeline[i]
    const key = (f.card ?? f.file) + "|" + f.key
    if (key !== lastKey) {
      const top = f.card
        ? cards[f.card]
        : await sharp(path.join(take, f.file)).resize(W, SCREEN_H, { fit: "fill" }).toBuffer()
      last = await sharp({ create: { width: W, height: H, channels: 3, background: "#15161d" } })
        .composite([
          { input: top, top: 0, left: 0 },
          { input: f.strip, top: SCREEN_H, left: 0 },
        ])
        .removeAlpha()
        .raw()
        .toBuffer()
      lastKey = key
    }
    if (!ff.stdin.write(last)) await new Promise((r) => ff.stdin.once("drain", r))
    if (i % every === 0) {
      const file = path.join(out, "tmp", `w${String(small.length).padStart(4, "0")}.png`)
      await sharp(last, { raw: { width: W, height: H, channels: 3 } })
        .resize(script.webp.width)
        .png()
        .toFile(file)
      small.push(file)
    }
  }
  ff.stdin.end()
  await new Promise((r) => ff.on("close", r))
  const delay = String(Math.round((1000 * every) / FPS))
  const args = ["-loop", "0", "-min_size", "-kmax", "60"]
  for (const file of small)
    args.push("-lossy", "-q", String(script.webp.quality), "-m", "4", "-d", delay, file)
  args.push("-o", path.join(out, `${NAME}.webp`))
  const r = spawnSync("img2webp", args, { stdio: "inherit" })
  if (r.status !== 0) throw new Error("img2webp failed")
  fs.rmSync(path.join(out, "tmp"), { recursive: true })
  for (const f of [`${NAME}.mp4`, `${NAME}.webp`])
    console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(2), "MB")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
