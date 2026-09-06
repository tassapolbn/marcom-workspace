/* Work-only snapshot. Filtering stays in the browser and never writes to Firebase. */
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
  // Export the pure predicate for dependency-free regression tests.
  if(typeof module==='object'&&module.exports){module.exports={matchesTask};return;}
  const data=document.getElementById('board-data');if(!data)return;
  const tasks=JSON.parse(data.textContent);
  const cards=Array.from(document.querySelectorAll('.card'));
  const rows=Array.from(document.querySelectorAll('[data-task-id]'));
  const controls=document.getElementById('board-controls');
  const query=document.getElementById('board-search');
  const member=document.getElementById('board-member');
  const status=document.getElementById('board-status');
  const due=document.getElementById('board-due');
  function filterBoard(){
    const filter={query:query.value.trim(),member:member.value,status:status.value,due:due.value};
    let shown=0;
    rows.forEach(row=>{const show=matchesTask(tasks[row.dataset.taskId],filter);row.hidden=!show;if(show)shown++;});
    const filtering=Object.values(filter).some(Boolean);
    document.querySelector('.grid').classList.toggle('member-filtered',Boolean(filter.member));
    cards.forEach(card=>{
      const own=Array.from(card.querySelectorAll('[data-task-id]'));
      const count=own.filter(row=>!row.hidden).length;
      card.hidden=filtering?count===0:false;
      card.querySelector('.cnt').textContent=filtering?count+' / '+own.length:own.length;
    });
    document.getElementById('board-results').textContent='Showing '+shown+' of '+rows.length+' ongoing tasks';
    document.getElementById('board-empty').hidden=shown!==0||!filtering;
    document.getElementById('board-reset').hidden=!filtering;
  }
  controls.addEventListener('input',filterBoard);
  controls.addEventListener('change',filterBoard);
  controls.addEventListener('submit',event=>event.preventDefault());
  document.getElementById('board-reset').addEventListener('click',()=>{
    query.value='';member.value='';status.value='';due.value='';filterBoard();query.focus();
  });
  document.getElementById('board-compact').addEventListener('change',event=>{
    document.body.classList.toggle('compact',event.target.checked);
  });
  const dialog=document.getElementById('dv');
  let returnFocus=null,previousOverflow='';
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function row(label,value){return value?'<div class="dv-row"><div class="dv-k">'+esc(label)+'</div><div class="dv-v">'+esc(value)+'</div></div>':'';}
  const labels={pending:'Pending','in-progress':'In progress',waiting:'Waiting','on-hold':'On hold'};
  root.showDetail=function(id){
    const task=tasks[id];if(!task)return;
    returnFocus=document.activeElement;previousOverflow=document.body.style.overflow;
    const pills=[labels[task.status]||'Pending',task.priority==='high'?'High priority':'',task.event].filter(Boolean)
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
    document.getElementById('dv-inner').innerHTML=html+'<div class="dv-note">Read only · updates are made in the workspace.</div></div>';
    dialog.querySelector('.dv-x').addEventListener('click',()=>dialog.close());
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
  filterBoard();
})(typeof window==='undefined'?globalThis:window);
