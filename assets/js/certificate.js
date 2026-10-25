/**
 * certificate.js — Participant Certificate Portal Logic
 *
 * Security model:
 * - All validation happens on the backend. UI state is only for UX.
 * - The backend enforces: event active, attendance present,
 *   no duplicate certificate, eligibility per Interest filter.
 * - The participant's chosen name may differ from registered name.
 * - After successful generation, the cert URL is shown.
 * - Repeat visits return the existing certificate without regenerating.
 * - A short-lived verifyToken (from the eligibility check) gates generation.
 * - Rate limiting is enforced server-side.
 * - The participant email is NEVER put in the page URL.
 */

let currentEventId = null;
let verifiedEmail = null;
let verifyToken = null;      // short-lived token from backend after eligibility check
let eligibilityData = null;  // {hasExistingCert, registeredName, certId?}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check if event ID is in URL (for QR code links)
  const urlEventId = getQueryParam('eventId');
  loadCertificateEvents(urlEventId);

  document.getElementById('event-selector')
    ?.addEventListener('change', handleCertEventChange);

  document.getElementById('btn-verify-email')
    ?.addEventListener('click', handleVerifyEmail);

  document.getElementById('cert-email-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') handleVerifyEmail(); });

  document.getElementById('btn-review-name')
    ?.addEventListener('click', handleReviewName);

  document.getElementById('btn-generate-cert')
    ?.addEventListener('click', handleGenerateCertificate);

  document.getElementById('btn-edit-name')
    ?.addEventListener('click', () => showStep('step-name'));

  document.getElementById('cert-name-input')
    ?.addEventListener('input', updateNamePreview);

  document.getElementById('btn-download-existing')
    ?.addEventListener('click', handleDownloadExisting);

  document.getElementById('btn-try-again')
    ?.addEventListener('click', () => showStep('step-email'));
});

// ── Load Events ───────────────────────────────────────────────
async function loadCertificateEvents(preselectedId) {
  const select = document.getElementById('event-selector');
  if (!select) return;
  try {
    const res = await API.listCertificateEvents();
    const events = Array.isArray(res.data) ? res.data : (res.data?.events || res.events || []);
    select.innerHTML = '<option value="">— Select Your Event —</option>';
    events.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.eventId || ev.eventID;
      opt.textContent = `${ev.eventName} (${formatDate(ev.eventDate)})`;
      select.appendChild(opt);
    });
    if (preselectedId) {
      select.value = preselectedId;
      handleCertEventChange();
    }
  } catch (err) {
    showAlert('event-load-error', 'Failed to load events: ' + err.message, 'danger');
  }
}

function handleCertEventChange() {
  const select = document.getElementById('event-selector');
  currentEventId = select.value;
  verifiedEmail = null;
  verifyToken = null;
  eligibilityData = null;

  if (!currentEventId) {
    showElement('cert-flow', false);
    return;
  }
  showElement('cert-flow', true);

  // Update header
  const eventName = select.options[select.selectedIndex]?.textContent || '';
  document.getElementById('cert-event-display').textContent = eventName;

  showStep('step-email');
  // Clear inputs
  document.getElementById('cert-email-input').value = '';
  document.getElementById('cert-name-input').value = '';
  showElement('email-error', false);
}

// ── Step Navigation ───────────────────────────────────────────
function showStep(stepId) {
  document.querySelectorAll('.cert-step').forEach(el => el.classList.remove('active'));
  const step = document.getElementById(stepId);
  if (step) step.classList.add('active');
}

