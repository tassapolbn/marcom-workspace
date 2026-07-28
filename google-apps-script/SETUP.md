# Google Calendar sync — setup (about 5 minutes)

Do this once for **your own** Google account. Khun O (and anyone else) repeats
the same steps later with their own account, so each person's tasks go to their
own calendar. Nothing is shared between accounts.

## Step 1 — Create the script

1. Open **script.google.com** and sign in with your school Google account.
2. Click **New project** (top left).
3. Select everything in the code box and delete it.
4. Open the file `marcom-calendar-sync.gs` from this folder, copy the whole
   contents, and paste it into the empty code box.

## Step 2 — Set your secret phrase

Near the top of the pasted code, find this line:

    var SECRET = 'change-me-please';

Replace `change-me-please` with any private phrase, for example
`marcom-boss-2026-sunflower`. Write it down; you will paste it into the app in
Step 5. Press **Ctrl+S** to save.

Optional: to use a calendar other than your main one, put its calendar ID in
`CALENDAR_ID`. Leave it empty to use your default calendar.

## Step 3 — Deploy it as a Web app

1. Click **Deploy** (top right), then **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** MARCOM calendar sync
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone**
4. Click **Deploy**.

"Anyone" sounds alarming but is required for the app to reach it. The secret
phrase is what actually protects it: without the phrase, requests are refused.

## Step 4 — Approve the permissions

Google will ask you to authorise the script.

1. Click **Authorize access**, choose your account.
2. You will see "Google hasn't verified this app". This is expected, because
   the script is yours and private. Click **Advanced**, then
   **Go to (project name) (unsafe)**.
3. Click **Allow** so the script may manage your calendar.
4. Copy the **Web app URL** that appears. It looks like
   `https://script.google.com/macros/s/AKfy.../exec`

Quick check: paste that URL into a new browser tab. You should see
`{"ok":true,"service":"MARCOM calendar sync","ready":true}`.

## Step 5 — Connect it to the workspace

1. Open the MARCOM Workspace and click the **settings gear** in the header.
2. Scroll to **Google Calendar sync**.
3. Paste the Web app URL, then the secret phrase from Step 2.
4. Click **Test connection**. It should say "Connected to calendar: ...".
5. Tick **Ask me to create calendar events for new tasks**, then click **Save**.

## How it behaves from now on

- Create a task with a due date and press Save: a popup asks whether to add it
  to your calendar. Press Yes and the event is created immediately.
- Delete that task: the calendar event is removed with it. If you press Undo on
  the deletion, the event is put back.
- Tasks without a due date never trigger anything.
- A task with a time (photography shoots) becomes a timed event; everything else
  becomes an all-day event.

## Keeping it safe

- Treat the Web app URL like a key: anyone with the URL **and** the phrase can
  add or delete events in this calendar.
- To revoke access at any time: script.google.com, open the project,
  **Deploy > Manage deployments**, then archive the deployment. Sync stops
  immediately.
- To pause without revoking: untick the box in Settings.

## If something does not work

- "Could not connect": the URL is wrong, or the deployment access is not set to
  Anyone. Re-check Step 3.
- "unauthorised": the phrase in Settings does not match the `SECRET` line.
- Events created in the wrong calendar: set `CALENDAR_ID` in the script.
- After editing the script, always redeploy: **Deploy > Manage deployments >**
  pencil icon **> Version: New version > Deploy**. The URL stays the same.
