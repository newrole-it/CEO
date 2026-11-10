// A starting point for a new video: copy this folder, rename it and change the steps.
// This one needs no model: it opens the Features page and scrolls to the Chrome extension.

/** Leave `email` out for pages that need no account. With it, the camera signs in first, off camera. */
// export const email = "alex@example.com"
/** Names the command line has to give as name=value; they arrive in `args`. */
export const needs = []

/** Off camera: get to the first picture. */
export async function prepare({ goto }) {
  await goto("/features")
}

/** On camera. A mark names a moment; script.json cuts the video between marks. */
export async function run({ p, mark, pause, click, scrollTo }) {
  mark("start")
  await pause(1200)
  await scrollTo(p.locator("#extension"))
  await pause(1200)
  mark("extension")
  await click(p.getByRole("link", { name: "Setup" }).first())
  await p.waitForURL(/\/setup/)
  await pause(1500)
  mark("end")
}
