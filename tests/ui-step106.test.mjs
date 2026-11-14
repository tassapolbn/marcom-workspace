import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const start=css.indexOf('/* Step 106:');
assert.ok(start>=0,'step 106 block exists');
const block=css.slice(start,css.indexOf('/* Step 107:'));
const shared=css.slice(css.indexOf('/* Step 103:'),css.indexOf('/* Step 104:'));
function rule(text,selector){
  const found=[...text.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find(([,s])=>s.trim()===selector);
  assert.ok(found,selector);
  return Object.fromEntries(found[2].split(';').filter(d=>d.includes(':'))
    .map(d=>d.trim().split(/:(.*)/s).slice(0,2)));
}
function luminance(hex){
  let digits=hex.replace('#','');
  if(digits.length===3)digits=[...digits].map(c=>c+c).join('');
  const [r,g,b]=digits.match(/../g).map(c=>parseInt(c,16)/255)
    .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
for(const dark of [false,true])test(`selected menu day matches step 103 and has readable contrast in ${dark?'dark':'light'} mode`,()=>{
  const selected=rule(block,(dark?'html.dark ':'')+'.menu-day-pill.act');
  const filter=rule(shared,dark
    ?'html.dark .fpill:is(.act-navy,.act-accent,.act-coral),html.dark #panel-overview .ov-fpill.on'
    :'.fpill:is(.act-navy,.act-accent,.act-coral),#panel-overview .ov-fpill.on');
  for(const property of ['background','color','border-color'])assert.equal(selected[property],filter[property],property);
  if(!dark){assert.equal(selected.background,'#003057');assert.equal(selected.color,'#fff');}
  const a=luminance(selected.background),b=luminance(selected.color);
  assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
  assert.doesNotMatch(block,/var\(--gold\)|!important/);
});

test('day buttons share a centred equal row and the unselected filter appearance',()=>{
  const row=rule(block,'.menu-days'),day=rule(block,'.menu-day-pill');
  assert.equal(row.display,'flex');assert.equal(row.gap,'6px');
  for(const [name,value] of Object.entries({display:'flex',flex:'1','align-items':'center','justify-content':'center',
    height:'var(--hs-pill-h)',padding:'0','border-radius':'var(--hs-ctl-radius)','font-size':'12.5px','font-weight':'600',
    background:'var(--surface)',border:'1px solid var(--hs-btn-line)',color:'var(--muted)'}))assert.equal(day[name],value,name);
  assert.deepEqual(rule(block,'.menu-day-pill:not(.act):hover'),{background:'var(--hs-btn-hover)',color:'var(--text)'});
  assert.equal(rule(block,'.menu-day-pill.act')['font-weight'],'700');
});

test('today has a gold border and main ink only when it is unselected',()=>{
  assert.deepEqual(rule(block,'.menu-day-pill.today-pill:not(.act)'),{
    border:'1.5px solid #F0B323',color:'var(--text)','font-weight':'700'
  });
  assert.doesNotMatch(block,/\.today-pill(?!:not\(\.act\))/);
});

test('week picker overrides the shared field dimensions with the compact control appearance',()=>{
  const picker=rule(block,'html body select.menu-week-sel');
  for(const [name,value] of Object.entries({height:'var(--hs-ctl-h-sm)','min-height':'0','border-radius':'var(--hs-ctl-radius)',
    border:'1px solid var(--hs-btn-line)','font-size':'13px','font-weight':'600',background:'var(--surface)',color:'var(--text)'}))assert.equal(picker[name],value,name);
});

test('menu controls have 44px touch targets and the shared visible keyboard focus',()=>{
  const touch=block.match(/@media\(max-width:600px\),\(pointer:coarse\)\{([\s\S]*?)\n\}/);
  assert.ok(touch);
  assert.deepEqual(rule(touch[1],'.menu-day-pill,html body select.menu-week-sel'),{height:'44px','min-height':'44px'});
  assert.deepEqual(rule(block,'html body .menu-day-pill:focus-visible,html body select.menu-week-sel:focus-visible'),{
    outline:'2px solid var(--focus-ink,#1d4ed8)','outline-offset':'2px','box-shadow':'none'
  });
  assert.match(block,/@media\(prefers-reduced-motion:reduce\)\{\.menu-day-pill\{transition:none;\}\}/);
});

test('old menu presentation rules are removed at source and no other layer restyles them',()=>{
  const inline=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  assert.doesNotMatch(html,/\.menu-day-pill\.act\{background:var\(--gold\)/);
  assert.doesNotMatch(inline,/\.menu-week-sel|\.menu-days\s*\{/);
  const remaining=[...inline.matchAll(/([^{}]*\.menu-day-pill[^{}]*)\{([^{}]*)\}/g)];
  assert.equal(remaining.length,1);
  assert.equal(remaining[0][2],'transition:all 0.16s ease;','the existing shared transition is the only remaining day rule');
  assert.doesNotMatch(css.slice(0,start),/\.menu-day-pill|\.menu-week-sel/);
});

function menu(dow=1,selected=null){
  const elements=Object.fromEntries(['menu-week','menu-days','menu-date','menu-week-note','menu-list'].map(id=>[id,{}]));
  class MenuDate extends Date{
    constructor(...parts){super(...(parts.length?parts:[2026,10,dow===0?15:8+dow]));}
  }
  const context=vm.createContext({document:{getElementById:id=>elements[id]},
    window:{addEventListener(){}},localStorage:{getItem:()=> '1',setItem(){}},Date:MenuDate});
  const source=html.slice(html.indexOf('const MENU_DAYS='),html.indexOf('// ===== WIDGET REORDERING ====='));
  vm.runInContext(source,context);
  vm.runInContext(`menuSelectedDay=${JSON.stringify(selected)};renderMenu();`,context);
  const buttons=()=>[...elements['menu-days'].innerHTML.matchAll(/<div ([^>]+)>([^<]+)<\/div>/g)]
    .map(([,attrs,text])=>({text,...Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]))}));
  return {context,elements,buttons};
}

for(const selected of [null,'tue'])test(`rendered weekdays expose selection and today's date with ${selected||'today'} selected`,()=>{
  const m=menu(1,selected),buttons=m.buttons();
  assert.equal(buttons.length,5);
  for(const [i,b] of buttons.entries()){
    assert.equal(b.role,'button');assert.equal(b.tabindex,'0');
    assert.equal(b['aria-pressed'],i===(selected==='tue'?1:0)?'true':'false');
    assert.equal(b['aria-current'],i===0?'date':undefined);
  }
  assert.equal(buttons[0].class.includes('today-pill'),true);
});

test('weekends retain the existing Monday selection without marking a weekday as today',()=>{
  for(const dow of [0,6]){
    const buttons=menu(dow).buttons();
    assert.equal(buttons[0]['aria-pressed'],'true');
    assert.ok(buttons.every(b=>!b['aria-current']&&!b.class.includes('today-pill')));
  }
});

test('Enter and Space select a day and prevent scrolling; other keys leave selection alone',()=>{
  for(const key of ['Enter',' ','ArrowRight']){
    const m=menu(),tue=m.buttons()[1];
    let prevented=false;
    m.context.event={key,preventDefault(){prevented=true;}};
    vm.runInContext(tue.onkeydown,m.context);
    assert.equal(prevented,key!=='ArrowRight');
    assert.equal(m.buttons()[key==='ArrowRight'?0:1]['aria-pressed'],'true');
    assert.equal(m.elements['menu-week'].value,1,'day selection preserves the menu week');
  }
  const m=menu();
  vm.runInContext(m.buttons()[2].onclick,m.context);
  assert.equal(m.buttons()[2]['aria-pressed'],'true','pointer selection still works');
});
