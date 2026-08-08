# Chat photo upload — setup (about 5 minutes)

This lets the team share photos in the Team Chat. Photos are stored in one
shared Google Drive folder and shown inside the chat. You only need to do this
once, on the Google account that owns (or can edit) the photos folder.

## What you need
- The shared **chat photos** Drive folder. It is already wired into the script
  (folder id `1rHxba_qz3a3ZKYV7CZR1iT__OlBYEZRu`).
- The account you use below must own that folder or have **Editor** access to it.

## Step 1 — Create the script
1. Go to https://script.google.com and click **New project**.
2. Delete the sample code.
3. Open `marcom-photo-upload.gs` from this folder, copy everything, and paste it in.

## Step 2 — Set your secret phrase
1. Near the top, change `var SECRET = 'CHANGE_ME';` to any private phrase, for
   example `var SECRET = 'greenlife-photos';`.
2. Leave `FOLDER_ID` as it is (it already points at the shared folder).
3. Click the **Save** icon.

## Step 3 — Deploy as a Web app
1. Click **Deploy → New deployment**.
2. Click the gear icon and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. When asked, **Authorise access** and allow Drive access (choose your account,
   then Advanced → Go to project → Allow).
6. Copy the **Web app URL**. It ends with `/exec`.

## Step 4 — Connect it in the workspace
1. In the MARCOM Workspace, open **Settings**.
2. Find **Chat photo upload (Google Drive)** (visible to Boss only).
3. Paste the **Web app URL** and the **same secret phrase**.
4. Click **Test connection**. It should say it connected to the folder.
5. Click **Save**.

That is it. A photo button now appears in the Team Chat for everyone. Picking a
photo compresses it, uploads it to the shared folder, shows it in chat, and lets
members click it to open or download the original in Drive.

## Good to know
- Photos are shared **anyone with the link can view**, the normal trade-off so
  every member can see them. Do not put anything confidential here.
- If your account is on **Google Workspace** with restricted external sharing,
  link access may be limited to your organisation. That is fine as long as
  members sign in with a school account.
- Photos count against this account's Drive storage.
- To turn the feature off, delete the deployment (Deploy → Manage deployments →
  trash), or clear the URL in Settings.

## If a code change is made later
Apps Script does not apply edits to a live Web app automatically. After editing,
click **Deploy → Manage deployments → pencil → Version: New version → Deploy**.
The URL stays the same.
