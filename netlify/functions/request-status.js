/* Secure request status lookup for the public Request Centre.
   Requires matching request numbers and requester email, and returns only a
   minimal status summary for those requests, never the full request content. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');
const { parseLookup, matchRequests } = require('./lib/request-lookup');

const WS_NAMES = { dew: 'Graphic Design', o: 'Photography' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  const ip = clientIp(event);
  if (rateLimited(ip, 30, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many requests. Please try again later.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }

  const query = parseLookup(body);
  if (!query) return json(200, { ok: false });
  const { email } = query;

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
    /* Fetch candidates by email, then require a supplied request number too. */
    const snap = await db.collection('requests')
      .where('requester.email', '==', email)
      .get();

    let rows = snap.docs.map(d => d.data() || {});
    rows = matchRequests(rows, query);

    if (!rows.length) return json(200, { ok: false });
    const list = rows.map(summarise);
    /* `request` keeps older callers working; `requests` is the full list. */
    return json(200, { ok: true, request: list[0], requests: list });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: 'Lookup failed' });
  }
};
