# Plan: Tidy up the MARCOM Workspace (UX/UI review, October 2026)

Status: **approved by Boss on 24 Oct 2026**, with Claude's suggested decisions (see the end).
Boss also asked for a more elegant, modern look that is easy to use, smooth animations when things
open and close, a sidebar that can slide away, and dropdowns that save space. These are now
steps 3, 12 and 13.
Branch: `ux/declutter-overview`. Builder: Codex, one step at a time (see CLAUDE.md).

## What the review found

Checked in the local preview (`npm run preview:ui`, made-up data) at 1280 px wide, and in the code.
All 54 existing UI tests pass before any change.

### 1. Clicking outside a form throws the work away
Every form box closes when you click the dark background (`onclick="if(event.target===this)close…"`
on the overlay). Escape does the same. Nothing asks first and nothing keeps a draft, so a
half-filled task is gone. This applies to the task, event, note, link, leave and petty cash forms.

### 2. Deleting an event countdown takes five steps
Event Hub chip → event workspace opens → Edit Event → scroll to Delete → confirm.
Past events never leave the countdown. They show as "Done", and because the list is sorted
oldest first, they sit in front of the upcoming ones.

### 3. Add Task has too many fields, and some repeat
- Boss and Eye see 12 fields. Dew sees 22 for a design request. O sees 23 for a media request.
- The same thing is asked more than once:
  - **Event:** Event picker, "Event name" (shared card), "Brand / Campaign" (Dew) and "Event Name" (O).
  - **Who asked:** "Assigned By" and "Requestor" (Dew).
  - **Status:** Status and "Design Status" (Dew), which is two status menus in one form.
  - **Links:** Attachment, Related Links, "Final File Location" (Dew) and "File Location" (O).
  - **Free text:** Description and Notes.
- "Assigned Date" is always typed by hand, although it is almost always today.
- The Category options are personal to-do categories (Home, Shopping, Travel, Together), not MARCOM work.

### 4. The Overview is about 6.5 screens long with 24 cards
At 1280 px wide it is 5,760 px tall. Several cards show the same numbers under different names:

| Information | Where it appears now |
|---|---|
| Overdue tasks | greeting line, Today at a Glance, stats row, Today's Focus, Upcoming Deadlines (5 places) |
| Due today | greeting line, stats row, Today's Focus, Upcoming Deadlines (4 places) |
| Next event | greeting line, stats row, Event Countdown Hub (3 places) |
| Who is available | Team Availability, Who is free right now, Leave & Availability, Workload Heatmap (4 cards) |
| Requests | Today at a Glance, Request Centre, and "Team Requests". Team Requests is really app feedback (bug fix, new feature), but its name sounds like the Request Centre. |
| Shortcuts | Quick Actions repeats the header's + button, Search and the chat button |

Some low-use items also take up a lot of room:
- Today's Menu is 848 px tall.
- The Support Staff Work Calendar image is 1,000 px tall, at the very bottom.
- The payday strip and its "Hide salary period" button take about 200 px at the top of every tab.
- Department Resources, Brand Guidelines and Asset Library are three separate link cards.

### 5. The Event Board on the Overview gets very long
- It shows every shared task, including Done and Canceled ones, with no limit and no way to fold an event away.
- Event groups are sorted A–Z, not by what is due next.
- Bug: the Overview redraws every 5 seconds, which closes an open "Assign" dropdown while you are using it.
- Its empty message says to tick "Shared event task", but the checkbox is called "Share this card with the team".

### 6. Widgets on the member tabs are far down the page
On each member tab the right-hand column is about twice as tall as the task list (1,700–2,400 px).
Day-off in Lieu, Sick Leave and Deadlines end up below the fold. "Google Calendar" and
"Upcoming Events" are two widgets fed by the same calendar.

### Also noticed
- Netlify publishes the whole folder, so README.md, the plans and the tests can be opened on the
  live site. Nothing secret is in them, but they don't need to be public (step 15).
- The open P1 item in `UI-CODE-REVIEW.md` (request tracking by email only) is still open. Not in this plan.
- `index.html` is about 12,900 lines and has 43 style blocks layered on top of each other. That's
  why the look is uneven. New styling goes into `assets/workspace-ui.css`, which loads last, rather
  than into another inline block. The file is not rewritten.

## Steps

Each step goes to Codex as `.codex-tasks/step-N.md`. Claude reviews and tests it, ticks it here,
and commits it before the next step starts. Every step must keep `npm run test:ui` passing and
adds a test where the logic can be tested without a browser. Every check in the preview is done
in light and dark mode, at phone (390 px) and desktop (1280 px) width.
All motion respects the system "reduce motion" setting.

- [x] **Setup (Claude, no app code).** Add the team protocol (`CLAUDE.md`) and this plan to the project.
  Keep `.codex-tasks/` and `.claude/` out of Git, so they never go to the live site.

- [x] **1. Forms no longer close by accident**
  - Files: `index.html` (shared dialog handling, `closeModal`, `closeEventModal`), `tests/ui-interactions.test.mjs`
  - Clicking the dark background no longer closes any box that has form fields. The box gives a small shake instead.
  - Closing the task or event form with ×, Cancel or Escape after typing something asks
    "Discard your changes?" (Keep editing / Discard). If nothing was typed, it closes straight away as now.
  - Read-only boxes (search, links hub) still close on an outside click.
  - Test: in the preview, type in Add Task, then click outside, press Escape and press ×. Each time the
    text must still be there or the discard question must appear. Saving must still work, with no extra question.

- [x] **2. Unsaved new tasks are kept as a draft**
  - Files: `index.html` (`openAdd`, `saveTask`, `closeModal`), `tests/ui-interactions.test.mjs`
  - While you type a new task, a draft is kept in this browser, separately for each member.
    Reopening Add Task offers "Restore your unsaved task from 14:20?". Saving or discarding clears the draft.
  - Test: type a task, reload the page, open Add Task and restore it. Then save it and check the draft is gone.

- [x] **3. Smooth open and close everywhere (shared motion)**
  - Files: `assets/workspace-ui.css`, a small new `assets/ui-motion.js` (loaded from `index.html`), the widget collapse script and the Overview card fold button in `index.html`, a new `tests/ui-motion.test.mjs`
  - One shared, smooth fold and unfold animation (height and fade, about 200 ms). It is used by the
    side widgets on member tabs and by the Overview cards' fold buttons, and later steps reuse it
    for everything that opens and closes.
  - One shared dropdown menu style: it fades and slides in, closes on an outside click or Escape,
    and works with the keyboard.
  - With "reduce motion" switched on, everything opens instantly.
  - Test: fold and unfold widgets and Overview cards in the preview. The motion is smooth, the folded
    state is still remembered, and nothing jumps.

- [x] **4. Event countdown: easy delete, past events tidied away**
  - Files: `index.html` (Event Hub: `evHubHTML`, `renderEvHub`, `deleteEvent`; event workspace header; Event Countdown Hub on the Overview; their CSS)
  - Each countdown chip gets a small delete button. An event with no linked work is deleted in one
    click, with an Undo message. An event that has linked tasks, suppliers, files or a budget asks
    first and says what it holds.
  - Past events are hidden behind a "Past events (N)" toggle, which uses the shared fold animation.
    A "Clear past events" button deletes them all after one question.
  - The event workspace gets a Delete button next to Edit Event.
  - Test: in the preview, add one past and one future event. The past one is hidden. Deleting from the
    chip and then pressing Undo brings it back. Clear past events works. `npm run test:ui` passes.

- [x] **5. Event Board: open tasks only, folded by event**
  - Files: `index.html` (`evt-script` / `evbRender` and `evt-style`), `tests/ui-preview.mjs` (add a few made-up shared tasks), a UI test
  - Done and Canceled tasks are hidden, with a "Show completed (N)" switch.
  - Each event is one line (name, open tasks, unassigned count, next due date) and opens smoothly on click.
    At most 5 tasks show, then "Show N more". Events are sorted by what is due next.
    An event whose tasks are all done disappears from the board.
  - The 5-second refresh no longer closes the Assign dropdown. The empty message uses the right checkbox name.
  - Test: the preview board shows only open tasks, folded. Completed tasks appear with the switch.
    An Assign dropdown stays open for more than 5 seconds. The test covers the filter and sorting.

- [x] **6. Shorter Add Task form (layout only, no data change)**
  - Files: `index.html` (task form markup and CSS, `openAdd`, `openEdit`)
  - Shown first: Title, Due date, Priority, Event, Share with team. Description sits under a "+ Add details" link.
  - Everything else goes under a folded "More details" section, which opens smoothly: Assigned by,
    Assigned date (now filled with today), Category, Attachment, Related links, Notes. The section opens
    by itself when editing a task that already has something in those fields.
  - Dew's and O's request fields stay, grouped under their own folded heading.
  - Test: Add Task fits on one screen at 1280 × 800. Editing an existing task with notes and links
    shows them all. Saving keeps every field as before (checked against stored data in the preview).

- [x] **7. No repeated fields in design and media requests, MARCOM categories**
  - Files: `index.html` (design and media request sections, `saveTask`, `openEdit`, the O auto-copy script)
  - One "Requested by" field fills both Assigned By and Requestor.
  - Brand / Campaign and O's Event Name are filled from the chosen event, and can still be changed.
  - For design requests, one status menu: Design Status sets the main status automatically
    (Delivered → Done; In Progress / Review / Revision → In Progress; Waiting for Brief → Waiting; Brief Received → Pending).
  - Category becomes Design, Photo & Video, Social Media, Event, Print, Admin. An old task keeps its
    old category, which still shows when you edit it.
  - The stored data keeps every field, so the Team Board, the Request Centre and old tasks keep working.
  - Test: create a design request and a media request in the preview. Check the stored record has the
    copied values, and that Team Board tests still pass.

- [x] **8. One "Team today" card instead of four**
  - Files: `index.html` (Team Availability, Who is free right now, Leave & Availability, Workload Heatmap renderers)
  - One row per person: open tasks and workload level, free or busy now (when their calendar is connected), and on leave or sick today.
  - Test: the preview shows the four people with the same figures the four old cards showed. The
    "calendar not connected" note appears once, not four times.

- [x] **9. One set of "today" numbers on the Overview**
  - Files: `index.html` (Overview shell and the stats, focus and greeting renderers; `uxp-today`)
  - Keep one row of tiles you can click: Overdue · Due today · Due this week · New requests · Meetings today.
    Clicking a tile filters Upcoming Deadlines, which becomes the one task list.
  - Remove the repeats: the greeting line's numbers (the greeting and date stay), Today at a Glance,
    and Today's Focus. Its items are already the Overdue and Today groups in Upcoming Deadlines.
  - Test: each number appears once, matches the old counts on the same data, and filters the list.

- [x] **10. New Overview layout, with less-used items folded away**
  - Files: `index.html` (Overview shell order, Watermark queue, Team Requests, Quick Actions), a small layout helper, CSS
  - Order:
    - Today tiles first.
    - Main column: Upcoming Deadlines, then Event Board, then Master Calendar.
    - Side column: Team today, then Event Countdown, then Request Centre, then Announcements.
  - A folded "Resources & more" section at the bottom holds Department links, Brand guidelines,
    Asset library, Today's Menu, the Support Staff Calendar and Recent Team Activity.
  - The Watermark queue appears on the Overview only when something is due within 3 days. It always shows on O's tab.
  - Team Requests (app feedback) moves to Settings as "Suggest an app improvement".
  - Quick Actions is removed.
  - Test: the Overview at 1280 px is about 2.5 screens tall (from 6.5), and nothing is lost.
    Every moved item can still be reached in one or two clicks.

