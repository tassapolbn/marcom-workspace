import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { sendCardToSheet } = require('../netlify/functions/lib/sheet-link.js');
const MarcomSheet = require('../assets/sheet-sync.js');
const source = readFileSync(new URL('../netlify/functions/submit-request.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const url = 'https://script.google.com/macros/s/Deployment_123-abc/exec';
const secret = 'test-only-secret';
const design = {
  topic: 'Open day: Design Poster', description: 'REQUEST REQ-TEST - Graphic Design Request',
  dueDate: '2026-11-20', status: 'pending', priority: 'medium',
  assignedBy: 'Teacher (Primary)', notes: 'Submitted via Request Centre - Ref REQ-TEST',
  dzType: 'Poster', dzRequestor: 'Teacher', dzStatus: 'Brief Received', dzBrand: 'Open day'
};
const photo = {
  topic: 'Open day: Photography Coverage', description: 'Photography brief',
  dueDate: '2026-11-20', status: 'pending', priority: 'medium',
  assignedBy: 'Teacher (Primary)', notes: 'Submitted via Request Centre - Ref REQ-TEST',
  mdEvent: 'Open day', mdLocation: 'School hall', mdCategory: 'Photos'
};

function fake({ exists = true, cfg = { url, secret }, reply = { ok: true, tab: 'Dew', row: 7 } } = {}) {
  const calls = [], updates = [];
  return {
    calls, updates,
    db: { collection(name) {
      assert.equal(name, 'dept_settings');
      return { doc(id) {
        assert.equal(id, 'sheetsync');
        return { get: async () => ({ exists, data: () => cfg }) };
      } };
    } },
    taskRef: { update: async value => { updates.push(value); } },
    fetchImpl: async (...args) => { calls.push(args); return { json: async () => reply }; }
  };
}
const send = (f, overrides = {}) => sendCardToSheet({
  db: f.db, taskRef: f.taskRef, fetchImpl: f.fetchImpl,
  who: 'dew', cardId: 'card-123', task: design, ...overrides
});

test('missing settings or empty URL skip without fetching or updating', async () => {
  for (const options of [{ exists: false }, { cfg: {} }, { cfg: { url: '' } }]) {
    const f = fake(options);
    assert.deepEqual(await send(f), { status: 'skipped', reason: 'not configured' });
    assert.equal(f.calls.length, 0);
    assert.equal(f.updates.length, 0);
  }
});

test('only the exact HTTPS Apps Script Web App URL is accepted', async () => {
  for (const invalid of [
    'https://example.com/macros/s/abc/exec', url.replace('https:', 'http:'),
    url + '/extra', url + '?query=1', url + '#fragment',
    url.replace('script.google.com', 'script.google.com.example.com'),
    url.replace('Deployment_123-abc', 'abc.def'), url.replace('/exec', '/dev')
  ]) {
    const f = fake({ cfg: { url: invalid, secret } });
    assert.deepEqual(await send(f), { status: 'skipped', reason: 'invalid url' }, invalid);
    assert.equal(f.calls.length, 0);
    assert.equal(f.updates.length, 0);
  }
});

test('unknown member skips without fetching or updating', async () => {
  const f = fake();
  assert.deepEqual(await send(f, { who: 'unknown' }), { status: 'skipped', reason: 'no member' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.updates.length, 0);
});

test('a design card posts shared append values and saves its sheet row', async () => {
  const f = fake();
  assert.deepEqual(await send(f), { status: 'ok', tab: 'Dew', row: 7 });
  assert.equal(f.calls.length, 1);
  const [target, options] = f.calls[0];
  assert.equal(target, url);
  assert.equal(options.method, 'POST');
  assert.deepEqual(options.headers, { 'Content-Type': 'text/plain;charset=utf-8' });
  assert.equal(options.redirect, 'follow');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.signal.aborted, false);
  const body = JSON.parse(options.body);
  assert.deepEqual(body, {
    secret, action: 'append', who: 'dew', cardId: 'card-123',
    values: MarcomSheet.forAppend(MarcomSheet.rowFor(design, 'dew').values)
  });
  assert.equal(body.values.status, 'Ready to do!');
  assert.deepEqual(f.updates, [{ sheetRow: { member: 'dew', tab: 'Dew', row: 7, title: design.topic } }]);
});

test('a photography card targets O with Photo media', async () => {
  const f = fake({ reply: { ok: true, tab: 'O', row: 12 } });
  assert.deepEqual(await send(f, { who: 'o', task: photo }), { status: 'ok', tab: 'O', row: 12 });
  const body = JSON.parse(f.calls[0][1].body);
  assert.equal(body.who, 'o');
  assert.equal(body.values.media, 'Photo');
  assert.deepEqual(body.values, MarcomSheet.forAppend(MarcomSheet.rowFor(photo, 'o').values));
  assert.deepEqual(f.updates, [{ sheetRow: { member: 'o', tab: 'O', row: 12, title: photo.topic } }]);
});

test('missing optional reply fields and secret use browser-compatible defaults', async () => {
  const f = fake({ cfg: { url }, reply: { ok: true } });
  assert.deepEqual(await send(f, { task: {} }), { status: 'ok', tab: 'Dew', row: 0 });
  assert.equal(JSON.parse(f.calls[0][1].body).secret, '');
  assert.deepEqual(f.updates, [{ sheetRow: { member: 'dew', tab: 'Dew', row: 0, title: '' } }]);
});

test('a rejected append throws without exposing the secret or saving a row', async () => {
  const f = fake({ reply: { ok: false, error: 'protected' } });
  await assert.rejects(send(f), error => {
    assert.equal(error.message, 'sheet link: protected');
    assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(f.updates.length, 0);
});

test('an empty reply uses the no reply error', async () => {
  for (const reply of [null, {}, { ok: false }]) {
    const f = fake({ reply });
    await assert.rejects(send(f), { message: 'sheet link: no reply' });
    assert.equal(f.updates.length, 0);
  }
});

test('network, JSON and task update errors propagate', async () => {
  for (const stage of ['fetch', 'json', 'update']) {
    const f = fake();
    const failure = new Error(stage + ' failed');
    if (stage === 'fetch') f.fetchImpl = async () => { throw failure; };
    if (stage === 'json') f.fetchImpl = async () => ({ json: async () => { throw failure; } });
    if (stage === 'update') f.taskRef.update = async () => { throw failure; };
    await assert.rejects(send(f), error => error === failure);
    assert.equal(f.updates.length, 0);
  }
});

test('the supplied timeout aborts the fetch and propagates', async () => {
  const f = fake();
  // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(send(f, {
      timeoutMs: 10,
      fetchImpl: async (_target, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
    }), { name: 'TimeoutError' });
    assert.equal(f.updates.length, 0);
  } finally { clearTimeout(keepAlive); }
});

test('Node and browser exports have the same API and row values', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(new URL('../assets/sheet-sync.js', import.meta.url), 'utf8'), context);
  assert.deepEqual(Object.keys(MarcomSheet), Object.keys(context.window.MarcomSheet));
  for (const who of ['boss', 'dew', 'o', 'junior', 'unknown']) {
    for (const task of [design, photo, {}]) {
      assert.deepEqual(MarcomSheet.rowFor(task, who), plain(context.window.MarcomSheet.rowFor(task, who)));
    }
  }
});

