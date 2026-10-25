# SUSEC Event & Certificate Portal — Comprehensive Deployment Guide

This guide provides step-by-step instructions to deploy the complete portal on:
1. **A new computer or a different Google Account** (Backend + Database)
2. **GitHub Pages** (Free static hosting)
3. **cPanel Web Hosting** (Custom domain or subdomain, e.g. `events.susec.ac.in`)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│               FRONTEND (Static Web Host)               │
│      Hosted on GitHub Pages OR cPanel (Apache)         │
│  - index.html (Gateway Landing)                        │
│  - attendance.html (Isolated Operator Workstation)     │
│  - certificate.html (Isolated Credential Desk)         │
│  - admin.html & admin-login.html (Admin Portal)        │
│  - assets/ (CSS, JS, Official Logos)                   │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS POST (JSON)
                           ▼
┌────────────────────────────────────────────────────────┐
│          BACKEND (Google Apps Script Web App)          │
│  - Dispatches actions & verifies session tokens        │
│  - Neutralizes formula injection & timing attacks      │
│  - Runs in Indian Standard Time (IST / Asia/Kolkata)   │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│       GOOGLE SHEETS       │ │       GOOGLE DRIVE        │
│ - Master System DB        │ │ - Certificate Template    │
│ - Event Registration Data │ │ - Output Folder (PDFs)    │
│ - Attendance & Cert Logs  │ │ - Generated Certificates  │
└───────────────────────────┘ └───────────────────────────┘
```

---

## Part 1: Setting Up the Backend on a Google Account

Follow these steps if you are deploying to a new or different Google Account.

### Step 1.1: Create the Master System Spreadsheet
1. Sign in to your target Google Account and visit [Google Sheets](https://sheets.google.com).
2. Create a **Blank spreadsheet** and name it `SUSEC Portal — Master Database`.
3. Note its **Spreadsheet ID** from the address bar:
   ```
   https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j_EXAMPLE_ID/edit
                                         └── THIS IS THE SPREADSHEET ID ──┘
   ```
4. Keep this spreadsheet **private** (do not share it publicly).

---

### Step 1.2: Create the Google Apps Script Project
1. Open [script.google.com](https://script.google.com) and click **New project**.
2. Name the project `SUSEC Event & Certificate Backend`.
3. You will copy the files from the `apps-script/` directory into this project:
   * **`Config.gs`**: Paste code from [`apps-script/Config.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/Config.gs).
     * Replace `MASTER_SHEET_ID: 'YOUR_MASTER_SPREADSHEET_ID_HERE'` with your actual Master Spreadsheet ID from Step 1.1.
   * **`Auth.gs`**: Paste code from [`apps-script/Auth.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/Auth.gs).
   * **`SheetsService.gs`**: Paste code from [`apps-script/SheetsService.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/SheetsService.gs).
   * **`EventService.gs`**: Paste code from [`apps-script/EventService.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/EventService.gs).
   * **`AttendanceService.gs`**: Paste code from [`apps-script/AttendanceService.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/AttendanceService.gs).
   * **`CertificateService.gs`**: Paste code from [`apps-script/CertificateService.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/CertificateService.gs).
   * **`Api.gs`**: Paste code from [`apps-script/Api.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/Api.gs).
   * **`Code.gs`**: Paste code from [`apps-script/Code.gs`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/apps-script/Code.gs).
4. **Update Manifest (`appsscript.json`)**:
   * Click the gear icon ⚙️ (**Project Settings**) on the left.
   * Check **"Show 'appsscript.json' manifest file in editor"**.
   * Return to editor, click `appsscript.json`, and paste:
     ```json
     {
       "timeZone": "Asia/Kolkata",
       "dependencies": {},
       "exceptionLogging": "STACKDRIVER",
       "runtimeVersion": "V8",
       "webapp": {
         "executeAs": "USER_DEPLOYING",
         "access": "ANYONE"
       }
     }
     ```

---

