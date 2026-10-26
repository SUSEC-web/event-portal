/**
 * shared.js — Shared constants, utilities, and toast notifications
 * GitHub Pages: included in all pages
 */

// ── Configuration ─────────────────────────────────────────────
// IMPORTANT: Update APPS_SCRIPT_URL after deploying your Apps Script Web App.
// This URL is NOT a secret; security is enforced by the backend.
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyNpLcGYexy_URv-5ozeoHCPNOhbVT21SLvoXdscC80ChNp3pYA6s2QVWqd66JMFyUJdQ/exec',
  SESSION_KEY: 'cert_portal_session',
  SESSION_USER_KEY: 'cert_portal_user',
  DEBOUNCE_DELAY: 320,
  MAX_SEARCH_RESULTS: 20,
  TOAST_DURATION: 4000,
};

// ── Toast Notification System ─────────────────────────────────
const Toast = (() => {
  let container = null;

  function ensureContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }

  function show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
    const c = ensureContainer();
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
    c.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  return {
    success: (msg, d) => show(msg, 'success', d),
    error: (msg, d) => show(msg, 'error', d),
    warning: (msg, d) => show(msg, 'warning', d),
    info: (msg, d) => show(msg, 'info', d),
  };
})();

// ── Utility Functions ──────────────────────────────────────────

/** Escape user-supplied content before inserting into HTML */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Mask an email address: r***@domain.com */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}***@${domain}`;
}

/** Debounce a function call */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Format a date string strictly in Indian Standard Time (Asia/Kolkata).
 * Avoids UTC midnight day-shifting by pinning pure YYYY-MM-DD to midday IST.
 */
function formatDate(dateStr, options = {}) {
  if (!dateStr) return '—';
  try {
    const s = String(dateStr).trim();
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      const d = new Date(Date.UTC(year, month, day, 6, 0, 0)); // 11:30 AM IST
      return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: options.month || 'short', year: 'numeric',
        timeZone: 'Asia/Kolkata', ...options
      });
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: options.month || 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata', ...options
    });
  } catch { return String(dateStr); }
}

/** Format a datetime string strictly in Indian Standard Time (Asia/Kolkata) */
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const datePart = d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const timePart = d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata'
    });
    return `${datePart}, ${timePart} IST`;
  } catch { return String(dateStr); }
}

/**
 * Format a time string into clean Indian Standard Time format (hh:mm A)
 * Handles ISO timestamps (1899-12-30T...), 24-hr strings ("14:30"), and existing AM/PM
 */
function formatTimeIST(timeStr, includeSuffix = true) {
  if (!timeStr) return '';
  const s = String(timeStr).trim();
  if (!s) return '';

  // Case 1: Google Sheets baseline Date (1899/1900)
  if (s.includes('1899-12-') || s.includes('1900-01-')) {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (m) {
      let h = parseInt(m[1], 10);
      const mm = m[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      const hh = String(h).padStart(2, '0');
      return includeSuffix ? `${hh}:${mm} ${ampm} IST` : `${hh}:${mm} ${ampm}`;
    }
  }

  // Case 2: General ISO or full datetime string
  if (s.includes('T') || s.includes('Z')) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const timePart = d.toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true,
          timeZone: 'Asia/Kolkata'
        });
        return includeSuffix ? `${timePart} IST` : timePart;
      }
    } catch {}
  }

  // Case 3: Already has AM/PM
  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)/i);
  if (ampmMatch) {
    const hh = ampmMatch[1].padStart(2, '0');
    const mm = ampmMatch[2];
    const ampm = ampmMatch[3].toUpperCase();
    return includeSuffix ? `${hh}:${mm} ${ampm} IST` : `${hh}:${mm} ${ampm}`;
  }

  // Case 4: 24-hour format "HH:mm" or "HH:mm:ss"
  const m24 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const mm = m24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hh = String(h).padStart(2, '0');
    return includeSuffix ? `${hh}:${mm} ${ampm} IST` : `${hh}:${mm} ${ampm}`;
  }

  return s;
}

/**
 * Format a start and end time range into IST (e.g. "10:00 AM – 01:00 PM IST")
 */
function formatTimeRangeIST(startStr, endStr) {
  if (!startStr && !endStr) return '';
  const start = formatTimeIST(startStr, false);
  const end = formatTimeIST(endStr, false);
  if (start && end) {
    return `${start} – ${end} IST`;
  }
  if (start) {
    return `${start} IST`;
  }
  return `${end} IST`;
}

/** Get a URL query parameter */
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Set loading state on a button */
function setButtonLoading(btn, loading, originalText) {
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = originalText || 'Loading…';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  }
}

/** Show/hide an element by ID */
function showElement(id, show = true) {
  const el = document.getElementById(id);
  if (!el) return;
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

/** Show an alert block with a message */
function showAlert(containerId, message, type = 'info') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  const icons = { success: '✓', warning: '⚠', danger: '✕', info: 'ℹ' };
  el.innerHTML = `<span class="alert-icon">${icons[type] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;
  el.classList.remove('hidden');
}

/** Sanitize a string for use as a certificate name */
function sanitizeCertName(name) {
  if (!name) return '';
  // Allow letters (including unicode), spaces, dots, hyphens, apostrophes
  return name.replace(/[^\p{L}\p{M}\s.\-']/gu, '').trim().slice(0, 100);
}

/** Validate email format */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

/** Show a confirmation dialog, returns Promise<boolean> */
function confirmDialog(title, message, confirmText = 'Confirm', danger = false) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal-header">
          <h2 class="modal-title" id="confirm-title">${escapeHtml(title)}</h2>
          <button class="modal-close" id="confirm-cancel-x" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary);line-height:1.6">${escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#confirm-ok').onclick = () => cleanup(true);
    overlay.querySelector('#confirm-cancel').onclick = () => cleanup(false);
    overlay.querySelector('#confirm-cancel-x').onclick = () => cleanup(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    overlay.querySelector('#confirm-ok').focus();
  });
}

/** Initialize mobile sidebar toggle */
function initSidebarToggle() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!menuBtn || !sidebar) return;
  menuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay && overlay.classList.toggle('open');
  });
  overlay && overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });
}

/** Activate a tab system */
function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = container.querySelector(`[data-tab-panel="${target}"]`);
      if (panel) panel.classList.add('active');
    });
  });
}

/** Create a skeleton loader row */
function skeletonRows(cols, rows = 3) {
  return Array.from({ length: rows }, () =>
    `<tr>${Array.from({ length: cols }, () =>
      `<td><div class="skeleton" style="height:16px;border-radius:4px"></div></td>`).join('')}</tr>`
  ).join('');
}
