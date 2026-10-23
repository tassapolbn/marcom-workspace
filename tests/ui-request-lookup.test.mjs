import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { parseLookup, matchRequests, REF_RE } = require('../netlify/functions/lib/request-lookup.js');
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const email = 'staff@example.com';

test('lookup rejects missing numbers, invalid email and invalid numbers', () => {
  for (const body of [
    null, undefined, {}, { email }, { email: 'bad-email', refNo: 'REQ-ABCD' },
    { email, refNos: ['REQ-AB12CD34', 'REQ-ABC', 'REQ-ABCDEFGHIJKLM', '', null, 42] },
    { email, refNos: 'REQ-ABCD' }
  ]) assert.equal(parseLookup(body), null);
  assert.equal(REF_RE.test('REQ-AB23CD45'), true);
  assert.equal(REF_RE.test('REQ-AB12CD34'), false);
});

test('lookup normalizes single and multiple numbers and removes duplicates', () => {
  assert.deepEqual(parseLookup({ email: ' Staff@Example.COM ', refNo: ' req-abcd ' }), {
    email, refNos: ['REQ-ABCD']
  });
  assert.deepEqual(parseLookup({
    email, refNos: ['req-abcd', ' REQ-ABCD ', 'invalid', 'req-efgh', null], refNo: ' req-jklm '
  }), { email, refNos: ['REQ-ABCD', 'REQ-EFGH', 'REQ-JKLM'] });
});

test('lookup caps valid distinct numbers at 20', () => {
  const refs = Array.from({ length: 25 }, (_, i) => 'REQ-ABC' + String.fromCharCode(65 + i));
  assert.deepEqual(parseLookup({ email, refNos: ['invalid', refs[0], ...refs], refNo: 'REQ-ZZZZ' }), {
    email, refNos: refs.slice(0, 20)
  });
});

const older = { refNo: 'REQ-ABCD', requester: { email }, createdAtIso: '2026-10-22T10:00:00Z' };
const newer = { refNo: 'req-efgh', requester: { email: 'STAFF@EXAMPLE.COM' }, createdAtIso: '2026-10-24T10:00:00Z' };
const other = { refNo: 'REQ-JKLM', requester: { email: 'other@example.com' }, createdAtIso: '2026-10-25T10:00:00Z' };

test('matching requires both the number and email', () => {
  assert.deepEqual(matchRequests([older], { email: 'other@example.com', refNos: ['REQ-ABCD'] }), []);
  assert.deepEqual(matchRequests([older], { email, refNos: ['REQ-EFGH'] }), []);
  const rows = matchRequests([older, newer, other, {}], { email, refNos: ['REQ-ABCD'] });
  assert.deepEqual(rows, [older]);
  assert.equal(rows[0], older);
});

test('matching returns only valid pairs newest first without mutating input', () => {
  const rows = Object.freeze([older, newer, other]);
  assert.deepEqual(matchRequests(rows, { email, refNos: ['REQ-ABCD', 'REQ-EFGH', 'REQ-JKLM'] }), [newer, older]);
});

test('status endpoint uses the guarded lookup and retains email query and rate limit', () => {
  const server = readFileSync(new URL('../netlify/functions/request-status.js', import.meta.url), 'utf8');
  assert.match(server, /require\('\.\/lib\/request-lookup'\)/);
  assert.match(server, /const query = parseLookup\(body\)/);
  assert.match(server, /if \(!query\) return json\(200, \{ ok: false \}\)/);
  assert.match(server, /rows = matchRequests\(rows, query\)/);
  assert.match(server, /\.where\('requester\.email', '==', email\)/);
  assert.match(server, /rateLimited\(ip, 30, 10 \* 60 \* 1000\)/);
  assert.doesNotMatch(server, /slice\(0,\s*25\)/);
});

