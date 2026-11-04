/* Pure row values for each member's Google Sheet tab. */
(function(root){
  'use strict';
  var TABS = {boss:'Boss', dew:'Dew', o:'O', junior:'Eye'};
  var words = {
    boss:['Not started', 'In progress', 'Waiting for approval', 'On hold', 'Completed', 'Canceled'],
    junior:['Not started', 'In progress', 'Waiting for approval', 'On hold', 'Completed', 'Canceled'],
    o:['Not started', 'In progress', 'Blocked', 'Blocked', 'Completed', 'CANCELLED'],
    dew:['Ready to do!', 'In progress', 'Waiting for response', ' Hold', 'Completed', 'Cancel']
  };
  var statuses = ['pending', 'in-progress', 'waiting', 'on-hold', 'done', 'canceled'];
  /* O's Notes menu word for "mail sent" (Thai), written as escapes so it
     survives any file encoding. */
  var MAIL_SENT = '\u0E2A\u0E48\u0E07\u0E40\u0E21\u0E25\u0E41\u0E25\u0E49\u0E27';
  var stages = {
    'Waiting for Brief':'Information needed', 'Brief Received':'Ready to do!',
    'In Progress':'In progress', 'Review':'Waiting for response',
    'Revision Required':'Edit', 'Approved':'File Prepared ', 'Delivered':'Completed'
  };
  function has(obj, key){return Object.prototype.hasOwnProperty.call(obj, key);}
  function validMember(member){return typeof member === 'string' && has(TABS, member);}
  function text(value){return value === null || value === undefined ? '' : String(value).trim();}
  function date(value){
    var valueText = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? {date:valueText} : '';
  }
  /* Same rule as cleanHeading_ in the Apps Script (a test keeps them equal). */
  function cleanHeading(value){return String(value).toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ').trim();}
  function memberFor(task, who){
    task = task || {};
    var member = Array.isArray(task.assignees) && task.assignees.length ? task.assignees[0] :
      (task.__src === 'event' ? task.owner : who);
    return validMember(member) ? member : '';
  }
  function statusWord(task, member){
    if(!validMember(member))return '';
    task = task || {};
    var status = text(task.status) || (task.done === true ? 'done' : 'pending');
    var index = statuses.indexOf(status);
    if(index < 0)index = 0;
    var stage = text(task.dzStatus);
    /* These menu labels deliberately keep their leading or trailing space. */
    if(member === 'dew' && index < 3 && has(stages, stage))return stages[stage];
    return words[member][index];
  }
  function cancelWord(member){return validMember(member) ? words[member][5] : '';}
  function rowFor(task, who, member){
    task = task || {};
    if(member === undefined)member = memberFor(task, who);
    if(!validMember(member))return null;
    var title = text(task.topic) || text(task.title);
    var event = text(task.eventLabel) || text(task.eventName) || text(task.mdEvent) || text(task.dzBrand);
    var description = text(task.description), notes = text(task.notes);
    var notesText = [description, notes].filter(function(value){return value !== '';}).join('\n\n');
    var assignedBy = text(task.assignedBy), status = statusWord(task, member);
    var dueDate = date(task.dueDate), values;
    if(member === 'boss'){
      values = {event:event, task:title, status:status, 'due date':dueDate, 'assigned by':assignedBy, note:notesText};
    }else if(member === 'junior'){
      values = {event:event, task:title, status:status, 'event owner':assignedBy, 'due date':dueDate, notes:notesText};
    }else if(member === 'dew'){
      var priority = text(task.priority);
      values = {
        'assigned by':assignedBy || text(task.dzRequestor), task:title,
        priority:priority === 'high' ? 'High' : (priority === 'low' ? 'Low' : 'Medium'),
        'due date':dueDate, status:status, 'details provided':description, 'additional details':notes
      };
    }else{
      var start = text(task.mdStart), end = text(task.mdEnd), media = text(task.mdCategory);
      values = {
        task:title, time:start ? start + (end ? ' - ' + end : '') : '',
        'assigned by':assignedBy, status:status, date:date(task.mdTaken), 'due date':dueDate,
        'photo file location':text(task.mdLocation), 'file location':text(task.mdFile),
        notes:task.mdMailSent === true ? MAIL_SENT : '',
        media:media === 'Photos' ? 'Photo' : (media === 'Videos' ? 'Video' : (media === 'Both' ? 'Photo&VDO' : '')),
        'upload date':date(task.mdUpload), 'watermark deleting date':date(task.mdWatermark)
      };
    }
    return {member:member, tab:TABS[member], values:values};
  }
  function forAppend(values){
    var result = {};
    Object.keys(values).forEach(function(key){if(values[key] !== '')result[key] = values[key];});
    return result;
  }
  function changes(before, after, member){
    if(!validMember(member))return {};
    var oldValues = rowFor(before, '', member).values;
    var newValues = rowFor(after, '', member).values, result = {};
    Object.keys(newValues).forEach(function(key){
      if(JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))result[key] = newValues[key];
    });
    return result;
  }
  root.MarcomSheet = {TABS:TABS, cleanHeading:cleanHeading, memberFor:memberFor, statusWord:statusWord,
    cancelWord:cancelWord, rowFor:rowFor, forAppend:forAppend, changes:changes};
  if (typeof module === 'object' && module && module.exports) module.exports = root.MarcomSheet;
})(typeof window !== 'undefined' ? window : globalThis);
