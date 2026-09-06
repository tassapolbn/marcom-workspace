/* Read-only "Team Task Board" for a Director who has no login.
   Opened via a private link:  /team-board?token=XXXX
   The token is set by the admin in the app and stored in
   dept_settings/board_share. This function reads every member's ONGOING tasks
   with the Admin SDK (bypassing client rules) and returns a polished, read-only
   HTML page. Tasks can be clicked to see detail, but nothing can be edited.
   It never exposes leave, pay or any other private field. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');
const { ACTIONS } = require('./lib/board-actions');

const ORDER = ['boss', 'dew', 'o', 'junior'];
const ROLE = {
  boss: 'Marcom Manager',
  dew: 'Graphic Designer',
  o: 'Photographer & Video Editor',
  junior: 'Junior Events Coordinator'
};
const DEFAULT_NAME = { boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' };
/* A crisp graduation-cap mark on a white tile. Inline SVG, so it always renders
   the same and can never break or load oddly like a stretched logo file. */
const LOGO_TAG = '<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="#12365a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 9l-10 -4l-10 4l10 4l10 -4v6"/><path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4"/></svg>';
const PEOPLE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M20.5 20c0-2.4-1.5-4.2-3.7-4.8"/></svg>';
const COLOR = {
  boss:   ['#2b5488', '#12365a'],
  dew:    ['#9272b9', '#65458b'],
  o:      ['#4d8595', '#285d6b'],
  junior: ['#2f8a53', '#166534']
};
const DONE = { done: 1, canceled: 1 };
const BOARD_DATE = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
const STATUS = {
  'pending':     { label: 'Pending',     bg: '#eef1f5', fg: '#5b6675' },
  'in-progress': { label: 'In progress', bg: '#e6effd', fg: '#1d4ed8' },
  'waiting':     { label: 'Waiting',     bg: '#fdf0d9', fg: '#855714' },
  'on-hold':     { label: 'On hold',     bg: '#efe9fb', fg: '#6d28d9' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00');
  if (isNaN(t.getTime())) return String(d);
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysUntil(d) {
  if (!d) return null;
  const deadline = Date.parse(d + 'T00:00:00Z'); if (isNaN(deadline)) return null;
  // Netlify runs in UTC; deadline badges follow the team's Bangkok workday.
  const parts = Object.fromEntries(BOARD_DATE.formatToParts(new Date()).map(p => [p.type,p.value]));
  const today = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day));
  return Math.round((deadline - today) / 86400000);
}
function isActive(t) { return !DONE[(t && t.status) || 'pending']; }
function taskAssignees(t) {
  if (Array.isArray(t.assignees) && t.assignees.length) return t.assignees.filter(Boolean);
  return t.owner ? [t.owner] : [];
}
function isSharedMany(t) { return taskAssignees(t).length >= 2; }
function assignedTo(t, ws) { return taskAssignees(t).indexOf(ws) >= 0; }

/* Only work-related, non-personal fields ever reach the page. */
function detailOf(t, whoName, colors, notes) {
  const d = {
    who: whoName, c: colors[0], c2: colors[1],
    topic: t.topic || t.title || 'Untitled',
    status: t.status || 'pending',
    priority: t.priority || '',
    due: t.dueDate ? fmtDate(t.dueDate) : '',
    dueRaw: t.dueDate || '',
    daysLeft: daysUntil(t.dueDate),
    category: t.category || '',
    event: (t.eventLabel || t.eventName || ''),
    description: t.description || '',
    assignedBy: t.assignedBy || '',
    assignedDate: t.assignedDate ? fmtDate(t.assignedDate) : ''
  };
  if (t.mdTaken || t.mdLocation || t.mdStart || t.mdEnd || t.mdEvent) {
    d.shootEvent = t.mdEvent || '';
    d.shootDate = t.mdTaken ? fmtDate(t.mdTaken) : '';
    d.shootTime = (t.mdStart || '') + (t.mdStart && t.mdEnd ? ' - ' : '') + (t.mdEnd || '');
    d.shootLocation = t.mdLocation || '';
  }
  if (t.dzType || t.dzBrand || t.dzStatus) {
    d.designType = t.dzType || '';
    d.designBrand = t.dzBrand || '';
    d.designStatus = t.dzStatus || '';
    if (typeof t.dzRevisions === 'number' && t.dzRevisions > 0) d.revisions = String(t.dzRevisions);
  }
  if (Array.isArray(t.links) && t.links.length) {
    d.links = t.links.filter(l => l && l.url).slice(0, 8).map(l => ({ title: String(l.title || l.url), url: String(l.url) }));
  }
  /* The real record this card came from, so a Director action can be tied to it.
     Nothing here is secret: the ids are only useful with the share token. */
  d.coll = t.__coll || '';
  d.docId = t.__id || '';
  d.requests = (notes && notes[d.coll + '/' + d.docId]) || [];
  return d;
}

