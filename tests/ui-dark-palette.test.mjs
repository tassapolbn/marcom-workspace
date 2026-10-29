import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=css.slice(css.indexOf('/* Step 73:')).split('/* Step 74:')[0];
const palette={pending:'#a3b1c4',progress:'#93b4f5',waiting:'#f0b86e',hold:'#c0a5f0',done:'#86d9a0',cancel:'#fda4a4',overdue:'#fda4a4'};
function lum(hex){const a=hex.match(/[a-f\d]{2}/gi).map(v=>{const s=parseInt(v,16)/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
test('Step 73 is scoped to dark mode and defines one semantic status palette',()=>{
 for(const [name,value] of Object.entries(palette)) assert.ok(block.includes(`--st-${name}:${value};`));
 for(const [,selector] of block.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{/g)) assert.ok(selector.trim().startsWith('html.dark'));
});
test('dark status and identity text pass AA on raised cards',()=>{
 // CSS uses a translucent white card over #0A0E18; also check the
 // brighter tinted card used by the saved-colour readability calculation.
 assert.match(html,/html\.dark \.task-card\{background:rgba\(255,255,255,\.06\)/);
 for(const bg of ['#191d26','#26374b']) for(const colour of [...Object.values(palette),'#e8ad80','#93b4d5','#f4a080','#8ad4a4']) assert.ok((lum(colour)+.05)/(lum(bg)+.05)>=4.5,`${colour} on ${bg}`);
});
test('Dew keeps a brown hue and primary actions stay navy with custom colours',()=>{
 const accent=block.match(/body.theme-dew\{--accent:(#[a-f\d]+)/)[1];
 const [r,g,b]=accent.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
 const hue=60*(g-b)/(r-b);
 assert.ok(hue>=15&&hue<35,`orange-brown hue ${hue}`);
 assert.match(block,/filter-tabs \.fpill:is\(\.act-accent,\.act-navy\)\{background:#10243a!important/);
 assert.match(html,/css\+='html.dark body.theme-'\+w\+.*background:#10243a!important/);
});
test('dark events and day agendas are flat and priority and today stay neutral',()=>{
 assert.match(block,/\.ev-chip,html.dark #evb-card \.evb-g/);
 assert.match(block,/\.cal-detail\{border:0!important;.*border-radius:0!important;background:transparent!important;box-shadow:none!important/);
 assert.match(block,/\.ov-pri.high\{background:transparent!important;color:#bdc7d5!important/);
 assert.match(block,/today.sel\{outline-color:#93b4d5!important/);
});
