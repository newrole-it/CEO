# Demo videos

Short videos of newrole.it with karaoke captions, such as the tour at the top of the root README. Each is a real run of the app in a headless Chrome, cut and captioned by a script, so it can be made again after the interface changes.

| File | What it is |
|---|---|
| `record.mjs` | Records a scenario: `node record.mjs <scenario.mjs> <base url> <out dir> [name=value ...]` |
| `recorder.mjs` | The camera behind it: the browser, the drawn mouse pointer, the frames and the marks |
| `build.mjs` | Cuts a recording into `<name>.mp4`, `<name>.webp` and `captions.json`: `node build.mjs <take dir> <script.json> <out dir>` |
| `videos/tailor-cv/` | The README tour: from a CV in a PDF to a CV tailored to one offer. [Its scenario and captions](../../apps/resume-engine-optimization/docs/screenshots/demo/scenario.md) |
| `videos/template/` | A short video that needs no model. Copy it to start a new one |

## What you need

Node, Google Chrome, `ffmpeg` with libx264, and `img2webp` (from the `webp` package). The scripts use `playwright` and `sharp`, which are not dependencies of this repository. Copy this folder somewhere of your own and install them there:

```bash
cp -R scripts/demo ~/newrole-demo && cd ~/newrole-demo
npm init -y && npm install playwright sharp
```

Record against a **fresh clone with its own database**, never your own install: a scenario creates an account, a profile, CVs and offers. In the clone's `.env`, set another port in `APP_ORIGIN` if 43123 is taken, then `npm run go`.

## The README tour

```bash
# 1. Print videos/tailor-cv/alex-rivera-cv.html to a PDF in Chrome.
# 2. Record: about four minutes, most of it the model working.
node record.mjs videos/tailor-cv/scenario.mjs http://127.0.0.1:43123 take \
  cv=/path/to/Alex-Rivera-CV.pdf \
  offer=https://newrole-it.github.io/demo/jobs/senior-frontend-engineer/
# 3. Put the two match scores from take/facts.json into the "round2" caption in script.json.
# 4. Build.
node build.mjs take videos/tailor-cv/script.json out
```

Copy `out/demo.mp4` and `out/demo.webp` to `apps/resume-engine-optimization/docs/screenshots/`, and `out/captions.json` to its `demo/` folder. Update the scene times in `scenario.md` there.

An account can run the scenario once. For another take, pass another address: `email=alex2@example.com`.

The model words its findings differently on every run. The scenario looks for the requirement that mentions Playwright and the question about page load times; if a run does not produce them, record again.

## Changing a video without recording again

`script.json` is the cut. Edit it and run `build.mjs` on the same take:

- `scenes[].caption`: the text of the caption. One sentence per scene; it lights up word by word over the scene.
- `scenes[].clips`: what the scene shows. `{ "from": "a", "to": "b", "dur": 2 }` plays the recording between two marks in 2 seconds, however long it really took. Leave `dur` out to play it as recorded. `{ "card": "intro", "dur": 2 }` shows a card.
- `slow`: stretches every clip. `1.25` plays the whole video at 0.8 of its speed.
- `cards`: the title cards. A line's `kind` is `brand`, `big`, `accent`, `sub` or `code`.
- `name`: the name of the files. `webp`: the size, frame rate and quality of the animation.

## Making another video

1. Copy `videos/template/` to `videos/<name>/`.
2. Write the steps in `scenario.mjs`. `run(camera)` gets the Playwright page as `p` and helpers that move the drawn pointer: `click(locator)`, `moveTo(locator)`, `scrollTo(locator)`, `goto("/path")`, `pause(ms)`. Call `mark("name")` at every moment you may want to cut at: before and after a wait, and where a scene starts and ends. `prepare(camera)` runs off camera. Export `email` to start signed in on a fresh account, and `needs` for the `name=value` arguments the scenario reads from `args`. Write what the run found (a score, a file name) into `facts`, for the captions.
3. Record it, and look at `take/marks.json` for how long each part took.
4. Write `script.json`: the scenes, their clips between your marks, a caption for each. Set `name`.
5. Build, watch, change `script.json`, build again.

Keep the people and companies fictional, and say on a card or in the caption when a wait was shortened. An offer has to be on a public address, because newrole.it does not read offers from `localhost`: add a page to the `newrole-it/demo` repository, next to the Acme Cloud one.
