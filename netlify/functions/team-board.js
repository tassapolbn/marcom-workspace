/* Read-only "Team Task Board" for a Director who has no login.
   Opened via a private link:  /team-board?token=XXXX
   The token is set by the admin in the app and stored in
   dept_settings/board_share. This function reads every member's ONGOING tasks
   with the Admin SDK (bypassing client rules) and returns a polished, read-only
   HTML page. Tasks can be clicked to see detail, but nothing can be edited.
   It never exposes leave, pay or any other private field. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');

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
const COLOR = {
  boss:   ['#2b5488', '#12365a'],
  dew:    ['#ef9445', '#dd7a1c'],
  o:      ['#e15a2b', '#c2410c'],
  junior: ['#2f8a53', '#166534']
};
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
function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00');
  if (isNaN(t.getTime())) return String(d);
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

/* Only work-related, non-personal fields ever reach the page. */
function detailOf(t, whoName, colors) {
  const d = {
    who: whoName, c: colors[0], c2: colors[1],
    topic: t.topic || t.title || 'Untitled',
    status: t.status || 'pending',
    priority: t.priority || '',
    due: t.dueDate ? fmtDate(t.dueDate) : '',
    dueRaw: t.dueDate || '',
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
  return d;
}

function taskRow(t, id) {
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
  const pr = (t.priority === 'high') ? '<span class="pill pri-high">High</span>'
    : (t.priority === 'low') ? '<span class="pill pri-low">Low</span>' : '';
  const evName = (t.eventLabel || t.eventName || '').trim();
  const ev = evName ? '<span class="pill ev">' + esc(evName) + '</span>' : '';
  return '<button type="button" class="t' + cls + '" onclick="showDetail(\'' + id + '\')">'
    + '<span class="t-top">' + topic + '<i class="chev">\u203a</i></span>'
    + '<span class="meta2">' + due + stPill + pr + ev + '</span></button>';
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

const STYLE = '<style>'
  + ':root{--ink:#16202e;--muted:#7a8699;--line:#e7ebf1;--brand:#f0b323;--brand2:#d9971a;}'
  + '*{box-sizing:border-box;} html{scroll-behavior:smooth;}'
  + 'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);'
  + 'background:radial-gradient(1200px 600px at 12% -8%,#e9f0fb 0%,rgba(233,240,251,0) 55%),radial-gradient(1000px 560px at 100% 0%,#eae7fb 0%,rgba(234,231,251,0) 50%),#f4f6fb;min-height:100vh;}'
  + '.wrap{max-width:1140px;margin:0 auto;padding:26px 16px 70px;}'
  // hero
  + '.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,#22406a,#0a2444 60%,#0a1e3c);color:#fff;border-radius:22px;padding:26px 26px 22px;box-shadow:0 24px 50px -24px rgba(12,26,52,.7);animation:heroIn .7s cubic-bezier(.2,.7,.2,1) both;}'
  + '.hero:before{content:"";position:absolute;inset:-40% -10% auto auto;width:520px;height:520px;background:radial-gradient(circle at 30% 30%,rgba(120,170,255,.35),rgba(120,170,255,0) 60%);filter:blur(6px);animation:float 12s ease-in-out infinite;}'
  + '.hero:after{content:"";position:absolute;inset:auto auto -60% -12%;width:470px;height:470px;background:radial-gradient(circle at 50% 50%,rgba(240,179,35,.26),rgba(240,179,35,0) 62%);animation:float 15s ease-in-out infinite reverse;}'
  + '.hero-accent{position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand),#ffd873 45%,var(--brand));z-index:2;}'
  + '.hero-in{position:relative;z-index:1;}'
  + '.brand{display:flex;align-items:center;gap:11px;}'
  + '.logo{width:50px;height:50px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;padding:7px;box-shadow:0 10px 20px -8px rgba(0,0,0,.55);overflow:hidden;flex:0 0 auto;}'
  + '.logo img{max-width:100%;max-height:100%;object-fit:contain;display:block;}'
  + '.logo.fb{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#0a2444;font-weight:900;font-size:18px;padding:0;}'
  + '.hero h1{margin:0;font-size:21px;letter-spacing:-.3px;} .hero h1 .mk{color:var(--brand);font-weight:900;}'
  + '.titleaccent{width:48px;height:3px;border-radius:99px;margin:8px 0 0;background:linear-gradient(90deg,var(--brand),#ffd873);}'
  + '.hero .sub{margin:8px 0 0;font-size:12.5px;color:#c3d6f2;}'
  + '.ro{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);padding:4px 11px;border-radius:99px;font-weight:800;font-size:11.5px;margin-left:auto;}'
  + '.ro .dot{width:8px;height:8px;border-radius:50%;background:#5ee08a;box-shadow:0 0 0 0 rgba(94,224,138,.6);animation:pulse 2.2s infinite;}'
  + '.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;}'
  + '.stat{flex:1;min-width:120px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;backdrop-filter:blur(6px);}'
  + '.stat .n{font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1;} .stat .l{font-size:11px;color:#bcd2ec;margin-top:4px;font-weight:600;}'
  + '.stat.warn .n{color:var(--brand);} .stat.bad .n{color:#ff9d9d;}'
  + '.stat.warn{border-color:rgba(240,179,35,.35);} .stat.warn:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--brand),var(--brand2));border-radius:14px 0 0 14px;}'
  + '.stat{position:relative;overflow:hidden;}'
  + '.updated{display:flex;justify-content:center;gap:8px;font-size:11.5px;color:var(--muted);margin:16px 0 2px;}'
  // grid + cards
  + '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:8px;}'
  + '.card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 10px 30px -22px rgba(16,24,40,.5);opacity:0;transform:translateY(16px);animation:fadeUp .55s cubic-bezier(.2,.7,.2,1) forwards;transition:transform .18s ease,box-shadow .18s ease;}'
  + '.card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -22px rgba(16,24,40,.55);}'
  + '.card .bar{height:5px;background:linear-gradient(90deg,var(--c),var(--c2));}'
  + '.card .hd{display:flex;align-items:center;gap:11px;padding:13px 15px 6px;}'
  + '.av{width:40px;height:40px;border-radius:12px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:16px;background:linear-gradient(135deg,var(--c),var(--c2));box-shadow:0 8px 16px -8px var(--c2);}'
  + '.hd .nm{font-size:15.5px;font-weight:800;letter-spacing:-.2px;} .hd .rl{font-size:11px;color:var(--muted);font-weight:600;margin-top:1px;}'
  + '.cnt{margin-left:auto;font-size:11px;font-weight:900;color:#fff;background:linear-gradient(135deg,var(--c),var(--c2));border-radius:99px;padding:3px 10px;}'
  + '.list{padding:6px 12px 14px;display:flex;flex-direction:column;gap:9px;}'
  + '.t{appearance:none;text-align:left;width:100%;font:inherit;color:inherit;cursor:pointer;background:#fbfcfe;border:1px solid #eaeef4;border-left:4px solid #9aa4b2;border-radius:12px;padding:10px 12px;opacity:0;transform:translateY(8px);animation:fadeUp .5s ease forwards;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease,background .14s ease;}'
  + '.t:hover{transform:translateY(-2px) scale(1.008);box-shadow:0 10px 22px -14px rgba(16,24,40,.5);background:#fff;}'
  + '.t.od{border-left-color:#dc2626;} .t.soon{border-left-color:#e0900a;}'
  + '.t-top{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;line-height:1.35;}'
  + '.t-top .chev{margin-left:auto;color:#c3ccd8;font-size:18px;font-weight:400;transition:transform .14s ease,color .14s ease;} .t:hover .chev{transform:translateX(3px);color:var(--muted);}'
  + '.meta2{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;}'
  + '.pill{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;}'
  + '.due{background:#eef1f5;color:#4b5563;} .due.od{background:#fde8e8;color:#b91c1c;} .due.soon{background:#fdf0d9;color:#b7791f;}'
  + '.pri-high{background:#fde8e8;color:#b91c1c;} .pri-low{background:#eef1f5;color:#5b6675;} .ev{background:#efe9fb;color:#6d28d9;}'
  + '.empty{font-size:12.5px;color:#9aa4b2;padding:8px 4px 14px;text-align:center;}'
  + '.foot{margin-top:26px;font-size:11.5px;color:var(--muted);text-align:center;line-height:1.7;}'
  // detail modal
  + '.dv-back{position:fixed;inset:0;background:rgba(11,22,42,.55);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .22s ease;z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:26px 14px;overflow:auto;}'
  + '.dv-back.open{opacity:1;pointer-events:auto;}'
  + '.dv{width:100%;max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 40px 80px -30px rgba(8,16,34,.7);transform:translateY(24px) scale(.97);opacity:0;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .22s ease;}'
  + '.dv-back.open .dv{transform:none;opacity:1;}'
  + '.dv-hd{position:relative;color:#fff;padding:20px 22px;background:linear-gradient(135deg,var(--c,#22406a),var(--c2,#0a2444));}'
  + '.dv-hd .who{font-size:12px;font-weight:800;opacity:.9;letter-spacing:.2px;} .dv-hd h3{margin:5px 0 0;font-size:18px;letter-spacing:-.2px;line-height:1.3;}'
  + '.dv-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:10px;border:none;background:rgba(255,255,255,.16);color:#fff;font-size:18px;cursor:pointer;line-height:1;transition:background .15s;} .dv-x:hover{background:rgba(255,255,255,.3);}'
  + '.dv-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}'
  + '.dv-body{padding:18px 22px 22px;}'
  + '.dv-row{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #f0f2f6;} .dv-row:last-child{border-bottom:none;}'
  + '.dv-k{flex:0 0 108px;font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;padding-top:1px;}'
  + '.dv-v{flex:1;font-size:13.5px;color:var(--ink);line-height:1.5;white-space:pre-wrap;word-break:break-word;}'
  + '.dv-links{margin-top:14px;display:flex;flex-direction:column;gap:7px;}'
  + '.dv-links a{font-size:12.5px;color:#1d4ed8;text-decoration:none;background:#eef3fe;border:1px solid #dbe6fb;border-radius:9px;padding:8px 11px;word-break:break-all;} .dv-links a:hover{background:#e2ecfd;}'
  + '.dv-note{margin-top:14px;font-size:11px;color:var(--muted);text-align:center;}'
  // keyframes
  + '@keyframes fadeUp{to{opacity:1;transform:none;}}'
  + '@keyframes heroIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:none;}}'
  + '@keyframes float{0%,100%{transform:translate(0,0);}50%{transform:translate(-18px,18px);}}'
  + '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(94,224,138,.6);}70%{box-shadow:0 0 0 8px rgba(94,224,138,0);}100%{box-shadow:0 0 0 0 rgba(94,224,138,0);}}'
  + '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}.card,.t{opacity:1!important;transform:none!important;}}'
  + '</style>';

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
  try { const es = await db.collection('event_tasks').get(); eventTasks = es.docs.map(d => d.data() || {}); }
  catch (e) { console.error(e); }

  const TASKS = {};
  let idc = 0;
  let totalActive = 0, overdue = 0, dueWeek = 0;
  const cards = [];
  for (const ws of ORDER) {
    let own = [];
    try { const os = await db.collection(ws + '_tasks').get(); own = os.docs.map(d => d.data() || {}); }
    catch (e) { console.error(e); }
    const mine = own.filter(isActive).concat(eventTasks.filter(t => isActive(t) && assignedTo(t, ws)));
    mine.sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
    const nm = names[ws] || DEFAULT_NAME[ws] || ws;
    const colors = COLOR[ws] || COLOR.boss;
    const rows = mine.map((t, i) => {
      const id = 't' + (idc++);
      TASKS[id] = detailOf(t, nm, colors);
      const du = daysUntil(t.dueDate);
      totalActive++; if (du !== null && du < 0) overdue++; else if (du !== null && du <= 7) dueWeek++;
      return taskRow(t, id).replace('<button', '<button style="animation-delay:' + (80 + i * 45) + 'ms"');
    }).join('');
    const initial = esc((nm || '?').trim().charAt(0).toUpperCase() || '?');
    cards.push('<div class="card" style="--c:' + colors[0] + ';--c2:' + colors[1] + ';animation-delay:' + (120 + ORDER.indexOf(ws) * 90) + 'ms">'
      + '<div class="bar"></div><div class="hd"><div class="av">' + initial + '</div>'
      + '<div><div class="nm">' + esc(nm) + '</div><div class="rl">' + esc(ROLE[ws] || '') + '</div></div>'
      + '<div class="cnt">' + mine.length + '</div></div>'
      + '<div class="list">' + (mine.length ? rows : '<div class="empty">No ongoing tasks \u2728</div>') + '</div></div>');
  }

  const now = new Date();
  const when = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const inner = '<div class="wrap">'
    + '<div class="hero"><div class="hero-accent"></div><div class="hero-in">'
    + '<div class="brand"><div class="logo">' + LOGO_TAG + '</div><div><h1>HeadStart <span class="mk">MARCOM</span> &mdash; Team Board</h1><div class="titleaccent"></div><p class="sub">A live look at what everyone is working on</p></div>'
    + '<span class="ro"><span class="dot"></span> Read only</span></div>'
    + '<div class="stats">'
    + '<div class="stat"><div class="n" data-count="' + totalActive + '">0</div><div class="l">Active tasks</div></div>'
    + '<div class="stat warn"><div class="n" data-count="' + dueWeek + '">0</div><div class="l">Due within 7 days</div></div>'
    + '<div class="stat bad"><div class="n" data-count="' + overdue + '">0</div><div class="l">Overdue</div></div>'
    + '</div></div></div>'
    + '<div class="updated"><span>Updated ' + esc(when) + '</span><span>&middot;</span><span>Refresh for the latest</span></div>'
    + '<div class="grid">' + cards.join('') + '</div>'
    + '<div class="foot">Private, read-only view shared by the HeadStart MARCOM team.<br>Tap any task to see its detail. Only ongoing tasks are shown, and no personal information is included.</div>'
    + '</div>'
    + '<div class="dv-back" id="dv" onclick="if(event.target===this)closeDetail()"><div class="dv" role="dialog" aria-modal="true"><div id="dv-inner"></div></div></div>';

  const dataJson = JSON.stringify(TASKS).replace(/</g, '\\u003c');
  const script = '<script>(function(){'
    + 'var TASKS=' + dataJson + ';'
    + 'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}'
    + 'function row(k,v){return v?(\'<div class="dv-row"><div class="dv-k">\'+esc(k)+\'</div><div class="dv-v">\'+esc(v)+\'</div></div>\'):"";}'
    + 'function pill(txt,bg,fg){return \'<span class="pill" style="background:\'+bg+\';color:\'+fg+\'">\'+esc(txt)+\'</span>\';}'
    + 'var SC={pending:["Pending","rgba(255,255,255,.2)","#fff"],"in-progress":["In progress","rgba(255,255,255,.2)","#fff"],waiting:["Waiting","rgba(255,255,255,.2)","#fff"],"on-hold":["On hold","rgba(255,255,255,.2)","#fff"]};'
    + 'window.showDetail=function(id){var t=TASKS[id];if(!t)return;var inner=document.getElementById("dv-inner");'
    + 'var pills="";var s=SC[t.status]||SC.pending;pills+=pill(s[0],s[1],s[2]);'
    + 'if(t.priority==="high")pills+=pill("High priority","rgba(255,255,255,.2)","#fff");else if(t.priority==="low")pills+=pill("Low priority","rgba(255,255,255,.2)","#fff");'
    + 'if(t.event)pills+=pill(t.event,"rgba(255,255,255,.2)","#fff");'
    + 'var h=\'<div class="dv-hd" style="--c:\'+(t.c||"#22406a")+\';--c2:\'+(t.c2||"#0a2444")+\'"><button class="dv-x" onclick="closeDetail()" aria-label="Close">\\u00d7</button>\';'
    + 'h+=\'<div class="who">\'+esc(t.who||"")+\'</div><h3>\'+esc(t.topic||"Task")+\'</h3><div class="dv-pills">\'+pills+\'</div></div>\';'
    + 'h+=\'<div class="dv-body">\';'
    + 'h+=row("Due date",t.due);h+=row("Category",t.category);h+=row("Description",t.description);'
    + 'h+=row("Assigned by",t.assignedBy);h+=row("Assigned",t.assignedDate);'
    + 'h+=row("Shoot event",t.shootEvent);h+=row("Shoot date",t.shootDate);h+=row("Shoot time",t.shootTime);h+=row("Location",t.shootLocation);'
    + 'h+=row("Design type",t.designType);h+=row("Brand",t.designBrand);h+=row("Design status",t.designStatus);h+=row("Revisions",t.revisions);'
    + 'if(t.links&&t.links.length){h+=\'<div class="dv-links">\';for(var i=0;i<t.links.length;i++){var u=t.links[i].url||"";if(!/^https?:\\/\\//i.test(u))u="https://"+u;h+=\'<a href="\'+esc(u)+\'" target="_blank" rel="noopener">\'+esc(t.links[i].title||t.links[i].url)+\'</a>\';}h+="</div>";}'
    + 'h+=\'<div class="dv-note">Read only \\u2014 this view cannot be edited.</div></div>\';'
    + 'inner.innerHTML=h;document.getElementById("dv").classList.add("open");document.body.style.overflow="hidden";};'
    + 'window.closeDetail=function(){document.getElementById("dv").classList.remove("open");document.body.style.overflow="";};'
    + 'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeDetail();});'
    + 'var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches;'
    + 'Array.prototype.forEach.call(document.querySelectorAll("[data-count]"),function(el){var target=+el.getAttribute("data-count")||0;if(reduce||!window.requestAnimationFrame){el.textContent=target;return;}var t0=0,dur=850;function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur);var e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;el.textContent=Math.round(target*e);if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);});'
    + '})();<\/script>';

  return htmlPage(200, 'Team Task Board', inner, script);
};
