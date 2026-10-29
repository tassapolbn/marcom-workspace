/* Pure grouping and ordering for the shared Event Board. */
(function(root){
  'use strict';
  function finished(t){return t.status === 'done' || t.status === 'canceled';}
  /* A card's event: its label, or the name of the event picked for it (step 58),
     so a card made with the event picker alone never lands in "Other". */
  function labelOf(t){return t.eventLabel || t.eventName || '';}
  function compare(a, b){return a < b ? -1 : (a > b ? 1 : 0);}
  function due(a, b){
    if(!a || !b)return a ? -1 : (b ? 1 : 0);
    return compare(a, b);
  }
  function groups(tasks, opts){
    opts = opts || {};
    var byLabel = Object.create(null);
    var finishedCount = 0;
    function assigned(t){
      var people = typeof opts.assignees === 'function' ? opts.assignees(t) :
        (t.assignees && t.assignees.length ? t.assignees : t.owner);
      return Array.isArray(people) ? people.some(Boolean) : !!people;
    }
    (tasks || []).forEach(function(t){
      if(opts.filter && labelOf(t) !== opts.filter)return;
      var label = labelOf(t) || 'Other';
      var group = byLabel[label] || (byLabel[label] = {
        label:label, tasks:[], open:0, done:0, unassigned:0, nextDue:''
      });
      if(finished(t)){
        group.done++;
        finishedCount++;
      }else{
        group.open++;
        if(!assigned(t))group.unassigned++;
        if(t.dueDate && (!group.nextDue || t.dueDate < group.nextDue))group.nextDue = t.dueDate;
      }
      if(opts.showDone || !finished(t))group.tasks.push(t);
    });
    var result = Object.keys(byLabel).map(function(label){return byLabel[label];}).filter(function(group){
      return opts.showDone || group.open > 0;
    });
    result.forEach(function(group){
      group.tasks.sort(function(a, b){
        return due(a.dueDate, b.dueDate) ||
          compare(a.title || a.topic || '', b.title || b.topic || '');
      });
    });
    result.sort(function(a, b){return due(a.nextDue, b.nextDue) || compare(a.label, b.label);});
    return {groups:result, finishedCount:finishedCount};
  }
  root.MarcomEventBoard = {groups:groups, labelOf:labelOf};
})(window);