function taskRow(t, id, whoLabel, reqCount) {
  const topic = esc(t.topic || t.title || 'Untitled');
  const du = daysUntil(t.dueDate);
  const od = du !== null && du < 0;
  const soon = du !== null && du >= 0 && du <= 3;
  const cls = (od ? ' od' : (soon ? ' soon' : '')) + (reqCount > 0 ? ' rq' : '');
  let due = '';
  if (t.dueDate) {
    const dcls = od ? ' od' : (soon ? ' soon' : '');
    const lbl = od ? ('Overdue ' + fmtDate(t.dueDate)) : (du === 0 ? 'Due today' : (soon ? (du + 'd left') : fmtDate(t.dueDate)));
    due = '<span class="pill due' + dcls + '">' + esc(lbl) + '</span>';
  } else due = '<span class="pill due">No deadline</span>';
  const st = STATUS[t.status] || STATUS['pending'];
  const stPill = '<span class="pill" style="background:' + st.bg + ';color:' + st.fg + ';">' + esc(st.label) + '</span>';
  const pr = (t.priority === 'high') ? '<span class="pill pri-high">High</span>'
    : (t.priority === 'low') ? '<span class="pill pri-low">Low</span>' : '';
  const evName = (t.eventLabel || t.eventName || '').trim();
  const ev = evName ? '<span class="pill ev">' + esc(evName) + '</span>' : '';
  const who = whoLabel ? '<span class="pill whopill"><i class="dot2"></i>' + esc(whoLabel) + '</span>' : '';
  const rq = reqCount > 0
    ? '<span class="pill req">' + (reqCount === 1 ? '1 request sent' : reqCount + ' requests sent') + '</span>'
    : '';
  return '<button type="button" class="t' + cls + '" data-task-id="' + id + '" onclick="showDetail(\'' + id + '\')">'
    + '<span class="t-top">' + topic + '<i class="chev">\u203a</i></span>'
    + '<span class="meta2">' + due + stPill + pr + ev + who + rq + '</span></button>';
}

function htmlPage(statusCode, title, inner, extraScript) {
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
      + '<title>' + esc(title) + '</title>' + STYLE + '</head><body>' + inner
      + (extraScript || '') + '</body></html>'
  };
}

const STYLE = '<link rel="stylesheet" href="/assets/team-board.css">';

