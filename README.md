# Event Attendance & Certificate Management Portal 

A complete, self-hosted web application for Saurashtra University Startup & Entrepreneurship Council (SUSEC) events. Supports registration lookup, attendance marking, and one-click certificate PDF generation from Google Slides templates.

> 📖 **Full Deployment Guide Available**: For complete instructions on deploying to **GitHub Pages**, **cPanel (Apache hosting)**, or another **Google Account**, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## ⚠️ Before You Read: Security Commitments

| What is secured | How |
|---|---|
| Admin passwords | SHA-256 + unique salt in private Google Sheet |
| Session tokens | 256-bit random hex; stored as SHA-256(token) server-side |
| Aadhaar / DOB / Phone | Never returned by any API endpoint |
| Certificate deduplication | Script-level lock + log-first-then-generate pattern |
| Event filtering | Server-side only; client cannot bypass event boundaries |
| Admin URL | Not a secret — backend validates every call independently |

**Honest limitation:** Apps Script cannot provide bcrypt or server IP access. SHA-256 + lockout is the strongest option available. Use a strong admin password (≥ 16 characters, mixed case, numbers, symbols).

---

## Repository Structure 

```
event-certificate-portal/
├── index.html           ← Landing page (GitHub Pages)
├── admin-login.html     ← Admin login (GitHub Pages)
├── admin.html           ← Admin dashboard (GitHub Pages)
├── attendance.html      ← Attendance portal (GitHub Pages)
├── certificate.html     ← Certificate portal (GitHub Pages)
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── shared.js    ← Utilities (all pages)
│       ├── api.js       ← Backend communication
│       ├── auth.js      ← Session token management
│       ├── admin.js     ← Admin UI logic
│       ├── attendance.js← Attendance UI
│       └── certificate.js← Certificate UI
└── apps-script/         ← Deploy to Google Apps Script (NOT GitHub Pages)
    ├── appsscript.json
    ├── Code.gs
    ├── Config.gs
    ├── Auth.gs
    ├── SheetsService.gs
    ├── EventService.gs
    ├── AttendanceService.gs
    ├── CertificateService.gs
    └── Api.gs
```

---

## Deployment Guide

### Step 1: Create the Master Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Name it **"Event Portal — System Data"** (or similar).
3. Copy the spreadsheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`
4. Keep this spreadsheet **private** — share it only with your Google account.

### Step 2: Set Up the Apps Script Project

1. Go to [script.google.com](https://script.google.com) and click **New Project**.
2. Name the project **"Event Certificate Portal Backend"**.
3. Delete the default `Code.gs` content.
4. Create each file from `apps-script/` by clicking **+ (New Script file)**:
   - Paste contents of `Config.gs`, `Auth.gs`, `SheetsService.gs`, `EventService.gs`, `AttendanceService.gs`, `CertificateService.gs`, `Api.gs`, `Code.gs`
5. Replace `appsscript.json` via **Project Settings → Edit appsscript.json**.

### Step 3: Configure Constants

In `Config.gs`, set:
```javascript
MASTER_SHEET_ID: 'YOUR_MASTER_SPREADSHEET_ID',
ALLOWED_ORIGIN:  'https://yourusername.github.io',
```

### Step 4: Initialize the System

1. Open `Auth.gs` and find `initializeSystem()`.
2. Change `INITIAL_USERNAME` and `INITIAL_PASSWORD` to your chosen values.
   > ⚠️ **Use a strong password: 16+ characters, mixed case, numbers, symbols.**
3. In the Apps Script editor, select `initializeSystem` from the function dropdown and click **Run**.
4. Grant the required permissions when prompted.
5. Check the execution log — it should say "System initialized."
6. **Immediately** comment out or delete the `INITIAL_PASSWORD` line.
7. Log in and change your password using the Settings page.

### Step 5: Enable Required Services

In the Apps Script editor, go to **Services (+)** and enable:
- **Google Drive API** (Advanced)
- **Google Slides API** (Advanced)

These are available via `DriveApp`, `SlidesApp`, and `SpreadsheetApp` which are all enabled by default.

### Step 6: Deploy the Web App

1. Click **Deploy → New Deployment**.
2. Type: **Web app**.
3. Settings:
   - Execute as: **Me** (your Google account)
   - Who has access: **Anyone** (required for the public frontend to reach it)
4. Click **Deploy** and copy the **Web App URL**.

> ⚠️ The Web App URL is not a secret. It will be embedded in frontend JS. Security is enforced by the backend through session tokens and event-level validation.

### Step 7: Configure the Frontend

Open `assets/js/shared.js` and update:
```javascript
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec',
```

### Step 8: Prepare Google Slides Templates

For each event, create a Google Slides file with the following placeholders in the text:
```
{{PARTICIPANT_NAME}}
{{EVENT_NAME}}
{{EVENT_DATE}}
{{INSTITUTION}}
{{CERTIFICATE_ID}}
```
- Design the certificate normally; placeholders will be replaced at generation time.
- Note the Slides file ID from its URL and paste it when configuring the event.
- Ensure the Apps Script account (your deploying Google account) has at least **Viewer** access to the template file.

### Step 9: Create Output Folders in Google Drive

1. In Google Drive, create a folder per event (e.g., `Certificates — Robotics Workshop 2024`).
2. Copy the folder ID from its URL:
   `https://drive.google.com/drive/folders/**THIS_PART**`
3. Ensure the Apps Script account has **Editor** access to these folders.

### Step 10: Publish to GitHub Pages

1. Push the project root to a GitHub repository (do NOT include `apps-script/` — add it to `.gitignore`).
2. Go to **Settings → Pages** and set Source to the root of the `main` branch.
3. Your portal will be at `https://yourusername.github.io/repo-name/`.

