const REF_RE = /^REQ-[A-Z2-9]{4,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseLookup(body) {
  if (!body || typeof body !== 'object') return null;
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;

  const values = Array.isArray(body.refNos) ? body.refNos.concat(body.refNo) : [body.refNo];
  const refNos = [...new Set(values
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toUpperCase())
    .filter(value => REF_RE.test(value)))].slice(0, 20);
  return refNos.length ? { email, refNos } : null;
}

function matchRequests(rows, query) {
  const refNos = new Set(query.refNos);
  return rows.filter(r => refNos.has((r.refNo || '').toUpperCase())
    && String((r.requester || {}).email || '').toLowerCase() === query.email)
    .sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
}

module.exports = { parseLookup, matchRequests, REF_RE };
