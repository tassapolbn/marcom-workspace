import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { isRealDate, isRealTime, scheduleErrors } = require('../netlify/functions/lib/request-validation');
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const submit = source.slice(source.indexOf('  window.rcSubmit=function(key){'), source.indexOf('  function rcFail(msg){'));

test('request dates must exist in the calendar within 2000 to 2100', () => {
  for (const value of ['2026-10-24', '2028-02-29', '2000-02-29', '2100-12-31']) {
    assert.equal(isRealDate(value), true, value);
  }
  for (const value of ['2026-02-31', '2027-02-29', '2026-13-01', '2026-1-01', '1999-12-31', '',
    '2100-02-29', '2101-01-01', '2026-00-01', '2026-01-00', '2026-04-31', ' 2026-10-24', null]) {
    assert.equal(isRealDate(value), false, String(value));
  }
});

test('request times use strict 24-hour HH:MM values', () => {
  for (const value of ['00:00', '23:59']) assert.equal(isRealTime(value), true, value);
  for (const value of ['24:00', '29:70', '7:30', '12:60', '', null]) {
    assert.equal(isRealTime(value), false, String(value));
  }
});

const photo = { deadline: '2026-10-24', eventDate: '2026-10-24', startTime: '09:00', endTime: '10:00' };

test('valid schedules remain unchanged and absent fields are left to required validation', () => {
  const data = Object.freeze({ ...photo });
  assert.deepEqual(scheduleErrors('photo', data), {});
  assert.deepEqual(scheduleErrors('photo', {}), {});
  assert.deepEqual(scheduleErrors('design', { deadline: '2026-10-24' }), {});
  assert.deepEqual(scheduleErrors('design', { ...photo, endTime: '08:00' }), {});
});

test('photography end times must be strictly after start times', () => {
  for (const endTime of ['09:00', '08:59']) {
    assert.deepEqual(scheduleErrors('photo', { ...photo, endTime }), { endTime: 'end_before_start' });
  }
});

test('invalid times are reported without comparing their order', () => {
  assert.deepEqual(scheduleErrors('photo', { ...photo, startTime: '29:70', endTime: '24:00' }), {
    startTime: 'invalid_time', endTime: 'invalid_time'
  });
  assert.deepEqual(scheduleErrors('photo', { ...photo, startTime: '29:70' }), { startTime: 'invalid_time' });
  assert.deepEqual(scheduleErrors('photo', { ...photo, endTime: '7:30' }), { endTime: 'invalid_time' });
});

test('schedule errors identify each invalid date for either request type', () => {
  assert.deepEqual(scheduleErrors('design', { deadline: '2026-02-31' }), { deadline: 'invalid_date' });
  assert.deepEqual(scheduleErrors('photo', { ...photo, deadline: '2026-02-31', eventDate: '2027-02-29' }), {
    deadline: 'invalid_date', eventDate: 'invalid_date'
  });
});

test('submission endpoint returns schedule errors instead of blanking times', () => {
  const server = readFileSync(new URL('../netlify/functions/submit-request.js', import.meta.url), 'utf8');
  assert.match(server, /const \{ scheduleErrors \} = require\('\.\/lib\/request-validation'\)/);
  assert.match(server, /const fieldErrors = scheduleErrors\(body\.type, d\)/);
  assert.match(server, /return json\(400, \{ ok: false, error: 'Please check the highlighted fields\.', fields: fieldErrors \}\)/);
  assert.doesNotMatch(server, /for\s*\(const tk of \['startTime', 'endTime'\]\).*d\[tk\]\s*=\s*''/);
  assert.doesNotMatch(server, /DATE_RE|TIME_RE/);
});

