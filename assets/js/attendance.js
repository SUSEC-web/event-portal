/**
 * attendance.js — Attendance Operator Portal Logic
 *
 * Security model:
 * - Attendance operations are gated by server-side attendanceEnabled flag.
 * - Search results do NOT expose Aadhaar, DOB, or phone numbers.
 * - Attendance is marked by stable recordId, revalidated server-side.
 * - Search uses debouncing; results arrive asynchronously.
 * - The page updates dynamically without reloading.
 * - Repeated mark-present requests are idempotent.
 */

let currentEvent = null;
let selectedRecord = null;
let operatorToken = null;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAttendanceEvents();

  const searchInput = document.getElementById('attendance-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, CONFIG.DEBOUNCE_DELAY));
  }

  const markBtn = document.getElementById('btn-mark-present');
  if (markBtn) markBtn.addEventListener('click', handleMarkPresent);

  const clearBtn = document.getElementById('btn-clear-selection');
  if (clearBtn) clearBtn.addEventListener('click', clearSelection);

  const eventSelect = document.getElementById('event-selector');
  if (eventSelect) eventSelect.addEventListener('change', handleEventChange);
});

// ── Load Events ───────────────────────────────────────────────
async function loadAttendanceEvents() {
  const select = document.getElementById('event-selector');
  if (!select) return;
  try {
    const res = await API.listAttendanceEvents();
    const raw = res.data || res;
    const events = Array.isArray(raw) ? raw : (raw.events || []);

    select.innerHTML = '<option value="">— Select Event —</option>';
    events.forEach(ev => {
      const opt = document.createElement('option');
      const id = ev.eventId || ev.eventID;
      opt.value = id;
      opt.textContent = `${ev.eventName} (${formatDate(ev.eventDate)})`;
      select.appendChild(opt);
    });

    if (events.length === 0) {
      showElement('no-events-msg', true);
      showElement('attendance-panel', false);
    } else {
      showElement('no-events-msg', false);
    }
  } catch (err) {
    showAlert('event-load-error', 'Failed to load events: ' + err.message, 'danger');
  }
}

// ── Event Selection ───────────────────────────────────────────
async function handleEventChange() {
  const select = document.getElementById('event-selector');
  const eventId = select.value;
  clearSelection();
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('attendance-search').value = '';

  if (!eventId) {
    showElement('attendance-panel', false);
    showElement('event-info-panel', false);
    currentEvent = null;
    return;
  }

  showElement('attendance-panel', true);
  showElement('event-info-panel', true);

  const selectedText = select.options[select.selectedIndex]?.text || '';
  document.getElementById('event-info-name').textContent = selectedText;
  currentEvent = {
    eventId: eventId,
    eventID: eventId,
    eventName: selectedText,
    attendanceEnabled: true
  };
  showElement('event-deactivated-msg', false);

  // Fetch full event details from backend
  try {
    const res = await API.listAttendanceEvents();
    const raw = res.data || res;
    const eventList = Array.isArray(raw) ? raw : (raw.events || []);
    const evDetails = eventList.find(e => (e.eventId === eventId) || (e.eventID === eventId));
    if (evDetails) {
      currentEvent = {
        ...evDetails,
        eventId: evDetails.eventId || evDetails.eventID || eventId,
        eventID: evDetails.eventId || evDetails.eventID || eventId,
        attendanceEnabled: (evDetails.attendanceEnabled === true || String(evDetails.attendanceEnabled).toLowerCase() === 'true')
      };
      document.getElementById('event-info-name').textContent = evDetails.eventName || selectedText;
      let dateDisplay = formatDate(evDetails.eventDate);
      if (evDetails.startTime || evDetails.endTime) {
        dateDisplay += ' • ' + formatTimeRangeIST(evDetails.startTime, evDetails.endTime);
      }
      document.getElementById('event-info-date').textContent = dateDisplay;
      document.getElementById('event-info-type').textContent = evDetails.eventType || '—';
    } else {
      document.getElementById('event-info-name').textContent = selectedText;
    }

    if (!currentEvent.attendanceEnabled) {
      showElement('event-deactivated-msg', true);
      document.getElementById('attendance-search').disabled = true;
    } else {
      showElement('event-deactivated-msg', false);
      document.getElementById('attendance-search').disabled = false;
    }
  } catch (e) {
    document.getElementById('event-info-name').textContent = selectedText;
    document.getElementById('attendance-search').disabled = false;
  }

  document.getElementById('attendance-search').focus();
}

// ── Search ────────────────────────────────────────────────────
async function handleSearch() {
  if (!currentEvent) return;
  const eventId = currentEvent.eventId || currentEvent.eventID;
  if (!eventId) return;

  if (currentEvent.attendanceEnabled === false) return;

  const query = document.getElementById('attendance-search').value.trim();
  const resultsEl = document.getElementById('search-results');

  if (query.length < 2) {
    resultsEl.innerHTML = '';
    return;
  }

  showElement('search-spinner', true);
  try {
    const res = await API.getAttendanceSearchResults(eventId, query, operatorToken || '');
    showElement('search-spinner', false);
    const rawData = res.data || res;
    const results = Array.isArray(rawData) ? rawData : (rawData.results || []);
    renderSearchResults(results);
  } catch (err) {
    showElement('search-spinner', false);
    resultsEl.innerHTML = `<div class="search-no-results">⚠ ${escapeHtml(err.message)}</div>`;
  }
}

