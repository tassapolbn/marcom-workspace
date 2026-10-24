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
| `assets/` | Static images (the support staff calendar was moved out of the HTML, saving ~650 KB per visit) and the small UI helpers listed in section 9 |
| `assets/workspace-ui.css` | Shared styles loaded after every inline layer, ending with the design tokens (radius, spacing, type, canvas, cards, controls) |
| `netlify/functions/submit-request.js` | Public request submission endpoint (validation, sanitising, rate limiting, honeypot, server request number, task auto-creation, failure log, optional email notifications) |
| `netlify/functions/request-status.js` | Secure status lookup by requester email, returns a minimal summary only |
| `netlify/functions/team-board.js` | The Director's board page (`/team-board?token=...`), server rendered |
| `netlify/functions/board-action.js` | The Director's action endpoint (`/board-action`): writes a request, never edits a task |
| `netlify/functions/lib/board-actions.js` | The action list, shared by the page and the endpoint so they can never disagree |
| `netlify/functions/lib/admin.js` | Shared Firebase Admin bootstrap and helpers |
| `firestore.rules` | Least-privilege Firestore rules (deploy AFTER the site, see below) |
| `tests/rules.test.mjs` | Emulator tests for every role |
| `netlify.toml`, `firebase.json`, `package.json` | Build and tooling configuration. `netlify.toml` also hides every non-app file from the live site |
| `CLAUDE.md`, `PLAN.md` | How Claude and Codex work on this project, and the current plan with its ticked steps |

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
   tracker with the requester's email address and the request number.
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
- Request tracking needs the request number and the requester's email
  address together, and returns only a minimal status summary for those
  requests. Requests sent from the same device list automatically.
- Request dates and times are checked on the server (real calendar dates,
  real 24-hour times, and an end after the start for photography).
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
- The Director's board has no login, so the private share token is its only
  credential and it is re-checked on every action. An action can do exactly one
  thing: add a record to `director_notes`. It can never change a status, a
  deadline, an assignee or any other stored field, and `director_notes` is
  server-write-only in the rules. Turning sharing off, or resetting the link,
  stops actions immediately, not just viewing.

## 7. Testing the rules

```
npm install
npm run test:rules
```

Requires Java (the Firestore emulator). The suite covers: public visitor,
admin, designer, media, junior, disabled user, and a signed-in user without
an ACL record.

Note: `director_notes` is a new collection. Until the rules in this repository
are published, the workspace cannot read it and Director requests will not
appear in the app, even though the board still accepts them (the server writes
with the Admin SDK, which bypasses rules).

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

The Team Board uses `assets/team-board.css` and `assets/team-board.js`.
Open `/team-board-preview` on the local preview server to check its real server
renderer with synthetic data, without a share token or Firebase credentials. The
preview also answers `/board-action` from the same in-memory data, so the whole
request flow can be tried locally. Its filters run locally; Refresh fetches a new
snapshot. Shared tasks appear once and remain visible when filtering for any of
their assignees. Deadline badges use the Bangkok calendar day. UI tests cover
share access, data escaping, filtering, shared-task counts, the Bangkok midnight
boundary, and every rule the action endpoint applies.

### How the board is organised

The board opens grouped by **status**, in the order In progress, Waiting,
Pending, On hold. **Group by** switches between status columns and team-member
columns; the choice is remembered in that browser. Both groupings share one set
of rendered cards, which the browser moves rather than redraws, so a task is
never counted or shown twice and a request badge survives the switch.

The status row above the filters is also the status filter: each category shows
its own colour, its own icon and how many ongoing tasks sit in it, and selecting
one narrows the board to that category. An empty category still appears, so the
full set of states stays visible. A status the board does not recognise is read
as Pending rather than dropped.

Each member keeps the colour their workspace tab already uses (the light-theme
`.tab-btn.a-*` set in `index.html`): Boss school navy, Dew burnt orange, O
orange-red, Eye deep green. That colour carries the member's group card and
every name tag on a task, so the same person reads as the same colour in both
places. A task shared by several people shows one tag per person. The colours
live in `COLOR` in `netlify/functions/team-board.js` and in the `.m-<key>`
custom properties in `assets/team-board.css`; a UI test fails if the two drift
apart. The shared card stays navy and gold, because it stands for the whole
team rather than one person.

Each status has its own accent, tint and glyph, so status is never signalled by
colour alone. On a task card the status owns the left rail and the chip at the
top, the deadline owns the surface tint and its own pill (red overdue, amber for
the next three days), and an open Director request owns the gold flag, so the
three signals never overwrite each other. To add or reword a status, edit
`STATUS` and `STATUS_ORDER` in `netlify/functions/team-board.js` and add the
matching `--s-<key>` custom properties in `assets/team-board.css`.

## 7a. Director requests from the Team Board

The Director opens the shared link, selects any task, and sends one of these,
with an optional message:

