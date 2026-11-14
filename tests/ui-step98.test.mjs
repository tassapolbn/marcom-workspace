import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/workspace-ui.css',import.meta.url),'utf8');
const step98=css.split('/* Step 98:')[1].split('/* Step ')[0];
const desktop=step98.split('@media(min-width:601px){')[1].split('@media')[0];
const phone=step98.split('@media(max-width:600px){')[1];
function rule(block,selector){
  const start=block.indexOf(selector+'{');
  assert.ok(start>=0,selector+' has a rule');
  return block.slice(start+selector.length+1,block.indexOf('}',start));
}
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a);
  return html.slice(a,b);
}

/* Exercise the real dock builder, click handler and minute callback with a
   local clock, so the date cannot silently depend on opening the Overview. */
function dock({expanded=false,lunchFirst=false}={}){
  const nodes=[];
  function node(){
    const classes=new Set();
    const el={children:[],parentNode:null,attributes:{},className:'',
      classList:{contains:c=>classes.has(c),add:c=>classes.add(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
      setAttribute(k,v){this.attributes[k]=v;},
      appendChild(child){
        if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(n=>n!==child);
        this.children.push(child);child.parentNode=this;return child;
      },
      insertAdjacentElement(where,child){
        assert.equal(where,'afterend');
        const parent=this.parentNode;
        parent.children.splice(parent.children.indexOf(this)+1,0,child);child.parentNode=parent;
      }};
    nodes.push(el);return el;
  }
  const body=node(),header=node(),salary=node();salary.id='salary-card';
  body.appendChild(header);body.appendChild(salary);
  if(lunchFirst){const lunch=node();lunch.id='lunch-banner';body.appendChild(lunch);}
  let clock='2026-11-13T23:59:30';
  class LocalDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}}
  const timers=[];
  const document={body,createElement:node,
    getElementById:id=>nodes.find(n=>n.id===id)||({
      'sal-days':{textContent:'17'},'sal-date':{textContent:'Mon, 30 November'}
    })[id]||null,
    querySelector:s=>s==='.app-header'?header:null};
  vm.runInNewContext(source('  function dockSalary(){','  /* iPhone (step 47)')+'dockSalary();',{
    document,window:{},esc:String,Date:LocalDate,
    localStorage:{getItem:()=>expanded?'0':'1',setItem(){}},
    setInterval:(callback,ms)=>timers.push({callback,ms})
  });
  return {body,header,salary,timers,get:document.getElementById,setClock(value){clock=value;}};
}

test('the date belongs to the shared payday row outside the salary details, even when lunch was built first',()=>{
  const d=dock({lunchFirst:true}),date=d.get('uxp-sal-today'),toggle=d.get('uxp-sal-toggle');
  assert.equal(date.className,'uxp-sal-today');
  assert.equal(date.textContent,'Friday, 13 November 2026');
  assert.equal(date.parentNode,toggle.parentNode);
  assert.equal(date.parentNode,d.get('lunch-banner').parentNode);
  assert.equal(date.parentNode.parentNode,d.salary.parentNode);
  assert.equal(d.body.children[0],d.header);
  assert.equal(d.body.children[1],d.get('uxp-salary-dock'));
  assert.match(rule(desktop,'.uxp-sal-today'),/order:1;flex-shrink:0;margin-left:auto;/,'the date stays at the right even if lunch is appended later');
});

test('the minute repaint crosses midnight with salary details open or closed, and clicks preserve the date',()=>{
  for(const expanded of [false,true]){
    const d=dock({expanded}),date=d.get('uxp-sal-today'),toggle=d.get('uxp-sal-toggle');
    assert.equal(d.timers.length,1);
    assert.equal(d.timers[0].ms,60000);
    assert.equal(toggle.attributes['aria-expanded'],String(expanded));
    d.setClock('2026-11-14T00:00:30');d.timers[0].callback();
    assert.equal(date.textContent,'Saturday, 14 November 2026');
    toggle.onclick();
    assert.equal(toggle.attributes['aria-expanded'],String(!expanded));
    assert.equal(date.textContent,'Saturday, 14 November 2026');
    d.setClock('2027-01-01T00:00:30');d.timers[0].callback();
    assert.equal(date.textContent,'Friday, 1 January 2027');
  }
});

test('the date is quiet desktop text and the obsolete Overview date and styles are removed',()=>{
  assert.match(rule(step98,'.uxp-sal-today'),/display:none;font-size:13px;font-weight:600;color:var\(--muted\);white-space:nowrap;/);
  assert.match(rule(desktop,'.uxp-sal-today'),/display:block;/);
  assert.doesNotMatch(html+css,/ov-datesub|ov-hello|ov-topbar/);
  const shell=source("  var SHELL=''",'  /* ---------- layout:');
  assert.match(shell,/'<\/div>'\s*\+'<section class="ov-team"/,'Team today immediately follows the announcement slot');
  assert.match(rule(css,'#ov-top'),/margin-bottom:var\(--sp-4,16px\)/);
  assert.match(rule(css,'#ov-top>#ov-ann-card'),/margin:0;/);
});

test('desktop uses an 8 + 40 + 8 top gap and a 56px page end, keeping the phone floating-control allowance',()=>{
  assert.match(rule(desktop,'.salary-dock'),/margin-top:8px;/);
  assert.match(rule(desktop,'.uxp-sal-bar'),/height:40px;flex-wrap:nowrap;align-items:center;margin:0;/);
  assert.match(rule(desktop,'.uxp-sal-toggle'),/height:40px;min-height:40px;/);
  assert.match(rule(desktop,'.tab-panel'),/padding-top:8px;padding-bottom:56px;/);
  assert.match(rule(desktop,'#panel-overview .ov-more'),/margin-bottom:0;/,'the last card adds no extra margin to the page end');
  assert.match(css,/\.tab-panel\{padding-bottom:calc\(160px \+ var\(--float-lift\)\);\}/);
  assert.doesNotMatch(phone,/padding-bottom|--float-lift|--dock-h/);
});

test('on iPhone the summary has no leading separator and refresh has its own 44px title-level cell',()=>{
  const shell=source("  var SHELL=''",'  /* ---------- layout:');
  assert.match(shell,/Team today<\/div><span class="ov-team-sum" id="team-sum">/,'the summary can take its own row');
  assert.match(html,/'<span class="ov-team-sep" aria-hidden="true">· <\/span>'\+total\+' open/);
  assert.match(rule(phone,'.ov-team-sep'),/display:none;/);
  assert.match(rule(phone,'.ov-team-head'),/display:grid;grid-template-columns:minmax\(0,1fr\) 44px;/);
  assert.match(rule(phone,'.ov-team-title'),/grid-column:1;grid-row:1;/);
  assert.match(rule(phone,'.ov-team-sum'),/grid-column:1\/-1;grid-row:2;white-space:normal;/);
  assert.match(rule(phone,'.ov-team-next'),/grid-column:1\/-1;grid-row:3;/,'a next meeting keeps its space');
  assert.match(rule(phone,'#panel-overview .ov-team-head>.ov-mini-btn'),/grid-column:2;grid-row:1;width:44px;height:44px;margin:0;/);
  assert.match(shell,/onclick="avlRefresh\(true\)" title="Refresh availability" aria-label="Refresh availability"/);
});
