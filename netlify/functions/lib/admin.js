/* Shared Firebase Admin bootstrap for Netlify Functions.
   Requires env var FIREBASE_SERVICE_ACCOUNT = full JSON of a service account key. */
const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
    const creds = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  return admin.firestore();
}

/* Very small in-memory rate limiter (per warm function instance, best effort). */
const buckets = new Map();
function rateLimited(ip, max, windowMs) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n += 1;
  if (buckets.size > 5000) buckets.clear();
  return b.n > max;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

module.exports = { admin, getDb, rateLimited, json, clientIp };