### Step 11: Configure an Event

1. Log in to `admin.html`.
2. Click **Create Event**.
3. Fill in event name, date, type.
4. Enter your registration spreadsheet ID.
5. Select the worksheet tab.
6. Map the column headers (the form loads them dynamically from the actual sheet).
7. Set the Interest column and exact Interest value (e.g., `Robotics Workshop`).
8. Select the Slides template ID and output folder ID.
9. Save the event.
10. Toggle **Attendance** and **Certificates** on when ready.

### Step 12: Create QR Codes

For the certificate portal, generate a QR code pointing to:
```
https://yourusername.github.io/repo-name/certificate.html?eventId=EVT_YOUREVENTID
```

The event ID appears in the admin dashboard after creating the event.

---

## Google Drive Permission Model

> **⚠️ Important — Read This**

When `DRIVE_LINK_SHARING = 'anyone'` (default):
- Generated PDFs are accessible to **anyone with the link**.
- Recipients **can forward** the certificate link to others.
- This is appropriate for participation certificates, which are not private documents.
- This is the recommended setting for usability.

When `DRIVE_LINK_SHARING = 'restricted'`:
- Only the deploying Google account can access the file.
- Participants cannot download their certificates directly.
- You would need to build a backend download proxy — outside the scope of this setup.

**Do not** claim that shareable Drive URLs are private. They are not. Design your certificates accordingly.

---

## Certificate Template Guide

### Preparing a Slide Template
1. Create a Google Slides presentation with a single certificate slide.
2. Design your certificate with backgrounds, logos, signatures, and layout.
3. Add text boxes with the following placeholder text (exact, including braces):
   - `{{PARTICIPANT_NAME}}` — will be replaced with the participant's chosen name
   - `{{EVENT_NAME}}` — event name from configuration
   - `{{EVENT_DATE}}` — formatted event date
   - `{{INSTITUTION}}` — participant's institution
   - `{{CERTIFICATE_ID}}` — unique certificate ID for verification
4. Format the placeholders with the font and size you want the final text to appear in.
5. Placeholders can be inside any text box. They do not need to be on their own line.

### Tips
- Keep the template under 5 MB for reliable PDF export within the 6-minute Apps Script timeout.
- Use a single slide. Multiple slides are supported but increase export time.
- Test the template by configuring a test event and generating one certificate manually.

---

## Acceptance Test Checklist

| # | Test | Expected |
|---|---|---|
| 1 | Admin login with correct credentials | Redirected to dashboard |
| 2 | Admin login with wrong password | Error message; attempt logged |
| 3 | 5 consecutive failures | Account locked message |
| 4 | Wait after lockout; retry | Login succeeds |
| 5 | Expired session token | Rejected; redirected to login |
| 6 | Modify event via admin UI without source code | Event saved and visible |
| 7 | Load real headers from registration sheet | Column dropdowns populate |
| 8 | Two events share one worksheet (different Interest values) | Each shows only its own participants |
| 9 | Search in attendance portal | Results appear without page reload |
| 10 | Click participant → confirmation panel | Name, masked email, institution shown |
| 11 | Click Mark Present | Sheet updated; repeated click returns "already present" |
| 12 | Bulk mark | Counts shown; records outside event unaffected |
| 13 | Deactivate attendance | Backend rejects mark-present calls |
| 14 | Unregistered email on certificate page | Generic error message |
| 15 | Registered but absent email | "Attendance not marked" error |
| 16 | Eligible participant generates certificate | PDF in Drive; URL in cert log and sheet |
| 17 | Repeat visit with same email | Existing certificate returned; no new PDF |
| 18 | Concurrent requests from two tabs | Only one certificate generated (lock guard) |
| 19 | Admin corrects certificate name | New PDF generated; old record preserved with notes |
| 20 | Deactivate certificates | Backend rejects generation attempts |

---

## Updating the Application

**Frontend (CSS/JS/HTML):** Push changes to GitHub. Pages redeploys automatically.

**Apps Script backend:**
1. Make edits in the script editor.
2. Click **Deploy → Manage Deployments → Edit (current) → Save**.
3. Use the same deployment URL — do not create a new one (it would change the URL).

**To add columns to the registration sheet:** Do NOT delete existing columns. Add new columns to the right. The column mapping in the event config will continue to work because it uses header names.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| CORS error in browser console | Apps Script Web App must be deployed as "Anyone". Check URL in `shared.js`. |
| `ERR_TOO_MANY_REDIRECTS` | Clear browser cache. Apps Script redirects once before serving. |
| `Script has exceeded maximum execution time` | Reduce Slides template size. Split large batch operations. |
| `No permission to access spreadsheet` | Ensure the deploying Google account has edit access to the spreadsheet. |
| Certificate URL broken after Drive reorganization | Use the stable file ID URL: `https://drive.google.com/file/d/FILE_ID/view`. |
| `AdminConfig sheet not found` | Re-run `initializeSystem()` from the Apps Script editor. |
| Session expired immediately | Check that `CFG.MASTER_SHEET_ID` is set correctly in `Config.gs`. |
| PDF blank or missing name | Verify placeholder text matches exactly: `{{PARTICIPANT_NAME}}` (with double braces). |

---

## Privacy & Data Protection Notes

- Aadhaar numbers, dates of birth, and phone numbers from the registration sheet are **never** returned by any API endpoint.
- Participant email addresses are not exposed in public certificate URLs.
- The certificate log stores registered emails for deduplication but these are protected by the private master spreadsheet.
- Attendance logs record record IDs, not personal details.
- Audit logs record admin actions for accountability.
- No data is sent to third-party services beyond Google Workspace.
