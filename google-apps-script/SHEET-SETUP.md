# Google Sheet link — setup

Do this once for the team's Google Sheet. Start with the test copy already set
in the script. The workspace connection described in Steps 6 and 7 will be
added in a later step; this script alone does not change the app.

## Step 1 — Which Google account to use

Use an account that can edit the **Boss**, **Dew**, **O** and **Eye** tabs.
The sheet's owner always can.

O's tab is protected. If you are not the owner, ask the owner to open the sheet
and choose **Data > Protect sheets and ranges > the O protection > Change
permissions**, then add your email.

The script writes as the account that deploys it. The sheet's edit history
will show that account.

## Step 2 — Create the script

1. Open **script.google.com** and sign in with the account from Step 1.
2. Click **New project** (top left).
3. Select everything in the code box and delete it.
4. Open `marcom-sheet-sync.gs` from this folder. Copy the whole file and paste
   it into the empty code box.
5. Give the project a name, such as **MARCOM sheet link**.

Use a separate project from the calendar script.

## Step 3 — Set your secret phrase

Near the top of the code, find:

    var SECRET = 'change-me-please';

Replace `change-me-please` with a long private phrase of your own. Keep it
somewhere safe; you will paste the same phrase into Settings in Step 6.
Do not leave it blank. The script refuses to work until the sample phrase is
replaced. Press **Ctrl+S** to save.

`SPREADSHEET_ID` already points to the test copy. Leave it as it is for now.

## Step 4 — Deploy as a Web app

1. Click **Deploy** (top right), then **New deployment**.
2. Click the gear beside "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** MARCOM sheet link
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone**
4. Click **Deploy**.

"Anyone" is needed so the workspace can reach the script without asking each
team member to sign in to Google. The secret phrase protects it: requests
without the matching phrase are refused.

## Step 5 — Approve the permissions

1. Click **Authorize access** and choose your account.
2. If you see "Google hasn't verified this app", click **Advanced**, then
   **Go to (project name) (unsafe)**. This is expected for your own private script.
3. Click **Allow**. It asks to see and edit your spreadsheets.
4. Copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy.../exec`.

Quick check: open the URL in a browser. You should see
`{"ok":true,"service":"MARCOM sheet link","ready":true}`.
This checks that the script is live. Step 6 checks access to the sheet.

## Step 6 — Connect it to the workspace

Once the Google Sheet link setting is available:

1. Open the workspace and click the **Settings gear**.
2. Find **Google Sheet link**. Only **Boss** can change this setting.
3. Paste the Web app URL and your secret phrase.
4. Click **Test connection**. It lists the four tabs, their headings, and
   whether the script can write there. Check all four.
5. Click **Save**.

## Step 7 — How it behaves

- A new card adds one row to its owner's tab: **Boss**, **Dew**, **O** or **Eye**
  (Junior). A card shared with several people goes to the first person's tab.
- In Dew's tab, the row goes right under the newest tasks at the top. In the
  other tabs, it goes under the last task. Empty spacers and rows containing
  only formulas do not count as tasks.
- The script inserts a fresh row so the sheet's table grows with it.
- Edits update the same row, even if someone has moved it by sorting or
  inserting rows. A repeated save uses the card's hidden row tag.
- Deleting a card sets its Status to **Canceled**, **CANCELLED** or **Cancel**,
  using that tab's words. It never deletes the sheet row.
- Columns the app has no value for stay empty, apart from repeated row formulas
  that the script copies from neighbouring rows.
- Existing formulas and headings are never changed.
- Cards that existed before the connection are not copied.
- Every other tab is left alone, including the hidden **Boss 1** tab.

The workspace will send the column values and status words when its connection
is added. The script writes the values it receives.

## Step 8 — Switching to the real sheet

1. Open the real sheet. Copy the part of its link between `/d/` and `/edit`.
2. In the script, replace the value of `SPREADSHEET_ID` with that ID.
3. Press **Ctrl+S**.
4. Choose **Deploy > Manage deployments > pencil icon**.
5. Set **Version: New version**, then click **Deploy**. The URL stays the same.
6. In workspace Settings, press **Test connection** again. Check the four tabs,
   their headings, and whether the script can write there.

## Step 9 — Keeping it safe

- Treat the URL and phrase together like a key. Anyone with both can add or
  update rows in the four allowed tabs. Keep them private.
- To revoke access, open the project at script.google.com. Choose
  **Deploy > Manage deployments**, then archive the deployment.
- To pause the connection, clear the URL in workspace Settings and click **Save**.

## Step 10 — If something does not work

- **"secret not set"**: the script still has the sample phrase. Do Step 3,
  then redeploy a New version (see the last point below).
- **"unauthorised"**: the phrase in Settings does not match `SECRET`.
- **"tab not found"**: a tab may have been renamed. Names must be exactly
  **Boss**, **Dew**, **O** and **Eye**.
- **"protected"**: the account that deployed the script cannot edit that tab.
  Follow Step 1 to ask the owner for access.
- **"no heading row"**: a heading cell must say **Task** within the first 10
  rows. An emoji after Task is fine.
- **"busy, please try again"**: another save is still running. Try again shortly.
- After editing the script, always redeploy: **Deploy > Manage deployments >
  pencil icon > Version: New version > Deploy**. The URL stays the same.
