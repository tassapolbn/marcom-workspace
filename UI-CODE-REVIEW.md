# UI and code review — 6 September 2026

The app's main interaction defects can be improved without changing its familiar
navy-and-gold identity. This pass fixes repeated dashboard DOM replacement and
keyboard handling. The largest remaining concerns are public request privacy,
server-side date validation, and the accumulated styling/runtime layers.

## Open findings, in priority order

### P1 — Public request tracking does not verify email ownership

`netlify/functions/request-status.js`, particularly the optional `refNo` handling
and the query on `requester.email`, accepts an unauthenticated email address and
returns up to 25 matching summaries. The response includes event names, deadlines,
statuses, and reference numbers. Knowing another person's email is enough to
retrieve those fields; entering an email does not establish ownership.

Recommended resolution: an email verification link or one-time code that grants
a short-lived tracking session. As an interim narrower flow, require the existing
random request reference plus email, and remove the email-only list endpoint.
The latter still relies on possession of the reference rather than verified
identity. This needs a coordinated requester flow and API change; it was not
silently changed during UI maintenance.

### P2 — Date/time validation accepts impossible scheduling data

`netlify/functions/submit-request.js` checks dates only against `YYYY-MM-DD` and
times only against `HH:MM`. Values such as `2026-02-31` and `29:70` pass the shape
checks. For photography, required time fields are checked before malformed times
are replaced with empty strings, so a nonempty invalid time can become a saved
request with no time.

Validate actual calendar dates, hour/minute ranges, and the required photography
time window before saving. Return specific field errors so the requester can
correct the input. Cover these cases with server tests before changing the API.

### P2 — Styling and runtime layers make further polish fragile

The current `index.html` contains roughly 12,800 lines / 928 KB of source, 42 inline
style blocks, 284 `!important` declarations, and 27 `setInterval` call sites. These
are source counts, not concurrent timer counts or transferred compressed bytes.
Later styles override earlier visual systems; feature scripts repeatedly wrap
global render functions. This is the same mechanism behind the previous payday
contrast and selected-tab defects.

Consolidate styles one component at a time: header/tabs, cards, forms, then dialogs.
Define one spacing scale, one shadow scale, and semantic foreground/background
pairs for each theme. Keep the selected-state and focus treatments distinct.
Retain colour for identity and status; use a quieter shared surface treatment for
data cards. Remove superseded rules only after comparing both themes and narrow
viewports. Move feature lifecycles into modules with explicit setup and cleanup,
replacing global function wrappers incrementally.

## Fixed in this pass

| Issue | Change | UX reason |
|---|---|---|
| Overview replaced unchanged content every five seconds | Added `assets/ui-render.js` and used its cached renderer at 21 overview render sites | Preserves focused controls, decorated nodes and text selection instead of repeatedly recreating them |
| Hidden browser documents still received the Overview polling render | Skip that polling render while `document.hidden` | Avoids work the user cannot see; existing data listeners remain active |
| Escape removed all legacy overlays directly | Route dismissal through the top overlay's close control, respecting its stacking order | Preserves underlying dialogs and executes existing cleanup logic |
| Global shortcuts intercepted native controls and browser commands | Respect input/textarea/select fields, IME composition, handled events, modifier keys and open dialogs | Prevents accidental task creation while typing or navigating a form |
| Closing command search could propagate Escape to other layers | Consume the handled Escape event | One keypress dismisses one layer |
| Saved-theme snapshots rewrote and moved an unchanged stylesheet | Update CSS and stylesheet position only when needed | Avoids needless style invalidation while preserving custom colours |

The new render helper stores generated markup in a `WeakMap`. It compares the
generated string, rather than browser-normalized `innerHTML`, so accessibility
decorations do not defeat the cache. Changed output still renders immediately.

## Verification

- `node --test tests/ui-*.test.mjs`: **22 passing tests**.
- Tests cover actual calendar-filter rendering, unchanged/changed content,
  existing board/rail behaviour, shortcuts, IME, browser modifiers, nested
  overlay dismissal, theme contrast generation and tab navigation.
- All inline application scripts parse; the new rendering module and local
  preview server pass JavaScript syntax checks.
- Reloaded the actual app with synthetic local data, checked the Overview and
  task editor, and verified Escape dismissal and restored focus visually.
- The previous pass also checked light/dark layouts and phone/tablet/desktop
  widths. This pass retains those layout rules.

The preview replaces Firebase with an in-memory adapter and blocks connections
to production app services. Production authentication, submission and database
rules were not integration-tested in this review. The changes reduce demonstrated
DOM churn; sustained 60 fps still requires frame-time profiling with realistic
record counts on target devices.

Changes are local and have not been deployed.