test('submission keeps separate failure handling and concurrent sheet and email steps', () => {
  assert.match(source, /require\('\.\/lib\/sheet-link'\)/);
  assert.match(source, /let task, taskRef;/);
  assert.match(source, /async function sheetStep\(\)\s*\{\s*if \(!taskRef\) return;\s*try\s*\{\s*await sendCardToSheet\(\{ db, who: T\.ws, cardId: taskRef\.id, task, taskRef \}\);\s*\} catch \(e\)\s*\{\s*try\s*\{\s*await db\.collection\('rc_failures'\)\.add\(\{\s*refNo, requestId: reqRef\.id, stage: 'sheet-link'/);
  assert.match(source, /async function notifyStep\(\)\s*\{\s*try \{ await notify\(refNo, T, d\); \} catch/);
  assert.match(source, /await Promise\.all\(\[sheetStep\(\), notifyStep\(\)\]\);/);
  assert.match(source, /stage: 'task-create'/);
  assert.match(source, /return json\(200, \{ ok: true, refNo \}\);\s*\};\s*$/);
});

function submission({ sheet, failTask = false, failLog = false, email } = {}) {
  const failures = [], errors = [], sheetCalls = [];
  const taskRef = { id: 'task-id' };
  const db = { collection(name) {
    return {
      async add(value) {
        if (name === 'requests') return { id: 'request-id' };
        if (name.endsWith('_tasks')) {
          if (failTask) throw new Error('task failed');
          return taskRef;
        }
        assert.equal(name, 'rc_failures');
        if (failLog) throw new Error('log failed');
        failures.push(plain(value));
      },
      doc: () => ({ update: async () => {} })
    };
  } };
  const exports = {};
  vm.runInNewContext(source, {
    exports, console: { error: (...args) => errors.push(args) },
    process: { env: { RESEND_API_KEY: 'test-key', NOTIFY_FROM: 'test@example.com' } },
    fetch: email || (async () => ({})),
    require(name) {
      if (name === './lib/admin') return {
        admin: { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } },
        getDb: () => db, rateLimited: () => false, clientIp: () => 'test',
        json: (statusCode, body) => ({ statusCode, body })
      };
      if (name === './lib/request-validation') return { scheduleErrors: () => ({}) };
      if (name === './lib/sheet-link') return { sendCardToSheet: async args => {
        sheetCalls.push(args);
        return sheet ? sheet(args) : { status: 'skipped', reason: 'not configured' };
      } };
      assert.equal(name, 'crypto');
      return require(name);
    }
  });
  return {
    failures, errors, sheetCalls, taskRef,
    run: () => exports.handler({ httpMethod: 'POST', body: JSON.stringify({
      type: 'design', data: {
        reqName: 'Teacher', department: 'Primary', email: 'teacher@example.com',
        eventName: 'Open day', deliverablesText: 'Poster', deadline: '2026-11-20'
      }
    }) })
  };
}

test('sheet failures are truncated and logged without changing submission success', async () => {
  const f = submission({ sheet: async () => { throw new Error('x'.repeat(1200)); } });
  const result = await f.run();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(plain(result.body), { ok: true, refNo: result.body.refNo });
  assert.equal(f.failures.length, 1);
  assert.deepEqual(f.failures[0], {
    refNo: result.body.refNo, requestId: 'request-id', stage: 'sheet-link',
    error: 'x'.repeat(1000), createdAtIso: f.failures[0].createdAtIso, createdAt: 'timestamp'
  });
  assert.ok(Number.isFinite(Date.parse(f.failures[0].createdAtIso)));
  assert.equal(f.sheetCalls[0].taskRef, f.taskRef);
  assert.equal(f.sheetCalls[0].cardId, 'task-id');
  assert.equal(f.sheetCalls[0].who, 'dew');
  assert.equal(f.sheetCalls[0].task.dzStatus, 'Brief Received');
});

test('a skipped sheet step needs no failure log; failed task creation skips it', async () => {
  const skipped = submission();
  assert.equal((await skipped.run()).body.ok, true);
  assert.equal(skipped.failures.length, 0);
  const failed = submission({ failTask: true });
  assert.equal((await failed.run()).body.ok, true);
  assert.equal(failed.sheetCalls.length, 0);
  assert.equal(failed.failures[0].stage, 'task-create');
});

test('a failed sheet failure log is only console-logged', async () => {
  const f = submission({ failLog: true, sheet: async () => { throw new Error('sheet failed'); } });
  assert.equal((await f.run()).body.ok, true);
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0][0], 'failure log failed');
});

test('email starts while the sheet step is still pending and email errors stay isolated', async () => {
  let releaseSheet, emailStarted;
  const sheetPending = new Promise(resolve => { releaseSheet = resolve; });
  const emailPending = new Promise(resolve => { emailStarted = resolve; });
  const f = submission({
    sheet: () => sheetPending,
    email: async () => { emailStarted(); throw new Error('email failed'); }
  });
  let finished = false;
  const running = f.run().then(result => { finished = true; return result; });
  let timer;
  try {
    await Promise.race([
      emailPending,
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('email waited for sheet')), 1000); })
    ]);
    assert.equal(f.sheetCalls.length, 1);
    assert.equal(finished, false);
  } finally {
    clearTimeout(timer);
    releaseSheet({ status: 'ok' });
  }
  assert.equal((await running).body.ok, true);
  assert.equal(f.failures.length, 0);
});