test('Request Centre defines both languages and handles server field errors', () => {
  assert.match(source, /RC_UI\.en\.err_date=/);
  assert.match(source, /RC_UI\.th\.err_date='\\u0e01/);
  assert.match(submit, /Object\.keys\(x\.j\.fields\)/);
  assert.match(submit, /msg\.textContent=U\(/);
});

function submissionHarness(lang, responses) {
  const nodes = {}, messages = [], failures = [], successes = [], requests = [];
  const data = { ...photo, comments: 'Keep these details' };
  let focused, scrolled;
  for (const [key, value] of Object.entries(data)) {
    const names = new Set();
    nodes['rcf-' + key] = {
      value, classList: { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name) },
      focus() { focused = key; }, scrollIntoView() { scrolled = key; },
      insertAdjacentElement(position, msg) { assert.equal(position, 'afterend'); messages.push(msg); }
    };
  }
  nodes['rc-step-err'] = { style: {} };
  nodes['rc-submit-btn'] = { disabled: false, innerHTML: '' };
  const T = { key: 'photo', sections: [{ fields: Object.keys(data).map(k => ({ k })) }] };
  const context = vm.createContext({
    window: {}, rcValues: { ...data }, typeOf: () => T, allFields: () => T.sections[0].fields,
    rcReadStep() { for (const key of Object.keys(data)) context.rcValues[key] = nodes['rcf-' + key].value; },
    rcLang: () => lang, motionBehavior: () => 'auto', esc: String,
    localStorage: { setItem() {}, getItem() { return null; } },
    console: { error() {} }, rcFail: msg => failures.push(msg), rcSuccess: (...args) => successes.push(args),
    document: {
      getElementById: id => nodes[id] || null,
      querySelectorAll(selector) { assert.equal(selector, '.rc-field-msg'); return messages.slice(); },
      createElement(tag) {
        assert.equal(tag, 'div');
        return { setAttribute(k, v) { this[k] = v; }, remove() { messages.splice(messages.indexOf(this), 1); } };
      }
    },
    fetch(url, options) {
      assert.equal(url, '/.netlify/functions/submit-request');
      requests.push(JSON.parse(options.body));
      const response = responses.shift();
      return Promise.resolve({ ok: response.ok, json: () => Promise.resolve(response) });
    }
  });
  vm.runInContext(source.slice(source.indexOf('  var RC_UI={'), source.indexOf('  var RC_TH={')), context);
  vm.runInContext(submit, context);
  return { context, nodes, messages, failures, successes, requests,
    get focused() { return focused; }, get scrolled() { return scrolled; },
    async send() { context.window.rcSubmit('photo'); await new Promise(resolve => setImmediate(resolve)); }
  };
}

for (const lang of ['en', 'th']) {
  test('server field errors preserve inputs, localize messages and clear on retry: ' + lang, async () => {
    const h = submissionHarness(lang, [
      { ok: false, fields: { deadline: 'invalid_date', startTime: 'invalid_time', endTime: 'end_before_start' } },
      { ok: true, refNo: 'REQ-TEST1234' }
    ]);
    await h.send();
    assert.deepEqual(h.failures, []);
    assert.deepEqual(h.successes, []);
    assert.equal(h.focused, 'deadline');
    assert.equal(h.scrolled, 'deadline');
    assert.equal(h.messages.length, 3);
    for (const [index, [key, textKey]] of Object.entries({ deadline: 'err_date', startTime: 'err_time', endTime: 'err_end' }).entries()) {
      const msg = h.messages[index];
      assert.equal(h.nodes['rcf-' + key].classList.contains('rc-err'), true);
      assert.equal(msg.id, 'rcm-' + key);
      assert.equal(msg.className, 'rc-field-msg');
      assert.equal(msg.role, 'alert');
      assert.equal(msg.textContent, h.context.RC_UI[lang][textKey]);
    }
    assert.equal(h.nodes['rc-step-err'].textContent, h.context.RC_UI[lang].err_fields);
    assert.equal(h.nodes['rc-step-err'].style.display, 'block');
    assert.equal(h.nodes['rc-submit-btn'].disabled, false);
    assert.ok(h.nodes['rc-submit-btn'].innerHTML.endsWith(h.context.RC_UI[lang].submit));
    assert.equal(h.nodes['rcf-comments'].value, 'Keep these details');
    assert.equal(h.context.rcValues.comments, 'Keep these details');
    h.nodes['rcf-deadline'].value = '2028-02-29';
    await h.send();
    assert.equal(h.messages.length, 0);
    for (const key of ['deadline', 'startTime', 'endTime']) assert.equal(h.nodes['rcf-' + key].classList.contains('rc-err'), false);
    assert.equal(h.requests[1].data.deadline, '2028-02-29');
    assert.equal(h.requests[1].data.comments, 'Keep these details');
    assert.equal(h.successes.length, 1);
    assert.equal(h.nodes['rc-step-err'].style.display, 'none');
  });
}

test('other submission failures keep the generic error behavior', async () => {
  const h = submissionHarness('en', [{ ok: false, error: 'Service not configured' }]);
  await h.send();
  assert.deepEqual(h.failures, [h.context.RC_UI.en.fail]);
  assert.equal(h.nodes['rc-submit-btn'].disabled, false);
  assert.equal(h.nodes['rcf-comments'].value, 'Keep these details');
});
