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
/* Official supplied HeadStart artwork, preserved at its original aspect ratio. */
const LOGO_TAG = '<img src="/assets/headstart-landscape-dark.png" alt="HeadStart International School Phuket" width="2048" height="510">';
const PEOPLE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M20.5 20c0-2.4-1.5-4.2-3.7-4.8"/></svg>';
const CAL_SVG = '<svg class="pico" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>';
const COLOR = {
  boss:   ['#F0B323', '#003057'],
  dew:    ['#F0B323', '#003057'],
  o:      ['#F0B323', '#003057'],
  junior: ['#F0B323', '#003057']
};
const DONE = { done: 1, canceled: 1 };
const BOARD_DATE = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});

/* The four ongoing states, listed the way a reader wants to meet them: work
   moving now, then work blocked on somebody, then work not started, then work
   deliberately paused. Each state carries its own glyph, so the board never
   asks anyone to tell states apart by colour alone. */
const STATUS_ORDER = ['in-progress', 'waiting', 'pending', 'on-hold'];
const STATUS = {
  'in-progress': { label: 'In progress', note: 'Being worked on now',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.2 12h5.6"/><path d="m12.4 9.6 2.4 2.4-2.4 2.4"/>' },
  'waiting':     { label: 'Waiting', note: 'Blocked or waiting on someone',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.1 1.9"/>' },
  'pending':     { label: 'Pending', note: 'Not started yet',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M8.4 12h7.2"/>' },
  'on-hold':     { label: 'On hold', note: 'Paused for now',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M10.2 9.2v5.6"/><path d="M13.8 9.2v5.6"/>' }
};
function statusOf(t) { const key = (t && t.status) || 'pending'; return STATUS[key] ? key : 'pending'; }
function statusIcon(key, size) {
  return '<svg class="sico" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none"'
    + ' stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'
    + ' aria-hidden="true">' + STATUS[key].icon + '</svg>';
}

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
    status: statusOf(t),
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

/* One task card. Status owns the strongest signals (the left rail and the chip
   at the top), the deadline owns the surface tint and its own pill, and a
   Director request owns the gold flag. The three never fight for the same
   piece of the card. `home` is the team-member group the card belongs to, so
   the browser can regroup without the server rendering the task twice. */
function taskRow(t, id, whoLabel, reqCount, home) {
  const topic = esc(t.topic || t.title || 'Untitled');
  const du = daysUntil(t.dueDate);
  const od = du !== null && du < 0;
  const soon = du !== null && du >= 0 && du <= 3;
  const key = statusOf(t);
  const cls = 's-' + key + (od ? ' od' : (soon ? ' soon' : '')) + (reqCount > 0 ? ' rq' : '');
  let due = '';
  if (t.dueDate) {
    const dcls = od ? ' od' : (soon ? ' soon' : '');
    const lbl = od ? ('Overdue ' + fmtDate(t.dueDate)) : (du === 0 ? 'Due today' : (soon ? (du + 'd left') : fmtDate(t.dueDate)));
    due = '<span class="pill due' + dcls + '">' + CAL_SVG + esc(lbl) + '</span>';
  } else due = '<span class="pill due">' + CAL_SVG + 'No deadline</span>';
  const stChip = '<span class="t-status">' + statusIcon(key, 14) + esc(STATUS[key].label) + '</span>';
  const pr = (t.priority === 'high') ? '<span class="pill pri-high">High priority</span>'
    : (t.priority === 'low') ? '<span class="pill pri-low">Low</span>' : '';
  const evName = (t.eventLabel || t.eventName || '').trim();
  const ev = evName ? '<span class="pill ev">' + esc(evName) + '</span>' : '';
  const who = whoLabel ? '<span class="pill whopill">' + esc(whoLabel) + '</span>' : '';
  const rq = reqCount > 0
    ? '<span class="pill req">' + (reqCount === 1 ? '1 request sent' : reqCount + ' requests sent') + '</span>'
    : '';
  return '<button type="button" class="t ' + cls + '" data-task-id="' + id + '"'
    + ' data-status="' + key + '" data-group="' + esc(home) + '" onclick="showDetail(\'' + id + '\')">'
    + '<span class="t-head">' + stChip + '<span class="t-flags">' + pr + rq + '</span></span>'
    + '<span class="t-title"><span class="t-name">' + topic + '</span><i class="chev" aria-hidden="true">›</i></span>'
    + '<span class="meta2">' + due + ev + who + '</span></button>';
}

/* A group card: the same shell for a team member and for a status column, so
   switching between the two groupings never changes the reading rhythm. */
function groupCard(o) {
  return '<div class="card' + (o.extra ? ' ' + o.extra : '') + '"' + (o.attr || '') + '>'
    + '<div class="bar"></div>'
    + '<div class="hd"><div class="av">' + o.avatar + '</div>'
    + '<div><div class="nm">' + esc(o.name) + '</div><div class="rl">' + esc(o.role) + '</div></div>'
    + '<div class="cnt">' + o.count + '</div></div>'
    + '<div class="list"' + (o.listAttr || '') + '>' + (o.rows || '')
    + '<div class="empty"' + (o.rows ? ' hidden' : '') + '>' + esc(o.empty) + '</div></div></div>';
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
      + '<title>' + esc(title) + '</title>' + STYLE + '</head><body' + (statusCode === 200 ? ' class="compact"' : '') + '>' + inner
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
  /* Every task is rendered exactly once. Both groupings are built from this
     one list, and the browser moves the rendered cards between them. */
  const built = [];
  const memberCards = [];
  const sharedCards = [];

  // A task shared with two or more people appears ONCE here, not repeated under
  // every member. It shows who it is shared with.
  const shared = eventTasks.filter(t => isActive(t) && isSharedMany(t))
    .sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
  if (shared.length) {
    shared.forEach(t => {
      const id = 't' + (idc++);
      const whoLabel = taskAssignees(t).map(nameOf).join(', ');
      TASKS[id] = detailOf(t, whoLabel, ['#F0B323', '#003057'], NOTES);
      TASKS[id].members = taskAssignees(t);
      bump(t);
      openReq += TASKS[id].requests.length;
      built.push({ id: id, status: statusOf(t), home: 'shared',
        html: taskRow(t, id, whoLabel, TASKS[id].requests.length, 'shared') });
    });
    sharedCards.push(groupCard({
      extra: 'shared', attr: ' style="--c:#F0B323;--c2:#003057"', avatar: PEOPLE_SVG,
      name: 'Shared across the team', role: 'Assigned to more than one person',
      count: shared.length, rows: '', listAttr: ' data-member-list="shared"',
      empty: 'No shared tasks in this view'
    }));
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
    mine.forEach(t => {
      const id = 't' + (idc++);
      TASKS[id] = detailOf(t, nm, colors, NOTES);
      TASKS[id].members = [ws];
      bump(t);
      openReq += TASKS[id].requests.length;
      built.push({ id: id, status: statusOf(t), home: ws,
        html: taskRow(t, id, nm, TASKS[id].requests.length, ws) });
    });
    memberCards.push(groupCard({
      attr: ' style="--c:' + colors[0] + ';--c2:' + colors[1] + '"',
      avatar: esc((nm || '?').trim().charAt(0).toUpperCase() || '?'),
      name: nm, role: ROLE[ws] || '', count: mine.length, rows: '',
      listAttr: ' data-member-list="' + esc(ws) + '"', empty: 'No ongoing tasks'
    }));
  }

  /* Status is the board's default organisation, so the server renders the
     cards into their status column. The team-member columns above are ready
     and empty; the browser fills them the moment that grouping is chosen. */
  const byStatus = {};
  STATUS_ORDER.forEach(k => { byStatus[k] = []; });
  built.forEach(row => byStatus[row.status].push(row));
  const statusCards = STATUS_ORDER.map(k => groupCard({
    extra: 's-' + k, avatar: statusIcon(k, 22), name: STATUS[k].label, role: STATUS[k].note,
    count: byStatus[k].length, rows: byStatus[k].map(r => r.html).join(''),
    listAttr: ' data-status-list="' + k + '"', empty: 'Nothing at this stage'
  })).join('');

  const now = new Date();
  const when = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const memberOptions = ORDER.map(ws => '<option value="' + ws + '">' + esc(nameOf(ws)) + '</option>').join('');
  /* Status is a headline filter, not a line in a dropdown: each category shows
     its own colour, its own glyph and how much work is sitting in it. */
  const statusChips = '<div class="status-filter" id="board-status" role="group" aria-label="Filter by status">'
    + '<button type="button" class="schip is-on" data-status="" aria-pressed="true">All statuses<b>' + totalActive + '</b></button>'
    + STATUS_ORDER.map(k => '<button type="button" class="schip s-' + k + '" data-status="' + k + '" aria-pressed="false">'
        + statusIcon(k, 14) + esc(STATUS[k].label) + '<b>' + byStatus[k].length + '</b></button>').join('')
    + '</div>';
  const groupBy = '<div class="groupby" role="group" aria-label="Group tasks by">'
    + '<span class="gb-label">Group by</span>'
    + '<button type="button" class="gbtn is-on" data-group-mode="status" aria-pressed="true">Status</button>'
    + '<button type="button" class="gbtn" data-group-mode="member" aria-pressed="false">Team member</button>'
    + '</div>';
  const controls = '<div class="toolbar" id="board-toolbar">'
    + '<div class="toolbar-head"><span class="tb-label">Status</span>' + statusChips + '</div>'
    + '<form id="board-controls" class="board-controls" role="search" aria-label="Filter team tasks">'
    + '<label class="control search-control"><span>Search tasks</span><input id="board-search" type="search" placeholder="Task, event or keyword" autocomplete="off"></label>'
    + '<label class="control"><span>Team member</span><select id="board-member"><option value="">Everyone</option>' + memberOptions + '</select></label>'
    + '<label class="control"><span>Deadline</span><select id="board-due"><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="none">No deadline</option></select></label>'
    + groupBy
    + '<label class="density"><input id="board-compact" type="checkbox" checked>Compact view</label></form></div>'
    + '<div class="results-line"><p id="board-results" role="status">Showing ' + totalActive + ' ongoing tasks</p><button id="board-reset" class="reset-btn" type="button" hidden>Clear filters</button></div>';
  const inner = '<main class="wrap">'
    + '<div class="hero"><div class="hero-accent"></div><div class="hero-in">'
    + '<div class="brand"><div class="logo">' + LOGO_TAG + '</div><div><div class="eyebrow">MARCOM WORKSPACE</div><h1>Team Board<span class="mk">.</span></h1><p class="sub">Grouped by status. Select a task to review the brief or send a request.</p></div>'
    + '<span class="ro">View and request</span></div>'
    + '<div class="stats">'
    + '<div class="stat"><div class="n" data-count="' + totalActive + '">' + totalActive + '</div><div class="l">Ongoing tasks</div></div>'
    + '<div class="stat warn"><div class="n" data-count="' + dueWeek + '">' + dueWeek + '</div><div class="l">Due within 7 days</div></div>'
    + '<div class="stat bad"><div class="n" data-count="' + overdue + '">' + overdue + '</div><div class="l">Overdue</div></div>'
    + '<div class="stat req"><div class="n" data-count="' + openReq + '">' + openReq + '</div><div class="l">Open requests</div></div>'
    + '</div></div></div>'
    + '<div class="updated"><span>Updated ' + esc(when) + ' · Bangkok time</span><button class="refreshbtn" type="button" onclick="location.reload()" aria-label="Refresh"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v5h-5"/></svg> Refresh</button></div>'
    + controls
    + '<div class="grid" id="grid-status">' + statusCards + '</div>'
    + '<div class="grid" id="grid-member" hidden>' + memberCards.concat(sharedCards).join('') + '</div>'
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

  return htmlPage(200, 'HeadStart MARCOM | Team Board', inner, script);
};
