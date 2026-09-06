# HeadStart MARCOM Workspace

Internal workspace for the Marketing and Communications department of
HeadStart International School Phuket, plus the public MARCOM Request Centre
(`<site URL>?request=1`).

Team: Boss (MARCOM Manager, admin), Dew (Graphic Designer), O (Photographer
and Video Editor), Eye (Junior Events Coordinator).

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | The whole application (internal workspace + public Request Centre) |
| `assets/` | Static images (the support staff calendar was moved out of the HTML, saving ~650 KB per visit) |
| `netlify/functions/submit-request.js` | Public request submission endpoint (validation, sanitising, rate limiting, honeypot, server request number, task auto-creation, failure log, optional email notifications) |
| `netlify/functions/request-status.js` | Secure status lookup by requester email, returns a minimal summary only |
| `netlify/functions/lib/admin.js` | Shared Firebase Admin bootstrap and helpers |
| `firestore.rules` | Least-privilege Firestore rules (deploy AFTER the site, see below) |
| `tests/rules.test.mjs` | Emulator tests for every role |
| `netlify.toml`, `firebase.json`, `package.json` | Build and tooling configuration |

## 1. Put the project on GitHub

On your computer, from this folder:

```
git remote add origin https://github.com/<your-username>/marcom-workspace.git
git push -u origin main
```

(Create the empty repository named `marcom-workspace` on github.com first, or
run `gh repo create marcom-workspace --private --source . --push` if you use
the GitHub CLI.)

Tip: keep your working clone OUTSIDE OneDrive in the long run (for example
`C:\dev\marcom-workspace`). OneDrive file locking occasionally interferes
with `.git` internals.

## 2. Connect Netlify to GitHub

In Netlify: Site settings -> Build and deploy -> Link repository -> choose the
GitHub repo, branch `main`. Netlify then gives you deploy previews for every
change and one-click rollback. Publish directory is `.` and functions are
picked up from `netlify/functions` automatically via `netlify.toml`.

## 3. Server configuration (required once, before rules deploy)

The public Request Centre now submits through a Netlify Function, so the
function needs a Firebase service account:

1. Firebase Console -> Project settings -> Service accounts -> Generate new
   private key. Keep this file PRIVATE (never commit it).
2. Netlify -> Site configuration -> Environment variables -> add
   `FIREBASE_SERVICE_ACCOUNT` = the full JSON content of that key file.
3. Optional email notifications (skip for now if you prefer): also set
   `RESEND_API_KEY`, `NOTIFY_FROM` (e.g. `MARCOM <marcom@yourdomain>`),
   `NOTIFY_TO_DESIGN`, `NOTIFY_TO_PHOTO`, `NOTIFY_TO_ADMIN`.

## 4. Deploy order (IMPORTANT)

1. Deploy the site + functions (push to GitHub, Netlify builds).
2. Set the environment variable above; trigger a redeploy.
3. Test the Request Centre: submit a test request at `<site>?request=1`,
   confirm it appears in the workspace and the task is created, and test the
   tracker with the requester's email address.
4. ONLY THEN deploy the new rules:
   `npx firebase deploy --only firestore:rules` (or paste `firestore.rules`
   into Firebase Console -> Firestore -> Rules).
   Old clients still open in a browser tab should be refreshed afterwards.

Rolling back rules: Firebase Console keeps a history of previous rule sets.

## 5. First admin account (bootstrap)

1. Sign in to the app once with your Google account so it exists in Firebase
   Authentication.
2. In Firebase Console -> Firestore, create collection `acl`, document ID =
   your email in lowercase (e.g. `boss@headstartphuket.com`) with fields:
   `role` = `"admin"`, `workspace` = null, `disabled` = false.
3. Reload the app: the Settings -> User access panel now lets you add
   Dew (`designer`), O (`media`) and Eye (`junior`).

Note: the rules require Google sign-in or a verified email. If a member uses
email/password, they must verify their email address first.

## 6. Security model (summary)

- The public page has NO direct database access. Rules deny unauthenticated
  reads and writes everywhere; the Netlify Function validates and writes with
  the Admin SDK.
- Request tracking uses the requester's email address and returns only a
  minimal status summary.
- Every collection is explicitly matched or whitelisted; unknown collections
  are denied, including for the admin.
- ACL: users read only their own record; only the admin lists or edits users.
- Chat and team-request authorship is enforced (`authorEmail` must match the
  signed-in user and cannot be changed afterwards).
- The activity log is append-only for everyone, including the admin.
- Members write only their own workspace collections; Eye also writes the
  shared `school_events` and `sop_templates`; O owns `o_templates`.
- Data listeners in the browser now start only AFTER an authorised sign-in,
  so the login screen and the public page no longer attempt (or receive) any
  team data.

## 7. Testing the rules

```
npm install
npm run test:rules
```

Requires Java (the Firestore emulator). The suite covers: public visitor,
admin, designer, media, junior, disabled user, and a signed-in user without
an ACL record.

### UI checks and local preview

Run `npm run test:ui` for the dependency-free navigation, contrast-generation,
dialog keyboard, and live-render regression checks. This also checks that every
inline application script parses.

Run `npm run preview:ui`, then open `http://127.0.0.1:4173/preview` for a local
preview using synthetic tasks and an in-memory Firebase adapter. Its controls
switch viewport width and theme and simulate a live refresh. The preview blocks
connections to app services and never uses production account or task data.
Reload the preview after editing source. Shared UI refinements live in
`assets/workspace-ui.css`, loaded after the older inline theme layers.
The small `assets/ui-render.js` module preserves unchanged Overview content
between live updates. See `UI-CODE-REVIEW.md` for reviewed issues, fixes, and
remaining priorities.

The read-only Team Board uses `assets/team-board.css` and `assets/team-board.js`.
Open `/team-board-preview` on the local preview server to check its real server
renderer with synthetic data, without a share token or Firebase credentials.
Its filters run locally; Refresh fetches a new snapshot. Shared tasks appear once
and remain visible when filtering for any of their assignees. Deadline badges use
the Bangkok calendar day. UI tests cover share access, data escaping, filtering,
shared-task counts, and the Bangkok midnight boundary.

## 8. Recommended follow-ups (not yet implemented)

- Firebase App Check (reCAPTCHA v3) for the internal app's Firestore access.
- Scheduled Firestore backups (Console -> Firestore -> Disaster recovery) and
  a CSV export button for TOIL / sick leave / petty cash.
- Archive completed requests to a `requests_archive` collection instead of
  deleting them after the retention window.
- Phased refactor of `index.html` into modules (shell, auth, data, features).
- Boss dashboard upgrades (workload, overdue, capacity) per the improvement
  plan.
