import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');

function zoomFix(){
  const a=html.indexOf('<script>/* iPhone and iPad zoom into');
  const b=html.indexOf('</script>',a);
  assert.ok(a>0&&b>a,'the iPhone zoom fix is in the page');
  assert.ok(a<html.indexOf('</head>'),'it runs in the head, before the page draws');
  return html.slice(a+'<script>'.length,b);
}
const START='width=device-width, initial-scale=1.0';
/* Runs the fix twice on a fake viewport tag and returns the tag's final content. */
function viewportOn(navigator){
  const meta={content:START};
  const context=vm.createContext({navigator,document:{querySelector:sel=>sel==='meta[name="viewport"]'?meta:null}});
  const code=zoomFix();
  vm.runInContext(code,context);
  vm.runInContext(code,context);
  return meta.content;
}

test('iPhones and iPads stop zooming into fields; other devices keep the viewport tag',()=>{
  const fixed=START+', maximum-scale=1';
  assert.equal(viewportOn({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',platform:'iPhone',maxTouchPoints:5}),fixed);
  assert.equal(viewportOn({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',maxTouchPoints:5}),fixed,'an iPad showing the desktop site');
  assert.equal(viewportOn({userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8)',platform:'Linux armv8l',maxTouchPoints:5}),START,'Android keeps pinch zoom');
  assert.equal(viewportOn({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',maxTouchPoints:0}),START,'a Mac computer');
  assert.equal(viewportOn({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:0}),START);
});

const block=css.slice(css.indexOf('/* Step 22: phone-friendly layout */'));

test('the Overview fits a phone: columns shrink and the Event Board header wraps',()=>{
  assert.ok(css.includes('/* Step 22: phone-friendly layout */'),'the phone block exists');
  assert.match(block,/#panel-overview \.ov-col-main,#panel-overview \.ov-col-side\{min-width:0;\}/);
  assert.match(block,/#evb-card>\.ov-card-head\{flex-wrap:wrap;/);
});

test('Add Task buttons wrap on narrow screens so Save + Calendar stays on screen',()=>{
  assert.match(block,/@media\(max-width:480px\)\{\s*#modal \.modal-footer\{flex-wrap:wrap;\}\s*#modal #modal-save-cal\{flex:1 1 100%!important;/);
});

test('phones get finger-sized buttons and no text under 11px',()=>{
  const phone=block.slice(block.indexOf('@media(max-width:640px)'));
  assert.match(phone,/\.ov-fpill[^{]*\.filter-tabs \.fpill[^{]*\{min-height:36px;\}/);
  assert.match(phone,/\.tcard-sel,\.tcard-move,\.role-btn\)\{min-height:32px;\}/);
  assert.match(phone,/\.ev-chip>\.ev-chip-del\{width:32px;height:32px;/);
  assert.match(phone,/\.ev-chip-date,\.ev-chip-name\{padding-right:34px;\}/,'chip text leaves room for the bigger delete button');
  assert.match(phone,/:is\(\.ev-chip-date,\.meet-label,\.ov-pri[^{]*\{font-size:11px!important;\}/);
});
