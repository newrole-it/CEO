# The demo video: scenario and captions

`demo.mp4` and `demo.webp` in the folder above are the 48-second tour at the top of the root README. The picture is 1280×800: the app in a 1280×704 window and a caption strip under it. The captions light up word by word, like karaoke. There is no sound.

Everything on screen is a real run of newrole.it from a fresh clone (`npm run go`), with Claude Code as the model. Nothing is mocked. Waiting for the model is sped up and a few page loads are cut out; the table says where. The whole cut then plays at 0.8 of its speed (`"slow": 1.25` in the script).

## Who and what

- **The person:** Alex Rivera, a fictional frontend engineer. The CV is `alex-rivera-cv.html`, printed to PDF.
- **The offer:** Senior Frontend Engineer at Acme Cloud, a fictional company, at https://newrole-it.github.io/demo/jobs/senior-frontend-engineer/ (the public repository `newrole-it/demo`). It has to be on a public address: newrole.it refuses to read offers from `localhost`.
- **The numbers in the captions** (73% and 86%) are the ones this run produced. A new recording gives other numbers, so change the caption in `script.json` to match.

## Scenes

| Time      | On screen                                                                                                                                           | Caption                                             | Real time                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| 0.0–2.9   | Title card: "Your CV, tailored to every job offer", "No hallucinations. Facts only."                                                                | A free CV builder for people in IT.                 | a card                                                                |
| 2.9–7.3   | `/start`, "Where shall we start?": a click on **Upload a CV or LinkedIn PDF**, "Reading your profile", then "Here's how we see you"                 | Upload your CV or your LinkedIn PDF.                | reading the PDF took 7.8 s, shown in 1 s                              |
| 7.3–12.3  | My CV: a click on **From profile**. The CV opens in the editor with the **CV design** panel; a click on the **Colour band** template                | Your CV is ready to edit. Pick a template.          | cut: saving the profile, the page load, closing "How to edit your CV" |
| 12.3–17.1 | Offers: the offer's link is typed in, **Read the offer**, and the offer's page opens with the whole posting                                         | Paste the link to a job offer.                      | a little faster than recorded                                         |
| 17.1–22.8 | **Tailor CV and letter**, **Tailor CV**, and the steps run one after another                                                                        | It tailors your CV and checks every step.           | tailoring took 45.6 s, shown in 4.5 s                                 |
| 22.8–28.2 | The match score: 73%, then the offer's requirements, each Met, Partly or Missing                                                                    | See what matches the offer and what is missing.     | a little faster than recorded                                         |
| 28.2–35.0 | A comment on the missing requirement (end-to-end tests with Playwright), then an answer under **Add numbers you know** (load time before and after) | It never invents facts. It asks you.                | about twice as fast                                                   |
| 35.0–40.2 | **Improve the CV and check again**: round 2 runs, then Round 1 (73%) and Round 2 (86%) side by side                                                 | Your answers go in. The match goes from 73% to 86%. | round 2 took 48.5 s, shown in 1.5 s                                   |
| 40.2–44.4 | **Open the CV**: the tailored CV in the editor, then **Download PDF**                                                                               | Download the PDF and apply.                         | nearly as recorded                                                    |
| 44.4–48.2 | End card with the install command                                                                                                                   | One command to start. Your data stays with you.     | a card                                                                |

`captions.json` has the start and end of every scene and the moment each word lights up, in seconds.

## Changing it or recording it again

The scripts and this video's files are in `scripts/demo/` in the repository root: the steps in `videos/tailor-cv/scenario.mjs`, the cut and the captions in `videos/tailor-cv/script.json`, the CV in `videos/tailor-cv/alex-rivera-cv.html`. [scripts/demo/README.md](../../../../../scripts/demo/README.md) says how to record, how to change a caption or the speed without recording again, and how to make another video.
