/**
 * MARCOM Workspace - Chat photo upload to Google Drive
 * ====================================================
 * Deploy this as a Web App from a Google account that can add files to the
 * shared chat photos folder. The chat sends a photo here; this script saves it
 * into that folder, makes it viewable by link, and returns the links back.
 *
 * WHY THIS APPROACH
 * A Drive share link only lets people VIEW files in Drive; it does not let a web
 * app WRITE files. An Apps Script Web App runs as you, can save into your folder
 * with no API key and no Blaze plan, and can be switched off at any time by
 * deleting the deployment.
 *
 * SETUP (about 5 minutes, see PHOTO-SETUP.md for the click-by-click version)
 *  1. Go to script.google.com and create a new project.
 *  2. Delete the sample code and paste this whole file in.
 *  3. Set SECRET below to any private phrase of your choosing.
 *  4. FOLDER_ID is already set to the shared chat photos folder.
 *  5. Deploy > New deployment > type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *  6. Authorise when asked (it will request Drive access), then copy the Web
 *     app URL (it ends with /exec).
 *  7. In the MARCOM Workspace: Settings > Chat photo upload, paste the URL and
 *     the same secret phrase, then Save.
 *
 * NOTES
 *  - The account you deploy from must own the folder or have Editor access to
 *    it. Uploaded photos count against that account's Drive storage.
 *  - Each photo is shared "anyone with the link can view" so every member can
 *    see it in chat. If this account is on Google Workspace with restricted
 *    external sharing, link access may be limited to your organisation, which
 *    is fine as long as all members sign in with a school account.
 *  - KEEP THE URL PRIVATE. Anyone holding both the URL and the secret can add
 *    files to this folder.
 */

/* Any private phrase. It must match the one entered in the workspace Settings. */
var SECRET = 'CHANGE_ME';

/* The shared "chat photos" Drive folder (taken from the folder's share link). */
var FOLDER_ID = '1rHxba_qz3a3ZKYV7CZR1iT__OlBYEZRu';

/* Safety cap on the decoded image size (the app already compresses to ~1600px). */
var MAX_BYTES = 12 * 1024 * 1024; // 12 MB

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function folder_() {
  return FOLDER_ID ? DriveApp.getFolderById(FOLDER_ID) : DriveApp.getRootFolder();
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && body.secret !== SECRET) {
      return json_({ ok: false, error: 'unauthorised' });
    }
    var action = body.action || '';

    /* Handy check that the connection and the secret are correct. */
    if (action === 'ping') {
      return json_({ ok: true, folder: folder_().getName() });
    }

    /* Save one compressed photo and return links for it. */
    if (action === 'upload') {
      if (!body.dataBase64) return json_({ ok: false, error: 'no image data' });
      var bytes = Utilities.base64Decode(body.dataBase64);
      if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'image too large' });
      var mime = body.mimeType || 'image/jpeg';
      var name = (body.filename || ('photo-' + new Date().getTime() + '.jpg'))
                   .replace(/[^\w.\- ]+/g, '_').slice(0, 120);
      var blob = Utilities.newBlob(bytes, mime, name);
      var file = folder_().createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) { /* domain policy may restrict this; still uploaded */ }
      var id = file.getId();
      return json_({
        ok: true,
        fileId: id,
        // Embeddable thumbnail that renders inside the chat bubble.
        imageUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600',
        // Full Drive page (view + download) that the chat image links to.
        viewUrl: 'https://drive.google.com/file/d/' + id + '/view',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id
      });
    }

    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* Opening the URL in a browser shows this, a quick way to confirm it is live. */
function doGet() {
  return json_({ ok: true, service: 'MARCOM chat photo upload', ready: true });
}
