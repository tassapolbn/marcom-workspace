import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../assets/workspace-ui.css', import.meta.url), 'utf8');
const requestCss = readFileSync(new URL('../assets/request-centre.css', import.meta.url), 'utf8');
const header = '/* Step 21: light mode readability */';
const start = css.indexOf(header);
assert.ok(start >= 0, 'Step 21 block exists');
const next = css.indexOf('/* Step ', start + header.length);
const block = css.slice(start + header.length, next < 0 ? undefined : next);
const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }));

function hexColour(hex) {
  const value = hex.replace('#', '').toLowerCase();
  return value.length === 3 ? value.split('').map(char => char + char).join('') : value;
}

function luminance(hex) {
  const rgb = hexColour(hex).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('every Step 21 selector is restricted to light mode', () => {
  assert.ok(rules.length > 0);
  for (const { selector } of rules) {
    // Split selector lists without splitting commas inside :is(...).
    for (const part of selector.split(/,(?![^()]*\))/)) {
      assert.ok(part.trim().startsWith('html:not(.dark)'), part);
    }
  }
});

// Backgrounds absent from the override are the documented rendered backgrounds.
const pairs = [
  ['.fpill.act-navy', '#ffffff', '#003057'],
  ['.btn-teal', '#ffffff', '#0f766e'],
  ['#panel-boss .btn-accent', '#ffffff', '#366a9c'],
  ['#panel-dew .btn-accent', '#ffffff', '#a25816'],
  ['#panel-o .btn-accent', '#ffffff', '#b73d0b'],
  ['.dirq-n', '#ffffff', '#b45309'],
  ['#panel-boss :is(', '#366a9c', '#e9f2f9'],
  ['#panel-dew :is(', '#a25816', '#fbefe4'],
  ['#panel-o :is(', '#b73d0b', '#f8e8e2'],
  ['confirmReset', '#be123c', '#fde6ea'],
  ['.mb-event', '#0b6e69', '#dbf0ef'],
  ['.myday-chip.warn', '#9a4a07', '#fbf0dc'],
  ['.menu-cat', '#7f5704', '#eef1f5'],
  ['::placeholder', '#5f6b7a', '#eef1f5'],
];

for (const [fragment, foreground, background] of pairs) {
  test(`light mode ${fragment} has at least 4.5:1 contrast`, () => {
    const rule = rules.find(({ selector }) => selector.includes(fragment));
    assert.ok(rule, `missing selector ${fragment}`);
    if (fragment === '.dirq-n') {
      // This override retains the existing white text and only changes its background.
      assert.match(rule.declarations, /(?:^|;)\s*background:\s*#b45309\s*;/i);
    } else {
      const colour = rule.declarations.match(/(?:^|;)\s*color:\s*(#[\da-f]{3,6})\b/i);
      assert.ok(colour, `${fragment} sets its foreground`);
      assert.equal(hexColour(colour[1]), hexColour(foreground));
    }
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 4.5, `${fragment}: ${ratio.toFixed(2)}:1`);
  });
}

test('Request Centre submit text overrides the shared button colour and passes contrast', () => {
  const rule = requestCss.match(/body\.request-mode #rc-root \.rc-submit-btn\s*\{([^}]+)\}/);
  assert.ok(rule, 'submit button rule exists');
  assert.match(rule[1], /(?:^|;)\s*color:\s*#003057!important\s*;/i);
  assert.ok(contrast('#003057', '#f0b323') >= 4.5);
});

test('Overview lunch menu categories use 11px text', () => {
  assert.ok(css.includes('#ov-menu-card .menu-cat{font-size:11px;}'));
});
