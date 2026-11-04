/* Append server-created cards using the same row values as the browser. */
const MarcomSheet = require('../../../assets/sheet-sync.js');

async function sendCardToSheet({ db, who, cardId, task, taskRef, fetchImpl, timeoutMs }) {
  const settings = await db.collection('dept_settings').doc('sheetsync').get();
  const cfg = settings.exists ? settings.data() : null;
  if (!cfg || !cfg.url) return { status: 'skipped', reason: 'not configured' };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.url)) {
    return { status: 'skipped', reason: 'invalid url' };
  }
  const row = MarcomSheet.rowFor(task, who);
  if (!row) return { status: 'skipped', reason: 'no member' };

  const response = await (fetchImpl || fetch)(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({
      secret: cfg.secret || '', action: 'append', who: row.member, cardId,
      values: MarcomSheet.forAppend(row.values)
    }),
    signal: AbortSignal.timeout(timeoutMs || 6000)
  });
  const reply = await response.json();
  if (!reply || !reply.ok) throw new Error('sheet link: ' + ((reply && reply.error) || 'no reply'));

  const sheetRow = {
    member: row.member, tab: reply.tab || row.tab, row: reply.row || 0,
    title: row.values.task || ''
  };
  await taskRef.update({ sheetRow });
  return { status: 'ok', tab: sheetRow.tab, row: sheetRow.row };
}

module.exports = { sendCardToSheet };
