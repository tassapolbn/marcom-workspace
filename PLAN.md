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

- [ ] **7. No repeated fields in design and media requests, MARCOM categories**
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

- [ ] **8. One "Team today" card instead of four**
  - Files: `index.html` (Team Availability, Who is free right now, Leave & Availability, Workload Heatmap renderers)
  - One row per person: open tasks and workload level, free or busy now (when their calendar is connected), and on leave or sick today.
  - Test: the preview shows the four people with the same figures the four old cards showed. The
    "calendar not connected" note appears once, not four times.

- [ ] **9. One set of "today" numbers on the Overview**
  - Files: `index.html` (Overview shell and the stats, focus and greeting renderers; `uxp-today`)
  - Keep one row of tiles you can click: Overdue · Due today · Due this week · New requests · Meetings today.
    Clicking a tile filters Upcoming Deadlines, which becomes the one task list.
  - Remove the repeats: the greeting line's numbers (the greeting and date stay), Today at a Glance,
    and Today's Focus. Its items are already the Overdue and Today groups in Upcoming Deadlines.
  - Test: each number appears once, matches the old counts on the same data, and filters the list.

- [ ] **10. New Overview layout, with less-used items folded away**
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

- [ ] **11. Compact Overview cards**
  - Files: `index.html` (Announcements, Department Resources / Brand Guidelines / Asset Library, Today's Menu, Support Staff Calendar, payday strip), CSS
  - Announcements shows the latest few posts, with a "New announcement" button that opens the composer smoothly.
  - One Resources card with tabs (Department links / Brand guidelines / Asset library), instead of three cards.
  - Today's Menu shows today only, with a "Whole week" link.
  - The Support Staff Calendar shows as a short preview that opens full size.
  - The payday strip starts as one compact line on every tab (days left, payday date, progress), with a "details" toggle.
  - Test: each card works in both themes and at phone width, and nothing that was there before is lost.

- [ ] **12. Member tabs: a sidebar that slides away, widgets easy to find**
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

- [ ] **13. Design refresh: elegant, modern, easy to read**
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

- [ ] **14. Final check and notes**
  - Files: `README.md`, `UI-CODE-REVIEW.md`
  - Full `npm run test:ui`, a walk-through of every tab and every form, keyboard use and focus outlines.
    Update the README and the review notes.

- [ ] **15. Keep docs and tests off the live site**
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