| Option | Extra field |
|---|---|
| Please prioritise this task | none |
| Needs to be done by | a date |
| Please hold this task | none |
| Please cancel this task | none |
| Please assign this task to | a name or department |
| Needs discussion on this task | none |
| Please give an update to | a name |
| Other comment or instruction | the message itself |

The board asks for the sender's name the first time and remembers it in that
browser. Each request then lands in three places at once: an amber panel on the
task card in the owner's tab, a **Director requests** group at the top of the
notification bell for the owner and for the admin, and an automatic Team Chat
message. The task itself is untouched, so the owner (or Boss) reads the request,
applies it by hand, and presses **Mark as handled** to clear it. Requests still
open are listed back on the board, so the same thing is not asked twice.

To add or reword an option, edit `netlify/functions/lib/board-actions.js`. The
menu and the server validation both read that one list.

## 8. Recommended follow-ups (not yet implemented)

- Firebase App Check (reCAPTCHA v3) for the internal app's Firestore access.
- Scheduled Firestore backups (Console -> Firestore -> Disaster recovery) and
  a CSV export button for TOIL / sick leave / petty cash.
- Archive completed requests to a `requests_archive` collection instead of
  deleting them after the retention window.
- Phased refactor of `index.html` into modules (shell, auth, data, features).
- Boss dashboard upgrades (workload, overdue, capacity) per the improvement
  plan.

## 9. Workspace layout (October 2026 tidy-up)

**Overview**, top to bottom:

- Team Announcements first, right under the payday strip and above the
  greeting: full width and always open. On wide screens the newest three sit
  side by side (two on tablets, stacked on phones); pinned ones come first, and
  New opens the composer.
- One row of five tiles: Overdue, Due today, Next 7 days, New requests and
  Meetings today. Each number appears once on the page. The three task tiles
  filter Upcoming Deadlines, which has All / Overdue / Today / 7 days pills.
- Main column: Upcoming Deadlines, the Event Board, then the Master Calendar.
  The Event Board shows open shared tasks only, folded by event and sorted by
  what is due next, with a Show completed switch.
- Side column: Team today, Event Countdown, Request Centre, then watermark
  deletions (only when one is due within 3 days). Team today replaces the old
  availability, "who is free", workload and leave cards.
- A folded **Resources & more** section holds Resources (tabs for department
  links, brand guidelines and the asset library), Today's Menu, Recent Team
  Activity and the Support Staff Calendar preview. It remembers whether it was
  left open.
- `ovLayout()` in the Overview script keeps every card in its slot, including
  cards other scripts add later, and moves only the cards that are out of
  place.

**Member tabs:**

- Side widgets start folded on a first visit. Each header shows its key
  number, so the list fits on one screen.
- On desktop the sidebar slides away to an icon rail. On tablets and phones it
  opens as a drawer from the Widgets button.
- Google Calendar and Upcoming Events are one Calendar widget, with Month and
  Upcoming views.
- The header chips (Active, Due Soon, Done) filter the board.
- The light/dark switch and Settings are in the "..." menu. Each device
  remembers the choice; dark is the default until someone picks light.

**Forms and events:**

- A dialog the user has typed into does not close on an outside click.
  Closing the task or event form asks "Discard your changes?".
- A new task keeps a draft in the browser, and the next Add Task offers to
  restore it.
- Add Task starts short: description and More details open on demand.
- Design requests ask for the status, the requester and the campaign once.
- Event countdowns delete in one click, with Undo, or after one question if
  the event holds work. Past events fold away, with Clear past events.

**Readability and phones:**

- Every text reaches the 4.5:1 contrast standard in light and dark mode.
  `tests/ui-contrast.test.mjs` checks each colour pair that was fixed.
- On screens up to 640 px, filter pills and small buttons are at least 36 px
  tall (task card dropdowns 32 px) and no text is smaller than 11 px. The
  Overview and Add Task fit a 360 px phone without sideways scrolling.
- iPhones and iPads do not zoom into a field when it is tapped: a small script
  next to the viewport tag adds `maximum-scale=1` on iOS only, and pinch-zoom
  still works. `tests/ui-mobile.test.mjs` covers it.

**Small helpers in `assets/`:**

| File | Purpose |
|---|---|
| `ui-motion.js` | One fold and unfold animation, and the dropdown helper. Both respect reduced motion |
| `ui-dialogs.js` | Background-click protection and the discard question |
| `task-draft.js` | New-task drafts |
| `event-board.js` | Grouping and sorting for the Event Board |
| `widget-summary.js` | Key numbers in widget headers |

Each helper has a matching `tests/ui-*.test.mjs` file.

**Live site:** `netlify.toml` returns "not found" for the plans, README,
review notes, rules, package files, tests, Apps Script and function sources.
A test fails if a new top-level file is added without a rule.
