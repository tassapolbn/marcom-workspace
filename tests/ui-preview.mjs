/** Local visual QA only. Run: node tests/ui-preview.mjs
 * Uses the actual index.html and an in-memory Firebase adapter. No app data leaves
 * the browser; CSP blocks connections and server routes never proxy production.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.UI_PREVIEW_PORT || 4173);

function fixtureBootstrap() {
  const errors = [];
  window.__previewErrors = errors;
  window.addEventListener('error', event => errors.push(event.message));
  window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  window.__previewNetwork = [];
  window.fetch = async function(input) {
    window.__previewNetwork.push(String(input));
    return new Response(JSON.stringify({ events: [], items: [], available: true, ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  window.open = () => null;
  class Timestamp {
    constructor(value = Date.now()) { this.value = value; this.seconds = Math.floor(value / 1000); this.nanoseconds = 0; }
    toDate() { return new Date(this.value); }
    toMillis() { return this.value; }
    static now() { return new Timestamp(); }
    static fromDate(date) { return new Timestamp(date.getTime()); }
  }
  const docs = new Map();
  const listeners = new Set();
  const today = new Date();
  const date = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
  const statuses = ['pending', 'in-progress', 'waiting', 'on-hold', 'done'];
  const names = ['Plan the school open day campaign', 'Prepare the September newsletter', 'Review photography and video assets', 'Confirm the event venue and schedule', 'Publish the parent information pack'];
  for (const member of ['boss', 'dew', 'o', 'junior']) {
    names.forEach((topic, i) => docs.set(member + '_tasks/sample-' + i, {
      topic, title: topic, description: 'Preview content for layout and motion review. Long English and Thai content: ประชาสัมพันธ์กิจกรรมโรงเรียน',
      desc: 'Preview content for layout and motion review. Coordinate with the team and collect final approvals.',
      status: statuses[i], priority: i === 1 ? 'high' : 'normal', dueDate: date(i - 1), date: date(-2),
      createdAt: Timestamp.fromDate(new Date(today.getTime() - i * 1000)), updatedAt: Timestamp.now(),
      doneAt: i === 4 ? Timestamp.now() : null, subtasks: [], tags: [], type: 'individual',
      eventName: i === 0 ? 'School Open Day' : '', assignedTo: member,
    }));
    docs.set(member + '_notes/sample', { title: 'Campaign checklist', content: 'Confirm artwork, review Thai copy, and check all event dates.', createdAt: Timestamp.now() });
    docs.set(member + '_links/sample', { title: 'Brand guidelines', url: '#preview-brand', category: 'Resources', createdAt: Timestamp.now() });
  }
  docs.set('acl/preview@example.test', { role: 'admin', workspace: null, disabled: false });
  docs.set('dept_settings/team', { names: { boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' } });
  docs.set('boss_settings/theme', { color: '#4B8FD0', textColor: 'auto' });
  docs.set('school_events/open-day', { title: 'School Open Day', name: 'School Open Day', date: date(7), category: 'School Event', color: '#4B8FD0', notes: 'Synthetic visual QA event' });
  docs.set('dept_settings/announcements', { items: [{ id: 'preview', title: 'September planning', text: 'Coordinate the next campaign with your team.', body: 'Coordinate the next campaign with your team.', author: 'Boss', createdAt: Date.now() }] });
  function docSnapshot(key) {
    return { id: key.split('/').at(-1), ref: new Ref(key, true), exists: docs.has(key), metadata: { fromCache: false, hasPendingWrites: false }, data: () => docs.get(key), get: field => docs.get(key)?.[field] };
  }
  function broadcast() { queueMicrotask(() => { for (const listener of listeners) { try { listener.fn(listener.ref.snapshot()); } catch (error) { errors.push(error.stack || String(error)); } } }); }
  let nextId = 0;
  class Ref {
    constructor(value, single = false, filters = []) { this.path = value; this.id = value.split('/').at(-1); this.single = single; this.filters = filters; }
    collection(name) { return new Ref(this.path + '/' + name); }
    doc(id = 'preview-added-' + (++nextId)) { return new Ref(this.path + '/' + id, true); }
    where(field, op, value) { return new Ref(this.path, this.single, this.filters.concat([[field, op, value]])); }
    orderBy() { return this; }
    limit() { return this; }
    startAfter() { return this; }
    snapshot() {
      if (this.single) return docSnapshot(this.path);
      let result = [...docs.keys()].filter(key => key.startsWith(this.path + '/') && key.slice(this.path.length + 1).indexOf('/') < 0).map(docSnapshot);
      for (const [field, op, expected] of this.filters) result = result.filter(doc => {
        const actual = doc.data()[field];
        if (op === '==') return actual === expected;
        if (op === 'array-contains') return Array.isArray(actual) && actual.includes(expected);
        if (op === 'in') return expected.includes(actual);
        if (op === '!=') return actual !== expected;
        if (op === '>=') return actual >= expected;
        if (op === '<=') return actual <= expected;
        return true;
      });
      return { docs: result, size: result.length, empty: !result.length, metadata: { fromCache: false, hasPendingWrites: false }, forEach: fn => result.forEach(fn), docChanges: () => result.map(doc => ({ type: 'added', doc })) };
    }
    get() { return Promise.resolve(this.snapshot()); }
    onSnapshot(options, next) {
      const fn = typeof options === 'function' ? options : next;
      const listener = { ref: this, fn }; listeners.add(listener);
      setTimeout(() => { if (listeners.has(listener)) { try { fn(this.snapshot()); } catch (error) { errors.push(error.stack || String(error)); } } }, 0);
      return () => listeners.delete(listener);
    }
    set(data, options) { docs.set(this.path, options?.merge ? { ...docs.get(this.path), ...data } : data); broadcast(); return Promise.resolve(); }
    update(data) { return this.set(data, { merge: true }); }
    delete() { docs.delete(this.path); broadcast(); return Promise.resolve(); }
    add(data) { const ref = this.doc(); return ref.set(data).then(() => ref); }
  }
  const database = {
    collection: name => new Ref(name), doc: name => new Ref(name, true), settings() {},
    enablePersistence: () => Promise.resolve(),
    batch() { const operations = []; const batch = { set: (...args) => { operations.push(() => args[0].set(...args.slice(1))); return batch; }, update: (...args) => { operations.push(() => args[0].update(...args.slice(1))); return batch; }, delete: ref => { operations.push(() => ref.delete()); return batch; }, commit: () => Promise.all(operations.map(fn => fn())) }; return batch; },
    runTransaction: async fn => fn({ get: ref => ref.get(), set: (ref, ...args) => ref.set(...args), update: (ref, ...args) => ref.update(...args), delete: ref => ref.delete() })
  };
  const firestore = () => database;
  firestore.Timestamp = Timestamp;
  firestore.FieldValue = { serverTimestamp: () => Timestamp.now(), delete: () => null, increment: value => value, arrayUnion: (...values) => values, arrayRemove: () => [] };
  const user = { uid: 'local-preview', email: 'preview@example.test', displayName: 'Preview', getIdToken: async () => 'local-preview' };
  const authState = { currentUser: user, onAuthStateChanged(fn) { const id = setTimeout(() => fn(user), 0); return () => clearTimeout(id); }, setPersistence: async () => {}, signOut: async () => {}, signInWithPopup: async () => ({ user }), signInWithEmailAndPassword: async () => ({ user }) };
  const auth = () => authState;
  auth.Auth = { Persistence: { LOCAL: 'LOCAL', SESSION: 'SESSION' } };
  auth.GoogleAuthProvider = class { setCustomParameters() {} };
  window.firebase = { initializeApp: () => ({}), apps: [{}], firestore, auth };
  window.previewRefresh = broadcast;
  const params = new URLSearchParams(location.search);
  if (!sessionStorage.getItem('preview-initialized')) {
    localStorage.removeItem('bb_dark'); localStorage.removeItem('uxp_sal'); localStorage.removeItem('uxp_sb_collapsed');
    sessionStorage.setItem('preview-initialized', '1');
  }
  window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
    const tab = params.get('tab') || 'boss';
    if (typeof window.switchTab === 'function') window.switchTab(tab);
    window.dispatchEvent(new Event('preview-ready'));
  }, 600));
  window.previewReport = function() {
    const sample = selector => {
      const el = document.querySelector(selector); if (!el) return null;
      const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
      return { text: el.textContent.trim().slice(0, 120), color: style.color, background: style.backgroundColor, border: style.borderBottomColor, animation: style.animationName, animationDelay: style.animationDelay, transition: style.transitionDuration, width: Math.round(rect.width), x: Math.round(rect.left), class: el.className, ariaSelected: el.getAttribute('aria-selected') };
    };
    const overflows = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.right > innerWidth + 2 || r.left < -2) && !el.closest('.tab-nav,.modal-overlay:not(.open),.cmdk-overlay:not(.open)');
    }).slice(0, 18).map(el => ({ selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + String(el.className).replaceAll(' ', '.')), x: Math.round(el.getBoundingClientRect().x), width: Math.round(el.getBoundingClientRect().width) }));
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, theme: document.documentElement.className, selected: [...document.querySelectorAll('.tab-btn.a-active')].map(el => el.id), payday: sample('#sal-date'), paydayNote: sample('#sal-note'), daysLabel: sample('.salary-days-label'), tabs: ['overview','boss','dew','o','junior'].map(t => sample('#tab-' + t)), task: sample('.tab-panel.active .task-card'), overflows, errors: errors.slice(-12), interceptedFetches: window.__previewNetwork.slice(-6) };
  };
}

const script = `<script>(${fixtureBootstrap.toString()})();</script>`;
function shell(width) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>MARCOM local UI preview</title><style>body{margin:0;background:#dce3ec;font:14px system-ui;color:#172339}header{padding:10px 16px;display:flex;gap:9px;align-items:center;flex-wrap:wrap;background:#172339;color:white}button,select{font:inherit;padding:6px 10px;border-radius:7px;border:1px solid #b4bfd0;cursor:pointer}iframe{display:block;height:calc(100vh - 55px);max-width:100%;margin:0 auto;border:0;background:white}pre{display:none;position:fixed;inset:60px 12px 12px auto;width:min(560px,90vw);overflow:auto;background:#101827;color:#d4f4e2;border:2px solid #62758c;border-radius:10px;padding:15px;z-index:20;white-space:pre-wrap;font:12px monospace}</style></head><body><header><b>Local UI preview · synthetic data</b><select id="width" aria-label="Preview viewport width"><option value="100%">Full width</option><option>1440</option><option>1024</option><option>900</option><option>768</option><option>390</option><option>320</option></select><button id="theme">Light / dark</button><button id="refresh">Simulate live refresh</button><button id="report">Diagnostics</button><button id="reload">Reload current source</button></header><iframe title="MARCOM preview" id="app" style="width:${width}px" src="/app"></iframe><pre id="diagnostics" role="status"></pre><script>const frame=document.getElementById('app'),picker=document.getElementById('width'),report=document.getElementById('diagnostics');picker.value='${width}';if(!picker.value)picker.value='100%';if(picker.value==='100%')frame.style.width='100%';picker.onchange=()=>{frame.style.width=picker.value==='100%'?'100%':picker.value+'px';report.style.display='none'};document.getElementById('theme').onclick=()=>frame.contentDocument.documentElement.classList.toggle('dark');document.getElementById('refresh').onclick=()=>frame.contentWindow.previewRefresh();document.getElementById('report').onclick=()=>{report.textContent=JSON.stringify(frame.contentWindow.previewReport(),null,2);report.style.display=report.style.display==='block'?'none':'block'};document.getElementById('reload').onclick=()=>frame.contentWindow.location.reload();window.previewReport=()=>frame.contentWindow.previewReport();</script></body></html>`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:' + port);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'none'; frame-src 'self'; form-action 'none'");
  try {
    if (url.pathname === '/' || url.pathname === '/preview') {
      const requested = Number(url.searchParams.get('width'));
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.end(shell(requested >= 280 && requested <= 2560 ? requested : '100%'));
    }
    if (url.pathname === '/app') {
      let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
      html = html.replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
      html = html.replace(/<head>/i, '<head>' + script);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.end(html);
    }
    if (/^\/assets\/[\w.-]+$/.test(url.pathname) || url.pathname === '/site.webmanifest') {
      const filepath = path.join(root, url.pathname.slice(1));
      const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' }[path.extname(filepath)] || 'application/octet-stream';
      response.setHeader('Content-Type', mime); return response.end(await fs.readFile(filepath));
    }
    response.writeHead(404); response.end('Preview route unavailable');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write('Local UI preview: http://127.0.0.1:' + port + '/preview\n'));
