# Central Event Task Board — implementation plan (Sections 1 and 5)

Status: PLAN ONLY. No code for this section has been written yet, as agreed.
Sections 2, 3 and 4 are implemented and ready to deploy.

## 1. Why this needs a plan first

Today a task lives in exactly one place: `boss_tasks`, `dew_tasks`, `o_tasks`
or `junior_tasks`. Roughly 40 functions assume that single source: counters,
filter pills, search, drag-and-drop, move-to-member, auto-archive, the Overview
widgets, the SOP generator and the Request Centre. Introducing a second source
(`event_tasks`) touches all of them. Done carelessly this is how tasks get lost.

## 2. Data model

New shared collection `event_tasks`. Each document keeps every field a task has
today, plus:

| Field | Meaning |
|---|---|
| `eventLabel` | e.g. "Christmas Fair". Displayed on the card. |
| `owner` | `boss` / `dew` / `o` / `junior`, or `""` for Unassigned |
| `createdBy`, `createdAt` | who first created it |
| `lastEditedBy`, `lastEditedAt` | stamped on every write, including status drags |

Personal and general tasks stay exactly where they are.

## 3. The `src` marker (the key safety idea)

Every task object held in memory gains a non-persisted marker:

- `__src = 'event'` for documents from `event_tasks`
- `__src = 'own'` for documents from the member collection

One helper, `taskRef(task)`, returns the correct collection reference from that
marker. Every write path (status change, edit, delete, drag-and-drop, archive)
goes through it. Nothing else needs to know where a task came from.

## 4. Merge points to update (complete list)

1. `tasksOf(w)` returns own tasks + event tasks where `owner === w`, sorted by
   due date. This single change feeds most of the app for free.
2. `renderList` / `kanbanHTML` — event label chip on the card.
3. Counters: Active, Due Soon, Done (they already read `tasksOf`).
4. Filter pills — no change needed if they read `tasksOf`.
5. Drag-and-drop status change — route through `taskRef`.
6. Move-to-member — branch: event task updates `owner`; general task keeps the
   existing cross-collection move.
7. Seven-day auto-archive — route through `taskRef`.
8. Global search and the command palette.
9. My Day strip, Today at a Glance, notification bell (they read `tasksOf`).
10. SOP generator writes to `event_tasks` with an owner picker.
11. Request Centre task creation stays in member collections (a request is not
    an event task) unless you want otherwise.

## 5. Overview: the shared board

A new "Event Board" card on the Overview lists all `event_tasks` grouped by
event, with an "Unassigned" group at the top and a Claim / Assign control.
This is where Boss and Eye see the same set of tasks.

## 6. Safeguards

- Delete confirmation names the task AND its event, and states plainly that it
  is a shared team task that everyone can see.
- `lastEditedBy` / `lastEditedAt` stamped on every write; shown compactly in the
  task editor ("Last edited by dew@... · 2 Aug 14:20"), never on the card face.
- Identity is taken from the signed-in session, exactly like chat authorship,
  so it cannot be typed in.

## 7. Migration (Section 5), in three steps

Step 1 — DRY RUN (no writes). A hidden admin-only tool scans all four member
collections, lists every task that has `eventId` or `eventName` set, and shows a
table: task, current collection, proposed event label, proposed owner. Boss
reviews and exports this list.

Step 2 — COPY. Each identified task is written to `event_tasks` preserving every
field, with `eventLabel` from `eventName`, `owner` from the source collection,
and `migratedFrom` recording the original path and id. Nothing is deleted yet.

Step 3 — VERIFY, then CLEAN UP. Counts are compared (source vs copied). Only
when they match exactly does Boss press a second button to remove the originals.
If anything mismatches, the copies can be deleted and nothing is lost, because
the originals are still in place.

Estimated volume: whatever the dry run reports. Roll back by deleting the copies.

## 8. Firestore rules

Already prepared in `firestore.rules` (ready, not yet deployed):

- `event_tasks`: any authorised member may read, create, update and delete;
  `createdBy` must match the signed-in user on create; `lastEditedBy` must match
  on update; `createdBy` cannot be rewritten.
- Explicit rules were added so Dew, O and Eye can always write their own
  `_lieu` and `_sick` records (Section 2).

**The rules must be re-published in Firebase after deploying the app.**

## 9. Suggested sequencing

1. Deploy Sections 2, 3, 4 now and confirm they work in production.
2. Build the `__src` marker plus `taskRef` helper and merge `tasksOf`, with
   `event_tasks` still empty. Nothing visible changes: pure safety groundwork.
3. Add the create-an-event-task path, the card label and the Overview board.
4. Run the migration dry run, review together, then copy, verify, clean up.
5. Switch the SOP generator over last.

Steps 2 to 5 are best done as separate deployments so any problem is isolated
and reversible.
