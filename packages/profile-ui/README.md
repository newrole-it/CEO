# @newrole/profile-ui

The screens that build a profile in newrole.it and newrole CV, for React and Next.js.

- `ProfileReview`: what was read from a CV or LinkedIn, every field editable in place, with the ones a model filled in marked; `fieldsFrom` and `cleanDraft` go with it.
- `LinkedInImport`: three ways in. Claude in the person's own Chrome (pass `browser`, the app's start and poll calls, or null where the app cannot drive that Chrome), LinkedIn's data export ZIP, and a PDF saved from LinkedIn (`onFile`).
- `PasteTile`: paste a CV's text.
- `ApplicantForm`: the form details, with what the app fills in for empty fields (`effective`) and `onSave`.

Load `@newrole/profile-ui/profile.css` after `@newrole/ui/styles.css`. Strings are in `copy-profile.ts` (Polish and English); the language comes from `@newrole/ui/locale`'s `LocaleProvider`. Render under `ToastProvider` from `@newrole/ui/interactive`.

newrole.it's calls: `src/app/profile/profile-ui.ts`. newrole CV's: `apps/cv/src/client/profile.ts`.
