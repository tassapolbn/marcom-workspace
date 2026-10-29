import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/workspace-ui.css','utf8').split('/* Step 74:')[1].split('/* Step 75:')[0];
test('step 74 uses flat header, logo, avatars and floating actions in both themes',()=>{
  assert.match(css,/html body \.app-header\{background:#003057!important;[^}]*box-shadow:none!important/);
  assert.match(css,/\.app-header::after\{content:none!important;display:none!important;background:none!important/);
  assert.match(css,/\.logo-icon\{background:#f0b323!important;box-shadow:none!important/);
  assert.match(css,/\.member-avatar\{box-shadow:none!important;filter:none!important/);
  assert.match(css,/#quickadd-fab,html body #tc-fab\{background:#003057!important/);
  assert.doesNotMatch(css,/gradient\(/);
});
test('step 74 shares the sidebar surface and exposes handles on touch and keyboard focus',()=>{
  assert.match(css,/\.two-col>\.side-col\{background:var\(--surface\);[^}]*gap:0/);
  assert.match(css,/\.widget:hover\{background:transparent!important;[^}]*border-top:1px solid var\(--border\)!important;[^}]*box-shadow:none!important/);
  assert.match(css,/\.uxp-wh-drag\{display:inline-flex;opacity:1;touch-action:none/);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/\.widget-head:focus-within \.uxp-wh-drag\{opacity:1/);
  assert.match(css,/\.widget-head>button:not\(\.uxp-wh-drag\)\{display:none/);
  assert.match(css,/\.widget-head>\.btn:last-of-type\{display:inline-flex/);
  assert.match(css,/html.dark body[^}]*\.widget-head \.btn,[\s\S]*?background:transparent!important;color:#bdc7d5!important;border:1px solid #bdc7d5!important/);
});
test('touch reorder moves and saves a row, restores focus and cancels cleanly',()=>{
  const handlers={}, classes=new Set(); let captured=false,saved=0,focused=0,cleared=0,moved;
  const col={insertBefore:(a,b)=>{moved=[a,b];}};
  const wd={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  const row={parentNode:col,nextSibling:{},getBoundingClientRect:()=>({top:100,height:60}),classList:{add(){}}};
  const h={addEventListener:(n,f)=>handlers[n]=f,setPointerCapture:()=>captured=true,hasPointerCapture:()=>captured,releasePointerCapture:()=>captured=false,focus:()=>focused++};
  const start=html.indexOf('      var touchTarget=null,touchAbove=false;');
  vm.runInNewContext(html.slice(start,html.indexOf('      head.insertBefore(h,head.firstChild);',start)),{h,wd,col,document:{elementFromPoint:()=>({closest:()=>row})},clearMarks:()=>cleared++,saveOrder:()=>saved++});
  const e={pointerType:'touch',pointerId:1,clientX:20,clientY:110,preventDefault(){}};
  handlers.pointerdown(e); assert.ok(captured); assert.ok(classes.has('uxp-dragging'));
  handlers.pointermove(e); handlers.pointerup(e);
  assert.deepEqual(moved,[wd,row]); assert.equal(saved,1);assert.equal(focused,1);assert.ok(!classes.size);assert.ok(!captured);
  handlers.pointerdown(e);handlers.pointermove(e);handlers.pointercancel(e);assert.ok(!classes.size);assert.ok(cleared>=3);assert.equal(saved,1);
});
test('original inline style layers cannot restore header, logo or round-button gradients and glows',()=>{
  const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for(const target of ['.app-header','.app-header::after','.logo-icon','.quickadd-fab','.chat-fab','#quickadd-fab','#tc-fab','.member-avatar']){
    const matching=rules.filter(([,selectors])=>selectors.split(',').some(s=>s.trim().endsWith(target)||s.trim().endsWith(target+':hover')));
    if(target.startsWith('.')) assert.ok(matching.length,`source rules found for ${target}`);
    for(const [,selector,body] of matching){
      assert.doesNotMatch(body,/(?:radial|linear|conic)-gradient\(|var\(--grad-header\)/,selector);
      if(!target.includes('fab')) assert.doesNotMatch(body,/box-shadow\s*:\s*(?!none\b)[^;]+/,selector);
      if(target.endsWith('::after')){
        assert.match(body,/content\s*:\s*none/,selector);
        assert.match(body,/display\s*:\s*none/,selector);
      }
    }
  }
});
test('folded Petty Cash hides the nested settings action and keeps Add expense',()=>{
  const head=html.slice(html.indexOf('<div class="widget pc-widget">'),html.indexOf('<div class="widget-body"><div id="pc-body">'));
  assert.match(head,/onclick="openPcExpense\(\)"/);
  assert.match(head,/onclick="openPcSettings\(\)"/);
  assert.match(css,/\.pc-widget\.collapsed \.widget-head button\[onclick="openPcSettings\(\)"\]\{display:none;\}/);
  assert.doesNotMatch(css,/\.pc-widget \.widget-head button\[onclick="openPcSettings\(\)"\]\{display:none/);
});
