// SpacetimeAuth (OIDC) login. The ID token it returns is passed to
// SpacetimeDB as the connection token; SpacetimeDB derives a stable identity
// from it, so the same login means the same account on every device.
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

const CLIENT_ID = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID;

/** False when no client ID is configured: the game runs guest-only. */
export const loginEnabled = Boolean(CLIENT_ID);

const manager = loginEnabled
  ? new UserManager({
      authority: 'https://auth.spacetimedb.com/oidc',
      client_id: CLIENT_ID!,
      // Back to the app root; works on any static host without route rewrites.
      redirect_uri: `${window.location.origin}/`,
      post_logout_redirect_uri: `${window.location.origin}/`,
      scope: 'openid profile email',
      response_type: 'code',
      // Stay logged in across tabs and browser restarts.
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    })
  : null;

/** Completes a login if the page was loaded as the OIDC redirect target. */
export async function handleRedirect(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (!manager || !params.has('code') || !params.has('state')) return;
  try {
    await manager.signinRedirectCallback();
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/**
 * The logged-in user, or null for guests. If a previous login has expired,
 * this redirects to log in again (usually instant while the SpacetimeAuth
 * session is alive) and never resolves.
 */
export async function currentUser(): Promise<User | null> {
  if (!manager) return null;
  const user = await manager.getUser();
  if (!user) return null;
  if (user.expired) {
    await manager.signinRedirect();
    return new Promise(() => {});
  }
  return user;
}

export async function login(): Promise<void> {
  await manager?.signinRedirect();
}

export async function logout(): Promise<void> {
  if (!manager) return;
  try {
    await manager.signoutRedirect();
  } catch {
    // Provider logout unavailable: forget the local session at least.
    await manager.removeUser();
    window.location.reload();
  }
}
