/**
 * admin.js — Admin Dashboard Logic (Clean & Fast)
 *
 * All actions are gated by Auth.requireAuth() client-side
 * and validated by backend session tokens on every API call.
 *
 * Sections:
 * 1. Init & session validation
 * 2. Section switching
 * 3. Dashboard / Event cards & toggles
 * 4. Event configuration form (CRUD)
 * 5. Dynamic column mapping
 * 6. Attendance & Certificate activation toggles
 * 7. Event deletion
 * 8. Bulk attendance marking
 * 9. Admin password change & logout
 */

let adminEvents = [];
let currentEditEventId = null;
let lastHeaderMap = {};

// ── 1. Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin-login.html')) return;

  const userEl = document.getElementById('sidebar-username');
  if (userEl) userEl.textContent = Auth.getUsername() || 'Admin';

  // Validate session with backend
  try {
    await API.validateAdminSession();
  } catch {
    Auth.clearSession();
    window.location.href = 'admin-login.html';
    return;
  }

  // Start inactivity idle timer (30-min security timeout)
  Auth.initInactivityWatcher();

  initSidebarToggle();

  // Navigation handlers
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-create-event')?.addEventListener('click', openCreateEventModal);
  document.getElementById('btn-save-event')?.addEventListener('click', handleSaveEvent);
  document.getElementById('btn-cancel-event')?.addEventListener('click', closeEventModal);
  document.getElementById('btn-cancel-event-footer')?.addEventListener('click', closeEventModal);
  document.getElementById('btn-change-password')?.addEventListener('click', handleChangePassword);

  // Dynamic spreadsheet metadata loading
  document.getElementById('ev-spreadsheet-id')?.addEventListener('change', onSpreadsheetChange);
  document.getElementById('ev-worksheet-name')?.addEventListener('change', onWorksheetChange);
  document.getElementById('ev-interest-column')?.addEventListener('change', onInterestColumnChange);

  // Default section
  switchSection('dashboard');
  loadDashboard();
});

// ── 2. Section Switching ──────────────────────────────────────
function switchSection(section) {
  document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

  if (section === 'dashboard') loadDashboard();
  else if (section === 'events') loadEventsList();
}

// ── 3. Dashboard & Event Cards ────────────────────────────────
async function loadDashboard() {
  try {
    const res = await API.listAdminEvents();
    adminEvents = Array.isArray(res.data) ? res.data : (res.data?.events || res.events || []);
    renderDashboardStats(adminEvents);
    renderEventCards(adminEvents);
  } catch (err) {
    showAlert('dashboard-error', 'Failed to load dashboard: ' + err.message, 'danger');
  }
}

