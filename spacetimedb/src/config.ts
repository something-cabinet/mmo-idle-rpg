// Deployment configuration. None of these values are secret.

/** Issuer of SpacetimeAuth ID tokens. */
export const SPACETIMEAUTH_ISSUER = 'https://auth.spacetimedb.com/oidc';

/**
 * SpacetimeAuth client IDs allowed to log in (dashboard → Clients).
 * Tokens from SpacetimeAuth for any other client are rejected, so another
 * app's users can't log in with tokens that were issued for that app.
 * While empty, only guests can play.
 */
export const OIDC_CLIENT_IDS: readonly string[] = [
    'client_034eP7avaqrYk4QDG9Sfue'
];

/** SpacetimeAuth `sub` claims that get the Admin role on login. */
export const ADMIN_SUBJECTS: readonly string[] = [];

/**
 * Admin emails aren't here: they're the database's ADMIN_EMAILS environment value
 * (reducers/account.ts `adminEmails`), set from the gitignored .env files on publish, so
 * no address lands in git.
 */

/**
 * Identities (hex, no 0x) that get the Admin role on connect, whatever logged
 * them in. For the `spacetime` CLI login (`spacetime login show`), so admin
 * reducers can be run with `spacetime call`.
 */
export const ADMIN_IDENTITIES: readonly string[] = [
    'c200de8e699af334af9084cbe40dc310a6ba1075c563af31c642be0214dfc93e',
];
