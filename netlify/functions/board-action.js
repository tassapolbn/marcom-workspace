/* Director actions from the shared Team Board.
   POST /.netlify/functions/board-action
        { token, coll, docId, action, value, note, from }

   The Director has no login, so the private share token is the only credential
   and this endpoint is deliberately narrow: it NEVER edits a task. It writes a
   request into director_notes, which the owner and the admin then see in the
   workspace and apply themselves. Nothing here can change a status, a deadline,
   an assignee, leave, pay or any other stored field. */
const { admin, getDb, rateLimited, json, clientIp } = require('./lib/admin');
const { TASK_COLLECTIONS, WORKSPACES, LIMITS, findAction, validDate, sentenceFor } = require('./lib/board-actions');

const DONE = { done: 1, canceled: 1 };
const OPEN_PER_TASK_MAX = 12;

/* Replace control characters, trim, and cap the length of anything the browser
   sends. Written as a scan rather than a regular expression so the intent stays
   readable and no character range can silently drift. */
function clean(value, max) {
  const source = String(value == null ? '' : value);
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    out += (code < 32 || code === 127) ? ' ' : source.charAt(i);
  }
  return out.trim().slice(0, max);
}

function ownersOf(coll, task) {
  if (coll !== 'event_tasks') {
    const ws = coll.replace(/_tasks$/, '');
    return WORKSPACES.indexOf(ws) >= 0 ? [ws] : [];
  }
  const list = Array.isArray(task.assignees) && task.assignees.length
    ? task.assignees
    : (task.owner ? [task.owner] : []);
  return list.filter(function (w) { return WORKSPACES.indexOf(w) >= 0; });
}

exports.handler = async (event) => {
  if (String((event && event.httpMethod) || '').toUpperCase() !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  const ip = clientIp(event);
  if (rateLimited(ip, 40, 10 * 60 * 1000)) {
    return json(429, { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; }
  catch (e) { return json(400, { ok: false, error: 'The request could not be read.' }); }

  const token = clean(body.token, 80);
  const coll = clean(body.coll, 40);
  const docId = clean(body.docId, 200);
  const from = clean(body.from, LIMITS.name);
  const note = clean(body.note, LIMITS.note);
  let value = clean(body.value, LIMITS.value);

  const action = findAction(clean(body.action, 40));
  if (!action) return json(400, { ok: false, error: 'That action is not available.' });
  if (TASK_COLLECTIONS.indexOf(coll) < 0 || !docId || docId.indexOf('/') >= 0 || docId === '.' || docId === '..') {
    return json(400, { ok: false, error: 'That task could not be identified. Please refresh the board.' });
  }
  if (!from) return json(400, { ok: false, error: 'Please add your name so the team knows who is asking.' });
  if (action.input === 'date' && !validDate(value)) return json(400, { ok: false, error: 'Please choose a valid date.' });
  if (action.input === 'text' && !value) return json(400, { ok: false, error: 'Please fill in ' + String(action.inputLabel || 'the missing field').toLowerCase() + '.' });
  if (!action.input) value = '';
  if (action.id === 'comment' && !note) return json(400, { ok: false, error: 'Please write your comment.' });

  let db;
  try { db = getDb(); }
  catch (e) { console.error(e); return json(500, { ok: false, error: 'This board is not configured yet.' }); }

  /* The token is the only credential, so it is checked on every action. Turning
     sharing off or resetting the link stops actions at once, not just viewing. */
  let share = {};
  try { const s = await db.collection('dept_settings').doc('board_share').get(); share = (s.exists && s.data()) || {}; }
  catch (e) { console.error(e); return json(500, { ok: false, error: 'The board could not be reached. Please try again.' }); }
  if (!(share && share.enabled !== false && share.token && token && token === share.token)) {
    return json(403, { ok: false, error: 'This link is no longer valid. Please ask the MARCOM team for a current link.' });
  }

  /* The task must exist and still be live, so a request can never be attached
     to a deleted or finished card. */
  let task = null;
  try { const t = await db.collection(coll).doc(docId).get(); task = t.exists ? (t.data() || {}) : null; }
  catch (e) { console.error(e); return json(500, { ok: false, error: 'The task could not be read. Please try again.' }); }
  if (!task) return json(404, { ok: false, error: 'That task no longer exists. Please refresh the board.' });
  if (DONE[task.status || 'pending']) return json(409, { ok: false, error: 'That task is already closed. Please refresh the board.' });

  const owners = ownersOf(coll, task);
  const topic = clean(task.topic || task.title || 'Untitled', 200);
  const taskKey = coll + '/' + docId;

  /* A ceiling per task, so one card cannot be filled with open requests. */
  try {
    const open = await db.collection('director_notes')
      .where('taskKey', '==', taskKey).where('status', '==', 'new').limit(OPEN_PER_TASK_MAX).get();
    if (open.size >= OPEN_PER_TASK_MAX) {
      return json(429, { ok: false, error: 'This task already has several open requests. Please wait for the team to action them.' });
    }
  } catch (e) { console.error('[board-action] open request count failed', e); }

  const sentence = sentenceFor(action, value);
  const record = {
    action: action.id,
    actionLabel: action.label,
    actionShort: action.short,
    sentence: sentence,
    value: value,
    note: note,
    from: from,
    taskKey: taskKey,
    taskColl: coll,
    taskId: docId,
    taskTopic: topic,
    owners: owners,
    status: 'new',
    source: 'team-board',
    createdAtIso: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  let id = '';
  try { const ref = await db.collection('director_notes').add(record); id = ref.id; }
  catch (e) { console.error(e); return json(500, { ok: false, error: 'The request could not be saved. Please try again.' }); }

  /* Team Chat copy, so the whole team sees it live. A failure here must not
     lose the request, which is already saved above. */
  try {
    let names = { boss: 'Boss', dew: 'Dew', o: 'O', junior: 'Eye' };
    try {
      const t = await db.collection('dept_settings').doc('team').get();
      if (t.exists) names = Object.assign(names, (t.data() || {}).names || {});
    } catch (e) { console.error('[board-action] team names unavailable', e); }
    const who = owners.length ? owners.map(w => names[w] || w).join(', ') : 'the team';
    await db.collection('chat_messages').add({
      text: from + ' asked on the Team Board: ' + topic + ' - ' + sentence
        + (note ? ' - "' + note + '"' : '') + ' (for ' + who + ')',
      authorEmail: 'team-board@marcom.local',
      authorName: from + ' (Team Board)',
      authorWs: '',
      type: 'text',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error('[board-action] chat copy failed', e); }

  return json(200, { ok: true, id: id, sentence: sentence, from: from, note: note });
};
