const TOKEN_KEY = "deskspot_token";

/** Session storage so a Vercel-hosted UI can authenticate against a separate API host. */
export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode / blocked storage — cookie auth still works on same-origin setups.
  }
}
