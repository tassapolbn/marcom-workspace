/* Public Request Centre submission endpoint.
   The browser never writes to Firestore: this function validates, sanitises,
   rate limits, generates a secure reference number, creates the request and
   the assigned task with the Admin SDK, and records any automation failure. */
const crypto = require('crypto');
const { admin, getDb, rateLimited, json, clientIp } = require('./lib/admin');

const TYPES = {
  design: { label: 'Graphic Design Request', short: 'Graphic Design', ws: 'dew',
    required: ['reqName', 'department', 'email', 'eventName', 'designType', 'deadline'] },
  photo:  { label: 'Photography Request', short: 'Photography', ws: 'o',
    required: ['reqName', 'department', 'email', 'eventName', 'eventDate', 'deadline'] }
};

const LONG = new Set(['purpose', 'wording', 'instructions', 'comments', 'moments']);
const SHORT_MAX = 300, LONG_MAX = 5000, NAME_MAX = 120;
const ARRAY_FIELDS = new Set(['photoTypes', 'deliverables', 'usage']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CTRL_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function cleanStr(v, max) {
  if (v == null) return '';
  return String(v).replace(CTRL_RE, '').trim().slice(0, max);
}
function safeHttpUrl(u) {
  u = cleanStr(u, 1000);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^\/\//.test(u)) return '';
  return 'https://' + u;
}
function makeRefNo() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return 'REQ-' + out;
}

function sanitiseData(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const keys = Object.keys(raw).slice(0, 60);
  for (const k of keys) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(k)) continue;
    const v = raw[k];
    if (k === 'links') continue; /* handled separately */
    if (ARRAY_FIELDS.has(k) || Array.isArray(v)) {
      out[k] = (Array.isArray(v) ? v : []).slice(0, 15).map(x => cleanStr(x, 80)).filter(Boolean);
    } else if (k === 'email') {
      out[k] = cleanStr(v, NAME_MAX).toLowerCase();
    } else if (k === 'reqName' || k === 'department' || k === 'approver') {
      out[k] = cleanStr(v, NAME_MAX);
    } else if (LONG.has(k)) {
      out[k] = cleanStr(v, LONG_MAX);
    } else {
      out[k] = cleanStr(v, SHORT_MAX);
    }
  }
  return out;
}
function sanitiseLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map(l => ({
    title: cleanStr(l && l.title, 150) || 'Attachment',
    url: safeHttpUrl(l && l.url)
  })).filter(l => l.url);
}

const FIELD_LABELS = {
  reqName: 'Requester', department: 'Department', email: 'Email',
  eventName: 'Event Name', eventDate: 'Event Date', purpose: 'Purpose',
  designType: 'Design Type', format: 'Design Format', customW: 'Width', customH: 'Height', customU: 'Unit',
  colors: 'Preferred Colours', fonts: 'Preferred Fonts', style: 'Preferred Style',
  wording: 'Wording to include', instructions: 'Additional Instructions',
  deadline: 'Deadline', approver: 'Approver', comments: 'Comments',
  venue: 'Venue', startTime: 'Start Time', endTime: 'End Time',
  photoTypes: 'Photography Type', deliverables: 'Deliverables', usage: 'Intended Usage',
  vips: 'Special guests', moments: 'Important moments', restrictions: 'Restrictions'
};
function buildBrief(T, d, refNo) {
  const lines = ['REQUEST ' + refNo + ' - ' + T.label, ''];
  for (const [k, label] of Object.entries(FIELD_LABELS)) {
    let v = d[k];
    if (Array.isArray(v)) v = v.join(', ');
    if (v) lines.push(label + ': ' + v);
  }
  return lines.join('\n').slice(0, 9000);
}