function renderDashboardStats(events) {
  const total = events.length;
  const active = events.filter(e => {
    const att = e.attendanceEnabled === true || String(e.attendanceEnabled).toLowerCase() === 'true';
    const cert = e.certificatesEnabled === true || String(e.certificatesEnabled).toLowerCase() === 'true';
    return att || cert;
  }).length;
  const withCerts = events.filter(e => e.certificatesEnabled === true || String(e.certificatesEnabled).toLowerCase() === 'true').length;

  setStat('stat-total-events', total);
  setStat('stat-active-events', active);
  setStat('stat-cert-events', withCerts);
}

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderEventCards(events) {
  const container = document.getElementById('events-grid');
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-tertiary)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
      </div>
      <h3>No Events Configured</h3>
      <p>Click "Add New Event" to set up your first registration sheet.</p>
    </div>`;
    return;
  }

  container.innerHTML = events.map(ev => {
    const id = ev.eventId || ev.eventID || ev.EventID || '';
    const attOn = ev.attendanceEnabled === true || String(ev.attendanceEnabled).toLowerCase() === 'true' || ev.attendanceEnabled === 1 || ev.attendanceEnabled === '1';
    const certOn = ev.certificatesEnabled === true || String(ev.certificatesEnabled).toLowerCase() === 'true' || ev.certificatesEnabled === 1 || ev.certificatesEnabled === '1';

    return `
    <div class="event-card" data-event-id="${escapeHtml(id)}">
      <div class="event-card-header ${ev.eventType === 'offline' ? 'offline' : ''}">
        <div class="event-card-top-row">
          <div class="event-card-badge">${escapeHtml(ev.eventType || 'online')}</div>
          <span class="event-card-id-pill">${escapeHtml(id)}</span>
        </div>
        <div class="event-card-title">${escapeHtml(ev.eventName)}</div>
        <div class="event-card-date">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${formatDate(ev.eventDate)}</span>
          ${(ev.startTime || ev.endTime) ? `<span class="event-card-time">&bull; ${formatTimeRangeIST(ev.startTime, ev.endTime)}</span>` : ''}
        </div>
      </div>

      <!-- Live Counters: Registration, Attendance, Certificates -->
      <div class="event-card-stats">
        <div class="card-stat-pill card-stat-reg" title="Total Registered Participants">
          <div class="card-stat-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div class="card-stat-data">
            <span class="card-stat-count" id="stat-reg-${escapeHtml(id)}">${ev.registered != null ? ev.registered : '<span class="stat-spinner"></span>'}</span>
            <span class="card-stat-title">Registration</span>
          </div>
        </div>

        <div class="card-stat-pill card-stat-att" title="Total Attendees Marked Present">
          <div class="card-stat-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div class="card-stat-data">
            <span class="card-stat-count" id="stat-att-${escapeHtml(id)}">${ev.present != null ? ev.present : '<span class="stat-spinner"></span>'}</span>
            <span class="card-stat-title">Attendance</span>
          </div>
        </div>

        <div class="card-stat-pill card-stat-cert" title="Total Certificates Issued">
          <div class="card-stat-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div class="card-stat-data">
            <span class="card-stat-count" id="stat-cert-${escapeHtml(id)}">${ev.certificates != null ? ev.certificates : '<span class="stat-spinner"></span>'}</span>
            <span class="card-stat-title">Certificates</span>
          </div>
        </div>
      </div>

      <div class="event-card-body">
        <div class="event-card-toggles">
          <label class="event-card-toggle toggle-wrap" title="Toggle participant attendance portal for this event">
            <span class="toggle">
              <input type="checkbox" id="att-toggle-${escapeHtml(id)}"
                ${attOn ? 'checked' : ''}
                onchange="toggleAttendance('${escapeHtml(id)}', this.checked)">
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </span>
            <span>Attendance</span>
          </label>
          <label class="event-card-toggle toggle-wrap" title="Toggle certificate generation portal for this event">
            <span class="toggle">
              <input type="checkbox" id="cert-toggle-${escapeHtml(id)}"
                ${certOn ? 'checked' : ''}
                onchange="toggleCertificates('${escapeHtml(id)}', this.checked)">
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </span>
            <span>Certificates</span>
          </label>
        </div>
        <div class="event-card-actions">
          <button class="btn btn-sm btn-outline" onclick="openEditEventModal('${escapeHtml(id)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Edit</span>
          </button>
          <button class="btn btn-sm btn-outline btn-outline-danger" onclick="confirmDeleteEvent('${escapeHtml(id)}', '${escapeHtml(ev.eventName)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  const container2 = document.getElementById('events-grid-2');
  if (container2) container2.innerHTML = container.innerHTML;

  // Asynchronously load live counters for each card
  loadCardStatsAsync(events);
}

async function loadCardStatsAsync(events) {
  for (const ev of events) {
    const id = ev.eventId || ev.eventID || ev.EventID || '';
    if (!id) continue;
    try {
      const res = await API.getEventStatistics(id);
      const data = res.data || res;
      ev.registered = data.registered ?? 0;
      ev.present = data.present ?? 0;
      ev.certificates = data.certificates ?? 0;

      document.querySelectorAll(`[id="stat-reg-${id}"]`).forEach(el => { el.textContent = data.registered ?? 0; });
      document.querySelectorAll(`[id="stat-att-${id}"]`).forEach(el => { el.textContent = data.present ?? 0; });
      document.querySelectorAll(`[id="stat-cert-${id}"]`).forEach(el => { el.textContent = data.certificates ?? 0; });
    } catch {
      document.querySelectorAll(`[id="stat-reg-${id}"]`).forEach(el => { el.textContent = '0'; });
      document.querySelectorAll(`[id="stat-att-${id}"]`).forEach(el => { el.textContent = '0'; });
      document.querySelectorAll(`[id="stat-cert-${id}"]`).forEach(el => { el.textContent = '0'; });
    }
  }
}

