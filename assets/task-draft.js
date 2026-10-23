/* Keep unfinished new tasks in this browser, separately for each member. */
(function(root){
  'use strict';
  var prefix = 'marcom_task_draft_v1_';
  var timer = null;
  var pending = null;
  var banner = null;
  var meaningful = ['m-topic','m-desc','m-notes','m-attach','m-assignedby',
    'm-evt-label','m-md-event','m-md-location','m-md-file',
    'm-dz-type','m-dz-requestor','m-dz-brand','m-dz-file'];
  var times = ['m-md-start','m-md-end','m-dz-start','m-dz-end'];

  function remove(who){
    try{root.localStorage.removeItem(prefix + who);}catch(error){}
  }
  function read(who){
    try{
      var draft = JSON.parse(root.localStorage.getItem(prefix + who));
      return draft && draft.v === 1 && draft.who === who &&
        typeof draft.savedAt === 'number' && isFinite(draft.savedAt) &&
        draft.fields && typeof draft.fields === 'object' &&
        Array.isArray(draft.people) && Array.isArray(draft.links) ? draft : null;
    }catch(error){return null;}
  }
  function copyLinks(links){
    return Array.isArray(links) ? links.filter(function(link){return !!link;}).map(function(link){
      return {title:link.title, url:link.url};
    }) : [];
  }
  function hasText(value){return typeof value === 'string' && value.trim() !== '';}
  function save(state){
    if(typeof modalState === 'undefined' || modalState !== state ||
       !state || state.editId || root.__sopBatch)return;
    var body = document.getElementById('modal-body');
    if(!body)return;
    var fields = {};
    Array.prototype.forEach.call(body.querySelectorAll('input, textarea, select'), function(field){
      if(field.id && field.id.indexOf('m-') === 0){
        fields[field.id] = field.type === 'checkbox' ? field.checked : field.value;
      }
    });
    var links = copyLinks(typeof modalLinks !== 'undefined' ? modalLinks : []);
    if(!meaningful.some(function(id){return hasText(fields[id]);}) &&
       !links.some(function(link){return hasText(link.url);})){remove(state.who);return;}
    var people = typeof evtPeopleGet === 'function' ? evtPeopleGet() : [];
    var draft = {v:1, who:state.who, savedAt:Date.now(), taskType:state.taskType,
      fields:fields, people:Array.isArray(people) ? people.slice() : [], links:links};
    try{root.localStorage.setItem(prefix + state.who, JSON.stringify(draft));}catch(error){}
  }
  function cancel(){
    if(timer !== null)root.clearTimeout(timer);
    timer = null;
    pending = null;
  }
  function flush(){
    var state = pending;
    cancel();
    if(state)save(state);
  }
  function schedule(event){
    var modal = document.getElementById('modal');
    if(!modal || !modal.classList.contains('open') || !event.target ||
       !modal.contains(event.target) || typeof modalState === 'undefined' ||
       !modalState || modalState.editId || root.__sopBatch)return;
    cancel();
    pending = modalState;
    timer = root.setTimeout(flush, 400);
  }
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  root.addEventListener('pagehide', flush);

  function hideOffer(){
    if(banner && banner.parentNode)banner.parentNode.removeChild(banner);
    banner = null;
  }
  function clear(who){
    cancel();
    /* SOP saves share the new-task hook but must leave regular drafts alone. */
    if(!root.__sopBatch)remove(who);
    hideOffer();
  }
  function restore(draft){
    if(!draft || typeof modalState === 'undefined' || !modalState ||
       modalState.editId || root.__sopBatch || draft.who !== modalState.who)return;
    cancel();
    if(draft.taskType && typeof setTaskType === 'function')setTaskType(draft.taskType);
    Object.keys(draft.fields || {}).forEach(function(id){
      if(id.indexOf('m-') !== 0)return;
      var field = document.getElementById(id);
      if(!field)return;
      if(times.indexOf(id) !== -1 && typeof t24Set === 'function')t24Set(id, draft.fields[id]);
      else if(field.type === 'checkbox')field.checked = !!draft.fields[id];
      else field.value = draft.fields[id];
    });
    if(typeof evtToggle === 'function')evtToggle();
    if(typeof evtPeopleSet === 'function')evtPeopleSet(draft.people || []);
    if(typeof modalLinks !== 'undefined')modalLinks = copyLinks(draft.links);
    if(typeof renderModalLinks === 'function')renderModalLinks();
    if(typeof autoGrowDesc === 'function')autoGrowDesc();
    hideOffer();
    if(typeof root.MarcomDialogs !== 'undefined' && root.MarcomDialogs &&
       typeof root.MarcomDialogs.markDirty === 'function'){
      root.MarcomDialogs.markDirty(document.getElementById('modal'));
    }
  }
  function offer(who){
    hideOffer();
    if(typeof modalState === 'undefined' || !modalState || modalState.editId || root.__sopBatch)return;
    var draft = read(who);
    if(!draft)return;
    if(Date.now() - draft.savedAt >= 7 * 24 * 60 * 60 * 1000){remove(who);return;}
    var body = document.getElementById('modal-body');
    if(!body)return;
    var saved = new Date(draft.savedAt);
    var today = new Date();
    var time = saved.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', hour12:false});
    var stamp = saved.toDateString() === today.toDateString() ? time :
      saved.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) + ', ' + time;
    banner = document.createElement('div');
    banner.className = 'task-draft-banner';
    banner.setAttribute('role', 'status');
    var icon = document.createElement('i');
    icon.className = 'ti ti-history';
    icon.setAttribute('aria-hidden', 'true');
    banner.appendChild(icon);
    var message = document.createElement('span');
    message.textContent = 'You have an unsaved task from ' + stamp + '.';
    banner.appendChild(message);
    var restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'btn btn-navy btn-sm';
    restoreButton.textContent = 'Restore';
    restoreButton.addEventListener('click', function(){restore(draft);});
    banner.appendChild(restoreButton);
    var discardButton = document.createElement('button');
    discardButton.type = 'button';
    discardButton.className = 'btn btn-ghost btn-sm';
    discardButton.textContent = 'Discard';
    discardButton.addEventListener('click', function(){clear(who);});
    banner.appendChild(discardButton);
    body.insertBefore(banner, body.firstChild);
  }
  root.MarcomDraft = {offer:offer, hideOffer:hideOffer, restore:restore, clear:clear, read:read, flush:flush};
})(window);