// ── Step 1: Verify Email ──────────────────────────────────────
async function handleVerifyEmail() {
  if (!currentEventId) {
    Toast.warning('Please select an event first.');
    return;
  }
  const emailInput = document.getElementById('cert-email-input');
  const email = emailInput.value.trim().toLowerCase();

  showElement('email-error', false);

  if (!isValidEmail(email)) {
    showAlert('email-error', 'Please enter a valid email address.', 'danger');
    emailInput.focus();
    return;
  }

  const btn = document.getElementById('btn-verify-email');
  setButtonLoading(btn, true, 'Verifying…');

  try {
    const res = await API.verifyCertificateEligibility(currentEventId, email);
    setButtonLoading(btn, false);

    verifiedEmail = email;
    eligibilityData = res.data;
    verifyToken = res.data.verifyToken; // short-lived server token

    if (res.data.hasExistingCert) {
      // Already issued — show download
      renderExistingCertificate(res.data);
      showStep('step-existing');
    } else {
      // Eligible — proceed to name entry
      showStep('step-name');
      document.getElementById('cert-name-input').focus();
      // Pre-fill with registered name as suggestion (not required to match)
      if (res.data.registeredName) {
        document.getElementById('cert-name-input').placeholder = res.data.registeredName;
      }
    }
  } catch (err) {
    setButtonLoading(btn, false);
    // Return generic errors to avoid exposing registration data
    showAlert('email-error', err.message || 'Verification failed. Please check your email and try again.', 'danger');
  }
}

// ── Step 2: Name Entry ────────────────────────────────────────
function updateNamePreview() {
  const name = document.getElementById('cert-name-input').value;
  const sanitized = sanitizeCertName(name);
  document.getElementById('cert-name-preview-value').textContent = sanitized || '—';
}

async function handleReviewName() {
  const rawName = document.getElementById('cert-name-input').value;
  const certName = sanitizeCertName(rawName);

  showElement('name-error', false);

  if (!certName || certName.length < 2) {
    showAlert('name-error', 'Please enter a valid name (at least 2 characters).', 'danger');
    return;
  }
  if (certName.length > 100) {
    showAlert('name-error', 'Name is too long (maximum 100 characters).', 'danger');
    return;
  }

  // Update preview before proceeding to confirmation
  document.getElementById('cert-name-confirm-display').textContent = certName;
  showStep('step-confirm');
}

// ── Step 3: Confirm & Generate ────────────────────────────────
async function handleGenerateCertificate() {
  const rawName = document.getElementById('cert-name-input').value;
  const certName = sanitizeCertName(rawName);

  if (!verifiedEmail || !currentEventId || !verifyToken || !certName) {
    Toast.error('Session expired. Please start again.');
    showStep('step-email');
    return;
  }

  // Show progress
  showStep('step-progress');
  const progressMsg = document.getElementById('cert-progress-msg');
  progressMsg.textContent = 'Generating your certificate… Please do not close this page.';

  try {
    const res = await API.generateCertificate(
      currentEventId,
      verifiedEmail,
      certName,
      verifyToken
    );

    if (res.data.alreadyIssued) {
      // Race condition: another request generated it first
      renderExistingCertificate(res.data);
      showStep('step-existing');
      return;
    }

    // Success
    const downloadBtn = document.getElementById('btn-download-success');
    if (downloadBtn) {
      downloadBtn.href = res.data.certificateUrl;
      downloadBtn.textContent = 'Download Certificate (PDF)';
    }
    document.getElementById('cert-success-name').textContent = certName;
    showStep('step-success');

  } catch (err) {
    showStep('step-error');
    document.getElementById('cert-error-msg').textContent = err.message || 'Certificate generation failed. Please try again later.';
  }
}

// ── Existing Certificate ──────────────────────────────────────
function renderExistingCertificate(data) {
  const nameEl = document.getElementById('existing-cert-name');
  const dateEl = document.getElementById('existing-cert-date');
  if (nameEl) nameEl.textContent = data.certName || '—';
  if (dateEl) dateEl.textContent = formatDateTime(data.generatedAt) || '—';
}

function handleDownloadExisting() {
  if (!verifiedEmail || !currentEventId) {
    Toast.error('Session expired. Please start again.');
    return;
  }
  // Retrieve the URL from the eligibility data
  if (eligibilityData && eligibilityData.certificateUrl) {
    window.open(eligibilityData.certificateUrl, '_blank', 'noopener,noreferrer');
  } else {
    Toast.error('Certificate URL not available. Please contact the organizer.');
  }
}