// ── Date & Time Input Normalizers ─────────────────────────────
function normalizeDateForInput(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes('T')) {
    const part = str.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  }
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = String(dmy[1]).padStart(2, '0');
    const month = String(dmy[2]).padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

function normalizeTimeForInput(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) return str;
  const matchHms = str.match(/^([01]\d|2[0-3]):([0-5]\d):[0-5]\d$/);
  if (matchHms) return `${matchHms[1]}:${matchHms[2]}`;
  const match12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const ampm = match12[3].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  if (str.includes('T')) {
    const timePart = str.split('T')[1];
    const matchIso = timePart?.match(/^([01]\d|2[0-3]):([0-5]\d)/);
    if (matchIso) return `${matchIso[1]}:${matchIso[2]}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '';
}

// ── 4. Event Configuration (CRUD) ─────────────────────────────
function loadEventsList() {
  loadDashboard();
}

function openCreateEventModal() {
  currentEditEventId = null;
  document.getElementById('event-modal-title').textContent = 'Create New Event';
  document.getElementById('event-form').reset();
  document.getElementById('ev-event-id-display').textContent = '';
  const errEl = document.getElementById('event-form-error');
  if (errEl) errEl.classList.add('hidden');
  clearColumnSelectors();
  showElement('event-modal', true);
  document.getElementById('event-modal').classList.add('active');
  document.getElementById('ev-event-name').focus();
}

async function openEditEventModal(eventId) {
  currentEditEventId = eventId;
  document.getElementById('event-modal-title').textContent = 'Edit Event Configuration';
  const errEl = document.getElementById('event-form-error');
  if (errEl) errEl.classList.add('hidden');
  try {
    showElement('event-modal', true);
    document.getElementById('event-modal').classList.add('active');
    const res = await API.getEventById(eventId);
    const ev = res.data?.event || res.data || res.event;
    await populateEventForm(ev);
  } catch (err) {
    Toast.error('Failed to load event: ' + err.message);
  }
}

async function populateEventForm(ev) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const rawId = ev.eventId || ev.eventID || ev.EventID || '';
  const idEl = document.getElementById('ev-event-id-display');
  if (idEl) idEl.textContent = rawId ? `Configuration for ID: ${rawId}` : '';

  set('ev-event-name', ev.eventName || '');
  set('ev-event-date', normalizeDateForInput(ev.eventDate));
  set('ev-start-time', normalizeTimeForInput(ev.startTime));
  set('ev-end-time', normalizeTimeForInput(ev.endTime));
  set('ev-event-type', ev.eventType || 'online');
  set('ev-filter-mode', ev.filterMode || 'interest');
  set('ev-spreadsheet-id', ev.spreadsheetId || ev.spreadsheetID || '');
  set('ev-slides-template-id', ev.slidesTemplateId || ev.slidesTemplateID || '');
  set('ev-output-folder-id', ev.outputFolderId || ev.outputFolderID || '');

  const ssId = (ev.spreadsheetId || ev.spreadsheetID || '').trim();
  const wsName = ev.worksheetName;

  lastHeaderMap = {};
  if (ssId) {
    const worksheetSelect = document.getElementById('ev-worksheet-name');
    worksheetSelect.innerHTML = '<option>Loading sheets…</option>';
    worksheetSelect.disabled = true;

    try {
      const res = await API.getSpreadsheetMetadata(ssId);
      const sheets = (res.data && res.data.sheets) || res.sheets || [];
      worksheetSelect.innerHTML = '<option value="">— Select Worksheet —</option>';
      sheets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        worksheetSelect.appendChild(opt);
      });
      worksheetSelect.disabled = false;

      if (wsName) {
        worksheetSelect.value = wsName;
        // Fetch headers and populate all column selectors
        setColumnSelectorsLoading(true);
        try {
          const hRes = await API.getWorksheetHeaders(ssId, wsName);
          const headers = (hRes.data && hRes.data.headers) || hRes.headers || [];
          lastHeaderMap = Object.fromEntries(headers.map((h, i) => [h, i]));
          populateColumnSelectors(headers);
          loadWorksheetSample(ssId, wsName);

          const setCol = (id, val) => {
            const el = document.getElementById(id);
            if (el && val) el.value = val;
          };
          setCol('ev-name-column', ev.nameColumn);
          setCol('ev-email-column', ev.emailColumn);
          setCol('ev-institution-column', ev.institutionColumn);
          setCol('ev-status-column', ev.statusColumn);
          setCol('ev-attendance-ts-column', ev.attendanceTimestampColumn);
          setCol('ev-cert-name-column', ev.certificateNameColumn);
          setCol('ev-cert-status-column', ev.certificateStatusColumn);
          setCol('ev-cert-url-column', ev.certificateUrlColumn || ev.certificateURLColumn);
          setCol('ev-interest-column', ev.interestColumn);

          if (ev.interestColumn) {
            await onInterestColumnChange();
          }
          set('ev-interest-value', ev.interestValue || '');
        } catch (hdrErr) {
          console.warn('Headers loading error during edit populate:', hdrErr);
        } finally {
          setColumnSelectorsLoading(false);
        }
      }
    } catch (sheetErr) {
      console.warn('Metadata loading error during edit populate:', sheetErr);
      worksheetSelect.innerHTML = '<option value="">Error loading sheets</option>';
    }
  }
}

function closeEventModal() {
  const modal = document.getElementById('event-modal');
  if (modal) modal.classList.remove('active');
  currentEditEventId = null;
}

async function handleSaveEvent() {
  const form = document.getElementById('event-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const eventData = collectEventFormData();
  const btn = document.getElementById('btn-save-event');
  setButtonLoading(btn, true, 'Saving…');

  try {
    if (currentEditEventId) {
      await API.updateEvent(currentEditEventId, eventData);
      Toast.success('Event updated successfully.');
    } else {
      await API.createEvent(eventData);
      Toast.success('Event created successfully.');
    }
    closeEventModal();
    loadDashboard();
  } catch (err) {
    Toast.error(err.message || 'Failed to save event.');
    showAlert('event-form-error', err.message, 'danger');
  } finally {
    setButtonLoading(btn, false);
  }
}

function collectEventFormData() {
  const g = (id) => (document.getElementById(id)?.value || '').trim();
  return {
    eventName: g('ev-event-name'),
    eventDate: g('ev-event-date'),
    startTime: g('ev-start-time'),
    endTime: g('ev-end-time'),
    eventType: g('ev-event-type'),
    spreadsheetId: g('ev-spreadsheet-id'),
    worksheetName: g('ev-worksheet-name'),
    filterMode: g('ev-filter-mode'),
    interestColumn: g('ev-interest-column'),
    interestValue: g('ev-interest-value'),
    nameColumn: g('ev-name-column'),
    emailColumn: g('ev-email-column'),
    institutionColumn: g('ev-institution-column'),
    statusColumn: g('ev-status-column'),
    attendanceTimestampColumn: g('ev-attendance-ts-column'),
    certificateNameColumn: g('ev-cert-name-column'),
    certificateStatusColumn: g('ev-cert-status-column'),
    certificateUrlColumn: g('ev-cert-url-column'),
    slidesTemplateId: g('ev-slides-template-id'),
    outputFolderId: g('ev-output-folder-id'),
  };
}

// ── 5. Dynamic Column Mapping ─────────────────────────────────
async function onSpreadsheetChange() {
  const ssId = document.getElementById('ev-spreadsheet-id').value.trim();
  if (!ssId) return;

  const worksheetSelect = document.getElementById('ev-worksheet-name');
  worksheetSelect.innerHTML = '<option>Loading…</option>';
  worksheetSelect.disabled = true;

  try {
    const res = await API.getSpreadsheetMetadata(ssId);
    const sheets = res.data.sheets || [];
    worksheetSelect.innerHTML = '<option value="">— Select Worksheet —</option>';
    sheets.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      worksheetSelect.appendChild(opt);
    });
    worksheetSelect.disabled = false;
  } catch (err) {
    worksheetSelect.innerHTML = '<option>Error loading</option>';
    Toast.error('Cannot load spreadsheet: ' + err.message);
  }
}

async function onWorksheetChange() {
  const ssId = document.getElementById('ev-spreadsheet-id').value.trim();
  const wsName = document.getElementById('ev-worksheet-name').value;
  if (!ssId || !wsName) return;

  setColumnSelectorsLoading(true);
  try {
    const res = await API.getWorksheetHeaders(ssId, wsName);
    const headers = res.data.headers || [];
    lastHeaderMap = Object.fromEntries(headers.map((h, i) => [h, i]));
    populateColumnSelectors(headers);
    loadWorksheetSample(ssId, wsName);
    const interestCol = document.getElementById('ev-interest-column').value;
    if (interestCol) onInterestColumnChange();
  } catch (err) {
    Toast.error('Cannot load headers: ' + err.message);
  } finally {
    setColumnSelectorsLoading(false);
  }
}

function setColumnSelectorsLoading(loading) {
  const selectors = document.querySelectorAll('.col-selector');
  selectors.forEach(s => { s.disabled = loading; });
}

function populateColumnSelectors(headers) {
  const selectors = [
    'ev-interest-column', 'ev-name-column', 'ev-email-column',
    'ev-institution-column', 'ev-status-column', 'ev-attendance-ts-column',
    'ev-cert-name-column', 'ev-cert-status-column', 'ev-cert-url-column',
  ];
  selectors.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Not mapped —</option>';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      sel.appendChild(opt);
    });
    if (current && headers.includes(current)) sel.value = current;
    sel.disabled = false;
  });
}

function clearColumnSelectors() {
  document.querySelectorAll('.col-selector').forEach(s => {
    s.innerHTML = '<option value="">— Select worksheet first —</option>';
    s.disabled = true;
  });
}

async function onInterestColumnChange() {
  const ssId = document.getElementById('ev-spreadsheet-id').value.trim();
  const wsName = document.getElementById('ev-worksheet-name').value;
  const intCol = document.getElementById('ev-interest-column').value;
  if (!ssId || !wsName || !intCol) return;

  const valSelect = document.getElementById('ev-interest-value-dropdown');
  if (!valSelect) return;
  valSelect.innerHTML = '<option>Loading…</option>';
  try {
    const res = await API.getInterestValues(ssId, wsName, intCol);
    const values = res.data.values || [];
    valSelect.innerHTML = '<option value="">— Select or type manually —</option>';
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      valSelect.appendChild(opt);
    });
    valSelect.disabled = false;
    valSelect.addEventListener('change', () => {
      const manual = document.getElementById('ev-interest-value');
      if (manual && valSelect.value) manual.value = valSelect.value;
    });
  } catch {}
}

async function loadWorksheetSample(ssId, wsName) {
  const sampleEl = document.getElementById('sample-preview');
  if (!sampleEl) return;
  sampleEl.innerHTML = '<div class="skeleton" style="height:80px;margin:8px 0"></div>';
  try {
    const res = await API.getWorksheetSample(ssId, wsName);
    const rows = res.data.rows || [];
    const headers = res.data.headers || [];
    if (rows.length === 0) { sampleEl.innerHTML = '<p class="text-sm" style="color:var(--text-tertiary)">No data rows found.</p>'; return; }
    const safeHeaders = headers.filter(h => !/aadhaar|aadhar|dob|birth|phone|mobile/i.test(h)).slice(0, 5);
    const table = `<div class="table-wrap" style="margin-top:8px;font-size:0.8rem">
      <table>
        <thead><tr>${safeHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, 3).map(row =>
          `<tr>${safeHeaders.map(h => `<td class="truncate" style="max-width:140px">${escapeHtml(row[headers.indexOf(h)] || '')}</td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table></div>`;
    sampleEl.innerHTML = `<p class="text-xs" style="color:var(--text-tertiary);margin-bottom:4px">Preview (first 3 rows):</p>${table}`;
  } catch {
    sampleEl.innerHTML = '';
  }
}

// ── 6. Attendance & Certificate Activation ────────────────────
async function toggleAttendance(eventId, enabled) {
  if (!eventId) {
    Toast.error('Event ID is missing. Please refresh the page.');
    return;
  }
  try {
    await API.setAttendanceActivation(eventId, enabled);
    Toast.success(`Attendance ${enabled ? 'activated' : 'deactivated'} for event.`);
  } catch (err) {
    Toast.error(err.message);
    const cb = document.getElementById(`att-toggle-${eventId}`);
    if (cb) cb.checked = !enabled;
  }
}

async function toggleCertificates(eventId, enabled) {
  if (!eventId) {
    Toast.error('Event ID is missing. Please refresh the page.');
    return;
  }
  try {
    await API.setCertificateActivation(eventId, enabled);
    Toast.success(`Certificate generation ${enabled ? 'activated' : 'deactivated'}.`);
  } catch (err) {
    Toast.error(err.message);
    const cb = document.getElementById(`cert-toggle-${eventId}`);
    if (cb) cb.checked = !enabled;
  }
}

// ── 7. Event Deletion ─────────────────────────────────────────
async function confirmDeleteEvent(eventId, eventName) {
  if (!eventId) {
    Toast.error('Cannot delete: Event ID is missing.');
    return;
  }
  const confirmed = confirm(`Are you sure you want to delete "${eventName}" (${eventId})?\n\nThis will remove the event configuration.`);
  if (!confirmed) return;

  try {
    await API.deleteEvent(eventId);
    Toast.success(`Event "${eventName}" deleted successfully.`);
    loadDashboard();
  } catch (err) {
    Toast.error('Failed to delete event: ' + err.message);
  }
}

// ── 8. Bulk Attendance ────────────────────────────────────────
let bulkSelectedIds = new Set();

async function loadBulkSection(eventId) {
  bulkSelectedIds.clear();
  updateBulkCount();
  const tbody = document.getElementById('bulk-att-tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(4, 5);
  try {
    const res = await API.adminSearchParticipants(eventId, '');
    const raw = res.data || res;
    const records = Array.isArray(raw) ? raw : (raw.results || []);

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:32px;color:var(--text-tertiary)">No participants found for this event.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td><input type="checkbox" class="bulk-check" data-id="${escapeHtml(r.recordId)}"
          ${r.attendanceStatus === 'Present' ? 'disabled checked' : ''}
          onchange="handleBulkCheck(this)"></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.institution || '—')}</td>
        <td><span class="badge ${r.attendanceStatus === 'Present' ? 'badge-success' : 'badge-neutral'}">${escapeHtml(r.attendanceStatus || 'Not Marked')}</span></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:32px;color:var(--danger)">${escapeHtml(err.message)}</td></tr>`;
    Toast.error(err.message);
  }
}

