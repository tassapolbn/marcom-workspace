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
  if (!REF_RE.test(refNo) || !EMAIL_RE.test(email)) return json(200, { ok: false });

  let db;
  try { db = getDb(); } catch (e) { console.error(e); return json(500, { ok: false, error: 'Service not configured' }); }

  try {
    const snap = await db.collection('requests').where('refNo', '==', refNo).limit(1).get();
    if (snap.empty) return json(200, { ok: false });
    const r = snap.docs[0].data() || {};
    const reqEmail = ((r.requester && r.requester.email) || '').toLowerCase();
    if (!reqEmail || reqEmail !== email) return json(200, { ok: false });
    return json(200, {
      ok: true,
      request: {
        refNo: r.refNo || refNo,
        status: r.status || 'Submitted',
        typeLabel: r.typeLabel || '',
        eventName: r.eventName || '',
        assignedToTeam: WS_NAMES[r.assignedTo] || '',
        createdAtIso: r.createdAtIso || '',
        deadline: r.deadline || ''
      }
    });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: 'Lookup failed' });
  }
};
