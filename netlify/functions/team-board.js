/* Read-only "Team Task Board" for a Director who has no login.
   Opened via a private link:  /.netlify/functions/team-board?token=XXXX
   The token is set by the admin in the app and stored in
   dept_settings/board_share. This function reads every member's ONGOING tasks
   with the Admin SDK (bypassing client rules) and returns a clean, read-only
   HTML page. It never exposes notes, leave, pay or any other private field. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');

const ORDER = ['boss', 'dew', 'o', 'junior'];
const ROLE = {
  boss: 'Marcom Manager',
  dew: 'Graphic Designer',
  o: 'Photographer & Video Editor',
  junior: 'Junior Events Coordinator'
};
const DEFAULT_NAME = { boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' };
const DONE = { done: 1, canceled: 1 };
const STATUS = {
  'pending':     { label: 'Pending',     bg: '#eef1f5', fg: '#5b6675' },
  'in-progress': { label: 'In progress', bg: '#e6effd', fg: '#1d4ed8' },
  'waiting':     { label: 'Waiting',     bg: '#fdf0d9', fg: '#b7791f' },
  'on-hold':     { label: 'On hold',     bg: '#efe9fb', fg: '#6d28d9' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlPage(statusCode, title, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    },
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<meta name="robots" content="noindex, nofollow">'
      + '<title>' + esc(title) + '</title>' + STYLE + '</head><body>' + body + '</body></html>'
  };
}

const STYLE = '<style>'
  + '*{box-sizing:border-box;} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f6f9;color:#1b2733;}'
  + '.wrap{max-width:1100px;margin:0 auto;padding:22px 16px 60px;}'
  + '.hd{background:linear-gradient(135deg,#234b78,#003057);color:#fff;border-radius:16px;padding:20px 22px;box-shadow:0 10px 26px -12px rgba(15,30,52,.5);}'
  + '.hd h1{margin:0;font-size:20px;letter-spacing:-.2px;} .hd p{margin:6px 0 0;font-size:13px;color:#cfe0f5;}'
  + '.meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;font-size:12px;color:#bcd2ec;}'
  + '.ro{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.14);padding:3px 10px;border-radius:99px;font-weight:700;}'
  + '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:16px;}'
  + '.card{background:#fff;border:1px solid #e5e9ef;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.05);}'
  + '.card h2{margin:0;font-size:15px;padding:13px 15px 4px;} .card .role{font-size:11.5px;color:#7a8699;padding:0 15px 10px;font-weight:600;}'
  + '.card .cnt{float:right;font-size:11px;font-weight:800;color:#234b78;background:#eaf1fb;border-radius:99px;padding:2px 9px;margin-top:1px;}'
  + '.list{padding:0 11px 12px;display:flex;flex-direction:column;gap:8px;}'
  + '.t{border:1px solid #e9edf3;border-left:4px solid #9aa4b2;border-radius:10px;padding:9px 11px;}'
  + '.t.od{border-left-color:#dc2626;} .t.soon{border-left-color:#e0900a;}'
  + '.t .top{font-size:13.5px;font-weight:600;line-height:1.35;color:#1b2733;word-break:break-word;}'
  + '.t .meta2{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;align-items:center;}'
  + '.pill{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;}'
  + '.due{background:#eef1f5;color:#4b5563;} .due.od{background:#fde8e8;color:#b91c1c;} .due.soon{background:#fdf0d9;color:#b7791f;}'
  + '.pri-high{background:#fde8e8;color:#b91c1c;} .pri-low{background:#eef1f5;color:#5b6675;}'
  + '.ev{background:#efe9fb;color:#6d28d9;} .empty{font-size:12.5px;color:#8a94a6;padding:6px 4px 12px;}'
  + '.foot{margin-top:22px;font-size:11.5px;color:#8a94a6;text-align:center;line-height:1.6;}'
  + '.gate{max-width:460px;margin:14vh auto;background:#fff;border:1px solid #e5e9ef;border-radius:16px;padding:26px;text-align:center;box-shadow:0 10px 30px -14px rgba(15,30,52,.4);}'
  + '.gate h1{font-size:18px;margin:0 0 8px;} .gate p{font-size:13.5px;color:#5b6675;line-height:1.6;margin:0;}'
  + '</style>';

function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00');
  if (isNaN(t.getTime())) return esc(d);
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysUntil(d) {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00'); if (isNaN(t.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400000);
}
function isActive(t) { return !DONE[(t && t.status) || 'pending']; }
function assignedTo(t, ws) {
  if (Array.isArray(t.assignees) && t.assignees.length) return t.assignees.indexOf(ws) >= 0;
  return (t.owner || '') === ws;
}

function taskRow(t) {
  const topic = esc(t.topic || t.title || 'Untitled');
  const du = daysUntil(t.dueDate);
  const od = du !== null && du < 0;
  const soon = du !== null && du >= 0 && du <= 3;
  const cls = od ? ' od' : (soon ? ' soon' : '');
  let due = '';
  if (t.dueDate) {
    const dcls = od ? ' od' : (soon ? ' soon' : '');
    const lbl = od ? ('Overdue ' + fmtDate(t.dueDate)) : (du === 0 ? 'Due today' : (soon ? (du + 'd left') : fmtDate(t.dueDate)));
    due = '<span class="pill due' + dcls + '">' + esc(lbl) + '</span>';
  }
  const st = STATUS[t.status] || STATUS['pending'];
  const stPill = '<span class="pill" style="background:' + st.bg + ';color:' + st.fg + ';">' + esc(st.label) + '</span>';
  let pr = (t.priority === 'high') ? '<span class="pill pri-high">High</span>'
    : (t.priority === 'low') ? '<span class="pill pri-low">Low</span>' : '';
  const evName = (t.eventLabel || t.eventName || '').trim();
  const ev = evName ? '<span class="pill ev">' + esc(evName) + '</span>' : '';
  return '<div class="t' + cls + '"><div class="top">' + topic + '</div>'
    + '<div class="meta2">' + due + stPill + pr + ev + '</div></div>';
}

exports.handler = async (event) => {
  const ip = clientIp(event);
  if (rateLimited(ip, 60, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many requests.' });

  const token = String((event.queryStringParameters || {}).token || '').trim();

  let db;
  try { db = getDb(); } catch (e) { console.error(e); return htmlPage(500, 'Unavailable', '<div class="gate"><h1>Not available</h1><p>This board is not configured yet.</p></div>'); }

  // Verify the private link token against the admin-set value.
  let share = {};
  try { const s = await db.collection('dept_settings').doc('board_share').get(); share = (s.exists && s.data()) || {}; }
  catch (e) { console.error(e); }
  const good = share && share.enabled !== false && share.token && token && token === share.token;
  if (!good) {
    return htmlPage(403, 'Link not valid',
      '<div class="gate"><h1>This link is not available</h1><p>The link is incorrect or has been turned off. Please ask the MARCOM team for a current link.</p></div>');
  }

  // Member display names.
  let names = Object.assign({}, DEFAULT_NAME);
  try { const t = await db.collection('dept_settings').doc('team').get(); if (t.exists) names = Object.assign(names, (t.data() || {}).names || {}); }
  catch (e) { console.error(e); }

  // Shared event tasks (read once, filtered per member below).
  let eventTasks = [];
  try { const es = await db.collection('event_tasks').get(); eventTasks = es.docs.map(d => d.data() || {}); }
  catch (e) { console.error(e); }

  // Each member's own ongoing tasks + shared tasks assigned to them.
  const cards = [];
  for (const ws of ORDER) {
    let own = [];
    try { const os = await db.collection(ws + '_tasks').get(); own = os.docs.map(d => d.data() || {}); }
    catch (e) { console.error(e); }
    const mine = own.filter(isActive)
      .concat(eventTasks.filter(t => isActive(t) && assignedTo(t, ws)));
    mine.sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
    const nm = esc((names[ws] || DEFAULT_NAME[ws] || ws));
    const rows = mine.length ? mine.map(taskRow).join('') : '<div class="empty">No ongoing tasks.</div>';
    cards.push('<div class="card"><h2>' + nm + '<span class="cnt">' + mine.length + ' active</span></h2>'
      + '<div class="role">' + esc(ROLE[ws] || '') + '</div><div class="list">' + rows + '</div></div>');
  }

  const now = new Date();
  const when = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = '<div class="wrap">'
    + '<div class="hd"><h1>HeadStart MARCOM &mdash; Team Task Board</h1>'
    + '<p>Live view of what each team member is working on.</p>'
    + '<div class="meta"><span class="ro">● Read only</span><span>Updated ' + esc(when) + '</span><span>Refresh the page for the latest</span></div></div>'
    + '<div class="grid">' + cards.join('') + '</div>'
    + '<div class="foot">This is a private, read-only view shared by the HeadStart MARCOM team.<br>Only ongoing tasks are shown. No personal information is included.</div>'
    + '</div>';
  return htmlPage(200, 'Team Task Board', body);
};
