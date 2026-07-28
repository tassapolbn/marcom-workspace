/* Secure request status lookup for the public Request Centre.
   Requires BOTH the server-generated reference number and the requester's
   email address. Returns only a minimal status summary, never the full
   request, and never lists other people's requests. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');

const REF_RE = /^REQ-[A-Z2-9]{4,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WS_NAMES = { dew: 'Graphic Design', o: 'Photography' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  const ip = clientIp(event);
  if (rateLimited(ip, 30, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many requests. Please try again later.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }

  const refNo = String(body.refNo || '').trim().toUpperCase();
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(200, { ok: false });
  if (refNo && !REF_RE.test(refNo)) return json(200, { ok: false });

  let db;
  try { db = getDb(); } catch (e) { console.error(e); return json(500, { ok: false, error: 'Service not configured' }); }

  /* Only ever a short status summary. The brief, attachments, restrictions and
     every other detail of a request are never returned to the public page. */
  const summarise = (r) => ({
    refNo: r.refNo || '',
    status: r.status || 'Submitted',
    typeLabel: r.typeLabel || '',
    eventName: r.eventName || '',
    assignedToTeam: WS_NAMES[r.assignedTo] || '',
    createdAtIso: r.createdAtIso || '',
    deadline: r.deadline || ''
  });

  try {
    /* Look up everything this email address has submitted, newest first. */
    const snap = await db.collection('requests')
      .where('requester.email', '==', email)
      .get();

    let rows = snap.docs.map(d => d.data() || {});
    if (refNo) rows = rows.filter(r => (r.refNo || '').toUpperCase() === refNo);
    rows.sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
    rows = rows.slice(0, 25);

    if (!rows.length) return json(200, { ok: false });
    const list = rows.map(summarise);
    /* `request` keeps older callers working; `requests` is the full list. */
    return json(200, { ok: true, request: list[0], requests: list });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: 'Lookup failed' });
  }
};