function renderSearchResults(results) {
  const el = document.getElementById('search-results');
  if (!Array.isArray(results) || results.length === 0) {
    el.innerHTML = '<div class="search-no-results">No matching participants found.</div>';
    return;
  }
  const items = results.map(r => {
    const isPresent = String(r.attendanceStatus || '').toLowerCase() === 'present';
    const statusBadge = isPresent
      ? '<span class="badge badge-success badge-dot">Present</span>'
      : '<span class="badge badge-neutral">Not Marked</span>';
    return `
      <div class="search-result-item" role="button" tabindex="0"
           data-record-id="${escapeHtml(r.recordId)}"
           aria-label="Select ${escapeHtml(r.name)}">
        <div>
          <div class="search-result-name">${escapeHtml(r.name)}</div>
          <div class="search-result-meta">${escapeHtml(r.institution || '—')}${r.email ? ` &middot; ${escapeHtml(r.email)}` : ''}</div>
        </div>
        <div class="search-result-status">${statusBadge}</div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="search-results">${items}</div>`;
  el.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => selectParticipant(item.dataset.recordId, results));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectParticipant(item.dataset.recordId, results); });
  });
}

// ── Select Participant ────────────────────────────────────────
async function selectParticipant(recordId, cachedResults) {
  selectedRecord = cachedResults.find(r => r.recordId === recordId);
  if (!selectedRecord) return;

  // Highlight selected
  document.querySelectorAll('.search-result-item').forEach(el => {
    el.style.background = el.dataset.recordId === recordId ? 'var(--primary-light)' : '';
  });

  renderParticipantPanel(selectedRecord);
  showElement('participant-panel', true);
  document.getElementById('participant-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderParticipantPanel(record) {
  document.getElementById('participant-avatar').textContent = (record.name || '?')[0].toUpperCase();
  document.getElementById('participant-name-display').textContent = escapeHtml(record.name);
  document.getElementById('participant-institution').textContent = escapeHtml(record.institution || '—');
  const emailEl = document.getElementById('participant-email-display') || document.getElementById('participant-email-masked');
  if (emailEl) emailEl.textContent = record.email || '—';

  const statusEl = document.getElementById('participant-status');
  const isPresent = String(record.attendanceStatus || '').toLowerCase() === 'present';
  if (isPresent) {
    statusEl.innerHTML = '<span class="badge badge-success badge-dot">Already Marked Present</span>';
    document.getElementById('btn-mark-present').style.display = 'none';
    document.getElementById('already-present-msg').style.display = 'flex';
  } else {
    statusEl.innerHTML = '<span class="badge badge-neutral">Not Yet Marked</span>';
    document.getElementById('btn-mark-present').style.display = 'inline-flex';
    document.getElementById('already-present-msg').style.display = 'none';
  }
}

// ── Mark Present ──────────────────────────────────────────────
async function handleMarkPresent() {
  if (!currentEvent || !selectedRecord) {
    Toast.error('No participant selected.');
    return;
  }
  const eventId = currentEvent.eventId || currentEvent.eventID;
  if (!eventId) {
    Toast.error('No event selected.');
    return;
  }
  if (!currentEvent.attendanceEnabled) {
    Toast.error('Attendance is currently deactivated for this event.');
    return;
  }

  const confirmed = await confirmDialog(
    'Confirm Attendance',
    `Mark ${selectedRecord.name} as Present for ${currentEvent.eventName || 'this event'}?`,
    'Mark Present'
  );
  if (!confirmed) return;

  const btn = document.getElementById('btn-mark-present');
  setButtonLoading(btn, true, 'Marking…');

  try {
    const res = await API.markParticipantPresent(
      eventId,
      selectedRecord.recordId,
      operatorToken || ''
    );

    setButtonLoading(btn, false);
    const data = res.data || res;
    if (data && data.alreadyPresent) {
      Toast.warning('Participant was already marked present.');
    } else {
      Toast.success(`${selectedRecord.name} marked Present successfully.`);
    }

    // Update local state without page reload
    selectedRecord.attendanceStatus = 'Present';
    renderParticipantPanel(selectedRecord);

    // Refresh the search results to reflect new status
    await handleSearch();

  } catch (err) {
    setButtonLoading(btn, false);
    Toast.error(err.message || 'Failed to mark attendance.');
    showAlert('mark-error', err.message, 'danger');
  }
}

// ── Clear Selection ───────────────────────────────────────────
function clearSelection() {
  selectedRecord = null;
  showElement('participant-panel', false);
  document.querySelectorAll('.search-result-item').forEach(el => {
    el.style.background = '';
  });
}
