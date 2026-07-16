/* Firestore security rules tests (run against the local emulator).
   How to run:
     1. npm install
     2. npm run test:rules        (requires Java for the Firestore emulator)
   Covers every role in the suggestion prompt: public visitor, admin (Boss),
   designer (Dew), media (O), junior (Eye), disabled user, and a signed-in
   user with no ACL record. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT = 'bb-task-list-test';
let env;
let passed = 0, failed = 0;
async function check(name, p, expectOk) {
  try {
    if (expectOk) await assertSucceeds(p); else await assertFails(p);
    passed++; console.log('  PASS ' + name);
  } catch (e) {
    failed++; console.error('  FAIL ' + name + ' -> ' + (e && e.message || e));
  }
}

function ctx(email, opts = {}) {
  if (!email) return env.unauthenticatedContext();
  return env.authenticatedContext(email.replace(/[@.]/g, '_'), {
    email,
    email_verified: opts.verified !== false,
    firebase: { sign_in_provider: opts.provider || 'google.com' }
  });
}

const BOSS = 'boss@headstartphuket.com';
const DEW = 'dew@headstartphuket.com';
const O = 'o@headstartphuket.com';
const EYE = 'eye@headstartphuket.com';
const GONE = 'left@headstartphuket.com';
const STRANGER = 'random@gmail.com';

async function seed() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('acl/' + BOSS).set({ role: 'admin', workspace: null, disabled: false });
    await db.doc('acl/' + DEW).set({ role: 'designer', workspace: 'dew', disabled: false });
    await db.doc('acl/' + O).set({ role: 'media', workspace: 'o', disabled: false });
    await db.doc('acl/' + EYE).set({ role: 'junior', workspace: 'junior', disabled: false });
    await db.doc('acl/' + GONE).set({ role: 'designer', workspace: 'dew', disabled: true });
    await db.doc('requests/r1').set({ refNo: 'REQ-TEST1234', status: 'Submitted', assignedTo: 'dew',
      requester: { name: 'T', department: 'Primary', email: 'teacher@headstartphuket.com' } });
    await db.doc('chat_messages/m1').set({ text: 'hello', authorEmail: DEW, authorName: 'Dew', authorWs: 'dew', createdAt: new Date() });
    await db.doc('activity/a1').set({ actorEmail: BOSS, action: 'seeded' });
    await db.doc('petty_cash/p1').set({ amount: 100, date: '2026-07-01' });
    await db.doc('sick_leave/s1').set({ date: '2026-07-01' });
    await db.doc('dew_tasks/t1').set({ topic: 'existing' });
  });
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
  await seed();

  const pub = ctx(null).firestore();
  const boss = ctx(BOSS).firestore();
  const dew = ctx(DEW).firestore();
  const o = ctx(O).firestore();
  const eye = ctx(EYE).firestore();
  const gone = ctx(GONE).firestore();
  const stranger = ctx(STRANGER).firestore();

  console.log('Public visitor (Request Centre page):');
  await check('cannot list requests', pub.collection('requests').get(), false);
  await check('cannot read a request', pub.doc('requests/r1').get(), false);
  await check('cannot create a request directly', pub.collection('requests').add({ refNo: 'REQ-X' }), false);
  await check('cannot create a task directly', pub.collection('dew_tasks').add({ topic: 'spam' }), false);
  await check('cannot read chat', pub.collection('chat_messages').get(), false);
  await check('cannot read acl', pub.doc('acl/' + BOSS).get(), false);

  console.log('Signed-in stranger with no ACL record:');
  await check('cannot read requests', stranger.collection('requests').get(), false);
  await check('cannot read own missing acl doc is allowed shape (get denied for other doc)', stranger.doc('acl/' + BOSS).get(), false);
  await check('cannot list acl', stranger.collection('acl').get(), false);
  await check('cannot read petty cash', stranger.collection('petty_cash').get(), false);

  console.log('Disabled user:');
  await check('cannot read tasks', gone.collection('dew_tasks').get(), false);
  await check('cannot post chat', gone.collection('chat_messages').add({ text: 'hi', authorEmail: GONE, authorName: 'x', authorWs: 'dew', createdAt: new Date() }), false);

  console.log('Admin (Boss):');
  await check('reads requests', boss.collection('requests').get(), true);
  await check('lists acl', boss.collection('acl').get(), true);
  await check('writes acl', boss.doc('acl/new@headstartphuket.com').set({ role: 'junior', disabled: false }), true);
  await check('writes petty cash', boss.collection('petty_cash').add({ amount: 5, date: '2026-07-02' }), true);
  await check('writes dew tasks (assign work)', boss.collection('dew_tasks').add({ topic: 'assigned by boss' }), true);
  await check('cannot edit activity entries', boss.doc('activity/a1').update({ action: 'rewritten' }), false);
  await check('can delete an activity entry', boss.doc('activity/a1').delete(), true);
  await check('cannot write unknown collection', boss.collection('random_stuff').add({ a: 1 }), false);

  console.log('Designer (Dew):');
  await check('writes own tasks', dew.collection('dew_tasks').add({ topic: 'mine' }), true);
  await check('cannot write O tasks', dew.collection('o_tasks').add({ topic: 'not mine' }), false);
  await check('reads O tasks (team overview)', dew.collection('o_tasks').get(), true);
  await check('cannot write petty cash', dew.collection('petty_cash').add({ amount: 1 }), false);
  await check('cannot write dept settings', dew.doc('dept_settings/team').set({ x: 1 }), false);
  await check('reads own acl doc', dew.doc('acl/' + DEW).get(), true);
  await check('cannot read another acl doc', dew.doc('acl/' + BOSS).get(), false);
  await check('cannot list acl', dew.collection('acl').get(), false);
  await check('updates request workflow fields', dew.doc('requests/r1').update({ status: 'In Progress', readByAssignee: true }), true);
  await check('cannot rewrite request requester', dew.doc('requests/r1').update({ requester: { email: 'x@x.com' } }), false);
  await check('cannot set invalid request status', dew.doc('requests/r1').update({ status: 'Whatever' }), false);
  await check('deletes request assigned to her', dew.doc('requests/r1').delete(), true);
  await check('posts chat as herself', dew.collection('chat_messages').add({ text: 'hi team', authorEmail: DEW, authorName: 'Dew', authorWs: 'dew', createdAt: new Date() }), true);
  await check('cannot post chat as someone else', dew.collection('chat_messages').add({ text: 'fake', authorEmail: BOSS, authorName: 'Boss', authorWs: 'boss', createdAt: new Date() }), false);
  await check('cannot add unexpected chat fields', dew.collection('chat_messages').add({ text: 'hi', authorEmail: DEW, authorName: 'Dew', authorWs: 'dew', createdAt: new Date(), evil: true }), false);

  console.log('Media (O):');
  await check('writes own recurring templates', o.collection('o_templates').add({ name: 'Weekly highlights' }), true);
  await check('writes own tasks', o.collection('o_tasks').add({ topic: 'shoot' }), true);
  await check('cannot write school events', o.collection('school_events').add({ name: 'x' }), false);

  console.log('Junior (Eye):');
  await check('writes shared school events', eye.collection('school_events').add({ name: 'Sports Day' }), true);
  await check('writes sop templates', eye.doc('sop_templates/main').set({ terms: [] }), true);
  await check('writes own tasks', eye.collection('junior_tasks').add({ topic: 'prep' }), true);
  await check('cannot write dew tasks', eye.collection('dew_tasks').add({ topic: 'x' }), false);
  await check('creates team request as self', eye.collection('team_requests').add({ text: 'please add a feature', category: 'App', status: 'open', authorEmail: EYE, authorName: 'Eye', createdAt: new Date() }), true);
  await check('cannot create team request as another author', eye.collection('team_requests').add({ text: 'x', category: 'App', status: 'open', authorEmail: BOSS, authorName: 'Boss', createdAt: new Date() }), false);

  await env.cleanup();
  console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
