/* Work-only snapshot. Filtering stays in the browser and never writes to Firebase.
   The one thing this page does write is a Director request, and that goes to the
   board-action function, which re-checks the share token and only ever adds a
   request record. It never edits the task itself. */
(function(root){
  'use strict';
  function matchesTask(task,filter){
    const text=[task.topic,task.who,task.category,task.event,task.description].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!filter.query||text.includes(filter.query.toLocaleLowerCase()))
      &&(!filter.member||(task.members||[]).includes(filter.member))
      &&(!filter.status||task.status===filter.status)
      &&(!filter.due||(filter.due==='overdue'?task.daysLeft!==null&&task.daysLeft<0
        :filter.due==='today'?task.daysLeft===0
        :filter.due==='week'?task.daysLeft!==null&&task.daysLeft>=0&&task.daysLeft<=7
        :task.daysLeft===null));
  }
  /* What the browser must supply before the server will accept an action.
     The server checks all of this again; this copy only saves a round trip. */
  function actionProblem(action,form){
    if(!form.from)return 'Please add your name so the team knows who is asking.';
    if(!action)return 'Please choose what you need.';
    if(action.input==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(form.value||''))return 'Please choose a valid date.';
    if(action.input==='text'&&!String(form.value||'').trim())return 'Please fill in '+String(action.inputLabel||'the missing field').toLowerCase()+'.';
    if(action.id==='comment'&&!String(form.note||'').trim())return 'Please write your comment.';
    return '';
  }
  // Export the pure predicates for dependency-free regression tests.
  if(typeof module==='object'&&module.exports){module.exports={matchesTask,actionProblem};return;}
  const data=document.getElementById('board-data');if(!data)return;
  const tasks=JSON.parse(data.textContent);
  const configEl=document.getElementById('board-config');
  const config=configEl?JSON.parse(configEl.textContent):{actions:[],token:'',endpoint:'/.netlify/functions/board-action'};
  const actions=Array.isArray(config.actions)?config.actions:[];
  const rows=Array.from(document.querySelectorAll('[data-task-id]'));
  const controls=document.getElementById('board-controls');
  const query=document.getElementById('board-search');
  const member=document.getElementById('board-member');
  const due=document.getElementById('board-due');
  const grids={status:document.getElementById('grid-status'),member:document.getElementById('grid-member')};
  const statusChips=Array.from(document.querySelectorAll('.schip'));
  const groupButtons=Array.from(document.querySelectorAll('[data-group-mode]'));
  const GROUP_KEY='hs-board-group',NAME_KEY='hs-board-viewer-name';
  const state={status:'',group:'status'};
  function savedName(){try{return localStorage.getItem(NAME_KEY)||'';}catch(_){return '';}}
  function rememberName(value){try{localStorage.setItem(NAME_KEY,value);}catch(_){/* private window: the name is simply retyped next time */}}
  function remember(key,value){try{localStorage.setItem(key,value);}catch(_){/* private window: the choice simply lasts this visit */}}

  /* Both groupings share one set of rendered cards. Regrouping moves the same
     buttons into another list, so a task is never drawn twice and the request
     panel painted onto a card survives the move. */
  function applyGrouping(mode){
    /* Only the two known groupings are accepted: a stale or edited saved value
       must fall back to the default, never name something that is not a grid. */
    state.group=mode==='member'?'member':'status';
    rows.forEach(row=>{
      const list=state.group==='status'
        ?grids.status.querySelector('[data-status-list="'+row.dataset.status+'"]')
        :grids.member.querySelector('[data-member-list="'+row.dataset.group+'"]');
      if(list&&row.parentNode!==list)list.insertBefore(row,list.querySelector('.empty'));
    });
    grids.status.hidden=state.group!=='status';
    grids.member.hidden=state.group==='status';
    groupButtons.forEach(button=>{
      const on=button.dataset.groupMode===state.group;
      button.classList.toggle('is-on',on);
      button.setAttribute('aria-pressed',String(on));
    });
    remember(GROUP_KEY,state.group);
  }

  function filterBoard(){
    const filter={query:query.value.trim(),member:member.value,status:state.status,due:due.value};
    let shown=0;
    rows.forEach(row=>{const show=matchesTask(tasks[row.dataset.taskId],filter);row.hidden=!show;if(show)shown++;});
    const filtering=Object.values(filter).some(Boolean);
    const grid=grids[state.group];
    let visibleCards=0;
    Array.from(grid.querySelectorAll('.card')).forEach(card=>{
      const own=Array.from(card.querySelectorAll('[data-task-id]'));
      const count=own.filter(row=>!row.hidden).length;
      card.hidden=filtering&&count===0;
      if(!card.hidden)visibleCards++;
      const empty=card.querySelector('.empty');if(empty)empty.hidden=count>0;
      card.querySelector('.cnt').textContent=filtering?count+' / '+own.length:own.length;
    });
    /* One group left on screen reads better across the page than in a column. */
    grid.classList.toggle('solo',visibleCards===1);
    document.getElementById('board-results').textContent='Showing '+shown+' of '+rows.length+' ongoing tasks';
    document.getElementById('board-empty').hidden=shown!==0||!filtering;
    document.getElementById('board-reset').hidden=!filtering;
  }
  function selectStatus(value){
    state.status=value;
    statusChips.forEach(chip=>{
      const on=(chip.dataset.status||'')===value;
      chip.classList.toggle('is-on',on);
      chip.setAttribute('aria-pressed',String(on));
    });
    filterBoard();
  }
  statusChips.forEach(chip=>chip.addEventListener('click',()=>selectStatus(chip.dataset.status||'')));
  groupButtons.forEach(button=>button.addEventListener('click',()=>{applyGrouping(button.dataset.groupMode);filterBoard();}));
  controls.addEventListener('input',filterBoard);
  controls.addEventListener('change',filterBoard);
  controls.addEventListener('submit',event=>event.preventDefault());
  document.getElementById('board-reset').addEventListener('click',()=>{
    query.value='';member.value='';due.value='';selectStatus('');query.focus();
  });
  const density=document.getElementById('board-compact');
  try{density.checked=localStorage.getItem('hs-board-compact')!=='false';}catch(_){}
  document.body.classList.toggle('compact',density.checked);
  density.addEventListener('change',event=>{
    document.body.classList.toggle('compact',event.target.checked);
    remember('hs-board-compact',String(event.target.checked));
  });
  /* The sticky toolbar only earns its shadow once it is actually pinned. */
  const toolbar=document.getElementById('board-toolbar');
  if(toolbar&&typeof IntersectionObserver==='function'){
    const sentinel=document.createElement('div');
    toolbar.parentNode.insertBefore(sentinel,toolbar);
    new IntersectionObserver(entries=>toolbar.classList.toggle('stuck',!entries[0].isIntersecting),{threshold:1}).observe(sentinel);
  }
  const dialog=document.getElementById('dv');
  let returnFocus=null,previousOverflow='';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function row(label,value){return value?'<div class="dv-row"><div class="dv-k">'+esc(label)+'</div><div class="dv-v">'+esc(value)+'</div></div>':'';}
  const labels={pending:'Pending','in-progress':'In progress',waiting:'Waiting','on-hold':'On hold'};
  /* The same four glyphs the cards use, so the dialog states the status in the
     same language as the board behind it. */
  const glyphs={
    'in-progress':'<circle cx="12" cy="12" r="9"/><path d="M9.2 12h5.6"/><path d="m12.4 9.6 2.4 2.4-2.4 2.4"/>',
    waiting:'<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.1 1.9"/>',
    pending:'<circle cx="12" cy="12" r="9"/><path d="M8.4 12h7.2"/>',
    'on-hold':'<circle cx="12" cy="12" r="9"/><path d="M10.2 9.2v5.6"/><path d="M13.8 9.2v5.6"/>'
  };
  function statusChip(key){
    const safe=glyphs[key]?key:'pending';
    return '<span class="dv-status s-'+safe+'"><svg class="sico" viewBox="0 0 24 24" width="14" height="14" fill="none"'
      +' stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +glyphs[safe]+'</svg>'+esc(labels[safe])+'</span>';
  }
  /* Keep the card in step with a request that was just sent, so the board does
     not have to be reloaded to see it. */
  function paintRequestPill(id){
    const task=tasks[id],element=document.querySelector('[data-task-id="'+id+'"]');
    if(!task||!element)return;
    const count=(task.requests||[]).length;
    element.classList.toggle('rq',count>0);
    const flags=element.querySelector('.t-flags');if(!flags)return;
    let pill=flags.querySelector('.pill.req');
    if(!count){if(pill)pill.remove();return;}
    if(!pill){pill=document.createElement('span');pill.className='pill req';flags.appendChild(pill);}
    pill.textContent=count===1?'1 request sent':count+' requests sent';
    const stat=document.querySelector('.stat.req .n');
    if(stat)stat.textContent=String(Object.keys(tasks).reduce((sum,key)=>sum+((tasks[key].requests||[]).length),0));
  }
  function requestsHTML(task){
    const list=task.requests||[];
    if(!list.length)return '';
    return '<div class="dv-req"><div class="dv-req-h">Open requests on this task ('+list.length+')</div>'
      +list.map(item=>'<div class="dv-req-i"><b>'+esc(item.sentence)+'</b>'
        +'<span>'+esc([item.from,item.when].filter(Boolean).join(' · '))+'</span>'
        +(item.note?'<p>'+esc(item.note)+'</p>':'')+'</div>').join('')
      +'<p class="dv-req-n">The owner clears each request in the workspace once it is handled.</p></div>';
  }
  function actionFormHTML(){
    if(!actions.length)return '';
    const options=actions.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.label)+(a.input?'…':'')+'</option>').join('');
    return '<form class="dv-act" id="dv-act" novalidate>'
      +'<div class="dv-act-h">Ask the owner for something</div>'
      +'<label class="dv-f"><span>Your name</span><input id="act-from" type="text" maxlength="60" autocomplete="name" placeholder="For example Khun Miki" value="'+esc(savedName())+'" required></label>'
      +'<label class="dv-f"><span>What do you need?</span><select id="act-action">'+options+'</select></label>'
      +'<label class="dv-f" id="act-extra-wrap" hidden><span id="act-extra-label"></span><input id="act-extra" type="text" maxlength="120"></label>'
      +'<label class="dv-f"><span>Message to the owner (optional)</span><textarea id="act-note" rows="2" maxlength="600" placeholder="Add any detail that helps"></textarea></label>'
      +'<div class="dv-act-row"><button type="submit" class="act-send" id="act-send">Send request</button>'
      +'<span class="act-msg" id="act-msg" role="status" aria-live="polite"></span></div>'
      +'<p class="dv-act-n">This does not change the task. The owner and the MARCOM Manager are notified and apply it.</p>'
      +'</form>';
  }
  function wireActionForm(id){
    const form=document.getElementById('dv-act');if(!form)return;
    const select=document.getElementById('act-action');
    const wrap=document.getElementById('act-extra-wrap');
    const label=document.getElementById('act-extra-label');
    const extra=document.getElementById('act-extra');
    const note=document.getElementById('act-note');
    const from=document.getElementById('act-from');
    const send=document.getElementById('act-send');
    const message=document.getElementById('act-msg');
    const current=()=>actions.filter(a=>a.id===select.value)[0]||null;
    function syncExtra(){
      const action=current();
      const needs=Boolean(action&&action.input);
      wrap.hidden=!needs;
      if(!needs){extra.value='';return;}
      label.textContent=action.inputLabel||'Detail';
      extra.type=action.input==='date'?'date':'text';
      extra.placeholder=action.input==='date'?'':(action.placeholder||'');
      if(action.input==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(extra.value))extra.value='';
    }
    function say(text,bad){message.textContent=text||'';message.classList.toggle('bad',Boolean(bad));}
    select.addEventListener('change',()=>{syncExtra();say('');});
    syncExtra();
    form.addEventListener('submit',function(event){
      event.preventDefault();
      const action=current();
      const payload={token:config.token,coll:tasks[id].coll,docId:tasks[id].docId,
        action:action?action.id:'',value:extra.value,note:note.value.trim(),from:from.value.trim()};
      const problem=actionProblem(action,payload);
      if(problem){say(problem,true);return;}
      rememberName(payload.from);
      send.disabled=true;say('Sending…',false);
      fetch(config.endpoint||'/.netlify/functions/board-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .then(response=>response.json().then(body=>({ok:response.ok,body:body||{}})))
        .then(result=>{
          if(!result.ok||!result.body.ok){send.disabled=false;say(result.body.error||'The request could not be sent.',true);return;}
          (tasks[id].requests=tasks[id].requests||[]).push({sentence:result.body.sentence,from:payload.from,note:payload.note,when:'just now'});
          paintRequestPill(id);
          form.innerHTML='<div class="dv-act-ok"><b>Request sent.</b> '+esc(result.body.sentence)
            +'<span>'+esc(tasks[id].who)+' and the MARCOM Manager have been notified.</span></div>';
        })
        .catch(()=>{send.disabled=false;say('No connection. Please check your network and try again.',true);});
    });
  }
  root.showDetail=function(id){
    const task=tasks[id];if(!task)return;
    returnFocus=document.activeElement;previousOverflow=document.body.style.overflow;
    const pills=statusChip(task.status)
      +[task.priority==='high'?'High priority':'',task.due?'Due '+task.due:'No deadline',task.event].filter(Boolean)
        .map(label=>'<span class="pill" style="background:#ffffff24;color:white">'+esc(label)+'</span>').join('');
    let html='<div class="dv-hd"><button type="button" class="dv-x" aria-label="Close task details" autofocus>&times;</button><div class="who">'+esc(task.who)+'</div><h3 id="dv-title">'+esc(task.topic)+'</h3><div class="dv-pills">'+pills+'</div></div><div class="dv-body">';
    const fields=[['Due date',task.due||'No deadline'],['Category',task.category],['Description',task.description||'No description added.'],['Assigned by',task.assignedBy],['Assigned',task.assignedDate],['Shoot event',task.shootEvent],['Shoot date',task.shootDate],['Shoot time',task.shootTime],['Location',task.shootLocation],['Design type',task.designType],['Brand',task.designBrand],['Design status',task.designStatus],['Revisions',task.revisions]];
    html+=fields.map(field=>row(...field)).join('');
    if(task.links&&task.links.length){
      html+='<div class="dv-links">';
      task.links.forEach(link=>{
        const raw=String(link.url||'').trim();
        try{
          const url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw);
          if(!['http:','https:'].includes(url.protocol))return;
          html+='<a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">'+esc(link.title||raw)+' ↗</a>';
        }catch(_){/* Skip malformed URLs without breaking the detail view. */}
      });
      html+='</div>';
    }
    html+=requestsHTML(task);
    /* A request needs the record it belongs to. Without one the task is still
       readable, it simply cannot be actioned. */
    html+=(task.coll&&task.docId)?actionFormHTML()
      :'<div class="dv-note">Task details are read only. Requests are unavailable for this card.</div>';
    document.getElementById('dv-inner').innerHTML=html+'</div>';
    dialog.querySelector('.dv-x').addEventListener('click',()=>dialog.close());
    wireActionForm(id);
    dialog.showModal();document.body.style.overflow='hidden';dialog.scrollTop=0;
  };
  dialog.addEventListener('click',event=>{
    const bounds=dialog.getBoundingClientRect();
    if(event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))dialog.close();
  });
  dialog.addEventListener('close',()=>{
    document.body.style.overflow=previousOverflow;
    if(returnFocus&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});
  });
  let savedGroup='status';
  try{savedGroup=localStorage.getItem(GROUP_KEY)||'status';}catch(_){}
  applyGrouping(savedGroup);
  filterBoard();
})(typeof window==='undefined'?globalThis:window);