### Step 1.3: Initialize Master Database & Admin Account
1. Open `Auth.gs` in the Apps Script editor.
2. Locate the function `initializeSystem()`.
3. Review or set the temporary initial administrator password:
   ```javascript
   const INITIAL_USERNAME = 'admin';
   const INITIAL_PASSWORD = 'ChangeMe@SUSEC2026!'; // Change to your desired initial password
   ```
4. In the top toolbar, select `initializeSystem` from the dropdown and click **Run**.
5. Google will ask for authorization (**Review permissions**):
   * Select your Google account.
   * Click **Advanced** → **Go to SUSEC Event & Certificate Backend (unsafe)**.
   * Click **Allow**.
6. Check the Execution log: You will see:
   `System initialized. Admin user created: admin`
7. Check your Master Spreadsheet: The tabs (`EventConfig`, `CertificateLog`, `AttendanceLog`, `AdminConfig`, `SessionStore`, `LoginAttempts`, `AuditLog`) will have been created with all headers.

---

### Step 1.4: Deploy as a Public Web App
1. In the Apps Script editor, click **Deploy** (top right) → **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   * **Description**: `SUSEC Production Backend v1`
   * **Execute as**: **Me (youraccount@gmail.com)**
   * **Who has access**: **Anyone** *(Mandatory: Allows attendees and operators to mark attendance and fetch certificates)*
4. Click **Deploy**.
5. Copy the **Web App URL**:
   `https://script.google.com/macros/s/AKfycb.../exec`
