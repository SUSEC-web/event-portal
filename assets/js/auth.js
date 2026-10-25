/**
 * auth.js — Client-side session token management
 *
 * SECURITY NOTE:
 * - Session tokens are stored in sessionStorage (cleared on tab close).
 * - They are NEVER put in localStorage, cookies, or URL query strings.
 * - The raw token is only ever sent in POST request bodies.
 * - The backend hashes the token before storing; the raw token is never
 *   stored server-side in readable form.
 * - Client-side flags must NEVER be used to authorize actions — every
 *   privileged backend call validates the token independently.
 */

const Auth = (() => {
  const TOKEN_KEY = 'cert_portal_token';
  const USER_KEY = 'cert_portal_user';
  const EXPIRY_KEY = 'cert_portal_expiry';

  function saveSession(token, username, expiresAt) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, username);
    sessionStorage.setItem(EXPIRY_KEY, expiresAt);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUsername() {
    return sessionStorage.getItem(USER_KEY);
  }

  function isClientTokenPresent() {
    const token = getToken();
    const expiry = sessionStorage.getItem(EXPIRY_KEY);
    if (!token || !expiry) return false;
    if (Date.now() > Number(expiry)) {
      clearSession();
      return false;
    }
    return true;
  }

  /**
   * Redirect to login if no client-side token is present.
   * NOTE: This is a UX convenience only. The backend validates every request.
   */
  function requireAuth(loginPage = 'admin-login.html') {
    if (!isClientTokenPresent()) {
      window.location.href = loginPage;
      return false;
    }
    return true;
  }

  /**
   * Redirect to admin dashboard if already logged in.
   */
  function redirectIfLoggedIn(dashboardPage = 'admin.html') {
    if (isClientTokenPresent()) {
      window.location.href = dashboardPage;
    }
  }

  let inactivityTimer = null;
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (!isClientTokenPresent()) return;
    inactivityTimer = setTimeout(() => {
      clearSession();
      alert('Security Notice: Your admin session has timed out due to 30 minutes of inactivity. Please sign in again.');
      window.location.href = 'admin-login.html';
    }, INACTIVITY_TIMEOUT_MS);
  }

  function initInactivityWatcher() {
    if (!isClientTokenPresent()) return;
    ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
      window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
  }

  return {
    saveSession,
    clearSession,
    getToken,
    getUsername,
    isClientTokenPresent,
    requireAuth,
    redirectIfLoggedIn,
    initInactivityWatcher,
  };
})();

