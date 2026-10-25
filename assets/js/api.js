/**
 * api.js — Release Version: Backend API Client
 *
 * Connects directly to Google Apps Script Web App for real-time dynamic data.
 * No mock data, no static data.
 *
 * Protocol notes:
 * - Uses POST with application/x-www-form-urlencoded (CORS simple request).
 * - Follows Apps Script 302 redirects automatically.
 * - Passes session tokens in request body to prevent leaking into URLs/logs.
 */

const API = (() => {
  // Clear any legacy mock database from previous testing
  try {
    localStorage.removeItem('portal_mock_events_db');
  } catch {}

  const BASE = CONFIG.APPS_SCRIPT_URL;

  /**
   * Low-level request function sending POST requests to Google Apps Script Web App.
   * Every call is routed dynamically to the authoritative Google Sheets backend.
   */
  async function request(action, params = {}, requiresAuth = false) {
    if (!BASE || BASE.includes('YOUR_DEPLOYMENT_ID_HERE')) {
      throw new Error('Apps Script Web App URL is not configured. Please set APPS_SCRIPT_URL in assets/js/shared.js');
    }

    const body = new URLSearchParams({ action, ...params });

    if (requiresAuth) {
      const token = Auth.getToken();
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }
      body.set('token', token);
    }

    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Server returned non-JSON response. Please verify your Apps Script Web App deployment.');
    }

    if (!data.success) {
      throw new Error(data.message || 'An unknown error occurred.');
    }

    return data;
  }

  // ── Auth ───────────────────────────────────────────────────

  async function adminLogin(username, password) {
    return request('adminLogin', { username, password });
  }

  async function adminLogout() {
    return request('adminLogout', {}, true);
  }

  async function validateAdminSession() {
    return request('validateAdminSession', {}, true);
  }

  async function changeAdminPassword(currentPassword, newPassword) {
    return request('changeAdminPassword', { currentPassword, newPassword }, true);
  }

  // ── Events ────────────────────────────────────────────────

  async function listAdminEvents() {
    return request('listAdminEvents', {}, true);
  }

  async function createEvent(eventData) {
    return request('createEvent', { eventData: JSON.stringify(eventData) }, true);
  }

  async function updateEvent(eventId, eventData) {
    return request('updateEvent', { eventId, eventData: JSON.stringify(eventData) }, true);
  }

  async function getEventById(eventId) {
    return request('getEventById', { eventId }, true);
  }

  async function deleteEvent(eventId) {
    return request('deleteEvent', { eventId }, true);
  }

  async function setAttendanceActivation(eventId, enabled) {
    return request('setAttendanceActivation', { eventId, enabled: enabled ? '1' : '0' }, true);
  }

  async function setCertificateActivation(eventId, enabled) {
    return request('setCertificateActivation', { eventId, enabled: enabled ? '1' : '0' }, true);
  }

  // ── Spreadsheet Metadata (Live Google Sheets) ─────────────

  async function getSpreadsheetMetadata(spreadsheetId) {
    return request('getSpreadsheetMetadata', { spreadsheetId }, true);
  }

  async function getWorksheetHeaders(spreadsheetId, worksheetName) {
    return request('getWorksheetHeaders', { spreadsheetId, worksheetName }, true);
  }

  async function getInterestValues(spreadsheetId, worksheetName, interestColumn) {
    return request('getInterestValues', { spreadsheetId, worksheetName, interestColumn }, true);
  }

  async function getWorksheetSample(spreadsheetId, worksheetName) {
    return request('getWorksheetSample', { spreadsheetId, worksheetName }, true);
  }

  // ── Templates / Folders (Live Google Drive) ───────────────

  async function listCertificateTemplates() {
    return request('listCertificateTemplates', {}, true);
  }

  async function listOutputFolders() {
    return request('listOutputFolders', {}, true);
  }

  // ── Public: Attendance Events ─────────────────────────────

  async function listAttendanceEvents() {
    return request('listAttendanceEvents', {});
  }

  // ── Attendance (Live Google Sheets) ───────────────────────

  async function getAttendanceSearchResults(eventId, query, operatorToken) {
    return request('getAttendanceSearchResults', { eventId, query, operatorToken: operatorToken || '' });
  }

  async function getParticipantAttendanceDetails(eventId, recordId, operatorToken) {
    return request('getParticipantAttendanceDetails', { eventId, recordId, operatorToken: operatorToken || '' });
  }

  async function markParticipantPresent(eventId, recordId, operatorToken) {
    return request('markParticipantPresent', { eventId, recordId, operatorToken: operatorToken || '' });
  }

  async function bulkMarkPresent(eventId, recordIds, operatorToken) {
    return request('bulkMarkPresent', {
      eventId,
      recordIds: JSON.stringify(recordIds),
      operatorToken: operatorToken || '',
    });
  }

  // ── Admin Attendance ──────────────────────────────────────

  async function adminSearchParticipants(eventId, query) {
    return request('adminSearchParticipants', { eventId, query }, true);
  }

  async function adminBulkMarkPresent(eventId, recordIds) {
    return request('adminBulkMarkPresent', {
      eventId,
      recordIds: JSON.stringify(recordIds),
    }, true);
  }

  // ── Public: Certificate Events ────────────────────────────

  async function listCertificateEvents() {
    return request('listCertificateEvents', {});
  }

  // ── Certificate (Live Slides & Drive PDF Engine) ──────────

  async function verifyCertificateEligibility(eventId, email) {
    return request('verifyCertificateEligibility', { eventId, email });
  }

  async function generateCertificate(eventId, email, certName, verifyToken) {
    return request('generateCertificate', { eventId, email, certName, verifyToken });
  }

  async function getExistingCertificate(eventId, email) {
    return request('getExistingCertificate', { eventId, email });
  }

  // ── Admin Reports & Audit Logs ────────────────────────────

  async function getEventStatistics(eventId) {
    return request('getEventStatistics', { eventId }, true);
  }

  async function getCertificateLogs(eventId, page = 1) {
    return request('getCertificateLogs', { eventId, page: String(page) }, true);
  }

  async function getAttendanceLogs(eventId, page = 1) {
    return request('getAttendanceLogs', { eventId, page: String(page) }, true);
  }

  async function adminCorrectCertificate(certId, newName, reason) {
    return request('adminCorrectCertificate', { certId, newName, reason }, true);
  }

  return {
    adminLogin,
    adminLogout,
    validateAdminSession,
    changeAdminPassword,
    listAdminEvents,
    createEvent,
    updateEvent,
    getEventById,
    deleteEvent,
    setAttendanceActivation,
    setCertificateActivation,
    getSpreadsheetMetadata,
    getWorksheetHeaders,
    getInterestValues,
    getWorksheetSample,
    listCertificateTemplates,
    listOutputFolders,
    listAttendanceEvents,
    getAttendanceSearchResults,
    getParticipantAttendanceDetails,
    markParticipantPresent,
    bulkMarkPresent,
    adminSearchParticipants,
    adminBulkMarkPresent,
    listCertificateEvents,
    verifyCertificateEligibility,
    generateCertificate,
    getExistingCertificate,
    getEventStatistics,
    getCertificateLogs,
    getAttendanceLogs,
    adminCorrectCertificate,
  };
})();
