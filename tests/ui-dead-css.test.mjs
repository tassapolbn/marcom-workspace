import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const stylesheet=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const stylePattern=/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const blocks=Array.from(source.matchAll(stylePattern),match=>match[1]);
const removed=[
  'ov-focus-card','ov-focus-h','ov-focus-sub','ov-focus-list','ov-focus-row',
  'ov-focus-clear','ov-fitem','ov-fi-topic','ov-fi-who','ov-fi-due',
  'fd-over','fd-today','fd-event','ov-today-line','tl-chip','tl-warn',
  'ov-avail-card','ov-avail','ov-mem','ov-mem-top','ov-mem-av','ov-mem-id',
  'ov-mem-name','ov-mem-role','ov-mem-bot','ov-mem-load','ov-st',
  'avl-card','avl-wrap','avl-row','avl-dot','avl-nm','avl-st','avl-note',
  'ov-hm','ov-hm-top','ov-hm-name','ov-hm-val','ov-hm-bar','ov-hm-fill',
  'ov-lv-name','ov-lv-stats','ov-main-list-grid','ov-ann-row','ov-ann-row-single'
];
// These names still occur in markup or JavaScript, including legacy renderers.
const retained=[
  'uxp-today-card','uxp-today-row','uxp-avail','uxp-chip','uxp-chip-n',
  'uxp-chip-l','uxp-pill','uxp-dot','ov-st-ok','ov-st-leave','ov-st-sick',
  'ov-lv','ov-lv-pill','ov-qa','ov-qa-btn'
];
function selectors(css){
  return Array.from(css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{/g),match=>match[1].trim())
    .filter(selector=>!selector.startsWith('@')).join('\n');
}
const inlineSelectors=blocks.map(selectors).join('\n');
const selectorName=name=>new RegExp('[.#]'+name+'(?![\\w-])');
const outsideStyles=[source.replace(stylePattern,''),
  ...readdirSync(new URL('../assets/',import.meta.url)).filter(name=>name.endsWith('.js'))
    .map(name=>readFileSync(new URL('../assets/'+name,import.meta.url),'utf8'))
].join('\n');

test('removed Overview names have no markup or JavaScript references',()=>{
  for(const name of removed){
    assert.doesNotMatch(outsideStyles,new RegExp('(?<![\\w-])'+name+'(?![\\w-])'),name+' is still referenced');
  }
});

test('every inline style block is free of removed Overview selectors',()=>{
  assert.ok(blocks.length>0,'inline style blocks must be found');
  for(const name of removed){
    assert.doesNotMatch(inlineSelectors,selectorName(name),name+' still has a CSS selector');
  }
});

test('referenced Overview names keep their styles',()=>{
  for(const name of retained){
    assert.match(outsideStyles,new RegExp('(?<![\\w-])'+name+'(?![\\w-])'),name+' is no longer referenced');
    assert.match(inlineSelectors,selectorName(name),name+' lost its CSS selector');
  }
});

test('key live Overview, widget, team and event styles remain',()=>{
  for(const name of ['ov-card','widget','ov-dl','evb-g']){
    assert.match(inlineSelectors,selectorName(name),name+' lost its CSS selector');
  }
  assert.match(selectors(stylesheet),selectorName('team-row'));
  // #ov-stats is the live element ID; its existing CSS uses .ov-stats.
  assert.match(outsideStyles,/class="ov-stats" id="ov-stats"/);
  assert.match(inlineSelectors,/\.ov-stats(?![\w-])/);
});