test('tracker includes an accessible request number input and posts refNos', () => {
  assert.match(source, /id="rc-hist-ref" type="text" autocomplete="off" spellcheck="false"/);
  const lookup = source.slice(source.indexOf('  function rcStatusLookup('), source.indexOf('  function rcHistRow('));
  assert.match(lookup, /JSON\.stringify\(\{email:em,refNos:refs\}\)/);
  const card = source.slice(source.indexOf('  function histHTML('), source.indexOf('  function rcStatusLookup('));
  assert.match(card, /placeholder="'\+esc\(U\('track_ph_ref'\)\)/);
  assert.match(card, /aria-label="'\+esc\(U\('track_ph_ref'\)\)/);
});

function trackerHarness(saved = {}, response = { ok: false }) {
  const requests = [];
  const nodes = {
    'rc-hist-list': { innerHTML: '' },
    'rc-hist-email': { value: '' },
    'rc-hist-ref': { value: '' }
  };
  const context = vm.createContext({
    window: {}, document: { getElementById: id => nodes[id] },
    localStorage: { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; } },
    U: key => key, esc: String, LT: String, stChip: String,
    fetch(url, options) {
      assert.equal(url, '/.netlify/functions/request-status');
      requests.push(JSON.parse(options.body));
      return Promise.resolve({ json: () => Promise.resolve(response) });
    }
  });
  const start = source.indexOf('  function rcStatusLookup(');
  const end = source.indexOf('  /* =====================================================================', start);
  vm.runInContext(source.slice(start, end), context);
  return { nodes, saved, requests, context,
    async run(name) { context.window[name](); await new Promise(resolve => setImmediate(resolve)); },
    get html() { return nodes['rc-hist-list'].innerHTML; }
  };
}

test('manual tracking requires both fields and sends a normalized pair', async () => {
  const h = trackerHarness();
  h.nodes['rc-hist-email'].value = ' Staff@Example.COM ';
  await h.run('rcTrackOne');
  assert.equal(h.requests.length, 0);
  assert.match(h.html, /track_both/);
  h.nodes['rc-hist-email'].value = '';
  h.nodes['rc-hist-ref'].value = ' req-abcd ';
  await h.run('rcTrackOne');
  assert.equal(h.requests.length, 0);
  assert.match(h.html, /track_both/);
  h.nodes['rc-hist-email'].value = ' Staff@Example.COM ';
  await h.run('rcTrackOne');
  assert.deepEqual(h.requests, [{ email, refNos: ['REQ-ABCD'] }]);
  assert.equal(h.saved.rc_email, email);
  assert.match(h.html, /track_nf/);
});

test('device history safely handles absent, malformed and non-array saved references', async () => {
  for (const saved of [
    {}, { rc_refs: '[{"ref":"REQ-ABCD"}]' }, { rc_email: email },
    ...['invalid-json', 'null', '{}', '[null,{},{"ref":42},{"ref":" "}]'].map(rc_refs => ({ rc_email: email, rc_refs }))
  ]) {
    const h = trackerHarness(saved);
    await h.run('rcRenderHist');
    assert.equal(h.requests.length, 0);
    assert.match(h.html, /track_none/);
    assert.doesNotMatch(h.html, /track_none_recent/);
  }
});

test('device history sends at most 20 saved numbers and handles no matches', async () => {
  const refs = Array.from({ length: 25 }, (_, i) => 'REQ-ABC' + String.fromCharCode(65 + i));
  const h = trackerHarness({ rc_email: ' Staff@Example.COM ', rc_refs: JSON.stringify(refs.map(ref => ({ ref, at: '2026-10-24' }))) });
  await h.run('rcRenderHist');
  assert.deepEqual(h.requests, [{ email, refNos: refs.slice(0, 20) }]);
  assert.match(h.html, /track_none_recent/);
});

test('manual and device tracking render matched summaries', async () => {
  for (const name of ['rcTrackOne', 'rcRenderHist']) {
    const h = trackerHarness({ rc_email: email, rc_refs: '[{"ref":"REQ-ABCD"}]' }, {
      ok: true, requests: [{ ...older, eventName: 'School concert', status: 'Submitted' }]
    });
    h.nodes['rc-hist-email'].value = email;
    h.nodes['rc-hist-ref'].value = 'REQ-ABCD';
    await h.run(name);
    assert.match(h.html, /REQ-ABCD/);
    assert.match(h.html, /School concert/);
    assert.match(h.html, /Submitted/);
  }
});