function handleBulkCheck(cb) {
  if (cb.checked) bulkSelectedIds.add(cb.dataset.id);
  else bulkSelectedIds.delete(cb.dataset.id);
  updateBulkCount();
}

function updateBulkCount() {
  const el = document.getElementById('bulk-selected-count');
  if (el) el.textContent = bulkSelectedIds.size;
}

function selectAllBulk() {
  document.querySelectorAll('.bulk-check:not(:disabled)').forEach(cb => {
    cb.checked = true;
    bulkSelectedIds.add(cb.dataset.id);
  });
  updateBulkCount();
}

async function submitBulkAttendance() {
  const eventId = document.getElementById('bulk-event-selector')?.value;
  if (!eventId || bulkSelectedIds.size === 0) { Toast.warning('Select at least one participant.'); return; }
  const confirmed = await confirmDialog('Bulk Mark Present',
    `Mark ${bulkSelectedIds.size} participant(s) as Present?`, 'Mark All Present', false);
  if (!confirmed) return;
  try {
    const res = await API.adminBulkMarkPresent(eventId, Array.from(bulkSelectedIds));
    const d = res.data || res;
    Toast.success(`Marked: ${d.success || 0} | Skipped: ${d.skipped || 0} | Failed: ${d.failed || 0}`);
    loadBulkSection(eventId);
  } catch (err) { Toast.error(err.message); }
}

// ── 9. Password Change & Logout ───────────────────────────────
async function handleChangePassword() {
  const curr = document.getElementById('curr-password')?.value;
  const next = document.getElementById('new-password')?.value;
  const confirm = document.getElementById('confirm-password')?.value;
  if (!curr || !next || !confirm) { Toast.warning('Please fill in all password fields.'); return; }
  if (next !== confirm) { Toast.error('New passwords do not match.'); return; }
  if (next.length < 12) { Toast.error('Password must be at least 12 characters.'); return; }
  const confirmed = await confirmDialog('Change Password', 'Are you sure you want to change your admin password?', 'Change Password', true);
  if (!confirmed) return;
  try {
    await API.changeAdminPassword(curr, next);
    Toast.success('Password changed successfully. You will be logged out.');
    setTimeout(() => handleLogout(), 2000);
  } catch (err) { Toast.error(err.message); }
}

async function handleLogout() {
  try { await API.adminLogout(); } catch {}
  Auth.clearSession();
  window.location.href = 'admin-login.html';
}
