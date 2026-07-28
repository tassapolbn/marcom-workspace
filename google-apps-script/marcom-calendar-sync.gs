/**
 * MARCOM Workspace - Google Calendar sync
 * =======================================
 * Deploy this as a Web App from YOUR OWN Google account. It then creates and
 * deletes events in YOUR calendar on behalf of the MARCOM Workspace app.
 *
 * WHY THIS APPROACH
 * The Google Calendar API would require an OAuth consent screen and Google
 * verification. An Apps Script Web App runs as you, needs no API key, and can
 * be revoked at any time by deleting the deployment.
 *
 * SETUP (about 5 minutes, see SETUP.md for the click-by-click version)
 *  1. Go to script.google.com and create a new project.
 *  2. Delete the sample code and paste this whole file in.
 *  3. Set SECRET below to any private phrase of your choosing.
 *  4. Deploy > New deployment > type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *  5. Authorise when asked, then copy the Web app URL.
 *  6. In the MARCOM Workspace: Settings > Calendar sync, paste the URL and the
 *     same secret phrase.
 *
 * KEEP THE URL PRIVATE. Anyone holding both the URL and the secret can add or
 * remove events in this calendar.
 */

/* Any private phrase. It must match the one entered in the workspace app. */
var SECRET = 'change-me-please';

/* Leave blank to use your default calendar, or put a calendar ID here. */
var CALENDAR_ID = '';

function getCal_() {
  return CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID)
                     : CalendarApp.getDefaultCalendar();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function tag_(taskId) {
  return '[MARCOM-TASK:' + taskId + ']';
}

/* Finds an event by its id, or by the hidden tag in its description. */
function findEvent_(cal, body) {
  if (body.eventId) {
    try {
      var ev = cal.getEventById(body.eventId);
      if (ev) return ev;
    } catch (e) { /* fall through to the tag search */ }
  }
  if (!body.taskId) return null;
  var mid = body.date ? new Date(body.date + 'T12:00:00') : new Date();
  var from = new Date(mid.getTime() - 400 * 24 * 3600 * 1000);
  var to   = new Date(mid.getTime() + 400 * 24 * 3600 * 1000);
  var list = cal.getEvents(from, to);
  var needle = tag_(body.taskId);
  for (var i = 0; i < list.length; i++) {
    var d = '';
    try { d = list[i].getDescription() || ''; } catch (e) {}
    if (d.indexOf(needle) >= 0) return list[i];
  }
  return null;
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (SECRET && body.secret !== SECRET) {
      return json_({ ok: false, error: 'unauthorised' });
    }

    var cal = getCal_();
    if (!cal) return json_({ ok: false, error: 'calendar not found' });

    var action = body.action || '';

    if (action === 'ping') {
      return json_({ ok: true, calendar: cal.getName() });
    }

    if (action === 'create') {
      if (!body.date) return json_({ ok: false, error: 'no date' });
      var title = body.title || 'MARCOM task';
      var desc = [body.notes || '', tag_(body.taskId || '')].filter(String).join('\n\n');
      var opts = { description: desc, location: body.location || '' };
      var ev;
      if (body.startTime && body.endTime) {
        ev = cal.createEvent(title,
          new Date(body.date + 'T' + body.startTime + ':00'),
          new Date(body.date + 'T' + body.endTime + ':00'), opts);
      } else {
        ev = cal.createAllDayEvent(title, new Date(body.date + 'T00:00:00'), opts);
      }
      return json_({ ok: true, eventId: ev.getId(), calendar: cal.getName() });
    }

    if (action === 'update') {
      var found = findEvent_(cal, body);
      if (!found) return json_({ ok: false, error: 'not found' });
      if (body.title) found.setTitle(body.title);
      if (body.location !== undefined) found.setLocation(body.location || '');
      if (body.date) {
        if (body.startTime && body.endTime) {
          found.setTime(new Date(body.date + 'T' + body.startTime + ':00'),
                        new Date(body.date + 'T' + body.endTime + ':00'));
        } else {
          found.setAllDayDate(new Date(body.date + 'T00:00:00'));
        }
      }
      return json_({ ok: true, eventId: found.getId() });
    }

    if (action === 'delete') {
      var target = findEvent_(cal, body);
      if (!target) return json_({ ok: true, deleted: 0, note: 'nothing to delete' });
      target.deleteEvent();
      return json_({ ok: true, deleted: 1 });
    }

    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* Opening the URL in a browser shows this, which is a handy check that the
   deployment is live. It never exposes any calendar data. */
function doGet() {
  return json_({ ok: true, service: 'MARCOM calendar sync', ready: true });
}