exports.handler = async (event) => {
  const ip = clientIp(event);
  if (rateLimited(ip, 60, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many requests.' });

  const token = String((event.queryStringParameters || {}).token || '').trim();

  let db;
  try { db = getDb(); } catch (e) { console.error(e); return htmlPage(500, 'Unavailable', '<div class="wrap"><div class="foot">This board is not configured yet.</div></div>'); }

  let share = {};
  try { const s = await db.collection('dept_settings').doc('board_share').get(); share = (s.exists && s.data()) || {}; }
  catch (e) { console.error(e); }
  const good = share && share.enabled !== false && share.token && token && token === share.token;
  if (!good) {
    return htmlPage(403, 'Link not valid',
      '<div class="wrap"><div class="hero" style="animation:none;"><div class="hero-accent"></div><div class="hero-in"><div class="brand"><div class="logo">' + LOGO_TAG + '</div><div><h1>This link is not available</h1><p class="sub">The link is incorrect or has been turned off. Please ask the MARCOM team for a current link.</p></div></div></div></div></div>');
  }

  let names = Object.assign({}, DEFAULT_NAME);
  try { const t = await db.collection('dept_settings').doc('team').get(); if (t.exists) names = Object.assign(names, (t.data() || {}).names || {}); }
  catch (e) { console.error(e); }

  let eventTasks = [];
  try { const es = await db.collection('event_tasks').get(); eventTasks = es.docs.map(d => Object.assign(d.data() || {}, { __id: d.id, __coll: 'event_tasks' })); }
  catch (e) { console.error(e); }

  /* Requests the Director has already sent and the team has not closed yet, so
     the same thing is not asked twice. Only work fields are read. */
  const NOTES = {};
  let openReq = 0;
  try {
    const ns = await db.collection('director_notes').where('status', '==', 'new').get();
    ns.docs.forEach(d => {
      const n = d.data() || {};
      const key = String(n.taskKey || '');
      if (!key) return;
      (NOTES[key] = NOTES[key] || []).push({
        sentence: String(n.sentence || n.actionLabel || ''),
        from: String(n.from || ''),
        note: String(n.note || ''),
        when: n.createdAtIso ? fmtDate(String(n.createdAtIso).slice(0, 10)) : ''
      });
    });
  } catch (e) { console.error(e); }

  const TASKS = {};
  let idc = 0;
  let totalActive = 0, overdue = 0, dueWeek = 0;
  function bump(t) { const du = daysUntil(t.dueDate); totalActive++; if (du !== null && du < 0) overdue++; else if (du !== null && du <= 7) dueWeek++; }
  const nameOf = (w) => names[w] || DEFAULT_NAME[w] || w;
  const cards = [];

  // A task shared with two or more people appears ONCE here, not repeated under
  // every member. It shows who it is shared with.
  const shared = eventTasks.filter(t => isActive(t) && isSharedMany(t))
    .sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
  if (shared.length) {
    const rows = shared.map(t => {
      const id = 't' + (idc++);
      const whoLabel = taskAssignees(t).map(nameOf).join(', ');
      TASKS[id] = detailOf(t, whoLabel, ['#5b5bd6', '#3f3aa8'], NOTES);
      TASKS[id].members = taskAssignees(t);
      bump(t);
      openReq += TASKS[id].requests.length;
      return taskRow(t, id, whoLabel, TASKS[id].requests.length);
    }).join('');
    cards.push('<div class="card shared" style="--c:#5b5bd6;--c2:#3f3aa8">'
      + '<div class="bar"></div><div class="hd"><div class="av">' + PEOPLE_SVG + '</div>'
      + '<div><div class="nm">Shared across the team</div><div class="rl">Assigned to more than one person</div></div>'
      + '<div class="cnt">' + shared.length + '</div></div>'
      + '<div class="list">' + rows + '</div></div>');
  }

  for (const ws of ORDER) {
    let own = [];
    try { const os = await db.collection(ws + '_tasks').get(); own = os.docs.map(d => Object.assign(d.data() || {}, { __id: d.id, __coll: ws + '_tasks' })); }
    catch (e) { console.error(e); }
    // own tasks + event tasks assigned to just this person (multi-shared ones are in the card above)
    const mine = own.filter(isActive)
      .concat(eventTasks.filter(t => isActive(t) && assignedTo(t, ws) && !isSharedMany(t)));
    mine.sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
    const nm = nameOf(ws);
    const colors = COLOR[ws] || COLOR.boss;
    const rows = mine.map(t => {
      const id = 't' + (idc++);
      TASKS[id] = detailOf(t, nm, colors, NOTES);
      TASKS[id].members = [ws];
      bump(t);
      openReq += TASKS[id].requests.length;
      return taskRow(t, id, '', TASKS[id].requests.length);
    }).join('');
    const initial = esc((nm || '?').trim().charAt(0).toUpperCase() || '?');
    cards.push('<div class="card" style="--c:' + colors[0] + ';--c2:' + colors[1] + '">'
      + '<div class="bar"></div><div class="hd"><div class="av">' + initial + '</div>'
      + '<div><div class="nm">' + esc(nm) + '</div><div class="rl">' + esc(ROLE[ws] || '') + '</div></div>'
      + '<div class="cnt">' + mine.length + '</div></div>'
      + '<div class="list">' + (mine.length ? rows : '<div class="empty">No ongoing tasks \u2728</div>') + '</div></div>');
  }

  const now = new Date();
  const when = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const memberOptions = ORDER.map(ws => '<option value="' + ws + '">' + esc(nameOf(ws)) + '</option>').join('');
  const controls = '<form id="board-controls" class="board-controls" role="search" aria-label="Filter team tasks">'
    + '<label class="control search-control"><span>Search tasks</span><input id="board-search" type="search" placeholder="Task, event or keyword" autocomplete="off"></label>'
    + '<label class="control"><span>Team member</span><select id="board-member"><option value="">Everyone</option>' + memberOptions + '</select></label>'
    + '<label class="control"><span>Status</span><select id="board-status"><option value="">All statuses</option><option value="pending">Pending</option><option value="in-progress">In progress</option><option value="waiting">Waiting</option><option value="on-hold">On hold</option></select></label>'
    + '<label class="control"><span>Deadline</span><select id="board-due"><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="none">No deadline</option></select></label>'
    + '<label class="density"><input id="board-compact" type="checkbox">Compact view</label></form>'
    + '<div class="results-line"><p id="board-results" role="status">Showing ' + totalActive + ' ongoing tasks</p><button id="board-reset" class="reset-btn" type="button" hidden>Clear filters</button></div>';
  const inner = '<main class="wrap">'
    + '<div class="hero"><div class="hero-accent"></div><div class="hero-in">'
    + '<div class="brand"><div class="logo">' + LOGO_TAG + '</div><div><h1>HeadStart <span class="mk">MARCOM</span> &mdash; Team Board</h1><div class="titleaccent"></div><p class="sub">Team priorities, at a glance. Select any task for the full brief, and to send a request to the owner.</p></div>'
    + '<span class="ro">View and request</span></div>'
    + '<div class="stats">'
    + '<div class="stat"><div class="n" data-count="' + totalActive + '">' + totalActive + '</div><div class="l">Active tasks</div></div>'
    + '<div class="stat warn"><div class="n" data-count="' + dueWeek + '">' + dueWeek + '</div><div class="l">Due within 7 days</div></div>'
    + '<div class="stat bad"><div class="n" data-count="' + overdue + '">' + overdue + '</div><div class="l">Overdue</div></div>'
    + '<div class="stat req"><div class="n" data-count="' + openReq + '">' + openReq + '</div><div class="l">Open requests</div></div>'
    + '</div></div></div>'
    + '<div class="updated"><span>Updated ' + esc(when) + ' · Bangkok time</span><button class="refreshbtn" type="button" onclick="location.reload()" aria-label="Refresh"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v5h-5"/></svg> Refresh</button></div>'
    + controls + '<div class="grid">' + cards.join('') + '</div>'
    + '<div id="board-empty" class="no-results" hidden><h2>No matching tasks</h2><p>Try a different search or clear the filters to see the whole team.</p></div>'
    + '<div class="foot">Ongoing work only · shared tasks appear once · your requests reach the owner and the MARCOM Manager, who apply them · refresh to load the latest updates.</div>'
    + '</main>'
    + '<dialog class="dv" id="dv" aria-labelledby="dv-title"><div id="dv-inner"></div></dialog>';

  const dataJson = JSON.stringify(TASKS).replace(/</g, '\\u003c');
  /* The token is already in this reader's address bar; the page carries it so an
     action can be posted back and re-checked on the server. */
  const configJson = JSON.stringify({ token: token, actions: ACTIONS, endpoint: '/.netlify/functions/board-action' }).replace(/</g, '\\u003c');
  const script = '<script id="board-data" type="application/json">' + dataJson + '</script>'
    + '<script id="board-config" type="application/json">' + configJson + '</script>'
    + '<script src="/assets/team-board.js" defer></script>';

  return htmlPage(200, 'Team Task Board', inner, script);
};
