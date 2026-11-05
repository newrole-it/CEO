# Stream B (CV) → owner: requests

Files outside `src/shared/cv`, `src/server/cv`, `src/app/cv`, `src/app/api/cv`, `mcp/tools-cv*`, `copy-cv.ts` and `cv.css` that need a change.

- **Navigation:** link "Moje CV" (`nav.cv`, already in `copy-cv.ts`) to `/cv` in the account menu (`src/app/components/site/**`).
- **`.env.example` and README:** `CHROME_PATH` is optional. PDFs are rendered by local Chrome (`CHROME_PATH`, then `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/usr/bin/google-chrome`, `/usr/bin/chromium`). Without Chrome, `/api/cv/[id]/pdf` returns 503 and the UI opens the print view at `/cv/[id]/print`.
- **Privacy (`/privacy`, README):** CV documents hold whatever the person types, including a photo (a resized JPEG data URL in `content.header.photo`). Uploaded PDFs are stored as uploaded, and rendered PDFs are cached in `CvDocument.pdf` until the next edit. "Delete CV and profile" in settings does not delete them; they are deleted at `/cv`.
- **Export (`src/server/privacy/export.ts`):** per §5.1, select `CvDocument` without `pdf`. `content.header.photo` is a large data URL; decide whether to keep it in the export.
- **Skill and README:** new MCP tools `cv_list`, `cv_get`, `cv_update` (`section` / `item` / `remove` / `content` / `copyAs`), `cv_export_pdf`. `cv_update` with `copyAs` is what the `apply` prompt's "copy titled <Company>" needs. `cv_get` replaces the photo with the marker `"(photo)"`; passing that marker back to `cv_update` keeps the stored photo.
- **`src/server/profile/context.ts`:** `jsonText` walks the whole content, so prompts also get `theme.accent` (`#175c72`) and the text of hidden sections. `cvText(content)` from `src/server/cv/service.ts` leaves both out. It needs a parsed `CvContent` (`parseCvContent` from `src/shared/cv/schema`).