async function notify(refNo, T, d) {
  /* Optional email notifications. Silently skipped unless env vars are set. */
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) return;
  const to = [];
  const assignee = T.ws === 'dew' ? process.env.NOTIFY_TO_DESIGN : process.env.NOTIFY_TO_PHOTO;
  if (assignee) to.push(assignee);
  if (process.env.NOTIFY_TO_ADMIN) to.push(process.env.NOTIFY_TO_ADMIN);
  const send = (rcpt, subject, text) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: rcpt, subject, text })
  }).catch(() => {});
  try {
    if (to.length) {
      await send(to, '[MARCOM] New ' + T.short + ' request ' + refNo + ' - ' + (d.eventName || ''),
        'A new request has arrived in the MARCOM Workspace.' + '\n\n' + buildBrief(T, d, refNo));
    }
    if (d.email) {
      await send([d.email], 'MARCOM received your request ' + refNo,
        'Dear Khun ' + (d.reqName || '') + ',\n\nThank you for your ' + T.short.toLowerCase() +
        ' request. Your reference number is ' + refNo + '.\nYou can track the status any time on the Request Centre page using this reference number and your email address.\n\nMARCOM Team, HeadStart International School Phuket');
    }
  } catch (e) { /* notifications must never fail the submission */ }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  if ((event.body || '').length > 200000) return json(413, { ok: false, error: 'Request too large' });
  const ip = clientIp(event);
  if (rateLimited(ip, 8, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many requests. Please try again later.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }

  /* Honeypot: real users never fill this hidden field. Pretend success. */
  if (body.website) return json(200, { ok: true, refNo: makeRefNo() });

  const T = TYPES[body.type];
  if (!T) return json(400, { ok: false, error: 'Unknown request type' });

  const d = sanitiseData(body.data);
  const links = sanitiseLinks(body.links);
  const missing = T.required.filter(k => !d[k]);
  if (missing.length) return json(400, { ok: false, error: 'Missing required fields: ' + missing.join(', ') });
  if (!EMAIL_RE.test(d.email)) return json(400, { ok: false, error: 'Invalid email address' });
  if (!DATE_RE.test(d.deadline)) return json(400, { ok: false, error: 'Invalid deadline date' });
  if (d.eventDate && !DATE_RE.test(d.eventDate)) return json(400, { ok: false, error: 'Invalid event date' });
  for (const tk of ['startTime', 'endTime']) if (d[tk] && !TIME_RE.test(d[tk])) d[tk] = '';

  let db;
  try { db = getDb(); } catch (e) { console.error(e); return json(500, { ok: false, error: 'Service not configured' }); }

  const refNo = makeRefNo();
  d.refNo = refNo;
  d.links = links;
  const nowIso = new Date().toISOString();
  const reqDoc = {
    refNo, type: body.type, typeLabel: T.label, assignedTo: T.ws,
    status: 'Submitted', readByAssignee: false,
    requester: { name: d.reqName || '', department: d.department || '', email: d.email },
    eventName: d.eventName || '', eventDate: d.eventDate || '', deadline: d.deadline || '',
    data: d, links,
    createdAtIso: nowIso,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'public-form'
  };

  let reqRef;
  try {
    reqRef = await db.collection('requests').add(reqDoc);
  } catch (e) {
    console.error('request write failed', e);
    return json(500, { ok: false, error: 'Your request could not be saved. Please try again.' });
  }

  /* Auto-create the task for the assigned team member. A failure here must not
     lose the request: it is logged to rc_failures for Boss to follow up. */
  try {
    const title = (d.eventName || 'Request') + ': ' + (body.type === 'design' ? ('Design ' + (d.designType || 'Artwork')) : 'Photography Coverage');
    const task = {
      topic: title.slice(0, 300),
      description: buildBrief(T, d, refNo),
      dueDate: d.deadline || '', status: 'pending', priority: 'medium', category: '',
      assignedBy: (d.reqName || '') + (d.department ? ' (' + d.department + ')' : ''),
      assignedDate: nowIso.slice(0, 10),
      notes: 'Submitted via Request Centre - Ref ' + refNo,
      done: false, links,
      requestId: reqRef.id, requestRef: refNo, requestType: body.type, requestData: d,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (body.type === 'design') {
      task.dzType = d.designType || ''; task.dzRequestor = d.reqName || '';
      task.dzStatus = 'Brief Received'; task.dzBrand = d.eventName || '';
    }
    if (body.type === 'photo') {
      task.mdEvent = d.eventName || ''; task.mdLocation = d.venue || ''; task.mdCategory = 'Photos';
    }
    const taskRef = await db.collection(T.ws + '_tasks').add(task);
    await db.collection('requests').doc(reqRef.id).update({ taskId: taskRef.id });
  } catch (e) {
    console.error('task automation failed', e);
    try {
      await db.collection('rc_failures').add({
        refNo, requestId: reqRef.id, stage: 'task-create',
        error: String((e && e.message) || e).slice(0, 1000),
        createdAtIso: nowIso, createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e2) { console.error('failure log failed', e2); }
  }

  try { await notify(refNo, T, d); } catch (e) { /* never fail the submission */ }

  return json(200, { ok: true, refNo });
};
