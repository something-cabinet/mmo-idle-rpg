// Deployment configuration. None of these values are secret.

/** Issuer of SpacetimeAuth ID tokens. */
export const SPACETIMEAUTH_ISSUER = 'https://auth.spacetimedb.com/oidc';

/**
 * SpacetimeAuth client IDs allowed to log in (dashboard → Clients).
 * Tokens from SpacetimeAuth for any other client are rejected, so another
 * app's users can't log in with tokens that were issued for that app.
 * While empty, only guests can play.
 */
export const OIDC_CLIENT_IDS: readonly string[] = [];

/** SpacetimeAuth `sub` claims that get the Admin role on login. */
export const ADMIN_SUBJECTS: readonly string[] = [];