- [x] **11. Compact Overview cards**
  - Files: `index.html` (Announcements, Department Resources / Brand Guidelines / Asset Library, Today's Menu, Support Staff Calendar, payday strip), CSS
  - Announcements shows the latest few posts, with a "New announcement" button that opens the composer smoothly.
  - One Resources card with tabs (Department links / Brand guidelines / Asset library), instead of three cards.
  - Today's Menu shows today only, with a "Whole week" link.
  - The Support Staff Calendar shows as a short preview that opens full size.
  - The payday strip starts as one compact line on every tab (days left, payday date, progress), with a "details" toggle.
  - Test: each card works in both themes and at phone width, and nothing that was there before is lost.

- [x] **12. Member tabs: a sidebar that slides away, widgets easy to find**
  - Files: `index.html` (member sidebars, the "Hide widgets" toggle, widget collapse script, Google Calendar and Upcoming Events widgets, header buttons)
  - The widget column becomes a proper sidebar. It slides closed so the task board gets the full width,
    and slides back open, and the choice is remembered. On tablets and phones it opens as a drawer from the side.
  - Widgets start folded on first visit and show their key number in the header, for example
    "Day-off in Lieu · 3 days" or "Sick Leave · 2 used". The whole list fits on one screen, and your own
    open/closed choices are still remembered.
  - "Google Calendar" and "Upcoming Events" become one Calendar widget.
  - The repeated Active / Due soon / Done row under the tab menu goes, because the member header already shows those numbers.
  - Rarely used header buttons (dark mode, settings, sync status) move into the existing "More" (⋯) dropdown.
  - Test: on every member tab the folded sidebar fits in one screen, slides open and closed smoothly,
    and works on a phone. Each widget opens, closes and remembers its state.

- [x] **13. Design refresh: elegant, modern, easy to read**
  - Files: `assets/workspace-ui.css` (one set of design tokens and component styles), small markup touches in `index.html` only where needed
  - Keep the HeadStart navy and gold identity, refined:
    - one type scale and one spacing scale,
    - softer layered shadows and the same corner radius on all cards,
    - calm card surfaces, so colour is kept for status and for each person,
    - clear hover, pressed and focus states, and smooth tab and filter transitions,
    - consistent buttons, inputs and pills, and tidy empty states.
  - Applies to the header, tabs, Overview cards, member tabs, dialogs and dropdowns, in light and dark.
  - Test: walk through every tab in both themes at 390 / 768 / 1280 px. Text contrast must still pass
    (the existing contrast test). Nothing overlaps or jumps.

- [x] **14. Final check and notes**
  - Files: `README.md`, `UI-CODE-REVIEW.md`
  - Full `npm run test:ui`, a walk-through of every tab and every form, keyboard use and focus outlines.
    Update the README and the review notes.

- [x] **15. Keep docs and tests off the live site**
  - Files: `netlify.toml`
  - The live site no longer serves README, the plans, the tests, the rules or the Apps Script files.
  - Test: check the rules locally. The app, the Request Centre and the Team Board are unchanged.

## Decisions (approved 24 Oct 2026)

1. Category: replaced with MARCOM categories (Design, Photo & Video, Social Media, Event, Print, Admin). Old tasks keep their value.
2. Design Status sets the main status automatically, with one menu.
3. Team Requests moves into Settings; Quick Actions is removed.
4. An event with no linked work is deleted in one click with Undo.
5. The live site stops publishing docs and tests (step 15).

## Not in this plan
- Rewriting `index.html` into modules, and the open security item in `UI-CODE-REVIEW.md`.
- Any change to Firestore rules, Netlify functions or stored data formats.

---

# Follow-up plan (24 Oct 2026): approved by Boss, with the suggested decisions

Steps 1–15 are done. Codex built steps 1–7 and Claude built steps 8–15 while Codex was at its usage
limit. These are the next items, with Codex building again from about 05:48 when its limit resets.

- [x] **16. Codex reviews the steps Claude built (8–15)**
  - Read-only: Codex runs with `-s read-only` and changes nothing. It reports any bugs, gaps or
    risky code in the step 8–15 commits. Claude checks each finding, and fixes go through the
    usual one-step routine.
  - Why: a second pair of eyes on code that Codex did not write and nobody else has reviewed.

- [x] **17. The server checks real dates and times on requests (review item P2)**
  - Files: `netlify/functions/submit-request.js`, the Request Centre form in `index.html` (error display), a new test file
  - Impossible dates (31 February) and times (29:70) are refused, and a photography request's
    end time must be after its start time. Each error is reported for its field, so the requester
    sees what to fix next to the field instead of a silent blank.
  - Test: server tests for good, impossible and missing values; the preview form shows the field errors.

- [x] **18. Safer request tracking (review item P1)** *(needs your decision below)*
  - Files: `netlify/functions/request-status.js`, the tracker in `index.html`, tests
  - Today anyone who knows a requester's email address can list that person's requests. Suggested
    now: tracking needs the request number **and** the email, and shows only that one request.
    Later, once email sending is set up, a one-time code by email can replace it.
  - Test: the wrong number, the wrong email, or an email alone return nothing; the right pair
    returns exactly one request with the same few fields as today.

- [x] **19. Remove styles for parts that no longer exist (first step of the style clean-up)**
  - Files: `index.html` (inline style blocks)
  - Delete the CSS for Today's Focus, Today at a Glance, the old availability, workload and leave
    cards, Quick Actions and the old "who is free" card, after checking that no element uses each selector.
  - Test: a test confirms those selectors are gone, and the preview looks the same in both themes at
    three widths.

## Decisions needed
1. Tracking: request number + email now, email code later? *(Claude suggests yes)*
2. Do the Codex review (step 16) first? *(Claude suggests yes)*
3. Before 05:48: wait for Codex, or let Claude start step 17 now? *(Either is fine)*

---

# Follow-up plan 2 (24 Oct 2026): announcements, light mode, phones, approved by Boss

Boss asked for three things: Team Announcements back at the top of the Overview, a check that
light mode still exists and every text is readable in it, and a check that the app works on phones.

## What the checks found
- **Announcements:** before the tidy-up they sat right under the greeting, above the numbers. Now
  they are the last card in the right column.
- **Light mode switch:** still there, in the ⋯ menu ("Dark mode: on/off"), and remembered per device.
  The header's sun/moon button was hidden in step 12.
- **Light mode text:** every visible text was measured against its background (the usual standard
  is 4.5:1, or 3:1 for large text). The Overview passes apart from two tiny labels. Problems:
  - Boss board: the selected "All" filter is white text on white, so it is invisible. This has
    been on the live site since the 5 September white theme.
  - Request Centre: the Submit Request button is white on gold (1.9:1). This came from the step 13
    button style; the button was designed with navy text.
  - White text on mid-tone buttons: teal Add buttons on widgets, Boss and Dew Add Task, O's New,
    the Director queue count (2.9–3.7:1).
  - Coloured text on tinted chips: board column counts, the member header name, role and
    greeting, Event Hub titles, Reset Year, the event badge on task cards, the "due today" chip,
    the lunch-menu category and the Next Meeting label (3.2–4.5:1). Field hint text is slightly
    pale (4.1–4.3:1).
- **Phones (375 px):**
  - The Overview is 481 px wide, so it scrolls sideways and the right edge of the cards is cut
    off. The cause is the Event Board header from step 5, whose title, Show done, filter and
    fold button don't wrap.
  - In Add Task, the Save + Calendar button is cut off by about 10 px.
  - Most fields use text smaller than 16 px, so iPhones zoom in when you tap one.
  - Many buttons are only 24–30 px tall, and a few labels are 9.5–10 px.
  - Member tabs, the widget drawer, the dialogs and the Request Centre already fit.
- **Dark mode** is what anyone who hasn't picked light sees. Problems:
  - The task card Move dropdown is navy on dark and almost invisible.
  - Dew, O and Eye's selected board filter is dark on dark.
  - Today's date in the small calendars and the teal Add buttons are white on bright colours.
  - Some of the new Overview labels are too dim ("7 days", Med and High, Event Board group names).

## Steps (Codex builds each one; Claude reviews, tests and commits)

- [x] **20. Team Announcements back at the top of the Overview**
  - Files: `index.html` (Overview shell and layout lists in `ov-script`), `assets/workspace-ui.css`,
    `tests/ui-layout.test.mjs`
  - The announcements card is the very first thing on the Overview, above the greeting and search,
    full width and always open (no fold button). The layout helper keeps it there. On wide screens,
    up to three announcements sit side by side (two on tablets, stacked on phones) so the card stays
    short. Nothing else changes: pinned first, newest three, Show all, New opens the composer, edit,
    pin and delete.
  - Test: the layout tests check the new order; in the preview at 1280 px and 375 px, the card comes
    first, above the greeting, and posting, pinning, deleting and Show all still work.

- [x] **21. Light mode: every text readable**
  - Files: `assets/workspace-ui.css` (one light-mode readability block), `assets/request-centre.css`
    (Submit Request text colour), a new `tests/ui-contrast.test.mjs`
  - Fix each item listed above with the smallest colour change that reaches 4.5:1. For example:
    - the selected Boss filter becomes navy with white text
    - Submit Request gets its navy text back
    - teal buttons use #0f766e, and member buttons use a slightly deeper shade of their own colour
    - column counts sit on white
    - field hints become a darker grey
  - Dark mode is untouched. The light/dark switch stays in the ⋯ menu.
  - Test: the new test checks each colour pair reaches 4.5:1. In the preview, the contrast checker
    finds no failures in light mode on the Overview, all four member tabs (widgets open), Add Task,
    the event dialog, Settings, chat, the Request Centre and the Director's board.

- [x] **22. Phone-friendly fixes**
  - Files: `assets/workspace-ui.css` (one phone block), `index.html` (a two-line iPhone zoom fix
    next to the viewport tag), a new `tests/ui-mobile.test.mjs`
  - The Overview fits the screen: its columns can shrink, and the Event Board header wraps onto two lines.
  - Add Task's buttons wrap on narrow screens, so Save + Calendar is never cut off.
  - iPhones and iPads stop zooming in when a field is tapped; pinch-zoom still works. Android is unchanged.
  - On screens up to 640 px, filter pills and small icon buttons are at least 36 px tall, and the
    smallest labels are at least 11 px.
  - Test: the new test checks the rules and the iPhone tag. In the preview at 360, 375 and 414 px,
    every tab, the drawer, Add Task and the Request Centre are exactly the screen width, with no
    button under 32 px in the main views. Screenshots are checked.

- [x] **23. Dark mode: the same readability check**
  - Files: `assets/workspace-ui.css` (one dark-mode readability block), `tests/ui-contrast.test.mjs`
  - Fix the dark-mode items listed above: the Move dropdown, the selected filter for Dew, O and Eye,
    today's date and the bright buttons, and the dim Overview labels and field hints. Light mode is untouched.
  - Test: the contrast checker finds no failures in dark mode on the same views; light mode results
    stay the same.

- [x] **24. Final check and docs**
  - Files: `README.md`, `UI-CODE-REVIEW.md`
  - Run all tests and the contrast and phone checks in both themes, then record the changes.

- [x] **25. Merge and deploy** *(Boss: "once done merge and deploy")*
  - Merge `ux/declutter-overview` into `main`, push it, and deploy the site, including the
    Netlify functions from steps 17 and 18. Then check the live site: Overview, a member tab,
    the Request Centre and request tracking.

## Decisions (Boss, 24 Oct 2026)
1. The light/dark switch stays in the ⋯ menu; no header button.
2. Step 23 (dark mode) is included.
3. Announcements go at the very top of the Overview: the first thing people see.
4. When everything is done: merge and deploy.

---

# Follow-up plan 3 (26 Oct 2026): Direction A "Quiet Desk", approved by Boss

Scope Boss set: **UX and UI only.** No features, no flows, no business logic.
**Light mode is the focus**; dark mode is only checked for no regression.
Direction chosen by Boss from three written options: **A, Quiet Desk.**

Quiet Desk in one line: *a calm operations console where the work is the first
thing you see, navy carries structure, gold is reserved for the brand mark and
one primary action, and colour elsewhere only ever means a status.*

Brand assets are fixed: navy `#003057`, gold `#F0B323`, Sarabun, the HeadStart
landscape logo.

## What the new baseline found (26 Oct, current `main`, light mode, 1440x900)

Re-shot after steps 20-25 landed, so this supersedes the earlier notes.
Evidence: `.oil-ui/workspace-redesign/shots/now-light-boss/` and
`.oil-ui/workspace-redesign/shots/now-light-overview/`.

Steps 20-25 already fixed a great deal. The payday panel is now a compact pill,
the sidebar widgets collapse, Overview has real triage tiles, and light-mode
contrast failures dropped from 13 to 5 on the Boss tab and to zero on Overview.
What is left is mostly *too many competing surfaces*, which is exactly what
Direction A addresses.

1. **About 225px of ambient chrome before any work.** Navy masthead, navy tab
   bar, payday pill, then a full-width gold lunch banner. The gold banner is the
   loudest colour on the page and it carries ambient information.
2. **The member tab greets you three times.** The member header card (name,
   role, three counters, "GOOD MORNING" and the date), then a "Good morning,
   Boss" card with the same overdue and due-today counts, then a full-width
   "NEXT MEETING / No upcoming meetings" band that uses a whole card to say
   nothing. The task list sits below the fold at 1440x900.
3. **Five triage tiles, five different coloured top bars.** Red, gold, navy,
   blue and purple. A tile reading `0 MEETINGS TODAY` currently has the same
   visual weight as `4 OVERDUE`.
4. **Three card languages on one page.** Team Announcements has a filled navy
   header with a gold rule; Event Hub has a 5px coloured left border; the rest
   are plain white cards. The lint counts 10 coloured single-side borders on the
   Boss tab.
5. **Cards inside cards:** 6 on Overview (team rows inside the team card, the
   day agenda inside the calendar card), 2 on the member tab.
6. **Readability still short in a few places (light mode):** struck-through task
   topics at 4.32:1, the `Medium` badge at 3.71:1, and 11.5px body text in the
   team note.
7. **Two floating round buttons overlap content** at the bottom right of both
   tabs.
8. **The `O` tab reads as a bare letter** in the tab bar, much weaker than the
   other three names.

## Steps

Boss approves this list before any code is written. Each step is small and
self-contained, gets reviewed and tested, then committed.

- [x] **26. One quiet status strip replaces the payday pill and the lunch banner**
  - Files: `index.html` (header and status area), `assets/workspace-ui.css`,
    `tests/ui-layout.test.mjs`
  - Payday, lunch and the sync state merge into one slim line directly under the
    tab bar: plain text on the page canvas, no fill, no full-width colour band.
    The gold band disappears; the information stays. Recovers roughly 95px of
    first screen and removes the loudest non-work colour on the page.
  - Test: at 1440 and 375 in the preview, the first real card starts higher, no
    gold band is drawn, and payday and lunch are still readable. Layout test
    checks the strip sits between the tab bar and the first card.
  - Done (26 Oct): payday and lunch share one plain line aligned to the cards, in
    both themes; no gold band. At 1440 the first card moved up from about y=235
    to y=181, so about 55px recovered, less than the 95px estimated above. On
    iPhone the two items wrap onto two lines, each a 44pt tap target. Lunch now
    uses a gold dot instead of the icon font. **Deviation:** the sync indicator
    stays in the header: it is already a quiet dot there, so moving it would add
    risk for no gain. Three new layout tests, one of them checked to fail
    without the change. Suite 245/245.

- [x] **27. One greeting on a member tab, not three**
  - Files: `index.html` (`memberPanelHTML`), `assets/workspace-ui.css`,
    `tests/ui-layout.test.mjs`
  - Merge the member header card, the "Good morning" card and the "Next meeting"
    band into one header block: name and role, the three counters, the date, and
    the overdue and due-today pills on one line. "Next meeting" becomes a line
    inside that block and is not drawn at all when there is nothing. The task
    list moves up.
  - No change to what the counters count or to any action.
  - Test: at 1440, the All Tasks list is visible on the first screen; with no
    meetings, no empty card exists in the DOM.
  - Done (26 Oct): one greeting, in the my-day line, which already knows the hour
    and whose desk it is ("Dew's day" on someone else's tab); the header card's
    plain "Good morning" is hidden. The greeting, focus line and both chips share
    one line and wrap on iPhone. In light mode the two cards read as one: the
    header keeps its 12% wash of the member's colour, which says whose desk this
    is, over a white "today" body, with one border, one radius and one shadow.
    At 1440 the task board now reaches the first screen (status columns from
    about y=780). **Deviation:** the empty meetings card is hidden rather than
    removed from the DOM: both renderers already mark it `.none` only when
    nothing is booked, so hiding that state needs no logic change, and a booked
    meeting still shows. Dark mode gets the same layout but keeps two separate
    cards, since fusing translucent dark surfaces risked a two-tone card.
    **Noted for step 35:** on iPhone the header card is about 370px tall in its
    existing phone layout. Three new tests; suite 248/248.

- [x] **28. One card language**
  - Files: `assets/workspace-ui.css`, `index.html` where card shells are built
  - Settle on one card: white surface, hairline border, one radius, one shadow.
    Team Announcements loses its filled navy header and matches the rest. The
    coloured single-side borders go, except where a rail genuinely carries a
    status, which step 30 defines.
  - Test: the shoot lint reports no coloured single-side border that is not a
    status rail; checked at 100% and 200% zoom.
  - Done (27 Oct): every card now uses one calm shadow and one 16px radius. The
    design refresh had already defined both (`--card-shadow`, `--r-lg`), but
    older rules kept most cards on the heavy `--shadow`, so in light mode that
    one token now means the calm shadow. Hover still deepens, and search results
    still float, each with a named elevation. Team Announcements matches the
    other card heads on every measured property. Decorative rails are gone
    (Event Hub, plain announcements); rails that carry meaning stay: task
    status, a pinned announcement, and a Director request. At 1440 and at 200%
    zoom: no overflow, no rails other than those. **Side effect fixed:**
    removing Event Hub's 4px rail tipped its event grid from five columns to
    six at 1440, shrinking chips to the 150px minimum so "School Open Day"
    wrapped. That minimum was already too tight at other widths, so it rises
    to 176px above phone width; phones keep two columns. Four new tests; suite
    252/252.

- [x] **29. Quiet the triage tiles, and let zero be quiet**
  - Files: `index.html` (Overview tiles), `assets/workspace-ui.css`
  - Keep colour only where it means something: overdue red, due today amber,
    the rest neutral. A tile whose value is `0` drops to a muted treatment, so
    `4 OVERDUE` is plainly louder than `0 MEETINGS TODAY`.
  - Test: at 1440 the eye lands on overdue first; a tile at 0 is visibly quieter.
  - Done (27 Oct): the five tiles no longer carry five coloured bars. Overdue
    keeps red (bar and number) and Due today keeps amber (bar, and its number
    now in amber ink, 5.8:1); Next 7 days, New requests and Meetings are
    neutral. A count of 0 reads quietly with a muted number (6.1:1), including
    Overdue at 0, which is good news; its "All clear" note stays. The tile
    helper adds one presentational class for a zero; data, labels, click
    actions and screen-reader text are unchanged. Light mode only, per the
    agreed scope: every rule is scoped to it. Two new tests, one running the
    real tile helper at 0 and at 4. Suite 254/254.

- [x] **30. Adopt the Team Board's status and member colour scales**
  - Files: `assets/workspace-ui.css`, `index.html` where status chips are drawn,
    a new check in `tests/ui-contrast.test.mjs`
  - Reuse the scales already live on the Team Board so the two surfaces read as
    one product: status In progress `#0e6ba8`, Waiting `#a97614`, Pending
    `#6b7a8c`, On hold `#7a5ea7`, each keeping a glyph so status is never
    colour-only; members Boss `#003057`, Dew `#A65614`, O `#C2410C`, Eye
    `#14532D`. Give every tab label its member colour at a readable weight,
    which also fixes the `O` tab reading as a bare letter.
  - Test: a test asserts the app and `assets/team-board.css` use the same hex
    values, so the two cannot drift apart.
  - Done (27 Oct): the workspace now uses the Team Board's status scale in its
    three tiers: accent for rails, icons and fills; ink for text; the board's
    tints. The accent alone is too light for text in two cases (Pending 4.4:1,
    Waiting 3.8:1 on white), so the four places that write a status as text
    (kanban column names, the amber event countdown, a request's "due soon",
    a team request's "in progress") use the ink, which reaches AA on white and
    on its tint. Pending moves from teal to slate and In progress from indigo
    to blue, matching the board; Done and Canceled have no board equivalent
    and keep theirs. Status is always written out too, so never colour-only.
    Member colours already matched (the board took them from the app's tab
    labels); a test now guards that. **Note:** Dew's fill tone inside the app
    (`--accent` #e07a1f, used for its 12% wash and buttons) is lighter than
    Dew's label colour #A65614; O and Eye match in both. Changing it would
    re-theme Dew's whole tab, so it is left as is. The tab-label weight part
    of this step moves to step 34. The rendered-text lint finds no new
    contrast failures, only the five step 31 owns. Three new tests, including
    the drift guard and a computed contrast check. Suite 257/257.

- [x] **31. Clear the last light-mode readability failures**
  - Files: `assets/workspace-ui.css`, `tests/ui-contrast.test.mjs`
  - Struck-through task topics to at least 4.5:1, the `Medium` badge to at least
    4.5:1, and no body text below 13px (the team note is 11.5px).
  - Test: `ui-contrast` finds no failures; the shoot lint reports no "body text
    under 13px".
  - Done (27 Oct): a full scan of every text element on all five tabs found
    more than the three items named above, and one root cause behind most of
    them. Done cards were drawn at 85% opacity and canceled ones at 72%, which
    dragged every topic, badge and button inside them below AA (struck topics
    4.32:1, "Medium" 3.71:1, "Details" 3.93:1, Dew's dated and tagged badges,
    O's "Pending upload" and role buttons). Their colours all pass at full
    opacity, so the cards now stay opaque and recede through colour instead: a
    faint grey surface, the struck muted topic, their column and their rail.
    One rule, not eight badge patches. **Regression from step 30 fixed:** the
    kanban count badge was written in the new slate and amber accents (4.39:1,
    3.82:1); it now uses the ink, like the column names. The Overview team note
    moves from 11.5px to 13px. Result in light mode: zero contrast failures and
    no body text under 13px on any tab, by both the shoot lint and a full
    rendered-text scan; dark mode stays clean. **Observation for step 35:**
    badge and label text sits at 10 to 12px, which is conventional for labels
    but small on iPhone. Two new tests; suite 259/259.

- [x] **32. Flatten the nested cards**
  - Files: `assets/workspace-ui.css`, `index.html`
  - The 6 nested cards on Overview and 2 on the member tab become rows separated
    by hairlines inside their parent card.
  - Test: the lint reports no cards inside cards; the panels still read as lists.
  - Done (27 Oct): no card sits inside another card on any of the five tabs,
    by a scan of every surface with a border or shadow and a radius (buttons
    and pills, which belong inside cards, excluded). Team today rows, Upcoming
    Deadlines rows, Event Board groups and countdown items are now rows
    separated by hairlines, and still highlight on hover; the day agenda is a
    section of the calendar card; announcements sit side by side as plain
    blocks. **Wider than the count above:** the 13 Upcoming Deadlines rows were
    each an outlined box. The lint did not count them because they have no
    fill, but they were the most visible instance of the problem, so they are
    included. Meaning is kept: an event chip keeps its urgency rule, a Director
    request becomes a tinted section at the foot of its task with its amber
    rail, and a pinned announcement keeps its gold. No `index.html` change was
    needed. Light mode. Also fixed in the tests: each step's styles are now
    read from its own block, so a later step cannot trip an earlier step's
    checks; one already had. Two new tests; suite 261/261.

- [x] **33. The floating buttons stop covering content**
  - Files: `assets/workspace-ui.css`
  - The two round buttons at the bottom right are **Team Chat** (`.chat-fab`)
    and **Quick Add** (`.quickadd-fab`). They currently sit on top of the
    sidebar and the task list. Give the page enough bottom padding that nothing
    is ever hidden beneath them. On iPhone, step 34 adds a bottom dock, so these
    two buttons, the chat panel and the toast stack (`#uxp-toasts`) all lift
    above it.
  - Test: at 1440, 1024 and the iPhone widths, nothing in the last card is
    covered, and with the dock showing, neither button overlaps it.
  - Done (27 Oct): every tab now ends 160px clear of the bottom edge (it was
    72px on desktop, 64px at tablet width and 48px on phones), so the last
    item can always scroll out from under the 140px button stack. Before,
    the "Resources & more" toggle at the end of Overview sat under the
    buttons at every size, and "No tasks" on Boss's tab did on iPhone;
    neither is covered now at 1440, 1024, iPhone 13 or 375. Everything that
    floats (both buttons, the open chat and the toast stack) reads one lift,
    `--float-lift`, made of the dock height and the home-bar inset; a
    pretend 64px dock raised each of them by exactly 64px. Two new tests;
    suite 263/263.

- [x] **34. The tab bar: a sliding pill on desktop, a bottom dock on iPhone**
  *(option 2 of 3, recommended; Boss to confirm)*
  - Files: `index.html` (the viewport tag, and a one-letter initial on each tab
    where the tabs are created), a new `assets/ui-tabs.js` (the sliding
    indicator and the view transition), `assets/workspace-ui.css`, a new
    `tests/ui-tabs.test.mjs`
  - **Desktop and iPad:** the five tabs become one compact group on the navy
    header, instead of five slots stretched across the full width. One white
    pill glides behind the selected name and changes width as it moves. The
    name takes that person's Team Board colour: Boss navy, Dew burnt orange,
    O orange-red, Eye green, and the school gold for the team Overview. About a
    quarter of a second, a crisp snap.
  - **iPhone:** the same tabs move to a dock along the bottom of the screen,
    the standard iPhone place for top-level sections. Five equal slots, each a
    round monogram (B, D, O, E, and a four-square mark for Overview) above the
    name. The selected monogram fills with that person's colour and lifts
    slightly, and the indicator glides along the dock. The monograms are text,
    so unlike today's icons they never turn into blank boxes when the icon font
    fails to load.
  - **Moving between tabs, everywhere:** the new view fades in and travels a
    short distance from the side you moved towards, so going right comes in
    from the right and going left from the left. The switch itself happens at
    once; the motion never makes you wait, rapid tapping never queues up
    animations, and with Reduce Motion on, everything is placed instantly.
  - **Unchanged:** the five destinations, what each tab shows, the request
    badges, arrow-key navigation and the screen-reader tab roles. It is the same
    tab bar, presented differently.
  - Test: the indicator always lands under the selected tab, including after a
    resize and once fonts finish loading; the slide direction follows tab order;
    Reduce Motion places everything instantly; tab roles and arrow keys are
    unchanged; at 320, 375, 390 and 430 the dock shows all five tabs with no
    sideways scrolling and every slot is at least 44pt; nothing fixed overlaps
    the dock.
  - Order: build after step 33, since the floating buttons must already know to
    lift above the dock. Absorbs the tab-label part of step 30.
  - Done (27 Oct): built as planned. **Desktop and iPad:** the five tabs are one
    compact group in a recessed track on the navy header, lined up with the
    logo. A white pill glides to the selected tab in about a third of a second
    and changes width as it goes, settling with a 3% overshoot. The selected
    name takes that person's colour on the pill (Overview in the school gold,
    #8a5b00 on white), and saved custom tab colours carry through. Inside the
    pill each tab is drawn by a clipped copy in the selected colours, so no
    name is ever dark on navy or light on white, even halfway through a move.
    All names now share one weight, so selecting a tab never shifts the others.
    **iPhone:** the tabs become a navy dock floating above the home bar, as
    wide as its tabs: five 56 to 72pt slots for Boss, two for a member who
    sees only Overview and their own tab. Each slot is a monogram (B, D, O, E,
    and a four-square mark for Overview, drawn inline so it never depends on
    the icon font) above the name; the selected monogram fills with the
    person's colour, which blends as the pill travels. The header is 49px
    shorter on iPhone, and the old tab row, which cut Eye off and needed a
    sideways swipe, is gone. **Moving between tabs:** the new view slides 16px
    in from the side you moved towards. Only what the person does is animated
    (start-up and restored tabs are placed), and Reduce Motion places
    everything at once. **Unchanged:** destinations, request badges, arrow
    keys and tab roles. **Found and fixed on the way:** the slide briefly
    widened the page, which on a phone zooms the layout out and dropped the
    dock off screen for 0.3s, so the page now clips it; dark mode's blurred
    header would have held the dock inside itself, so on phones that header is
    solid; and `viewport-fit=cover` also lets a phone on its side draw under
    the notch, so the page, the floating buttons and the widget drawer now keep
    clear of it. Checked in Chromium with emulated iPhone safe areas at 320,
    375, 390, 393, 430 and 440: no sideways scroll, nothing fixed overlaps the
    dock, every tab name at AA in both themes (lowest 4.61:1, Dew's selected
    name). A real iPhone check on the deploy preview is still needed. 14 new
    tests; suite 277/277.

- [x] **35. Final check and notes**
  - Run the full UI suite, the contrast checks and the phone widths in **both**
    themes, confirm dark mode has not regressed, take the evidence set, send one
    independent visual review, then record what changed.
  - Done (27 Oct): **Checks:** UI suite 277/277. A rendered scan of all five
    tabs at 1440 finds no contrast failures in either theme; its only notes
    are badges and small buttons under 13px, which are not body text. Every
    tab name reads at AA on the pill, the bar and the dock (lowest 4.61:1).
    iPhone widths 320 to 440 pass in both themes with emulated safe areas;
    200% zoom has no sideways scroll; the tab behaviour checks passed three
    runs in a row. **Dark mode** keeps its look against the original dark
    baseline; only the structure changed. **Evidence** (oil-ui, light mode):
    `.oil-ui/workspace-redesign/evidence/` (desktop 1440x900 and phone
    390x844, with recordings). **Independent review** (one round, scored, by a
    reviewer with no history): **6/10.** Keep: the sliding pill with its
    colour sweep, the iPhone dock including the two-tab member dock, and the
    today list under the name on desktop person tabs. Findings, most impact
    first: (1) redo the Overview's first screen, which reads as a generic
    greeting plus equal tiles plus cards and repeats its own numbers; (2) the
    first load shows an older layout and, on iPhone, a sign-in card before the
    redesign settles; (3) on iPhone your own work starts low on your own tab,
    and the sub-tab row wraps with two items looking selected; (4) the
    floating buttons cover content at the default sizes, and Boss's sidebar
    cuts off its labels; (5) task cards lead with three rows of controls before
    the title. **Fixed at once**, inside step 34 (commit f863cfa): the new view
    arrives in the same beat as the pill and is never blank, a softer spring
    stops the pill pushing into the end of the bar, and a press now looks
    different from a hover. The review's note that the view "always rises from
    below" did not reproduce: real clicks and taps slide in from the side of
    travel on desktop and iPhone. **Everything else** is new design work beyond
    this plan, so it is written up as follow-up plan 4 below, for Boss's
    approval before any code.

## The team all uses iPhone

Boss confirmed all four of the team use iPhone, so "mobile" means iPhone
specifically. That shapes several details:

- **Widths to test:** 375 (iPhone SE, 13 mini), 390 and 393 (the standard
  iPhones), 430 and 440 (Pro Max), and 320, which is what a standard iPhone
  shows with Display Zoom switched on.
- **Touch targets:** at least 44pt, Apple's minimum.
- **The home bar:** the dock must sit clear of the line at the bottom of Face ID
  iPhones. That needs `viewport-fit=cover` in the viewport tag. The header's
  existing safe-area padding was written to expect it, but the tag never
  enabled it, so that padding does nothing today. The existing iPhone zoom fix
  only appends `maximum-scale=1` to the tag, so the two work together, and no
  test pins the tag's exact content.
- **Home Screen app:** the manifest is set to `standalone`, so if any of you
  have added the workspace to your Home Screen, it runs without Safari's bars
  and the dock sits at the very bottom edge. The safe-area padding covers that.
- **No grey tap flash,** no effects that rely on hover, and Reduce Motion from
  the iPhone's Accessibility settings is honoured.
- **No vibration:** iPhone Safari does not let web pages trigger haptic
  feedback, so all feedback is visual.
- **Testing limitation:** this cloud environment has Chromium only, not Safari.
  I can emulate every iPhone screen size, but not Safari itself, its address
  bar or the home bar. The final check of steps 33 and 34 needs one of you on a
  real iPhone, using the Netlify deploy preview, before anything is merged.

## Noticed, not in this plan

- **Icons load from a CDN** (`cdn.jsdelivr.net`, Tabler webfont). Whenever that
  request fails, every icon in the app renders as a blank box. That is an
  infrastructure change rather than UX or UI, so it is outside the scope Boss
  set. Worth its own small step later: self-host the font.

## Decisions needed from Boss (plan 3, settled)

Settled on 26 Oct: Boss chose option 2 for the tab bar. Items 1 and 2 went
ahead on the defaults stated at the time; Boss can still overrule either.

1. The lunch banner becomes a line of text instead of a gold band. Lunch stays
   visible, it just stops being the loudest thing on screen. Acceptable?
2. Dark mode: checked for no regression only, not redesigned. Correct?
3. The tab bar (step 34): option 2, a sliding pill on desktop and a bottom dock
   on iPhone, is recommended. Option 1 keeps the sliding pill at the top on
   iPhone too; option 3 is a single travelling underline. Choosing 1 or 3 means
   step 34 is rewritten to match before any code.

# Follow-up plan 4 (27 Oct 2026): what the independent review found, approved by Boss

Scope stays the same: UX and UI only, light mode first, dark mode checked for
no regression. The review scored the redesign 6/10, named one block to redo
and four issues. The steps follow its ranking, most impact first. Nothing here
is built until Boss approves.

Approved by Boss on 27 Oct, with the recommended answer to every decision
below: Team Chat moves into the header on computers and iPads; the five
Overview tiles go; the line under the product name stays; dark mode's Dew
colour stays as it is.

- [x] **36. Opening the app shows one calm screen**
  - Files: `index.html` (a cover at the top of the page, and where sign-in
    starts), `assets/workspace-ui.css`, `tests/ui-layout.test.mjs`
  - Today every open passes through three screens: the page as written in the
    HTML (the old large payday panel, only the Boss tab), then the sign-in
    card, which the app shows at once and keeps up until Firebase confirms the
    session and reads the access list, then the real workspace. A signed-in
    person therefore sees a sign-in screen flash on every open, longest on a
    phone connection. This predates the redesign.
  - Change: a branded cover (navy, the logo, "Opening your workspace") is the
    first thing drawn and stays until the person is signed in and their first
    tab is set, then fades out once. The sign-in form appears only when the
    person really is signed out. If anything stalls, the cover gives way after
    a few seconds, so it can never trap anyone. Sign-in itself is unchanged.
  - Test: record the first load at 1440x900 and 390x844 as Boss and as a
    member: from the first frame to settled, only the cover and then the
    redesigned workspace appear, the selected tab never changes after the
    cover lifts, and no sign-in screen shows for a signed-in person; a
    signed-out person still gets the sign-in form.
  - Done (27 Oct): the cover (navy, the gold briefcase mark the sign-in screen
    already uses, "Opening your workspace", a slim progress line) is the first
    element in the page, with its styles in the head so it applies from the
    first paint. The session check now runs behind it; the gate's two states
    both lift it, so it fades once, onto either the workspace or the sign-in
    form. Recorded frame by frame in the preview, with an instant, a 0.6s and a
    1.2s session check: Boss on desktop and iPhone and Dew on iPhone see only
    the cover and then Overview, with no tab change afterwards and no sign-in
    form; a signed-out person sees the cover, then the form; a check stalled
    for 9.5s shows the form at 8s and the workspace once the check completes;
    the staff Request Centre page never shows the cover. The preview gained
    `?auth=out`, `?authDelay=` and `?role=` to test this, and no longer forces
    the Boss tab when no `?tab=` is given (the real app has no such switch).
    Four new tests, including the real sign-in script run against a fake page,
    Firebase and timers; suite 281/281.

- [x] **37. Redo the Overview's first screen: the work first**
  - Files: `index.html` (the Overview layout and its team rows),
    `assets/workspace-ui.css`, `tests/ui-layout.test.mjs`
  - The review's main point: the Overview reads as a generic dashboard (a
    greeting over five equal number tiles over a grid of cards); the tiles
    repeat the list right below them; the first work row sits about two thirds
    of the way down at 1440x900, and none shows on an iPhone's first screen.
    Nothing answers "is anyone blocked?": every person shows the same green
    "Available", and the workload bar is scaled to whoever has the most tasks,
    so "5 open, Low" can draw 80% full.
  - New skeleton, top to bottom:
    1. **Team today:** one slim row per person showing only what needs
       attention, in the shared status colours: overdue (red), waiting
       (amber), on hold (purple), out sick or on leave. Someone with nothing
       wrong reads "Clear", quietly. Tapping a person opens their tab. All of
       it comes from data the app already holds.
    2. **The work list** (overdue, today, tomorrow, this week) as the largest
       block, its first rows on the first screen at 1440x900 and 390x664.
    3. Everything else below it: announcements (pinned ones as one slim
       line), requests, meetings (only when a calendar is connected),
       countdowns, resources.
  - The five tiles go: their numbers already head the work list, so no figure
    appears twice. Payday, announcements, search, requests and meetings all
    stay reachable.
  - Test: the first work row's position at both sizes; the work list is the
    largest shape in a 480px thumbnail; no number appears twice on the first
    screen; a person with overdue or waiting work, or out sick, is flagged in
    their row.
  - Done (27 Oct): the five tiles are gone. Under the payday line the
    Overview reads: one announcement line, the greeting and search, Team today,
    then the work list beside Requests and the countdown. Team today has one
    cell per person: their open count, then only what needs attention, written
    with an icon in the shared status inks (overdue, waiting, on hold, out sick
    or on leave, in a meeting or about to start one when a calendar is
    connected), or a quiet "Clear". A quiet third line keeps each person's sick
    days and lieu balance from the old Leave card. The heading keeps what the
    tiles said that the work list does not: the work done this week, and the
    next meeting today, which opens Google Calendar as the Meetings tile did.
    The workload bar and level are gone, as planned.
    Tapping a person opens their tab. On a phone each person is one short line
    (icon and count), flags wrap under the name instead of being cut off, the
    greeting and the calendar setup note give way, and refresh and the next
    meeting stay. The announcement line's text opens the full list with the
    whole text, author, date, pin and delete ("All N" when there are more),
    so nothing is out of reach on a phone. Measured in the preview at 11:30,
    with the lunch line showing: the first work row starts at 542px at
    1440x900 (621 before), 619px at 1024x768, and 537px at 390x664, ending at
    587 above the dock (592); the work list is the largest shape; no number
    appears twice; no sideways scroll at 320 to 1440. Contrast: zero failures
    on all five tabs, light and dark. Tests: 291/291 (Team today, the
    announcement line and the new layout covered; the tile tests retired).
  - One difference from the written plan, for Boss to confirm: the
    announcements stay first, as one slim line (48px on a computer, 50px on a
    phone), because Boss decided on 24 Oct that they are "the first thing
    people see". The work still starts on the first screen at every size.
    Moving them below the work is a one-line change if Boss prefers.

- [x] **38. iPhone person tabs: your work above the dock**
  - Files: `assets/workspace-ui.css`, `index.html` (the zero chips),
    `tests/ui-layout.test.mjs`
  - Today on a 390x664 screen your name card is the biggest thing on your tab
    (about 180px: name, role, three counters, the date, and a palette button on
    a row of its own), so "Dew's day" starts around y=430 and its due dates
    sit under the floating buttons. At 320 the payday line breaks mid-date.
  - Change: a compact name row on phones (name, role and the palette button on
    one line; the counters as one short line); drop "Focus: 1 due today",
    which repeats the chip beside it; hide chips that read zero; keep dates and
    counts from breaking across lines.
  - The sub-tab row (Tasks, Events, Links, Notes, Requests) stays on one line
    and scrolls if needed, and the "Widgets" button stops looking like a
    second selected tab: today it is a white pill inside the row, the same look
    as the selected tab.
  - Test: at 390x664, 375x667 and 320x568 the first two "today" rows (title
    and due date) are readable above the dock and clear of the floating
    buttons; exactly one sub-tab looks selected; nothing breaks mid-date at
    320.
  - Done (27 Oct): on a phone the name bar is one row (initial, name, role
    and the colour button; a long role ends with an ellipsis) over one short
    row of counters, 112px instead of 182; today's date gives way there. My
    day no longer repeats "Focus: 1 due today", draws only counts above zero
    at every size ("1 new request" is now singular), and on a phone puts each
    row's date under its name, on the left. Payday, the counters and the chips
    never break inside a date or a count. The sub-tabs stay on one line and
    scroll, with Widgets at the end after a hairline, never in the white
    selected pill (also on iPads). Checked on all four person tabs at lunch
    time and in the afternoon: at 390x664, 375x667 and 390x844 the first two
    rows (name and date) are above the dock and clear of the round buttons;
    at 320x568 (the first iPhone SE) they are above the dock, but the round
    buttons still cover the end of a long name there, which Step 39 takes up.
    The colour picker opens on screen at 320, 390 and 1440. Contrast: zero
    failures on all five tabs, light and dark, at 1440 and 390 wide. Tests:
    295/295.

- [x] **39. Nothing fixed covers the work; no label is cut off**
  - Files: `assets/workspace-ui.css`, `index.html` (only if Team Chat moves),
    `tests/ui-layout.test.mjs`
  - Today the round Quick Add and Team Chat buttons cover content in the first
    view: "Add" and "Reset Year" in Boss's sidebar at 1440, O's status in the
    Overview's team rows, "New requests" and due dates on iPhone. On computers
    and iPads the floating Quick Add repeats the "+" already in the header.
    Boss's sidebar also cuts its own labels short ("Petty Cas…", "Day-off in
    Lie", "Sick Leav").
  - Change: one Quick Add per screen (the header "+" on computers and iPads;
    the floating one on phones, whose header has none); Team Chat per decision
    1 below; sidebar rows let a summary drop under its title instead of
    cutting the title.
  - Test: at 1440x900, 810x1080, 390x664 and 390x844 no fixed element covers
    text or a control in the first view (checked rectangle by rectangle); no
    sidebar label is cut off at 1440 with icons loaded.
  - Done (27 Oct): on computers and iPads (above 600px) the floating "+" is
    gone, since the header "+" does the same, and Team Chat is a header
    button next to the bell with its unread count; its panel drops down under
    the header (over it on a phone held sideways). It is the same button with
    the same badge, moved by the screen width. On iPhone both stay round
    buttons above the dock, as decided, and the header has no "+". Fixed on
    the way: on the Overview the header "+" opened O's task form, because
    "theme-overview" starts with "theme-o"; it now opens Boss's, as the round
    "+" did. Sidebar widgets keep their whole name ("Petty Cash", "Day-off in
    Lieu", "Sick Leave") with the summary under it. Checked rectangle by
    rectangle on all five tabs: nothing covers text or a control at 1440x900
    and 810x1080, and no sidebar label is cut off at 1440. On iPhone
    (390x664, 390x844) the two round buttons still sit over the right end of
    a few controls in the first view (a card's fold and "Add event" buttons,
    a "Med" label, the end of the sub-tab row), which scroll clear; task names
    and dates are not covered. Moving the round buttons into the iPhone
    header or dock would clear them too; that would change decision 1, so it
    is left for Boss. Tests: 299/299; contrast unchanged, zero failures.

- [x] **40. Task cards lead with the task**
  - Files: `index.html` (the task card), `assets/workspace-ui.css`,
    `tests/ui-layout.test.mjs` and the existing task card tests
  - Today each card opens with up to three rows of controls (status icon and
    menu, "Move to…" and a red dot, five icon buttons); the title is the fourth
    line; inside a status column the status shows four times. The red dot means
    "close to deadline", which the red due pill on the same card already says
    in words.
  - Change: the title is each card's first line, with one line of facts under
    it (due, priority, event); status shown once, as one compact menu; the done
    tick stays visible, and the other actions (calendar, duplicate, edit,
    delete, and "Move to…" for Boss) sit in one quiet row at the foot; the red
    dot goes; no coloured rail on cards inside a status column. Every action
    works exactly as today, drag and drop included.
  - Test: the title is the first line of every card; status appears once;
    every action is still reachable by mouse, touch and keyboard; at 1440x900
    the first row of task titles is visible on a person tab.
  - Done (27 Oct): each card now opens with the task's name and the done
    tick beside it; then one line of facts, read as text: the status as its
    own small menu, the due date, priority, then the event (which keeps its
    coloured chip) and the rest; then the role's controls and Details; then
    one quiet row at the foot with "Move to…" (Boss only), calendar,
    duplicate, edit and delete. The separate status chip and the pulsing
    "close to deadline" dot are gone, and cards inside a status column have
    no coloured rail (an older rule forced a 5px one). A long name may take a
    third line in a column. A Director request still lands inside the card,
    above the action row. Checked by mouse at 1440, by touch at 390 and by
    keyboard (the Tab order runs tick, status, role status, Details, Move to,
    calendar, duplicate, edit, delete): every action calls exactly what it
    did, and dragging a card to another column still moves it. At 1440x900
    the first task names on a person tab now start at 846px (939 before).
    The icon buttons gained spoken names ("Duplicate this task" and so on).
    Contrast: zero failures, light and dark, 1440 and 390. Tests: 303/303.

- [x] **41. Gold back to the brand; red only for trouble**
  - Files: `assets/workspace-ui.css`, `tests/ui-layout.test.mjs`
  - The direction keeps gold for the brand mark and one primary action; today
    it also colours the payday bar, the lunch dot, a countdown pill, the "due
    today" tile and the ADMIN badge. Red marks "7 days to School Open Day" on
    person tabs, while the Overview shows the same countdown in gold.
  - Change: the payday bar and lunch dot in navy tones; the ADMIN badge as a
    quiet outline; countdowns on the status scale (amber when close, red only
    when overdue), the same on every tab; "due today" in the amber ink already
    used for "due soon".
  - Test: a rendered scan lists where gold appears (expected: the logo, the
    header rule and one main action); contrast stays AA.
  - Done (27 Oct): the payday bar and the lunch dot are navy, ADMIN is a
    quiet white outline on the header, the Request Centre's "Due this week"
    and the master calendar's event dots left gold (amber and the event teal),
    and countdowns use one scale on every tab: amber within a week, calm navy
    before that, grey once past (events are never overdue, so never red).
    "School Open Day, 7 days" now reads amber on both the Overview and the
    person tabs, counted in whole days as its label is. A task due today or
    soon reads amber, as do "Due Soon" counts and the filter dot; only overdue
    work is red. A rendered scan of all five tabs in light mode now finds gold
    only on the logo, the Overview tab's own colour in the tab bar and the pin
    of Pinned Notes (pinned things kept their gold in step 32); the header
    rule is drawn by a pseudo-element the scan does not read. Red remains for
    overdue work, the notification count, the Canceled status, sick leave
    and high priority. Dark mode keeps its amber status colour and Dew's gold
    (decision 4). Contrast: zero failures, light and dark. Tests: 306/306.
    Small markup touches were needed in `index.html` (the countdown scale,
    the due-soon class and one Request Centre colour).

- [x] **42. Quiet details**
  - Files: `assets/workspace-ui.css`, `index.html` where a label is drawn,
    `tests/ui-layout.test.mjs`
  - Stacked headings share two or three left edges (on Dew's tab they start at
    nine different positions today); the chip beside the product name that
    repeats the selected tab goes, since the tab bar now says it; the palette
    icon repeated on the role line goes; the Event Hub stops being a wide card
    around one small tile; an iPhone on its side gets a slimmer sticky header
    (it takes 150 of 342px today).
  - Test: screenshots at 1440, 810 and 390, and an iPhone on its side.
  - Done (27 Oct): the chip that repeated the selected tab beside the
    product name is gone, and so is the icon on the role line that the avatar
    already shows. Headings and rows now share two left edges at 1440: the
    page edge (38px) and one inner edge 16px inside every card (55px); on
    Dew's tab today's rows moved under "Dew's day", and on the Overview the
    deadlines, calendar, Event Board and fold all write from the same edge as
    Team today and the announcement (before: 38, 49, 55, 57, 59, 63). The
    Event Hub's tiles now share the row, and a single event is one slim line
    (date, name, countdown, delete) instead of a small tile in a wide card. A
    phone or small tablet on its side gets a two-row header, the brand with
    its controls and then the tabs: 95px instead of 151 at 844x342 (iPhone 13
    in Safari), also at 667x375 and 932x430; the signed-in name gives way
    there, ADMIN and sign out stay. Screenshots at 1440, 810, 390 and on its
    side in `.oil-ui`. Contrast unchanged, zero failures. Tests: 310/310.

- [x] **43. Final check and a second independent review**
  - The step 35 routine: suite, contrast in both themes, iPhone widths,
    evidence, then one scored independent review.
  - Done (27 Oct): suite 312/312; zero contrast failures on all five tabs,
    light and dark, at 1440 and 390; the dock passes at 320, 375, 390, 393,
    430 and 440 wide in both themes with a home-bar inset (five slots of at
    least 56x52, 24px clear of the bottom, no sideways scroll, nothing fixed
    over it); arrow keys, Reduce Motion, resizing across the phone width and
    the two-tab member dock passed three runs in a row. Evidence in
    `.oil-ui/workspace-redesign/evidence43/`, with the icons showing.
  - Second independent review, scored: **7/10** (round 1 was 6/10). It keeps
    the iPhone monogram dock, the sliding pill and Team today, and asks for no
    block to be redone. Fixed at once, as defects: on iPhone the sticky
    Widgets button covered "Notes" and nothing showed the sub-tabs scroll (it
    is now the last item, and a fade at the right edge with the next tab
    peeking out signposts the row); Team Chat on iPhone opened 2px from the
    left edge and over the header (now an even sheet below the header); the
    two round buttons differed in size; task card menus were 32px tall on
    iPhone (now 40); announcement edit, pin and delete read at 1.55:1 (now
    above 3:1); an empty search showed its clear button; a task in an event
    wore violet, the On hold colour (now the event teal); the header cast a
    shadow before anything scrolled under it; opened Details still cut the
    description short. Deleted as the review suggested: "Sick 0 · Lieu 0
    Hours" (only non-zero values are written now), "· shared by the whole
    team", "DAY AGENDA" and the clock in each person header. Its larger
    proposals change decisions or how things work, so they are follow-up
    plan 5 below, for Boss to approve.

# Follow-up plan 5 (27 Oct 2026): what the second review found, for Boss to approve

Same scope: UX and UI only, light mode first. Nothing here is built until Boss
approves. Each item names what the review measured.

1. **The iPhone first screen spends its height on chrome.** At Safari's real
   size (390x664) the header, payday line, announcement and search come
   before the work: the first task row starts at about y=500 and two rows fit
   above the dock. Proposal: a header that shrinks to one compact row after a
   scroll; the payday line inside the header's menu on iPhone; one search on
   computers (the header "Search ⌘K" and the Overview search box overlap,
   or are labelled for what each finds). Announcements stay first.
2. **Person colours read like status colours.** O's orange-red sits next to
   overdue red, Eye's green next to Done, Dew's brown next to Waiting, and
   person colour fills the largest shapes (the Add Task bar, tinted person
   headers, the Event Hub). Proposal: person colour marks people at small
   sizes (monograms, names, the tab label) and never fills large areas; the
   Add Task bar and the headers turn neutral. The tab colours themselves stay.
3. **Task cards show every control at rest.** Proposal: at rest a card shows
   the task, its due state and a few quiet details in a fixed order; the
   action row appears on hover or keyboard focus on computers and on a tap of
   the card's "more" on iPhone; inside a status column the status menu folds
   into that row. Nothing is removed.
4. **The Overview is eight equal cards** and the right column ends early,
   leaving an empty strip. Proposal: the trouble list as the one heavy block;
   Request Centre as one line when everything is zero; Event Countdown folded
   into the Event Board, which already lists the same event.
5. **Team today gives every count equal weight.** Proposal: zeros fade, the
   owner of each deadline row shows as their monogram, so "who needs Boss
   today" reads in three seconds.
6. **Tab motion.** Round 1 asked for a softer spring; round 2 finds it too
   subtle to feel playful. Proposal: a visible overshoot and settle on the
   pill, with Reduce Motion unchanged. A taste call for Boss.
7. **The department line on iPhone** has been hidden since before the
   redesign; showing it adds about 14px to the header. Boss's call.

Next review: shoot the iPhone evidence at 390x664 as well as 390x844.

## Decisions needed from Boss (plan 4)

1. **Team Chat:** recommended, the chat button moves into the header on
   computers and iPads (next to the bell), so nothing floats over the work
   there; on iPhone it stays a round button above the dock. Alternative: keep
   it floating everywhere and accept that it covers some content until you
   scroll.
2. **The five Overview tiles:** recommended, remove them, since their numbers
   already head the work list. Alternative: keep their counts as one slim line.
3. **The line under the product name** ("Marketing & Communications
   Department"): the review suggests removing it; recommended, keep it as part
   of the brand lockup.
4. **Dark mode:** the review noticed Dew is drawn in gold in dark mode, the
   same as Overview. That predates this work, and changing it means touching
   dark mode, which is outside the scope you set. Recommended: leave it.

# Bug fixes before plan 5 (28 Oct 2026): two iPhone reports from Boss

Boss reported two bugs on the live site after the merge, both on iPhone in
light mode. Both are reproduced in the preview with data like the team's.
Approved by Boss on 28 Oct: option A (the coloured tiles come back), steps 44
to 46, then merge and deploy once every check passes.

## What the checks found

1. **Event Hub: the event names are missing.** An event can carry a fill
   colour and a text colour, and the team gives its events white or cream
   text on a coloured tile. Step 32 made the chips see-through in light mode
   so they read as flat rows, but each event kept its text colour, so white
   text now sits on white (1.00:1; cream reads 1.10:1). It affects the Event
   Hub on all four person tabs, at every screen size, in light mode only; dark
   mode still shows the tiles. Caused by the redesign (step 32).
2. **The same pattern on task cards.** A task linked to a coloured event shows
   a label in that event's colours. The light-mode readability fix of 24 Oct
   (plan 2, step 21) darkened the label's text so the default teal label reads
   well, but it also overrides the event's own text colour, so a label on a
   pink event reads dark teal on pink (1.32:1). Caused by that earlier fix,
   not by the redesign.
3. **Revisions "+" and "−" do nothing on a shared card.** The buttons save
   the new count to Dew's own task list, but a card shared by Boss and Dew is
   kept in the shared list, so the live database refuses the save and nothing
   says so. Dew's own cards work. This is older than the redesign (the code
   dates from 19 Aug) and the redesign did not touch it. The colour that stays
   after a tap is the button's hover colour, which an iPhone keeps after a
   tap. Every other control on a card already saves to the right list.
4. **Older, found while checking:** in the Event Hub's Timeline view and in
   the Overview's Event Countdown, an event's name or number is written in the
   event's own colour on white. Five of the ten colours in the event colour
   picker (teal, green, amber, orange and coral) read between 2.2:1 and 3.7:1
   there, below the 4.5:1 standard.

The earlier checks missed items 1, 2 and 4 because the preview's sample data
had a single event with a colour but no text colour, and no task linked to it.

## Steps

- [x] **44. Event names readable again in the Event Hub and on task cards**
  - Files: `index.html` (a chip and a task card label say when they carry the
    event's own colours), `assets/workspace-ui.css` (the step 32 and step 21
    rules leave those alone), `tests/ui-preview.mjs`, tests.
  - Change (decision 1, recommended A): a chip whose event has a chosen text
    colour keeps the team's coloured tile, as before the redesign and as in
    dark mode; a chip with only a colour stays a flat row with the colour as
    its top line. A task card label on a coloured event shows the event's own
    colours again; other labels keep the darker teal from step 21.
  - Test: the preview's sample data gains coloured events like the team's
    (white, cream and dark text) and a task linked to one, so every later check
    sees them. With them, a rendered scan of all five tabs at 390x844 and
    1440x900 in light mode finds no unreadable text, dark mode is unchanged,
    and screenshots of the Event Hub at 390 and 1440 match the approved look.
  - Done (28 Oct): a chip whose event has its own text colour is now marked as
    a coloured tile, and the step 32 flattening and the 24 Oct label rule leave
    such chips and labels alone, so in light mode they keep their fill, as in
    dark mode (a 12px tile, no outline). With events coloured like the team's
    on an iPhone-size screen, white, cream and dark text sit on their own
    colours again: 1.00:1 and 1.10:1 before, now the team's own pairs at 2.5:1
    to 7.6:1, the same as before the redesign. A task linked to a coloured
    event shows its label in the event's colours (white on pink, 4.6:1);
    labels without colours keep the darker teal. The preview's sample data has
    four more events coloured the way the team colours theirs, and two of
    Boss's tasks are linked to coloured events. Rendered scan of all five tabs
    at 390x844 and 1440x900, light mode: no failure on the four person tabs;
    only the Overview countdown numbers and the Timeline names remain, which
    step 46 takes up. Dark mode unchanged. Tests: 315/315 (three new, and the
    step 32 test follows the narrowed rule).

- [x] **45. Revisions "+" and "−" save on every card**
  - Files: `index.html` (the buttons save through the same helper as the
    status menu, which picks the right list and records who edited, and show
    the usual message if a save fails), `assets/workspace-ui.css` (the filled
    colour only under a mouse pointer; on iPhone a short press colour that does
    not stay, and buttons large enough to tap), tests.
  - Test: a new test runs the real Revisions code against a stand-in database:
    a shared card is saved to the shared list with the editor recorded, Dew's
    own card to Dew's list, and "−" at zero saves nothing. In the preview on an
    iPhone-size screen, "+" raises the count on a shared card and on Dew's own
    card, nothing new appears in Dew's list, and no colour stays after the tap.
  - Done (28 Oct): the buttons now save through the same helper as the status
    menu: a card shared by Boss and Dew is saved to the shared list with the
    editor recorded, as its rules require; Dew's own cards to Dew's list; a
    refused save shows the usual message; "−" at zero saves nothing. The
    helper that pointed only at the personal list is gone. Every other card
    control already used the right helper. On a touch screen the filled colour
    no longer stays after a tap (a short press shows instead), and on iPhone the
    buttons are 32px instead of 24. Checked in the preview on an iPhone-size
    screen: "+" raised the count on a shared card (0, 1, 2) and on Dew's own
    card; the shared card recorded the editor and kept its creator; nothing new
    appeared in Dew's list (before, a nameless task did); the button is white
    again after the tap. Tests: 317/317 (two new: the real buttons' code
    against a stand-in database, and the touch styles).

- [x] **46. Event colours readable as text (older issue, recommended)**
  - Files: `index.html` (Timeline names and Overview countdown numbers),
    `assets/workspace-ui.css`, tests.
  - Change: in light mode, when an event's colour is too light to read on
    white, its name or number is written in a darker shade of the same colour;
    the dots keep the exact colour; dark mode unchanged.
  - Test: the rendered scan with the five light colours finds no failure in
    the Timeline view or the Overview in light mode.
  - Done (28 Oct): for an event colour too light to read on white, a small
    helper finds the lightest darker shade of the same colour that reads at
    4.5:1; a colour that already reads stays exactly as chosen. In light mode
    the Timeline names and the Overview countdown numbers use it (amber
    becomes a deep amber, light blue a deeper blue); the dots, the coloured
    tiles and dark mode keep the colour as chosen. All ten colours in the event
    colour picker, and pure yellow, now read at 4.5:1 or better as text.
    Rendered scan with events coloured like the team's, all five tabs plus the
    Timeline view on the four person tabs, at 390x844 and 1440x900, light
    mode: zero failures. Dark mode shows the colours exactly as before.
    Tests: 320/320 (three new).

Then: the suite, the rendered checks above, a new pull request from `main`,
and, if Boss agrees, merge, deploy and confirm the live deploy.

Not changed: the colours the team picks. A few pairs read below the standard
even on their own tile (white text on green, teal, amber, orange or coral);
the event form already previews the pair while choosing.

## Decisions needed from Boss (bug fixes)

1. **Event Hub look:** A, bring back the coloured tiles with their white or
   cream text (recommended); or B, keep every event a flat row with its colour
   as a top line and the text in the normal colours.
2. **Step 46:** recommended, include it (small, and in the same feature).
3. **Going live:** recommended, merge and deploy once every check passes; or
   stop at the preview so Boss can try it on an iPhone first.

# Follow-up plan 5, step by step (28 Oct 2026): for Boss to approve

Boss asked on 28 Oct to continue plan 5. Its seven proposals (above) become
the steps below. Same scope: UX and UI only, light mode first, dark mode
checked for no regression, iPhone first. Every step is checked with the
team-like sample data (coloured events, shared cards, long names).

Approved by Boss on 28 Oct: every step; the livelier spring (step 53); the
department line stays hidden on iPhone, so step 54 needs nothing built; merge
and deploy once every check passes.

Baseline (28 Oct, 390x664, the visible size of Safari on an iPhone 13 or 14):
on the Overview the header (110px), the payday line, the announcement, the
search box and Team today come first; the first task row starts at about
y=500 and two rows fit above the tab bar. Screenshots in
`.oil-ui/workspace-redesign/plan5-baseline/`.

Found while studying: the header search (Search, Ctrl K) finds only Boss's
tasks and those of a "Best" list that no tab shows, and it still offers
"New task in Best" and "Go to Junior tab". The Overview's search box finds
every person's tasks, events, notes and links. On iPhone, Sign out appears
twice: in the header and in the "⋯" menu.

## Steps

- [x] **47. iPhone: the header gives its height back to the work**
  - Files: `index.html` (the header on phones), `assets/workspace-ui.css`,
    tests.
  - Change, on iPhone only: the payday line moves into the header's second
    row, where the ADMIN label and the sign-out button sit today ("Payday ·
    2 days"; the lunch notice shows there at lunchtime; a tap still opens the
    full payday details). ADMIN moves to the top of the "⋯" menu, which
    already has Sign out. After a scroll the header shrinks to one row (logo,
    search, bell, "⋯") and grows back at the top; with Reduce Motion it
    changes without movement.
  - Test: at 390x664 and 320x568 payday reads in the header and the line
    under it is gone; the Overview's first task row starts at least 40px
    higher; after a scroll the header is one row of about 56px; nothing
    overlaps or scrolls sideways from 320 to 440; a tap on payday still
    shows its details; the lunch notice still appears at lunchtime.
  - Done (28 Oct): on iPhone payday now sits in the header's second row
    ("Payday · 2 days", or "2 days" on the smallest iPhones), where ADMIN and
    the sign-out button were. The "⋯" menu now starts with who is signed in
    and their role, and already had Sign out. The line under the header
    appears only for the lunch notice, at lunchtime. The logo row scrolls away
    with the page and the 50px row with payday, the bell and "⋯" stays pinned,
    so nothing jumps (the 5px padding change on scroll is gone on phones); in
    the Home Screen app a band in the header's colour keeps the status bar
    covered. A tap on payday from the pinned row scrolls up to show the
    details. The "⋯" menu and the bell panel now open 8px under their button
    and follow it as the header moves; at the top of the page they used to
    open over the header's own row, covering the "⋯" button. Measured at
    390x664: the Overview's first deadline row starts at 443px (491 before)
    and Dew's tab moves up by 48px; computers are unchanged. Checked at
    lunchtime and in dark mode; iPhone widths 320 to 440 pass in both themes.
    Tests: 323/323 (three new). One difference from the written plan: the
    pinned row keeps payday instead of the logo, so the header never changes
    height under your finger.

- [x] **48. One search that finds everything**
  - Files: `index.html` (the search palette and the Overview's search box),
    `assets/workspace-ui.css`, tests.
  - Change: the header search finds everything the Overview's box finds
    (every person's tasks and shared cards, events, notes and links) and its
    actions name today's tabs, from Settings (the "Best" entries go). The
    Overview's search box goes, so there is one search on every screen. On
    iPhone the header gains a search button beside the bell.
  - Test: words from a Dew task, an O note, an event and a link are each
    found and open the right place; Ctrl K and "/" still open the search;
    on iPhone the Overview's first task row moves up by the box's height.
  - Done (28 Oct): the header search now finds what the Overview's box found:
    every person's tasks and shared cards, the team's events, notes and links,
    grouped as Tasks, Events, Notes and Links. A task opens in its editor; an
    event, note or link opens the tab it belongs to. Its actions come from the
    tabs you can see, with names and roles from Settings: New task (on the
    board you are on), Go to each tab, dark mode and Settings. The "Best"
    entries and "Go to Junior tab" are gone, and a member is offered only
    their own tabs. The Overview's search box and its results went, with
    their styles. On iPhone a search button the size of the bell sits beside
    it, and the Overview's empty top bar is hidden. Measured at 390x664: the
    first deadline row now starts at 389px (491 before plan 5, 443 after
    step 47), so a third row fits above the tab bar. The search field reads
    "Search tasks, events, notes or links". Tests: 326/326 (three new; the
    step 28, step 43 and calendar tests follow the removed box).

- [x] **49. Person colours as small marks only**
  - Files: `assets/workspace-ui.css` (`index.html` only where a colour is set
    inline), tests.
  - Change, light mode: a person's colour stays on their initial, their
    name, their tab label and the tab bar, and leaves the large areas. The
    "Add Task" bar becomes the same navy button on every tab; the person
    header and the Event Hub bar lose their tinted band and thick coloured
    edge. Status colours then carry their meaning alone. Dark mode unchanged.
  - Test: a rendered scan of the four person tabs finds no area larger than
    2,000px² filled with a person colour or its tint; contrast stays clean.
  - Done (28 Oct): in light mode the name bar and the Event Hub bar are plain
    (no tint), and every primary button on a person tab (Add Task, Add Event,
    Add Link, Add Note, the templates' New) and the selected filter are the
    Overview's navy, with a darker navy on hover. A person's colour now marks
    only their initial, their name and titles, their tab label and the tab
    bar, so the status colours are the only colour coding on the page. The
    three readability rules that darkened the old person-coloured buttons
    (from 24 Oct) went with them. A rendered scan of the four person tabs at
    1440x900 and 390x844 finds no area over 2,000px² in a person's colour or
    its tint (status and event colours aside); contrast: zero failures on all
    five tabs. Dark mode unchanged. Tests: 324/324 (one new; three contrast
    entries for the removed buttons went).

- [x] **50. Task cards are calm at rest**
  - Files: `index.html` (the card's action row and a "⋯" button),
    `assets/workspace-ui.css`, tests.
  - Change: at rest a card shows its name and tick, one line of facts, and
    Details. The action row (Move to…, calendar, duplicate, edit, delete)
    appears while the pointer is over the card or the keyboard is inside it
    on computers; on iPhone a "⋯" button on the card shows or hides it.
    Inside a status column the status menu joins that row, since the column
    already says the status. Nothing is removed; every action works as today.
  - Test: every action reachable by mouse, by touch (one extra tap) and by
    keyboard (Tab reaches the row and shows it); drag and drop between
    columns unchanged; spoken names unchanged; at 1440x900 more task names
    fit on the first screen of a person tab.
  - Done (28 Oct): at rest a card is its name and tick, the facts, the role's
    controls and one bar: Details on the left, "⋯" on the right. "⋯" opens the
    action row under it (Move to… for Boss, calendar, duplicate, edit,
    delete) and closes it again; an open row stays open through a live
    refresh. Inside a status column the status menu sits in that row; elsewhere
    it stays on the facts line. A click on the card still opens the task, so
    editing is one click as before. One difference from the written plan:
    "⋯" opens the row on computers too, instead of a mouse hover, because a
    row appearing under the pointer would make every card below it jump as
    you move down a column. Checked by mouse at 1440 and by touch on an
    iPhone 13 screen: every action calls what it did before, Details opens
    its own panel, and a dragged card still lands in the Waiting column. By
    keyboard the order is tick, design status, Details, "⋯", then the row.
    Cards are about 73px shorter (Dew's first card 269px to 196px; Dew's
    board 226px shorter). At 1440x900 the count of task names fully on the
    first screen stays at four per tab, since the board starts low on the page
    and its first row was already in view; the gain shows once you scroll.
    Contrast: zero failures. Tests: 327/327 (three new).

- [x] **51. The Overview: one heavy block, columns that end together**
  - Files: `index.html` (the Overview layout, Request Centre, Event
    Countdown, Event Board), `assets/workspace-ui.css`, tests.
  - Change: Upcoming Deadlines stays the one large block. The Request Centre
    is one line ("No new requests", with Open and Copy Link) when every count
    is zero, and its full grid when anything is waiting. The Event Countdown
    becomes the first section of the Event Board ("Coming up", every upcoming
    event with its days left, delete kept), so events and their shared tasks
    are one card. The Master Calendar moves to the right column under the
    Request Centre, so the two columns end together on computers.
  - Test: at 1440x900 and 1024x768 the two columns end within 120px of each
    other; every upcoming event, with or without tasks, still shows its days
    left; no event appears twice; on iPhone the order is Team today,
    deadlines, events, requests, calendar.
  - Done (28 Oct): Upcoming Deadlines is the one large block on the left. The
    Request Centre reads "No new requests or deadlines", with Open and Copy
    Link, when every count is zero; its full grid returns as soon as anything
    arrives. The Master Calendar sits under it on the right. The Event
    Countdown became the Event Board's "Coming up": every upcoming event with
    its days left and delete button, then the shared tasks with their filter
    (an event that has shared tasks also heads them there; the separate
    countdown card is gone). Its old card hides only once the list has moved,
    so if the board ever failed to load the countdown would stay put. One
    difference from the written plan: with two columns the Event Board runs
    full width under them ("Coming up" four across), because in the left
    column it left that column 470px longer than the right. The columns now
    end within 102px of each other at 1440x900 and 1024x768. In one column
    (iPhone, iPad upright) the order is Team today, deadlines, events,
    requests, calendar, as planned; turning an iPad moves the board with the
    columns. Contrast: zero failures. Tests: 330/330 (three new; four layout
    tests follow the new arrangement).

- [x] **52. Team today: what needs Boss reads first**
  - Files: `index.html` (Team today and the deadline rows),
    `assets/workspace-ui.css`, tests.
  - Change: in Team today, overdue reads strongest, waiting next and on hold
    quietest, and a person with nothing waiting fades back ("Clear"). Each
    row in Upcoming Deadlines starts with its owner's initial in their colour,
    as in the tab bar, instead of the name written out; the date stays.
  - Test: rendered weights (overdue bold red, on hold regular); every
    initial has a spoken name; contrast clean; the Team today tests updated.
  - Done (28 Oct): In Team today, overdue reads strongest (extra bold, red),
    waiting stays bold and on hold drops to medium weight; a person with
    nothing to flag fades back, their name in grey beside a quiet "Clear".
    Each row in Upcoming Deadlines opens with its owner's initial in their
    colour; the written name stays for screen readers only, so the row reads
    initial, topic, date and priority. White on every person colour reads at
    5:1 or better, and a saved tab colour is always darkened until it does.
    One small difference: on hold is medium (500) rather than regular, so it
    stays crisp at 13px. Contrast on the Overview: zero failures in light
    mode; in dark mode one older finding that is not from this step (an
    event's days-left number in a very dark event colour, raised with Boss).
    Tests: 334/334 (four new; the Team today tests follow the new class).

- [x] **53. Tab motion (decision 2)**
  - Files: `assets/workspace-ui.css` (the pill's spring), tests.
  - Change if chosen: the pill overshoots by about 4% and settles, in the
    same 0.34s; Reduce Motion unchanged.
  - Test: a frame recording of a move; the tab bar checks pass three runs in
    a row.
  - Done (28 Oct): the pill now overshoots by 4% and settles, in the same
    0.33s it already took (the plan said 0.34s by mistake); a browser without
    the newer curve gets one overshoot of about 4% too. One addition to the
    plan: at either end of the bar a 4% overshoot would push the pill out of
    the bar and cut it off, so there it squashes against the edge for a
    moment instead, by about as much as it would have overshot, and springs
    back; between tabs nothing is held back. That needed two measurements in
    the tab script (`assets/ui-tabs.js`): where the row of tabs starts and
    ends. Reduce Motion is unchanged: no glide, no slide. Recorded frame by
    frame on a computer and an iPhone: a 4.0% overshoot on every move between
    tabs, the pill never leaves the row, and it settles exactly on the tab.
    The tab bar checks (arrow keys, Reduce Motion, resizing, the two-tab
    dock, iPhone widths 320 to 440) passed three runs in a row. Tests:
    340/340 (three new).

- [x] **54. The department line on iPhone (decision 3)**
  - If shown: under the product name at the top of the page, gone once the
    header shrinks (step 47). If kept hidden: nothing to build.
  - Done (28 Oct): Boss chose to keep it hidden on iPhone, so the space goes
    to the work; computers and iPads still show it. Nothing to build.

- [ ] **55. Final check and a third independent review**
  - The suite, contrast in both themes, iPhone widths 320 to 440, evidence
    at 390x664, 390x844 and 1440x900 with the team-like data, one scored
    independent review, and one walk through the main tasks (add a task,
    change its status, find something) by a reviewer who has not seen the
    work.
  - Status (28 Oct): every automated check passes: the suite 340/340;
    contrast scans with zero failures in both themes, at 1440 and 390 wide,
    with the Event Hub in list and Timeline views; iPhone widths 320 to 440
    in both themes; the tab bar checks three runs in a row. Evidence at
    390x664, 390x844 and 1440x900 is in
    `.oil-ui/workspace-redesign/evidence55/` (not committed). On 390x664 the
    first deadline row starts at 389px with three rows above the dock; on
    computers the Overview columns end within 25px. Boss asked to deploy
    before the usage limit, so plan 5 was merged and deployed while the
    independent review and the walkthrough were still running; their
    findings follow as a separate fix.

## Decisions needed from Boss (plan 5)

1. **The plan:** recommended, approve steps 47 to 55 as written; or approve
   them without step 50, keeping every card's buttons visible.
2. **Tab motion:** recommended, the livelier spring, closer to Boss's first
   wish for a more playful tab bar; or keep the current gentle one.
3. **The department line on iPhone:** recommended, keep it hidden so the
   space goes to the work; or show it at the top of the page.
4. **Going live:** recommended, merge and deploy once every check passes; or
   stop at the preview first.

# Fixes found during plan 5 (28 Oct 2026): for Boss to approve

Boss sent a screenshot on 28 Oct: on a computer, the Deadlines calendar in a
person tab's sidebar has its name covered by the "<" month button. It is
reproduced in the preview, and the check across every sidebar widget found
more of the same.

Approved by Boss on 28 Oct: step 56 as written (the month switcher stays in
the header, on its own line when it does not fit) and step 57.

## What the checks found

1. **Sidebar widget headers on computers (Boss's screenshot).** Step 39 (live
   since 27 Oct) made each sidebar widget header a two-line grid, so a folded
   widget's summary sits under its name. In that grid the name gets whatever
   width the buttons leave. Two headers have wide controls: Deadlines (the
   month switcher) and Calendar (the Month and Upcoming switch, with refresh).
   There the name has 50 to 70px less room than it needs, so the month
   switcher covers "Deadlines" and the Month and Upcoming switch hides
   "Calendar" completely. All four person tabs, whenever the widget is open.
   Caused by the redesign (step 39).
2. **The same headers on iPhone and iPad, in the Widgets panel.** Below 981px
   wide the drag handle is hidden, and the grid then puts the first button in
   the handle's place, in front of the name: Add (Day-off in Lieu), Reset Year
   (Sick Leave), refresh (Phuket Weather, Calendar, Asset Library), + and
   settings (Petty Cash), Add (Recurring Templates), and the month switcher
   (Deadlines), which pushes "Deadlines" past the edge. Every person tab, open
   or folded. Caused by step 39, whose checks looked at computers with the
   widgets folded, which is why this was missed.
3. **Older, found while checking: event colours as text in dark mode.** Step
   46 made an event's own colour readable as text in light mode only. In dark
   mode the days-left number in "Coming up" and the event name in the Event
   Hub's Timeline view still use the raw colour on the dark card, and five of
   the ten colours in the event colour picker read below 4.5:1 there (navy
   1.5:1, purple 3.1:1, blue 3.4:1, grey 3.7:1, pink 3.8:1). Older than plan
   5; dark mode only.

## Steps

These run before step 55, so the final check and the third review cover
them, and they ship with plan 5.

- [x] **56. Sidebar widget headers: the name first, nothing covers it**
  - Files: `assets/workspace-ui.css` (the step 39 header rules make way for a
    step 56 block), tests.
  - Change: every sidebar header reads the same way on every screen: the drag
    handle (computers), the name, then its buttons on the right. When a button
    does not fit beside the name, such as the month switcher, it moves to its
    own line under the name, still on the right, so it never covers the name.
    A folded widget's summary stays under its name, lined up with its first
    letter.
  - Test: on all four person tabs, open and folded, at 320, 390 and 430 wide
    (Widgets panel), 768, 1024 and 1440: no button before the name, nothing
    overlaps, nothing outside the header, the name always has the room it
    needs; the summary starts under the name's first letter; the month arrows,
    Reset Year, Add and refresh still work, and tapping them does not fold
    the widget; before and after screenshots, including Boss's case.
  - Done (28 Oct): every sidebar header now reads the same way on every
    screen: the drag handle (computers), the name, then its buttons on the
    right. The Deadlines month switcher and the Calendar's Month and Upcoming
    switch sit on their own line under the name, on the right; the Calendar's
    refresh stays beside the name. A folded widget's summary starts exactly
    under the name's first letter (it sat 8px to the right before). On the
    narrowest phones (320px) a long folded name wraps instead of being cut,
    and a button that does not fit beside its name moves under it. Checked on
    all four person tabs, open and folded, at eleven sizes from 320 to 1440:
    no button before a name, no overlap, nothing outside a header. The month
    arrows, the Month and Upcoming switch and Add still work without folding
    the widget, and a tap on a header's free space still folds it. Tests:
    335/335 (two new; the step 39 header test moved here).

- [x] **57. Event colours readable as text in dark mode too (older issue,
  recommended)**
  - Files: `index.html` (the event text colour helper from step 46),
    `assets/workspace-ui.css`, tests.
  - Change: as step 46 did for light mode, an event colour too dark for the
    dark card is shown in the nearest lighter shade of the same colour that
    reads at 4.5:1, for the days-left number and the Timeline name only. The
    event keeps its colour everywhere else, and light mode is unchanged.
  - Test: all ten picker colours, and a custom very dark one, read at 4.5:1
    or better on the dark card and still on white; the dark-mode contrast scan
    shows zero failures on the Overview and the Event Hub.
  - Done (28 Oct): in dark mode an event colour too dark for the card now
    shows its days-left number ("Coming up") and its Timeline name in a
    lighter shade of the same colour: navy becomes slate blue, purple a
    lighter purple, the team's dark gold a muted gold. The shade is measured
    against the card's hover tint, so it reads at 4.5:1 or better at rest and
    on hover; the event's dot and every other use keep the colour as chosen.
    Light mode is unchanged. Contrast scans on every tab, list and Timeline
    views, at 1440 and 390 wide: zero failures in both themes (at 1440 wide,
    dark mode had 28 failing texts on the Overview and three person tabs
    before). Tests:
    337/337 (two new; three step 46 tests now also expect the dark shade).

## Decisions needed from Boss (fixes found during plan 5)

1. **Step 56:** recommended, approve it as written; or also move the
   Deadlines month switcher inside the calendar, above the days, which needs a
   change to how that widget is built on every tab.
2. **Step 57:** recommended, include it (small, the same helper as step 46);
   or leave dark mode as it is for now.

# Follow-up plan 6 (28 Oct 2026): what the third review and the walkthrough found, for Boss to approve

Plan 5 went live on 28 Oct (PR #9) before the two independent checks
returned, at Boss's request. Both are back:

- **Scored visual review: 7/10** (the same as round two). It confirms the
  iPhone header, one search, the Event Board, the initials on deadline rows,
  the tab motion and the dark-mode event text. Keep: the Overview deadline
  list and the tab pill. What holds the score at 7: the iPhone round buttons
  cover row controls, and person tabs do not open on the person's work.
- **Walkthrough:** a reviewer who had not seen the work added a task for Dew
  on an iPhone. It worked, after a detour.

Their reports, scripts and screenshots are in
`.oil-ui/workspace-redesign/review55/` and `ux55/` (not committed).

Approved by Boss on 28 Oct: every step (58 to 66), then a fourth independent
review, merge and deploy; the round buttons slide away while scrolling
(decision 2, A); a "For" line at the top of Add Task (decision 3); person
tabs open on the tasks, with the Event Hub after them (decision 4).

## What the checks found

1. **Bug (older): a task shared with an event lands under "Other"** on the
   Event Board until it is saved a second time. Confirmed in the code: a new
   shared card takes its event group from the "Event name" box, which picking
   the event does not fill, and the board groups only by that box
   (`assets/event-board.js`).
2. **Bug (older, Boss's tab only): the Deadlines legend** reads "Task" and
   "Sick", but deadlines due soon are drawn red, so they look like sick days.
   The other tabs' legend reads "Deadline" and "Due soon".
3. **Readability in light mode:** the filled event tiles fade towards the
   bottom, so their lower text drops to 4.0:1 on pink and 4.2:1 on olive, and
   the tile dates (9.5px at 78% opacity) read at about 3.3:1. Four texts are
   12.5px (the day summary rows, the director request lines, the event chip
   names). My contrast scan skips text on a gradient, which is why it
   reported zero; it will sample those too.
4. **iPhone: the two round buttons** ("+" and Team Chat) sit in the lane of
   each row's controls (the done tick, "⋯", the priority, delete). At most
   scroll positions one of them covers a control, so a tap meant for a tick
   can open Add Task or the chat.
5. **Person tabs do not open on the person's work:** on iPhone the name card,
   the Event Hub (391px), the sub-tabs, a full-width Add Task bar and the
   filters come first, so the first task card starts about 1.6 screens down.
   On a computer it starts at y=818 of 900.
6. **Finding and adding:** opening a task from search or from an Overview
   deadline switches tab but leaves the card off-screen and unmarked; a new
   task saves without a word, often into a folded group; each tab keeps the
   previous tab's scroll position; on iPhone the page behind the Add Task
   sheet scrolls along.
7. **Choosing who a task is for** appears only after ticking "Share this
   card with the team".
8. **Colour on cards:** "Due today" and "1d left" use exactly the Waiting
   amber, and Medium priority a near twin; one event's tag is teal on one card
   and pink on the next; person tags are one blue for everyone.
9. **iPhone Overview:** Upcoming Deadlines shows no title, and its "7 days"
   filter is cut off under the fold button. Overview deadline rows cannot be
   reached with the keyboard.
10. **Extras the review would remove:** the keyboard hints and "ESC" in the
    iPhone search; "(Ctrl K)" in the iPhone "⋯" menu; the "N days" pills on
    the Event Board (the big number already says it); the payday panel says
    "2 days left" four ways; "Calendar not connected" inside Team today
    (belongs in Settings); the iPhone full-width Add Task bar (the same sheet
    as "+"); delete buttons shown at rest on event tiles and Event Board rows;
    the second "Good morning, Boss"; the dashed "No tasks" box.
11. **Polish:** card titles and left edges do not share one line; a widget's
    name moves 54px right when it unfolds (the reorder arrows appear); the
    Overview columns end 24px apart; a "⋯" alone on its own row; the director
    request wears five decorations; priority labels at 10px; a square focus
    ring in the round search field; three calendar styles; marking a task
    done makes the next one jump under the thumb; the app opens white, then
    navy, then light.

Noted, not changed: the payday line above the announcement (it is the status
line under the header on every tab; the announcement stays first in the
Overview, as Boss decided on 24 Oct); a person's name, role and titles in
their colour (step 49 kept these marks on purpose).

## Steps

- [x] **58. Bugs: the event a task belongs to, and the Deadlines legend**
  - Files: `index.html` (saving a task, Boss's Deadlines legend),
    `assets/event-board.js`, tests.
  - Change: a shared task takes its event from the Event picker when the name
    box is empty, and the Event Board falls back to the event's name, so no
    task lands in "Other" by mistake. Boss's Deadlines legend matches the
    other tabs (Deadline, Due soon) and sick days keep their own mark.
  - Test: a shared task made with the picker alone shows under its event at
    once; existing cards are unchanged; every dot colour has a legend entry.
  - Done (28 Oct): picking an event now also fills a shared card's "Event
    name" (unless someone typed their own name, which is never overwritten),
    saving falls back to the picked event if the box is empty, and the Event
    Board files a card by its event's name when it has no label, so cards
    already saved that way leave "Other" too. The walkthrough's path, run
    again on an iPhone screen: Order printed banners for Dew, School Open Day
    picked, saved once, and School Open Day goes from 4 to 5 open with no
    "Other" group. Every Deadlines calendar's legend now reads Deadline (navy
    dot), Due soon (red dot) and Sick day (a tinted square, as a sick date
    is drawn), on Boss's tab and the others. Noticed in dark mode, older and
    left as it is: the navy deadline dot is faint on the dark card. Tests:
    343/343 (three new).

- [x] **59. Readable event tiles; no text under 13px**
  - Files: `assets/workspace-ui.css`, tests; the contrast scan learns to
    sample gradients.
  - Change: the tiles keep each event's own colours but stop fading; their
    dates read at 4.5:1 or better; the four 12.5px texts become 13px.
  - Test: pixel-sampled contrast on every tile at 1440 and 390, both themes.
  - Done (28 Oct): a filled tile is now its event's colour edge to edge, and
    its date is drawn at full strength at 11px (it was 9.5px at 78%). One
    thing the fade had hidden: some colour pairs the team chose never reached
    4.5:1 even at the top of a tile, for example white on the light blue of
    Open House (3.0:1). Where that happens, the tile, the task card's event
    label, the event form's preview and the Run-up Timeline's event-day bar
    now use the nearest shade of the same colour that reads (darker under
    light text, lighter under dark text); the text colour the team chose
    stays, and a pair that already reads is untouched. The event names, the
    day summary rows and the director request lines are 13px. The contrast
    scan now checks every colour of a gradient instead of skipping it: run
    on the old tiles it finds what the review found (dates at 3.45:1, pink
    names at 3.83:1); on the new ones, zero failures on every tab in both
    themes, at 1440 and 390, in list and Timeline views. Tests: 345/345 (two
    new; one step 44 test follows the solid tile).

- [x] **60. After you add or open a task, you see it (decision 3)**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: saving says what happened ("Added for Dew · due 2 Nov", with
    Show); opening a task from search or an Overview deadline scrolls to its
    card and marks it for a moment; each tab opens at its top; on iPhone the
    page behind a sheet stays still. If chosen, a "For" line at the top of Add
    Task shows whose board the task goes to and lets Boss change it.
  - Test: add a task from the Overview and from a person tab; open one from
    search and from a deadline row; on a computer and an iPhone.
  - Done (28 Oct): Add Task now opens with "For" at the top, for an admin
    adding a task: it starts with the board you are on, choosing someone else
    puts the task on their board (what was typed stays, and the form follows
    that person: their event list and Dew's or O's request fields), and
    "Several people (a shared card)" ticks the share option and shows its
    people. A member adding to their own board, and anyone editing, does not
    see it (Move to already moves a task). Saving now says what happened,
    for example "Added for Dew · due 2 Nov", with Show, which opens that
    person's tab at the new card and marks it with a ring that fades
    (switching a hidden filter back to All if needed). A search result and
    an Overview deadline row do the same, the search then opening the
    editor as before, so the card is in view once it closes. Every tab now
    opens at its top. On iPhone and iPad the page behind an open sheet stays
    still while the sheet scrolls (checked with a real touch drag). Checked
    end to end at 390x844 and 1440x900. Tests: 350/350 (five new; the search
    and deadline row tests follow the new behaviour).

- [x] **61. iPhone: the round buttons never cover a control (decision 2)**
  - Files: `assets/workspace-ui.css`, `index.html`, tests.
  - Test: the reviewer's check (every 40px of scroll at 390x664 and 390x844
    on the Overview, Boss and Dew) finds no control under a round button
    while scrolling.
  - Done (28 Oct): on iPhone the round "+" and Team Chat buttons slide down
    out of sight as soon as the page scrolls down, and come back as soon as
    it scrolls up, near the top of the page, or while Team Chat is open;
    from the moment they start to leave, a tap goes through to the card
    underneath. With Reduce Motion they simply fade. iPads and computers are
    unchanged. The reviewer's own check, rerun: covered positions went from
    21 to 46 per page to 0 on Dew and 1 on the Overview and Boss, that one
    being the very top of the page, where the buttons stay as decided.
    Tests: 352/352 (two new).

- [x] **62. Person tabs open on the person's work (decision 4)**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: on iPhone the name card slims to one line and the tasks come
    before the Event Hub; the full-width Add Task bar goes (the round "+"
    opens the same sheet); on computers the first row of cards sits above the
    fold.
  - Test: at 390x664 the first task card starts in the first screen; at
    1440x900 the first full row of cards is above the fold; the Event Hub
    keeps its coloured tiles.
  - Done (28 Oct): on every person tab the Event Hub now comes after the
    tasks, on every screen, and keeps its coloured tiles. On iPhone the
    full-width Add Task bar is gone (the round "+" opens the same sheet), the
    filters are one row that scrolls (an addition, as on the Overview), and
    from 375px wide the name card is one line: initial, name, the three
    counters with their icon and number (screen readers still hear Active,
    Due Soon and Done) and the colour button; on 320px screens it keeps its
    two rows. Measured at 390x664: the first task card now starts at 542 to
    578px (1092 to 1128 before), just above the dock, which still covers
    most of it; the trims in step 64 lift it further. At 1440x900 it starts
    at 622px (818 before), so the first row of cards is above the fold.
    iPhone widths 320 to 440 pass. Tests: 354/354 (two new).

- [x] **63. Colour on a card means a status, a person or the event**
  - Files: `assets/workspace-ui.css`, `index.html`, tests.
  - Change: due-soon dates read in plain ink with a clock (overdue stays
    red), so Waiting amber appears only on Waiting; Medium priority is
    neutral; one event tag style in the event's own colour; person tags carry
    the person's initial in their colour.
  - Test: sample every pill colour on the cards of all four tabs.
  - Done (28 Oct): due soon reads in bold ink with a clock; overdue and High
    stay red. Medium priority, a pending upload, a shoot time and a revision
    count are quiet facts; a request number and the old "Together" category
    take the navy of the other facts. Every event tag, on personal and shared
    cards alike, is one style in the event's own colours: its fill under its
    own text colour, or a tint with a readable shade of the colour as text.
    An event with no colour, or no longer on the calendar, gets a quiet grey
    tag; the teal and violet labels are gone. Shared cards find their event
    by name, and the Event form's preview shows the same tag. A shared card
    shows each person's initial in their colour, then the names in ink.
    The boards now also redraw when the events change, so a tag follows its
    event. Found on the way: in dark mode Dew's design menu showed "Approved"
    at 3.5:1 (dark green on near black); Approved and In progress now use
    the theme's status colours. Sampled every tag on the cards of all four
    tabs in both themes: colour is left only on statuses, people's initials
    and events. Contrast scans: zero failures in both themes at 1440 and
    390, Timeline included. Tests: 360/360 (seven new; the old teal pair
    retired).

- [x] **64. Trim (item 10)**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Test: each removed text is gone, nothing it pointed to is lost, and the
    person's work moves up rather than leaving gaps.
  - Done (28 Oct):
    - Search: on iPhone the "ESC" chip is now a "Cancel" button (44px)
      that closes the sheet; before, the only way out was tapping the dimmed
      area. The keyboard hints row is gone there, and the placeholder is
      shortened to fit beside Cancel. Computers keep "ESC" (now clickable)
      and the hints. The "⋯" menu reads "Search" on touch screens.
    - Event Board: no "N days" pill beside the big number ("1 day" is
      singular); only Today and Tomorrow keep a word.
    - Payday panel: the ring (days left, filling as the period passes), Next
      Payday and Pay Period stay; the count of days gone, the second bar and
      the "Soon" or "On track" badge are gone. "Payday!" still shows on the
      day. On iPhone the panel is 152px tall (243 before), and on computers
      the two cells sit side by side with their labels on one line.
    - Calendar setup: the note moved from Team today to the Google Calendar
      card in Settings. Boss sees who has not connected; everyone else sees
      their own calendar. Team today is 22px shorter on computers.
    - The iPhone full-width Add Task bar already went in step 62.
    - Delete buttons: on touch screens they are removed (not just hidden)
      from event tiles, Coming up rows and Timeline items, so nothing can be
      tapped by accident. An event is deleted from its own page (tap the
      tile); computers still show the button on hover and focus.
    - Greeting: the Overview says "Good morning, Boss"; My day on your own
      tab now reads "Today", and its filler line went too. Boss's first task
      card on a 390x664 iPhone moves up from 568 to 542px.
    - Empty columns: the dashed "No tasks" box is gone. An empty column is
      its header and its 0, and opens a 56px drop area while a card is
      dragged over it (checked with a real drag and drop). On iPhone each
      empty column gives back 70px.
    - Checks: nothing moved down on any tab at 390x664 or 1440x900. Contrast
      scans: zero failures in both themes, Timeline included. iPhone widths
      320 to 440 pass. Tests: 367/367 (seven new).

- [x] **65. Polish (items 9 and 11)**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: the iPhone deadlines title and full filter row; deadline rows
    reachable by keyboard; one set of left edges; a widget's name keeps its
    place when it unfolds; the columns end together; card footers one height;
    the director request as one quote and one action; priority at 13px; a
    round focus ring; one calendar style; a finished task lingers a moment so
    nothing jumps under the thumb; the app opens without the white flash.
  - Test: measured edges and column ends; a recording of marking a task done.
  - Done (28 Oct):
    - iPhone deadlines: the title is back, with its fold button beside it,
      and the four filters have a row of their own (all fit from 320px). The
      first deadline row on a 390x664 screen moves from 389 to 439px.
    - Deadline rows are buttons in the tab order: Enter or Space opens the
      task, with a focus ring.
    - Left edges: every Overview card title starts at the same point (Team
      today now has the same icon chip: 79 to 93px). In light mode, deadline
      rows, Coming up rows and Event Board groups and rows start at the
      card's edge, like their labels (11 to 23px in before); their hover
      tint reaches into the card's padding instead.
    - A widget's name stays put when it unfolds (it moved 54px before); the
      reorder arrows now follow the name.
    - The Overview columns end together from 1100 to 1920px wide (24px
      apart before).
    - Card footers: a card with details ends in one bar, Details and "⋯",
      one height (30px on computers, 40px on iPhone). A card without details
      has no footer row; its "⋯" sits in the corner of its facts.
    - Director request: one amber rule as the quote, a quiet label, the
      request, the note, who and when, and one "Mark as handled". The tint,
      badge, banner and dashed rule are gone; it is 144px tall (183 before),
      117 on iPhone (149).
    - Priority on deadline rows is 13px text beside a 13px date (10px pills
      before); Low is no longer blue.
    - The search field's focus ring is rounded, like the field.
    - One calendar style: plain day numbers on the Overview too (no grey
      tiles), today navy on every tab, and deadline dots navy everywhere, as
      the legend says. On Dew's, O's and Eye's tabs both were in the
      person's colour.
    - A finished task lingers: once ticked, it stays where it is for 1.4
      seconds, at its height, and "Today" above it waits too; then it moves.
      Recorded at 390 and 1440: nothing under the thumb moves during that
      moment. A quick second tick (undo) leaves it where it is.
    - Opening: the font and icon style sheets no longer hold back the first
      paint, and the page is navy until the cover lifts. With those style
      sheets slow (1.5s), the first paint came at 1676ms (white until then);
      it is now 112ms (navy), and the app is ready at 579ms instead of
      2113ms. With fast style sheets both open alike.
    - Checks: contrast scans zero failures in both themes, Timeline
      included; iPhone widths and the tab bar pass. Tests: 376/376 (ten new).

- [x] **66. Final check and a fourth independent review**
  - Done (28 Oct):
    - Final check: 376/376 tests. Contrast scans: zero failures in both
      themes at 1440 and 390, Timeline included. iPhone widths 320 to 440 and
      the tab bar pass, and so do the end-to-end checks of steps 58 to 65.
    - Found and fixed on the way: a colour-only event's tag (School Open Day,
      light blue) read at 4.00:1, because its text shade was measured on white
      rather than on the tint it sits on. It is now measured on the tint, over
      the greyer card of a finished task, and in dark mode aims for 5.3:1 so
      it still reads at 4.5:1 when a finished card fades. The scans now
      include cards tagged with colour-only events.
    - Boss's question, why an event tag on the Boss tab did not match its
      event's colour: three causes on the live site (plan 5). Teal text was
      forced on any event with a colour but no text colour; a card linked to
      its event by name got the default teal tag; and shared cards always used
      a fixed teal tag. Step 63 fixes all three. Compared event by event with
      the live code, every tag on Boss's tab now matches its Event Hub tile.
    - Fourth walkthrough (independent reviewer, iPhone 390x844, its own path):
      as the lead it found the School Open Day task with no owner, gave it to
      Eye and confirmed it on Eye's tab. It completed the task, with three
      hesitations and one wrong turn. Older behaviours, not changed by plan 6:
      - a shared task with no owner is missing from Upcoming Deadlines and
        Team today;
      - tapping an event under "Coming up" opens the Boss tab, not the
        event;
      - an event's own page counts only cards linked to it;
      - the assign menu on the Event Board keeps focus, so on a computer the
        row looks unchanged until you click elsewhere;
      - a shared task's row cuts its title, opens nothing and shows no
        priority.
      These go to Boss as a proposed follow-up plan. The repeated task names
      it saw are the preview's demo data.
    - Scored visual review (returned after the merge): 7/10, the same as
      rounds two and three, for new reasons; its findings are in follow-up
      plan 7 below.
    - Notes and evidence: `.oil-ui/workspace-redesign/evidence66/`, `ux66/`
      and `review66/` (not committed).

## Decisions needed from Boss (plan 6)

1. **The plan:** recommended, approve steps 58 to 66; or only the bugs and
   readability (58 to 60) for now.
2. **iPhone round buttons:** A (recommended), keep both, but they slide away
   while you scroll down and come back when you scroll up (Boss's 27 Oct
   decision stands; at the very top of a page they still sit over the lower
   right corner); or B, "+" joins the dock and Team Chat moves beside the
   bell, so nothing ever floats over the work (this changes the 27 Oct
   decision).
3. **Who a task is for:** recommended, a "For" line at the top of Add Task:
   it starts with the board you are on, and choosing someone else puts the
   task on their board (choosing several makes a shared card, as now); or
   keep today's form.
4. **Person tabs:** recommended, the tasks first and the Event Hub after
   them; or the Event Hub stays first but starts folded on iPhone.

# Follow-up plan 7 (28 Oct 2026): what the fourth review and walkthrough found, for Boss to approve

Plan 6 went live on 28 Oct (PR #10) before the scored review returned, at
Boss's request. Both independent checks are now back:

- **Scored visual review: 7/10**, the same as rounds two and three, for new
  reasons. Keep: Team today, the jump from a deadline row to its card with a
  ring, and the colour picker's darkening of light picks. What holds the
  score at 7: ticking a task done has no Undo and can lose the task's status;
  on a computer the work is not the heaviest thing on the first screen; red
  and gold no longer mean one thing each. Next after those: dark mode has
  its own colours, and the header glows and boxed sidebar read as a template.
- **Walkthrough:** a reviewer who had not seen the work, as the lead on an
  iPhone, found a School Open Day task with no owner and gave it to Eye. It
  worked, with three hesitations and one wrong turn, all in older Overview
  and Event Board behaviour.

Each finding below was checked in the code and on the preview before this
plan was written. The reports, scripts and screenshots are in
`.oil-ui/workspace-redesign/review66/` and `ux66/` (not committed).

Approved by Boss on 28 Oct: **only the bugs for now**: steps 67, 69 and 70,
and the colour picker bug from step 72 (step 72a below), with nothing
visual changed; this round ends with a final check of those fixes. Decisions
recorded for when the other steps are built: the tick moves to the left of
each card's name and both round buttons stay (step 68, A); the Payday line
stays where it is (step 71); the greeting goes and the date stays (step 71).
Steps 68, 71 to 76 and the fifth review (77) wait.

## What the checks found

1. **Bug (older): un-ticking a finished task loses its status.** Ticking
   sets Done; un-ticking always sets Pending, so a task that was Waiting or
   In Progress comes back as Pending (`toggleTaskDone`). Nothing offers an
   Undo after a tick.
2. **The board moves after a tick.** The finished card waits 1.4 seconds,
   then leaves. If it was overdue or due today, the Today panel above the
   board loses a row and the whole board jumps up (36px on a computer, 45px
   on iPhone).
3. **iPhone, at the top of a page, the round buttons cover card controls.**
   At 390x844 on Boss's tab they cover the middle of the first card's "⋯"
   and of the second card's tick; on Dew's tab the first card's "⋯"; at
   390x664 part of a tick. While scrolling they slide away, as decided in
   plan 6.
4. **Bug (older): work with no owner is missing from the Overview.** The
   Overview counts a shared card under its first owner only, and a shared
   card with no owner under nobody, so it is left out of Upcoming Deadlines
   and Team today. The only sign is "1 unassigned" on the Event Board, about
   2.4 screens down on an iPhone. A card shared by three people shows one
   initial.
5. **Event Board (older):** tapping an event under "Coming up" opens the
   Boss tab, not the event. An event's own page shows only the tasks on that
   person's board, so School Open Day reads "1 open" there and "4 open" on
   the Event Board. A shared task's row cuts its name, shows no priority and
   opens nothing when tapped. After choosing an owner on a computer the row
   looks unchanged until you click elsewhere, then jumps to another place.
6. **Desktop first screen (1440x900):** the Payday line comes before the
   team announcement; "Good afternoon, Boss" is the largest text on the
   Overview; on a person tab the full-width navy Add Task bar is the
   heaviest shape and the first card starts at 623px of 900; the Today rows
   put their dates about 1,000px right of the task names.
7. **Colour in light mode:** gold appears outside the logo (the Overview tab
   label and iPhone icon, the ring around today on the calendar, "Show" in
   messages, the Pinned Notes pin, a glow and a line in the header). "High"
   priority is red, beside overdue red, and "due today" uses the Waiting
   amber. Other colours mean nothing in particular: the teal "Add" with a
   glow, a red "Reset Year", multicoloured widget icons, a teal, green and
   red calendar legend, blue "Story email" buttons. A person's colour also
   tints names, roles and titles.
8. **Bug (older): a new person colour does not reach the name and role** on
   Boss's, Dew's and O's tabs: a light-mode readability rule from step 21
   fixes their old shades. The picker also offers HeadStart Yellow and
   HeadStart Navy as person colours.
9. **Dark mode has its own colours:** Pending is cyan (grey in light mode),
   Dew turns gold (the dark Waiting colour) on her tab, the selected filter
   is a gold gradient, Add Task takes each person's colour, and some lists
   are still boxes inside cards.
10. **Decoration:** the header has gold and blue glows over a gradient; the
    logo tile, avatars and round buttons glow or use gradients; on person
    tabs the sidebar is six to nine separate cards, each with a handle, an
    arrow, a tinted icon and one or two buttons.
11. **Smaller:** about 20 browser pop-ups remain (for example "No sick leave
    records to reset."); "Move to…" is cut off on a card; an opened Details
    turns into a navy pill; Request Centre's "Open" and "Copy Link" do not
    say what they open or copy.
12. **Polish:** dates in seven patterns ("1d left (29 Oct 2026)", "Due today
    (28 Oct 2026)", "in 4d", "was due 27 Oct 2026" and others); lone last
    words in cards; extra left edges; "All" and "All Tasks", "All Tasks" and
    "Tasks" for the same things; "Show 1 more" as tall as a row. On iPhone:
    the header numbers have no labels, content runs under the tab bar with
    no fade, Widgets sits at the end of a scrolling row, the quick-add title
    is not focused, and the opened announcement has an empty band. The app
    opens on a full navy screen before the light page.

From the preview's demo data, not the product: the same task names once per
person (every demo member has the same sample tasks), Boss's light blue
colour, and Request Centre "Open" seeming to do nothing (it opens a new
browser tab, which the test browser does not show).

## Steps

- [x] **67. Ticking a task done: Undo, the status kept, nothing above the board moves**
  - Files: `index.html` (ticking, the Today panel, messages),
    `assets/workspace-ui.css`, tests.
  - Change: a ticked card stays put for a moment as now, then folds away,
    and a message says "Done: <task>" with Undo for a few seconds. Undo, or
    un-ticking later, returns the task to the status it had, in its old
    place (the status is saved with the task when it is ticked; tasks
    finished before this change go back to Pending, as now). A task
    finished today stays in the Today panel, ticked and struck through,
    until tomorrow, so the panel keeps its size and the board stays still.
  - Test: tick a Waiting card, then Undo: it is back in Waiting, in the same
    place; tick it again and un-tick it from Done: Waiting again; the top of
    the board stays within 2px throughout, at 1440 and 390.
  - Done (29 Oct, built by Codex from `.codex-tasks/step-67.md`, reviewed by
    Claude): a task marked done, by its tick or by moving it to Done, now
    remembers the status it had and the day it was finished; un-ticking it,
    or Undo in the "Done: <task>" message (6 seconds), puts it back in that
    status (Pending only for tasks finished before this change). A task
    finished today keeps its Today row, struck through with a green tick and
    "done", and a "N done today" count joins the others, so the panel keeps
    its size. Checked in a browser at 1440x900 and 390x844: Review
    photography (Waiting) ticked, then Undo, is back in Waiting; the top of
    the board stayed at the same pixel through the tick, the Undo and an
    overdue task's tick; no page errors. Tests: 381/381 (five new).

- [x] **67a. Bug (found by Boss, 29 Oct): a folded Overview card stays tall and blank**
  - Files: `assets/workspace-ui.css`, tests.
  - Cause: on computers, a step 65 rule makes the last card of each Overview
    column grow so both columns end level; it also applied to a folded card,
    so a folded Upcoming Deadlines stayed 974px tall with nothing in it.
  - Done (29 Oct, built by Codex from `.codex-tasks/step-67a.md`, reviewed by
    Claude): a folded card no longer grows; it shrinks to its header (78px
    at 1490x900), and open cards still end level. Tests: 382/382 (one new).

- [ ] **68. iPhone: nothing under the round buttons at the top of a page (decision 2)**
  - Files: `index.html` (the card markup), `assets/workspace-ui.css`, tests.
  - Change, A (recommended): each card's tick moves to the left of its
    name, as in Apple Reminders and Things, and its "⋯" moves beside
    Details, so no control sits at a card's right edge, where the round
    buttons rest. Both buttons stay and still slide away while scrolling.
    B instead: "+" joins the tab bar and Team Chat moves beside the bell, so
    nothing floats at all (this changes Boss's 27 Oct decision).
  - Test: the reviewer's check (`s28-occlusion.mjs`) finds no tick and no
    "⋯" under the round buttons at 390x844 and 390x664 on the Overview, Boss
    and Dew; the step 61 check while scrolling still passes; ticking works
    by touch, mouse and keyboard.

- [ ] **69. Work with no owner, and shared work, on the Overview**
  - Files: `index.html` (the Overview's counts, deadline rows and Team
    today), `assets/workspace-ui.css`, tests.
  - Change: a shared task with no owner appears in Upcoming Deadlines with
    a "No owner" mark; tapping it opens its event on the Event Board with
    the task marked, ready to assign. Team today says how many tasks have no
    owner. A shared card is one row with every owner's initial, counted
    once.
  - Test: with the demo data, "Prepare welcome packs" shows in This week as
    "No owner" before it is assigned and with Eye's initial after; Team
    today's total includes it; a card for Boss, Dew and O shows three
    initials and counts once.

- [ ] **70. One team view of each event**
  - Files: `index.html` (the Event Board and the event page),
    `assets/event-board.js`, tests.
  - Change: tapping an event under "Coming up" opens that event's tasks on
    the Event Board (opened, scrolled to and marked) instead of the Boss
    tab. A shared task's row shows its full name, its priority and its
    owner, and tapping it opens the task. Choosing an owner is the row's
    main control (Claim stays, for taking a task yourself); the row shows
    the new owner at once and keeps its place. An event's own page on a
    person's tab also lists the team's shared tasks for that event, with
    their owners, so its numbers agree with the Event Board.
  - Test: the walkthrough's path again at 390x844 and 1440x900: one tap from
    "Coming up" to the School Open Day tasks; assigning shows the owner at
    once and the row does not move; the event page and the Event Board show
    the same number of open tasks.

- [ ] **72a. Bug: a new person colour reaches the name and role (part of 72, approved now)**
  - Files: `index.html` (the colour picker), tests.
  - Change: when a person picks a colour, their name, role, greeting line
    and Event Hub title take the readable shade of that colour, as their
    initials and tab label already do. With no colour picked, nothing
    changes. The step 21 rule keeps the default shades readable.
  - Test: pick a colour on Boss's, Dew's and O's tabs: the name and role
    change at once, in both themes, and read at 4.5:1 or better; with no
    colour picked the page looks exactly as before.

- [ ] **71. Desktop: the work first on the first screen (decisions 3 and 4)**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: on computers the Payday line moves into the header beside the
    tabs (if chosen), so the team announcement is the Overview's first row,
    as Boss decided on 24 Oct; the greeting goes and the date stays (if
    chosen); on person tabs Add Task becomes a normal navy button at the end
    of the filter row instead of a full-width bar; the Today rows show their
    date beside the task name. iPhone is unchanged.
  - Test: at 1440x900 the announcement is the Overview's first row; the
    largest text on the Overview is not a greeting; on a person tab the
    first row of cards (name, date and labels) is fully above the fold; in
    the reviewer's masked 480px thumbnail the heaviest shape below the
    header is the work.

- [ ] **72. Colour means one thing (light mode)**
  - Files: `assets/workspace-ui.css`, `index.html` (the colour picker's
    list and inline colours), tests.
  - Change:
    - Gold only on the logo: the Overview tab label and iPhone icon, today
      on the calendar and the buttons in messages turn white or navy (the
      header's gold line goes in step 74).
    - Red means overdue (and canceled) only: "High" priority becomes bold
      dark text with an arrow; "due soon" and "due today" use dark text with
      a clock, as cards have since step 63, so amber means Waiting only;
      sick and leave days keep their own marks, in grey.
    - Widget icons and their buttons in one quiet ink; "Reset Year" moves
      inside the Sick Leave widget; the teal "Add" and the blue "Story
      email" become quiet buttons.
    - A person's name and role in dark text; their colour stays on their
      initials, picture and tab label (step 49 kept it on names too). The
      step 21 rule that froze the old name colours goes, and the picker no
      longer offers the brand's gold and navy (a colour already chosen keeps
      working).
  - Test: a rendered scan finds gold only in the logo, red only on overdue
    and canceled, and every other colour on a status, an event, or a
    person's initial or tab label; a newly picked colour shows at once on
    the person's initials and tab; contrast scans find zero failures on all
    five tabs.

- [ ] **73. Dark mode uses the same colours**
  - Files: `index.html` (the dark-mode layers), `assets/workspace-ui.css`,
    tests.
  - Change: the light-mode status colours (Pending grey, In Progress blue,
    Waiting amber, On Hold purple, Done green) and person colours, in
    lighter shades; Dew is not gold; the selected filter and Add Task look
    the same on every tab; the Event Hub chips, the Coming up rows and the
    calendar's day list become flat rows, as in light mode.
  - Test: light and dark side by side show the same colour family for each
    status and each person; no gold outside the logo; contrast scans find
    zero failures in dark mode on all five tabs.

- [ ] **74. A flat header and one quiet sidebar**
  - Files: `index.html` (the header and sidebar layers),
    `assets/workspace-ui.css`, tests.
  - Change: the header is flat navy, without glows, gradients or the gold
    line; the logo tile, avatars and round buttons lose their glows; on
    person tabs the sidebar becomes one panel of rows, and each folded row
    shows at most one quiet action (the drag handle on hover only).
  - Test: no gradient or glow in the header at 1440 and 390; one sidebar
    panel with at most one visible button per folded row; reordering and
    folding widgets still work by mouse, touch and keyboard.

- [ ] **75. Smaller fixes and cuts**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: the browser pop-ups become the app's own messages (or a note
    beside the field); "Move to…" fits; an opened Details stays quiet;
    Request Centre's buttons say "Open request form" and "Copy form link".
    Cuts: "or deadlines" in "No new requests or deadlines"; the payday bar
    that repeats the days left; the "D Dew" label on Dew's own board; O's
    "Pending upload" and "Story email" on Done and Canceled cards; Dew's
    design menu on Done and Canceled cards; the Canceled column while it is
    empty.
  - Test: no browser pop-up left except as a last fallback; each cut checked
    on its tab at 1440 and 390.

- [ ] **76. Polish and motion**
  - Files: `index.html`, `assets/workspace-ui.css`, tests.
  - Change: one date format ("29 Oct", with the year only when it is not
    this year, and "2 days left"); no lone last word in card names; one set
    of left edges; one name for one control ("All Tasks" on every tab); a
    smaller "Show N more". On iPhone: labels on the header numbers, a fade
    behind the tab bar, Widgets reachable without scrolling the row, the
    quick-add title focused, no empty band in the opened announcement. A
    column's Done count ticks up when a card arrives, and the app opens on
    its own light frame instead of a full navy screen.
  - Test: a text scan finds one date pattern; screenshots at 1440 and 390 in
    both themes; the opening recorded with slow style sheets.

- [ ] **77. Final check and a fifth independent review**
  - Files: `PLAN.md`, tests, evidence (not committed).
  - Change: all tests, contrast scans in both themes, iPhone widths 320 to
    440, the end-to-end checks of steps 67 to 76; then a fifth scored review
    and a walkthrough by reviewers who have not seen the work; then merge
    and deploy.

## Decisions needed from Boss (plan 7)

1. **The plan:** recommended, approve steps 67 to 77; or the gap to 8 and
   the lead's bugs first (67 to 72), leaving dark mode, the header and
   sidebar, the cuts and the polish for later.
2. **iPhone round buttons at the top of a page:** A (recommended), the tick
   moves to the left of each card's name and "⋯" beside Details, and both
   buttons stay; or B, "+" joins the tab bar and Team Chat moves beside the
   bell, so nothing floats (this changes the 27 Oct decision).
3. **The Payday line on computers:** recommended, in the header beside the
   tabs, so the announcement is the Overview's first row; or keep it where
   it is.
4. **"Good afternoon, Boss" on the Overview:** recommended, remove it and
   keep the date; or keep it, smaller.
