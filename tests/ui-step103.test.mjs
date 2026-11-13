import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const css=readFileSync('assets/workspace-ui.css','utf8');
const shared=css.slice(css.indexOf('/* Step 103:'));
const older=css.split('/* Step 103:')[0];
const inline=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const rules=s=>[...s.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
const all=rules(shared);
const rule=selector=>{const r=all.find(r=>r.selector===selector);assert.ok(r,selector);return r.body;};
const declarations=body=>Object.fromEntries(body.split(';').filter(d=>d.includes(':')).map(d=>d.trim().split(/:(.*)/s).slice(0,2)));
const containing=selector=>{const r=all.find(r=>r.selector.includes(selector));assert.ok(r,selector);return r;};

test('step 103 defines the shared desktop, dark and touch values without heavier overrides',()=>{
  const base=declarations(rule(':root'));
  for(const [name,value] of Object.entries({'ctl-h':'36px','ctl-h-sm':'30px','ctl-radius':'10px','pill-h':'30px','field-h':'44px',
    'btn-main':'#003057','btn-main-hover':'#0b3f6b','btn-line':'#cfd8e3','btn-hover':'rgba(0,48,87,.06)','focus':'0 0 0 3px rgba(0,48,87,.18)'}))assert.equal(base['--hs-'+name],value,name);
  assert.deepEqual(declarations(rule('html.dark')),{'--hs-btn-line':'rgba(255,255,255,.18)','--hs-btn-hover':'rgba(255,255,255,.08)','--hs-focus':'0 0 0 3px rgba(143,180,220,.35)'});
  assert.match(shared,/@media\(max-width:600px\),\(pointer:coarse\)\{ :root\{ --hs-ctl-h:44px; --hs-ctl-h-sm:40px; \} \}/);
  assert.doesNotMatch(shared,/!important/);
});

test('button families use a common shape, compact controls use the small value and icons are 16px',()=>{
  const base=all.find(r=>r.selector.startsWith('.btn,.auth-btn')&&r.body.includes('height:')).body;
  assert.equal(all.find(r=>r.selector.startsWith('.btn,.auth-btn')&&r.body.includes('display:')).body,'display:inline-flex;');
  for(const [name,value] of Object.entries({'align-items':'center','justify-content':'center',gap:'6px',height:'var(--hs-ctl-h)',padding:'0 14px','border-radius':'var(--hs-ctl-radius)','font-size':'13.5px','line-height':'1','white-space':'nowrap'}))assert.equal(declarations(base)[name],value,name);
  const compact=declarations(rule('.btn-sm,.task-card .tc-more,.task-card .tc-acts-btn'));
  assert.equal(compact.height,'var(--hs-ctl-h-sm)');assert.equal(compact.padding,'0 11px');assert.equal(compact['font-size'],'13px');
  assert.match(containing('.btn i,').body,/font-size:16px/);
  assert.match(rule('.task-card .tc-acts-btn'),/width:var\(--hs-ctl-h-sm\);min-width:var\(--hs-ctl-h-sm\)/);
});

test('main actions are flat navy in light mode, with their existing dark fills',()=>{
  const main=containing('.btn-accent,.btn-navy').body;
  assert.match(main,/background:var\(--hs-btn-main\);background-image:none;[^}]*color:#fff;font-weight:700;box-shadow:none/);
  assert.match(containing('.btn-accent:hover,').body,/background:var\(--hs-btn-main-hover\);box-shadow:none;filter:none/);
  assert.equal(rule('html.dark .tab-panel .btn-accent'),'background:#10243a;color:#fff;');
  assert.equal(rule('html.dark .btn-navy,html.dark .btn-gold'),'background:#f0b323;color:#0b1220;');
  assert.equal(rule('html.dark .btn-teal'),'background:#2dd4bf;color:#032b28;');
  for(const {selector,body} of rules(inline+'\n'+older)){
    if(/\.btn-accent(?![\w-])/.test(selector))assert.doesNotMatch(body,/gradient\(|box-shadow:[^;]*(?:rgba|--accent-shadow|--shadow-(?:brand|yellow))/i,selector);
  }
  assert.doesNotMatch(html,/css\+='html:not\(\.dark\) body.theme-'\+w\+.*\.btn-accent/,'custom themes cannot overwrite the shared light fill');
});

test('secondary actions, quiet controls, danger and disabled states retain their distinct cues',()=>{
  const second=containing('.btn-ghost,.task-link,').body;
  assert.match(second,/background:var\(--surface\);border:1px solid var\(--hs-btn-line\);color:var\(--text\);font-weight:600;box-shadow:none/);
  const quiet=all.find(r=>r.selector.startsWith('.icon-btn,.uxp-col-btn,')&&r.selector.includes(':not(.ov-ann-new)')).body;
  assert.match(quiet,/width:var\(--hs-ctl-h\);min-width:var\(--hs-ctl-h\);padding:0;border:0;background:transparent;color:var\(--muted\)/);
  assert.match(rule('.btn-danger,.uxp-btn-danger'),/background:var\(--surface\);color:var\(--danger\);border:1px solid var\(--danger\)/);
  assert.match(rule('button:disabled,.btn.disabled,[aria-disabled="true"]'),/opacity:.5;pointer-events:none;cursor:not-allowed/);
  assert.match(rule('.dm-toggle,.cmdk-trigger'),/height:var\(--hs-ctl-h\);[^}]*border-radius:var\(--hs-ctl-radius\)/);
  assert.doesNotMatch(rule('.dm-toggle,.cmdk-trigger'),/background:/,'header translucency stays in its existing source rules');
});

test('filter pills share desktop dimensions and selected colours, with 44px touch targets',()=>{
  const pills=declarations(rule('.fpill,#panel-overview .ov-fpill'));
  for(const [name,value] of Object.entries({height:'var(--hs-pill-h)',padding:'0 12px','border-radius':'999px','font-size':'12.5px','font-weight':'600',background:'var(--surface)',border:'1px solid var(--hs-btn-line)',color:'var(--muted)'}))assert.equal(pills[name],value,name);
  assert.match(rule('.fpill:is(.act-navy,.act-accent,.act-coral),#panel-overview .ov-fpill.on'),/background:#003057;[^}]*color:#fff/);
  assert.match(containing('html.dark .fpill:is(').body,/background:#10243a;border-color:#647e9a;color:#fff/);
  assert.match(shared,/\.fpill,#panel-overview \.ov-fpill\{height:44px;min-height:44px;/);
});

test('count chips share a 22px minimum and centred type',()=>{
  const chips=containing('.kb-col-count,');
  for(const name of ['.ov-dl-count','.sub-tab :is(.badge,.count)','.wf-count','.widget-count'])assert.ok(chips.selector.includes(name),name);
  const d=declarations(chips.body);
  for(const [name,value] of Object.entries({height:'22px','min-width':'22px','border-radius':'999px','font-size':'12px','font-weight':'700','align-items':'center','justify-content':'center'}))assert.equal(d[name],value,name);
});

test('sub-tabs form a left aligned scrolling row with an unclipped underline in both themes',()=>{
  const bar=declarations(rule('.tab-panel .sub-nav'));
  for(const [name,value] of Object.entries({display:'flex','flex-wrap':'nowrap','justify-content':'flex-start',background:'transparent',padding:'0',border:'0','border-bottom':'1px solid var(--border)','border-radius':'0','box-shadow':'none','overflow-x':'auto'}))assert.equal(bar[name],value,name);
  const tab=declarations(rule('.tab-panel .sub-nav .sub-tab'));
  assert.equal(tab.flex,'0 0 auto');assert.equal(tab.height,'40px');assert.equal(tab.padding,'0 14px');assert.equal(tab['font-size'],'13.5px');assert.equal(tab['border-radius'],'0');
  assert.match(rule('.tab-panel .sub-nav .sub-tab.act'),/color:#003057;background:transparent;font-weight:700;box-shadow:none/);
  assert.match(rule('.tab-panel .sub-nav .sub-tab.act::after'),/bottom:0;height:2px;background:#003057/,'the full underline stays inside the scrolling row');
  assert.match(rule('html.dark .tab-panel .sub-nav .sub-tab.act'),/color:#cfe0f5/);
  assert.match(rule('html.dark .tab-panel .sub-nav .sub-tab.act::after'),/background:#8fb4dc/);
  assert.match(older,/\.sub-nav \.uxp-drawer-btn\{order:99/,'Widgets stays last');
  assert.match(shared,/\.sub-nav \.sub-tab,\.tab-panel \.sub-nav \.uxp-drawer-btn\{height:44px;min-height:44px/);
});

test('fields share dimensions and a focus ring, while task menus retain compact heights',()=>{
  const fields=containing('html body :is(.form-input,');
  assert.match(fields.selector,/select/);assert.match(fields.selector,/\.widget/);assert.match(fields.selector,/\[role="dialog"\]/);
  assert.match(fields.body,/height:var\(--hs-field-h\);border-radius:var\(--hs-ctl-radius\);border:1px solid var\(--hs-btn-line\);font-size:14px;padding:0 12px/);
  assert.match(rule('html body :is(textarea,.form-textarea)'),/height:auto;min-height:88px;padding:10px 12px/);
  assert.match(containing('html body textarea:focus').body,/border-color:#003057;box-shadow:var\(--hs-focus\);outline:none/);
  assert.match(rule('html body select:is(.tcard-sel,.tcard-move)'),/height:var\(--hs-ctl-h-sm\);[^}]*border-radius:var\(--hs-ctl-radius\)/);
  assert.match(fields.selector,/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\[type="color"\]\):not\(\[type="file"\]\)/);
});

test('keyboard focus covers controls and tiles; compact touch controls have a full target',()=>{
  const focus=containing('html body :is(button,a,[tabindex]');
  for(const name of ['.fpill','.ov-fpill','.sub-tab','.task-card','.ev-chip','select.tcard-sel','select.tcard-move'])assert.ok(focus.selector.includes(name),name);
  assert.match(focus.body,/outline:2px solid var\(--focus-ink,#1d4ed8\);outline-offset:2px/);
  const touch=shared.slice(shared.lastIndexOf('@media(max-width:600px),(pointer:coarse)'));
  for(const name of ['.btn','.task-card .tc-more','.task-card .tc-acts-btn','.gcal-refresh','.cal-arrow','.evhub-btn','select:is(.tcard-sel,.tcard-move)'])assert.ok(touch.includes(name),name);
  assert.match(touch,/\{min-height:44px;/);assert.match(touch,/\.tc-acts-btn\{min-width:44px;/);
});

test('source layers cannot restore the old control corners; sidebar rows and task corners are corrected',()=>{
  for(const {selector,body} of rules(inline+'\n'+older)){
    if(/\.(?:btn|btn-sm|btn-accent|btn-ghost|icon-btn|fpill|sub-tab|form-input|form-select)(?![\w-])/.test(selector))assert.doesNotMatch(body,/border-radius:[^;]*!important/,selector);
  }
  assert.doesNotMatch(inline,/\.task-card[^{}]*\{[^}]*border-radius:14px/);
  assert.match(older,/\.task-card\{border-radius:var\(--hs-radius-tile\)/);
  assert.equal(rule('.tab-panel .side-col .widget-title'),'font-size:14.5px;font-weight:700;');
  assert.match(older,/\.uxp-sb-title\{font-size:16px;font-weight:700/,'the panel title keeps its card scale');
  assert.doesNotMatch(shared,/quickadd-fab|tc-fab|\.tab-btn|uxp-sal|salary|bottom-nav|myday-columns|grid-template-columns/,'excluded controls and layouts retain their own styles');
});

// The optional Sheet action is hidden until the existing connection state enables it.
test('sharing control dimensions does not reveal a disabled integration action',()=>{
  assert.match(html,/\.tc-sheet-btn\{display:none\}/);
  assert.match(html,/body\.sheet-link-on \.tc-sheet-btn\{display:flex\}/);
  for(const r of all.filter(r=>r.body.includes('display:')&&r.selector.includes('.icon-btn')))assert.ok(r.selector.includes('.icon-btn:not(.tc-sheet-btn)'),r.selector);
});

// Found in the browser check: the 44px buttons pushed "Event Hub" onto two lines on iPhone.
test('the Event Hub title keeps one line beside its buttons on iPhone',()=>{
  const phone=shared.slice(shared.lastIndexOf('@media(max-width:600px){'));
  assert.match(phone,/\.tab-panel \.evhub-title\{white-space:nowrap;flex:0 0 auto;\}/);
  assert.match(phone,/@media\(max-width:380px\)\{[\s\S]*\.evhub-btn\.eh-tl-btn\{width:44px;padding:0;gap:0;font-size:0;\}/);
  assert.match(html,/class="evhub-btn eh-tl-btn"[^>]*><i class="ti ti-timeline"><\/i> Timeline<\/button>/,'the word stays in the button');
});
