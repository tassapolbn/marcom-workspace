import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const css=readFileSync('assets/workspace-ui.css','utf8');
const shared=css.slice(css.indexOf('/* Step 102:'));
const older=css.split('/* Step 102:')[0];
const inline=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const rules=s=>[...s.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
function rule(selector){
  const match=rules(shared).find(r=>r.selector===selector);
  assert.ok(match,selector);
  return match.body;
}
function slice(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
function declarations(body){return Object.fromEntries(body.split(';').filter(s=>s.includes(':')).map(s=>s.trim().split(/:(.*)/s).slice(0,2)));}

test('step 102 defines shared values once, with dark and small-screen overrides',()=>{
  const light=declarations(rule(':root')),dark=declarations(rule('html.dark'));
  for(const [key,value] of Object.entries({
    '--hs-radius-card':'16px','--hs-radius-tile':'12px',
    '--hs-shadow-card':'0 1px 2px rgba(16,36,62,.04),0 10px 24px -18px rgba(16,36,62,.22)',
    '--hs-shadow-tile':'0 1px 2px rgba(16,36,62,.05)',
    '--hs-shadow-float':'0 16px 40px -16px rgba(16,36,62,.34)',
    '--hs-pad-card':'20px','--hs-gap':'16px',
    '--hs-icon-tile-bg':'rgba(0,48,87,.06)','--hs-icon-tile-ink':'#003057'
  }))assert.equal(light[key],value,key);
  for(const [key,value] of Object.entries({
    '--hs-shadow-card':'0 1px 2px rgba(0,0,0,.30)','--hs-shadow-tile':'none',
    '--hs-shadow-float':'0 16px 40px -16px rgba(0,0,0,.6)',
    '--hs-icon-tile-bg':'rgba(255,255,255,.08)','--hs-icon-tile-ink':'#cfe0f5'
  }))assert.equal(dark[key],value,key);
  assert.match(shared,/@media\(max-width:600px\)\{ :root\{ --hs-pad-card:16px; --hs-gap:12px; \} \}/);
  for(const name of ['radius-card','radius-tile'])assert.equal((css.match(new RegExp('--hs-'+name+':','g'))||[]).length,1);
  assert.doesNotMatch(shared,/!important/,'old conflicts are removed at source');
});

test('every requested surface shares the card border, corner and shadow',()=>{
  const surface=rules(shared).find(r=>r.selector.startsWith('#panel-overview .ov-card,'));
  for(const selector of ['#ov-ann-card','#ov-team','#panel-overview .ov-more','.tab-panel .member-head',
    '.tab-panel .myday','.tab-panel .evhub','html body .tab-panel .two-col>.side-col',
    '[id$="-sub-events"]','[id$="-sub-links"]','[id$="-sub-notes"]','[id$="-sub-sop"]',
    '.evc-card','.ews-head','.ews-card','.link-card','.note-card'])assert.ok(surface.selector.includes(selector),selector);
  assert.deepEqual(declarations(surface.body),{
    'border-radius':'var(--hs-radius-card)','border':'1px solid var(--border)','box-shadow':'var(--hs-shadow-card)'
  });
  assert.match(shared,/\.tab-panel \.member-head\{background:var\(--surface\);background-image:none;/);
  assert.match(shared,/\.tab-panel \.evhub-head\{background:transparent;background-image:none;/);
});

test('older source layers cannot restore card corners, shadows, rails or tinted headers',()=>{
  const end=/(?:^|\s|>)(?:\.ov-card|\.ov-ann|#ov-ann-card|#ov-team|\.ov-more|\.member-head|\.evhub|\.evc-card|\.ews-card|\.ews-head|\.link-card|\.note-card|\.task-card|\.ev-chip|\.ev-chip-filled|\.modal|\.tc-pop|\.tcp-pop)(?::hover)?$/;
  for(const {selector,body} of rules(inline+'\n'+older)){
    // All selectors in these groups are simple; :is groups are checked separately.
    if(selector.split(',').some(s=>end.test(s.trim()))){
      assert.doesNotMatch(body,/(?:^|;)\s*(?:border-radius|box-shadow)\s*:/,selector);
      if(!selector.includes('.task-card'))assert.doesNotMatch(body,/(?:^|;)\s*border-left(?:-width|-color)?\s*:/,selector);
    }
    if(/(?:\.member-head|\.evhub-head)\s*$/.test(selector))assert.doesNotMatch(body,/gradient\(|color-mix\(/,selector);
  }
  assert.doesNotMatch(inline,/\.note-card\.nc-best\{[^}]*border-left/);
  assert.match(inline,/\.evc-card::before\{content:none;\}/);
});

test('task and event tiles and floating surfaces use their shared values',()=>{
  assert.equal(rule('.task-card'),'border-radius:var(--hs-radius-tile);box-shadow:var(--hs-shadow-tile);');
  assert.equal(rule('.ev-chip'),'border-radius:var(--hs-radius-tile);');
  assert.equal(rule('.modal,.confirm-box,.cmdk-box'),'border-radius:var(--hs-radius-card);box-shadow:var(--hs-shadow-float);');
  assert.equal(rule('.ui-menu,.tc-pop,.tcp-pop,#uxp-bell-panel,#uxp-more-panel'),'border-radius:var(--hs-radius-tile);box-shadow:var(--hs-shadow-float);');
  assert.doesNotMatch(rule('.task-card'),/border:/,'tile borders keep their existing meaning');
});

test('card padding and gaps use the same responsive rhythm without changing the working grids',()=>{
  assert.equal(rule('#panel-overview .ov-card,#ov-team'),'padding:16px var(--hs-pad-card) 20px;');
  assert.equal(rule('.tab-panel .evhub-head'),'background:transparent;background-image:none;');
  assert.match(shared,/\.tab-panel \.evhub-head\{padding:16px var\(--hs-pad-card\) 12px;\}/);
  assert.equal(rule('.tab-panel .evhub-body'),'padding:16px var(--hs-pad-card) 20px;');
  assert.match(rule('.tab-panel .member-head'),/padding:16px var\(--hs-pad-card\)/);
  assert.match(rule('.tab-panel .myday'),/padding:16px var\(--hs-pad-card\);margin-bottom:var\(--hs-gap\)/);
  assert.equal(rule('.tab-panel .two-col,#panel-overview .ov-grid'),'gap:var(--hs-gap);');
  assert.equal(rule('#ov-top,#ov-team'),'margin-bottom:var(--hs-gap);');
  assert.equal(rule('#panel-overview .ov-more'),'margin:0;');
  assert.doesNotMatch(shared,/\.kanban-board|\.kb-col\[|\.myday-columns|grid-template-columns:/,'Steps 100 and 101 retain their column layouts');
});

test('headers have one icon tile, title scale, summary scale and centred row',()=>{
  const row=rules(shared).find(r=>r.selector.startsWith('#panel-overview .ov-card-head,'));
  assert.match(row.selector,/\.ov-team-head/);assert.match(row.selector,/\.evhub-head/);assert.match(row.selector,/\.widget-head/);
  assert.equal(row.body,'min-height:40px;align-items:center;');
  const tiles=rules(shared).find(r=>r.selector.startsWith('#panel-overview .ov-card-title>i.ti:first-child,'));
  for(const selector of ['.ov-team-title>i.ti:first-child','.evhub-title>i.ti:first-child','.widget-title>i.ti:first-of-type'])assert.ok(tiles.selector.includes(selector));
  const tile=declarations(tiles.body);
  for(const [prop,value] of Object.entries({width:'32px',height:'32px',flex:'0 0 32px','border-radius':'10px','font-size':'17px',background:'var(--hs-icon-tile-bg)',color:'var(--hs-icon-tile-ink)'}))assert.equal(tile[prop],value);
  assert.match(shared,/\.uxp-sb-title\{font-size:16px;font-weight:700;color:var\(--text\);\}/);
  assert.equal(rule('.tab-panel .evhub-title,.member-head .member-name'),'font-size:16px;font-weight:700;','identity colours remain on person names and Event Hub titles');
  assert.match(shared,/\.tab-panel \.widget-sum\{font-size:13px;color:var\(--muted\);\}/);
  assert.match(shared,/\.ov-card-head>\.ov-card-title\{margin-right:auto;\}/);
});

test('section labels share one style, with overdue still red and phone Today labels still hidden',()=>{
  assert.deepEqual(declarations(rule('.ov-dl-grp-t,.evb-sec-h,.myday-label')),
    {'font-size':'11.5px','font-weight':'700','text-transform':'uppercase','letter-spacing':'.06em',color:'var(--muted)'});
  assert.equal(rule('#panel-overview .ov-dl-grp-t.od'),'color:var(--danger);');
  for(const {selector,body} of rules(inline+'\n'+older)){
    if(/(?:\.ov-dl-grp-t|\.evb-sec-h|\.myday-label)$/.test(selector))assert.doesNotMatch(body,/font-size:|font-weight:|text-transform:|letter-spacing:/,selector);
  }
  assert.match(older,/@media\(max-width:980px\)\{\s*\.myday-label,\.myday-empty\{display:none;\}/);
});

class Node{
  children=[];attributes={};className='';textContent='';innerHTML='';
  appendChild(n){this.children.push(n);}
  insertBefore(n,ref){const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,n);}
  get firstChild(){return this.children[0];}
  querySelector(s){return this.children.find(n=>s.endsWith('.'+n.className))||null;}
  setAttribute(k,v){this.attributes[k]=v;}
}
test('each desktop sidebar gets an idempotent Widgets header with the existing toggle action',()=>{
  const col=new Node(),first=new Node();col.appendChild(first);
  const toggle=()=>{};let rails=0,painted=0;
  const c=vm.createContext({document:{createElement:()=>new Node(),querySelectorAll:()=>[col]},window:{uxpSbToggle:toggle},buildRail:()=>rails++,paintToggles:()=>painted++});
  vm.runInContext(slice('  function decorate(){\n    document.querySelectorAll(\'.tab-panel .two-col>.side-col\')','  function boot(){'),c);
  c.decorate();c.decorate();
  assert.equal(col.children.length,3);assert.equal(rails,1);assert.equal(painted,2);
  const head=col.children[0];assert.equal(head.className,'uxp-sb-head');
  assert.equal(head.children[0].textContent,'Widgets');assert.equal(head.children[0].className,'uxp-sb-title');
  assert.equal(head.children[1].onclick,toggle);assert.equal(head.children[1].className,'uxp-sb-toggle');
  assert.equal(col.children[2],first);
  assert.match(inline,/\.uxp-sb-head\{[^}]*justify-content:space-between;[^}]*padding:16px var\(--hs-pad-card\);margin:0;/);
  assert.match(older,/@media\(max-width:980px\)[\s\S]*?\.uxp-drawer-head/,'phone drawer retains its own header');
});

test('Hide keeps its chevrons and accessible name, and the collapsed sidebar still shows again',()=>{
  const button=new Node();let collapsed=false;
  const c=vm.createContext({document:{querySelectorAll:()=>[button]},isCollapsed:()=>collapsed});
  vm.runInContext(slice('  function paintToggles(){','  /* On desktop the widgets fade'),c);
  c.paintToggles();assert.equal(button.attributes['aria-label'],'Hide sidebar');assert.equal(button.attributes['aria-expanded'],'true');
  assert.match(button.innerHTML,/ti-chevrons-right/);assert.match(button.innerHTML,/>Hide<\/span>/);
  collapsed=true;c.paintToggles();assert.equal(button.attributes['aria-label'],'Show sidebar');assert.equal(button.attributes['aria-expanded'],'false');assert.match(button.innerHTML,/ti-chevrons-left/);
  assert.match(shared,/body\.uxp-sb-collapsed \.uxp-sb-title\{display:none;\}/);
  assert.match(html,/window\.uxpSbToggle=function\(\)\{ setCollapsed\(!isCollapsed\(\)\); \}/);
  assert.match(html,/setCollapsed\(false\);\s*var behavior=motionBehavior/,'rail buttons still reopen the sidebar');
});

test('today has an unclipped gold ring, navy fill and white number on every calendar in both themes',()=>{
  assert.deepEqual(declarations(rule('.cal-day.today,#panel-overview .ov-cal-grid .cal-day.today')),
    {background:'#003057',color:'#fff','box-shadow':'0 0 0 2px var(--surface),0 0 0 4px #F0B323'});
  assert.equal(rule('.cal-day.today.sel,#panel-overview .ov-cal-grid .cal-day.today.sel'),'outline:0;');
  assert.deepEqual(declarations(rule('.cal-grid,#panel-overview .ov-cal-grid')),
    {overflow:'visible',padding:'4px',gap:'8px'});
  assert.doesNotMatch(older,/cal-day\.today[^{}]*\{[^}]*outline-color:/,'step 72b and dark navy rings are removed');
  assert.match(inline,/\.cal-day.sick-day.today\{background:#003057;color:#fff;\}/);
  assert.match(inline,/html.dark \.cal-day.today:not\(\.empty\):hover\{background:#003057;\}/);
});

function lum(hex){const [r,g,b]=hex.match(/[\da-f]{2}/gi).map(n=>{const c=parseInt(n,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('main titles, muted summaries and calendar numbers meet 4.5:1 in light and dark themes',()=>{
  for(const [ink,bgs] of [['#101a2b',['#ffffff','#eef1f5']],['#55637a',['#ffffff','#eef1f5']],
    ['#eaf0f8',['#192231','#26374b']],['#a3b1c4',['#192231','#26374b']],['#ffffff',['#003057']],
    ['#003057',['#f0f3f5']],['#cfe0f5',['#303b48']]]){
    for(const bg of bgs)assert.ok(contrast(ink,bg)>=4.5,`${ink} on ${bg}`);
  }
});

test('step 102 leaves button, pill, field and tab styling for step 103',()=>{
  for(const {selector,body} of rules(shared)){
    if(/\.(?:btn|fpill|ov-fpill|form-input|form-select|form-textarea|sub-tab|sub-nav)(?![\w-])/.test(selector)){
      assert.equal(body,'margin-bottom:var(--hs-gap);',selector);
    }
  }
});
