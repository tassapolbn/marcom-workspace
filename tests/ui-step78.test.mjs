import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/workspace-ui.css','utf8').split('/* Step 78:')[1];
const boot=html.split('<style id="boot-cover-style">')[1].split('</style>')[0];
function contrast(a,b){
  const lum=h=>{const c=h.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('step 78 restores the original gold ring glow with readable text in both themes',()=>{
  assert.match(css,/stroke:#f0b323;filter:drop-shadow\(0 0 4px rgba\(230,164,23,.55\)\)/);
  for(const [ink,bg] of [['8a5b00','f4f6f9'],['5b4619','f4f6f9'],['ffd569','0e1521'],['e9edf3','0e1521']]){
    assert.ok(css.includes('#'+ink));assert.ok(contrast(ink,bg)>=4.5);
  }
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*transition:none/);
});
test('step 78 opens on a full navy gradient in both themes, keeping first paint and reduced motion',()=>{
  assert.match(boot,/background:linear-gradient\(135deg,#00223C,#003057,#04406B\);color:#fff/);
  assert.doesNotMatch(boot,/88px|html.dark .boot-cover/);
  assert.match(boot,/html:not\(\.booted\),html.dark:not\(\.booted\)\{background:#00223C/);
  assert.match(boot,/stroke:#003057/);
  assert.match(boot,/prefers-reduced-motion:reduce/);
  for(const bg of ['00223C','003057','04406B'])for(const ink of ['ffffff','e9edf3','8fb4dc'])assert.ok(contrast(ink,bg)>=4.5);
});
test('step 78 salary ring handles one day, other days and payday without changing the badge',()=>{
  assert.match(html,/class="salary-days-label" id="sal-days-label"/);
  for(const [date,label,days,badge] of [['2026-10-29','day left',1,''],['2026-10-28','days left',2,''],['2026-10-30','days left','0','Payday!']]){
    class FixedDate extends Date{constructor(...args){super(...(args.length?args:[date+'T12:00:00']));}}
    const nodes={};
    const document={getElementById:id=>nodes[id]??=( {style:{},setAttribute(){}} )};
    vm.runInNewContext(html.slice(html.indexOf('const MONTHS='),html.indexOf('// TABS')), {Date:FixedDate,document});
    assert.equal(nodes['sal-days-label'].textContent,label);
    assert.equal(nodes['sal-days'].textContent,days);
    assert.ok(badge?nodes['sal-badge'].innerHTML.includes(badge):nodes['sal-badge'].innerHTML==='');
  }
});