6. Open [`assets/js/shared.js`](file:///c:/Users/siddh/.gemini/antigravity-ide/scratch/event-certificate-portal/assets/js/shared.js) in your project and update line 10:
   ```javascript
   const CONFIG = {
     APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
     ...
   };
   ```

---

## Part 2: Deploying Frontend to GitHub Pages

GitHub Pages is free, fast, and handles HTTPS automatically.

### Steps:
1. Initialize or push your project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "SUSEC Event & Certificate Portal Production Release"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/susec-portal.git
   git push -u origin main
   ```
   *(Note: The `.gitignore` excludes sensitive files and temporary artifacts)*.
2. Go to your repository on [GitHub.com](https://github.com).
3. Click **Settings** → **Pages** (under Code and automation in the left sidebar).
4. Under **Build and deployment**:
   * **Source**: `Deploy from a branch`
   * **Branch**: `main`
   * **Folder**: `/ (root)`
5. Click **Save**.
6. After 1–2 minutes, your portal will be live at:
   `https://YOUR_USERNAME.github.io/susec-portal/`

---

## Part 3: Deploying Frontend to cPanel (Custom Domain / Subdomain)

If you have a cPanel web hosting account (e.g. at Hostinger, GoDaddy, Bluehost, cPanel on university server), follow these steps to host on your own domain or subdomain (e.g., `events.susec.ac.in` or `yourdomain.com/portal`).

### Step 3.1: Create Subdomain or Directory in cPanel
1. Log into your **cPanel dashboard**.
2. Go to **Domains** → **Subdomains** (or **Domains** in newer cPanel versions).
3. Create a subdomain:
   * **Subdomain**: `events` (or `portal`)
   * **Domain**: `susec.ac.in` (or your domain)
   * **Document Root**: `public_html/events`
4. Click **Create**.

---

### Step 3.2: Upload Files via cPanel File Manager or FTP
1. In cPanel, click **File Manager** and navigate to your document root (`public_html/events` or `public_html`).
2. Upload the frontend files and folders:
   ```
   public_html/events/
   ├── .htaccess            (Configuration below)
   ├── index.html           (Landing Gateway)
   ├── admin-login.html     (Admin Sign-in)
   ├── admin.html           (Admin Dashboard)
   ├── attendance.html      (Operator Workstation)
   ├── certificate.html     (Credential Claim Desk)
   └── assets/
       ├── css/styles.css
       ├── img/ (logos & favicon)
       └── js/ (shared.js, api.js, auth.js, admin.js, etc.)
   ```
3. *Tip*: You can compress the files into a `.zip` on your computer, upload the `.zip` file via cPanel File Manager, and click **Extract**.

---

### Step 3.3: Add Apache Configuration (`.htaccess`)
In the root of your uploaded files (`public_html/events/`), create or edit a file named `.htaccess` with the following content:

```apache
# ── SUSEC Portal .htaccess Security & Routing ──

# 1. Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# 2. Prevent Directory Browsing
Options -Indexes

# 3. Security Headers
<IfModule mod_headers.c>
    # Anti-Clickjacking
    Header always set X-Frame-Options "SAMEORIGIN"
    # Anti-MIME sniffing
    Header always set X-Content-Type-Options "nosniff"
    # Referrer Policy
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    # XSS Protection
    Header always set X-XSS-Protection "1; mode=block"
    # Cache Control for static assets (1 hour revalidation)
    <FilesMatch "\.(html|htm)$">
        Header set Cache-Control "max-age=300, must-revalidate"
    </FilesMatch>
    <FilesMatch "\.(css|js|webp|png|jpg|svg)$">
        Header set Cache-Control "max-age=86400, public"
    </FilesMatch>
</IfModule>

# 4. UTF-8 Encoding
AddDefaultCharset UTF-8
```

---

### Step 3.4: Enable Free SSL (HTTPS)
1. In cPanel, navigate to **Security** → **SSL/TLS Status** (or **Let's Encrypt SSL**).
2. Find your domain/subdomain (`events.susec.ac.in`).
3. Click **Run AutoSSL** or issue a Let's Encrypt certificate.
4. Verify by visiting `https://events.susec.ac.in` in your browser.

---

## Part 4: Setting Up an Event (Workflow)

Once your frontend and backend are deployed:

1. **Create an Event Attendance/Registration Sheet**:
   * Create a standard Google Sheet where registrations are collected (e.g. from Google Forms).
   * Ensure it has columns for: Name, Email, Institution, Status (Present/Absent).
2. **Create a Certificate Template in Google Slides**:
   * Create a presentation in Google Slides with standard certificate dimensions (16:9 or 4:3).
   * Insert text boxes with placeholder variables:
     * `{{PARTICIPANT_NAME}}`
     * `{{EVENT_NAME}}`
     * `{{EVENT_DATE}}`
     * `{{INSTITUTION}}`
     * `{{CERTIFICATE_ID}}`
3. **Create a Target Google Drive Folder**:
   * Create a folder in Google Drive (e.g. `Certificates - National Startup Summit 2026`).
   * Copy the folder ID from its URL.
4. **Configure Event in Admin Portal**:
   * Open `admin.html` and sign in.
   * Click **Create Event**.
   * Enter your Event Name, Date, and Time (in Indian Standard Time).
   * Paste the Spreadsheet ID and select the Worksheet tab.
   * Map the respective columns.
   * Paste your Slides Template ID and Output Folder ID.
   * Click **Save Event Configuration**.
5. **Activate Portals**:
   * Turn **ON** the Attendance toggle when the event starts.
   * Turn **ON** the Certificates toggle when you are ready to allow attendees to claim certificates.

---

## Part 5: Sharing Links With Users

Because each portal is isolated, you can safely share dedicated links without exposing administrative functions:

| Role | Shareable URL | What they can see |
|---|---|---|
| **Public Attendees** | `https://yourdomain/certificate.html` | Only certificate search, validation, and PDF download. |
| **Attendance Operators** | `https://yourdomain/attendance.html` | Only live attendee search and "Mark Present" button. |
| **Portal Gateway** | `https://yourdomain/index.html` | Official SUSEC landing page with gateways. |
| **Administrators** | `https://yourdomain/admin-login.html` | Protected login to manage all events, column mappings, and toggles. |

---

## Part 6: Maintenance & Password Changes

1. **Change Admin Password**:
   * Log into `admin.html`.
   * Click **Security & Settings** in the sidebar.
   * Enter your current password and your new password (minimum 12 characters).
   * The new password is automatically salted and hashed with SHA-256 in the private `AdminConfig` sheet.
2. **Auto-Lockout**:
   * 5 consecutive failed login attempts automatically lock the account for 15 minutes.
3. **Inactivity Auto-Logout**:
   * The admin session automatically expires after 30 minutes of idle inactivity.
