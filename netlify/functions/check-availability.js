/* Availability check for the public Request Centre.
   Answers one question only: is the photographer already booked at that time?
   It never returns any calendar detail (no titles, venues, guests or names),
   so nothing private is exposed to the public page.

   Optional environment variables:
     PHOTO_CALENDAR_URL     - the photographer's Apps Script Web app URL
     PHOTO_CALENDAR_SECRET  - the matching secret phrase
   Without them the function still checks requests already in the workspace. */
const { getDb, rateLimited, json, clientIp } = require('./lib/admin');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const OPEN_STATUSES = ['Submitted', 'Under Review', 'Needs Clarification', 'Accepted', 'In Progress', 'Awaiting Approval'];

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return true; /* no times given: same day counts */
  return aStart < bEnd && aEnd > bStart;
}

async function calendarBusy(date, startTime, endTime) {
  const url = process.env.PHOTO_CALENDAR_URL;
  if (!url) return null; /* not configured: skip this source */
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'busy',
        secret: process.env.PHOTO_CALENDAR_SECRET || '',
        date, startTime, endTime
      })
    });
    const j = await res.json();
    if (j && j.ok) return !!j.busy;
  } catch (e) {
    console.error('calendar busy check failed', e);
  }
  return null;
}

async function requestsBusy(db, date, startTime, endTime) {
  try {
    const snap = await db.collection('requests').where('eventDate', '==', date).get();
    let hit = false;
    snap.docs.forEach(d => {
      const r = d.data() || {};
      if (r.type !== 'photo') return;
      if (!OPEN_STATUSES.includes(r.status || 'Submitted')) return;
      const s = (r.data && r.data.startTime) || '';
      const e = (r.data && r.data.endTime) || '';
      if (!s || !e || !startTime || !endTime) { hit = true; return; }
      if (overlaps(startTime, endTime, s, e)) hit = true;
    });
    return hit;
  } catch (e) {
    console.error('request clash check failed', e);
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  const ip = clientIp(event);
  if (rateLimited(ip, 40, 10 * 60 * 1000)) return json(429, { ok: false, error: 'Too many checks' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }

  const date = String(body.date || '').trim();
  const startTime = TIME_RE.test(body.startTime || '') ? body.startTime : '';
  const endTime = TIME_RE.test(body.endTime || '') ? body.endTime : '';
  if (!DATE_RE.test(date)) return json(200, { ok: false });

  let db = null;
  try { db = getDb(); } catch (e) { /* keep going: the calendar check may still work */ }

  const [cal, reqs] = await Promise.all([
    calendarBusy(date, startTime, endTime),
    db ? requestsBusy(db, date, startTime, endTime) : Promise.resolve(false)
  ]);

  const busy = (cal === true) || reqs === true;
  return json(200, {
    ok: true,
    busy,
    /* "source" only says WHICH check matched, never what the booking is. */
    source: busy ? (cal === true ? 'calendar' : 'requests') : '',
    checkedCalendar: cal !== null
  });
};
