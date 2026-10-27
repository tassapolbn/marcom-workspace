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

# Follow-up plan 2 (24 Oct 2026): announcements, light mode, phones — approved by Boss

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

# Follow-up plan 3 (26 Oct 2026): Direction A "Quiet Desk" — awaiting Boss's approval

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

- [ ] **33. The floating buttons stop covering content**
  - Files: `assets/workspace-ui.css`
  - The two round buttons at the bottom right are **Team Chat** (`.chat-fab`)
    and **Quick Add** (`.quickadd-fab`). They currently sit on top of the
    sidebar and the task list. Give the page enough bottom padding that nothing
    is ever hidden beneath them. On iPhone, step 34 adds a bottom dock, so these
    two buttons, the chat panel and the toast stack (`#uxp-toasts`) all lift
    above it.
  - Test: at 1440, 1024 and the iPhone widths, nothing in the last card is
    covered, and with the dock showing, neither button overlaps it.

- [ ] **34. The tab bar: a sliding pill on desktop, a bottom dock on iPhone**
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

- [ ] **35. Final check and notes**
  - Run the full UI suite, the contrast checks and the phone widths in **both**
    themes, confirm dark mode has not regressed, take the evidence set, send one
    independent visual review, then record what changed.

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

## Decisions needed from Boss

1. The lunch banner becomes a line of text instead of a gold band. Lunch stays
   visible, it just stops being the loudest thing on screen. Acceptable?
2. Dark mode: checked for no regression only, not redesigned. Correct?
3. The tab bar (step 34): option 2, a sliding pill on desktop and a bottom dock
   on iPhone, is recommended. Option 1 keeps the sliding pill at the top on
   iPhone too; option 3 is a single travelling underline. Choosing 1 or 3 means
   step 34 is rewritten to match before any code.
