/* One source of truth for the Director's task actions.
   Required by team-board.js (to draw the menu on the shared board) and by
   board-action.js (to validate what the browser sends back). Keeping both
   sides on this list means a new action can never be accepted by the server
   without appearing in the menu, or offered in the menu and then refused. */

/* input: null (no extra field), 'date' (a calendar date) or 'text' (a name or
   department). `label` reads as a sentence once the value is appended. */
const ACTIONS = [
  { id: 'prioritise', short: 'Prioritise',  label: 'Please prioritise this task',        input: null },
  { id: 'deadline',   short: 'Deadline',    label: 'Needs to be done by',                input: 'date', inputLabel: 'Required date' },
  { id: 'hold',       short: 'Hold',        label: 'Please hold this task',              input: null },
  { id: 'cancel',     short: 'Cancel',      label: 'Please cancel this task',            input: null },
  { id: 'assign',     short: 'Reassign',    label: 'Please assign this task to',         input: 'text', inputLabel: 'Name or department', placeholder: 'For example Khun Dew, or the Admissions team' },
  { id: 'discuss',    short: 'Discuss',     label: 'Needs discussion on this task',      input: null },
  { id: 'update',     short: 'Update',      label: 'Please give an update to',           input: 'text', inputLabel: 'Who needs the update', placeholder: 'For example Khun Miki' },
  { id: 'comment',    short: 'Comment',     label: 'Other comment or instruction',       input: null }
];

/* Task collections a request may point at. Anything else is refused, so a
   crafted request can never reach leave, pay or settings documents. */
const TASK_COLLECTIONS = ['event_tasks', 'boss_tasks', 'dew_tasks', 'o_tasks', 'junior_tasks'];
const WORKSPACES = ['boss', 'dew', 'o', 'junior'];

const LIMITS = { name: 60, value: 120, note: 600 };

function findAction(id) {
  return ACTIONS.filter(function (a) { return a.id === String(id || ''); })[0] || null;
}

/* A real calendar date, not merely the YYYY-MM-DD shape: 2026-02-31 is refused. */
function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function readableDate(value) {
  if (!validDate(value)) return String(value || '');
  const t = new Date(String(value) + 'T00:00:00Z');
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* The one line shown on the card, in the bell and in Team Chat. */
function sentenceFor(action, value) {
  if (!action) return '';
  if (action.input === 'date') return action.label + ' ' + readableDate(value);
  if (action.input === 'text') return action.label + ' ' + String(value || '').trim();
  return action.label;
}

module.exports = { ACTIONS, TASK_COLLECTIONS, WORKSPACES, LIMITS, findAction, validDate, readableDate, sentenceFor };
