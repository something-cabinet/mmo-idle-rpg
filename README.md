# MMO Idle RPG

Vite + React (TSX) browser client, SpacetimeDB (TypeScript module) backend.

```
.
├─ index.html, src/          # Vite client
│  ├─ main.tsx               # entry: login → connect, mounts the React app
│  ├─ store.ts               # connection state, data version, toasts, sticky view state
│  ├─ auth.ts                # SpacetimeAuth (OIDC) login/logout
│  ├─ net.ts                 # connection, guest token, subscriptions, guest linking
│  ├─ ui/                    # App (screens), Game (shell), shared components
│  │  └─ views/              # one component per game view
│  └─ module_bindings/       # GENERATED client bindings (npm run spacetime:generate)
├─ scripts/smoke-test.ts     # end-to-end test against a local server
├─ scripts/check-data.ts     # consistency checks for the static game data (npm run test:data)
└─ spacetimedb/              # Server module (runs inside SpacetimeDB)
   └─ src/
      ├─ schema.ts           # tables
      ├─ config.ts           # SpacetimeAuth client IDs, admin list
      ├─ game.ts             # pure rules/formulas (shared with the client)
      ├─ data/               # static game data with permanent IDs: stats, item bases, zones, legendaries
      ├─ helpers.ts          # auth checks, idle settlement, enter/leave world
      ├─ reducers/           # account (connect, linking, bans), character, chat, per-player views
      └─ index.ts            # module entry
```

## How it works

- **Accounts.** Every SpacetimeDB identity gets an `account` row on connect:
  - **Guest**: no login. SpacetimeDB issues an anonymous token, kept in `localStorage`.
    Clearing browser data loses it.
  - **Registered**: logged in with SpacetimeAuth. The ID token gives the same identity on
    every device. The server only accepts SpacetimeAuth tokens issued for our client ID.
  - `account` is private (email, ban state); a client reads its own row via the `my_account` view.
- **One character per account**, by design: alts would just be extra idle farms.
  Connecting enters the world automatically; opening a second tab takes over ("Play here").
- **Guest → login linking.** After logging in, the client opens a short second connection
  with the stored guest token and calls `offerLink`; the logged-in connection then calls
  `acceptLink`. Each side proves ownership with its own connection. If both have a character,
  the player must explicitly confirm deleting the guest one.
- **Moderation.** `role` (Player/Admin, from `ADMIN_EMAILS`, `ADMIN_SUBJECTS` or `ADMIN_IDENTITIES`) and `banned`; admins call
  `setBanned`. Banned accounts are rejected on connect.
- **Mail.** Admins send messages with optional attachments to one, several or all characters
  from the CLI (see "Sending mail"); players read and claim them in the Mail view. Attached
  items wait in escrow (`item` rows with `characterId` 0) until claimed. Only the game sends
  mail for now; the `sender` column (`System` / `Player`) leaves room for player gifts.
- **Idle progress without a server tick.** A `character` row is a snapshot as of
  `lastSettledAt`. Gains since then are computed by `project()` in `game.ts`, which both sides
  share: the client runs it on a timer for display; the server runs it only when it must know
  the exact state (connect, disconnect, spending). Offline time is capped at 8h on reconnect.
  An idle game therefore costs nothing while nobody is acting.
- **Server-authoritative.** Clients only call reducers (`createCharacter`, `buyUpgrade`,
  `sendChat`, …); the server recomputes progress itself and never trusts client numbers.
- **Bandwidth.** Each client subscribes only to its own character row (plus presence and chat).

Game design docs live in [docs/design/](docs/design/README.md).

## Dev setup (first time)

Requirements: **Node.js 22+** (includes npm) and **Git**.

1. **Install the SpacetimeDB CLI** (version 2.x):
   - Windows (PowerShell):
     ```powershell
     iwr https://windows.spacetimedb.com -useb | iex
     ```
   - macOS / Linux:
     ```sh
     curl -sSf https://install.spacetimedb.com | sh
     ```

   Then **open a new terminal** (on Windows, fully restart VS Code if you use its
   terminal) so `spacetime` is on your PATH, and check:
   ```sh
   spacetime --version
   ```
2. **Clone and install dependencies.** The client (repo root) and the server module
   (`spacetimedb/`) are separate npm projects, so install both:
   ```sh
   git clone <repo-url> mmo-idle-rpg
   cd mmo-idle-rpg
   npm install
   npm run server:install
   ```
3. **Optional: environment files.** Defaults point at the local server, so this is only
   needed for Maincloud or login. Vite picks the file by mode, so you never swap values:
   ```sh
   cp .env.example .env                       # shared values (login client ID)
   # .env.development: `npm run dev`   -> local server
   # .env.production:  `npm run build` -> Maincloud
   ```
   See [Environment files](#environment-files) for the contents.
4. **Check everything compiles:**
   ```sh
   npm run typecheck
   ```

No account or login is needed for local development; the CLI creates a local-only
identity on first publish.

## Local development

First time only, publish the module to the local server (with `spacetime:start` running):

```sh
npm run spacetime:publish:local
```

The local server keeps published modules and their data on disk, so after that every
session is just:

```sh
npm run spacetime:start            # terminal 1: local SpacetimeDB on :3000 (keep running)
npm run dev                        # terminal 2: open http://localhost:5173
```

The generated client bindings (`src/module_bindings/`) are committed, so you only need
`npm run spacetime:generate` after changing the server module.

Open two browser windows (one in a private window) to see multiplayer chat and the online list.

After changing the server: publish again, then regenerate the bindings. If you make a breaking
schema change (removing or changing columns), use `npm run spacetime:publish:local:reset`
(**this wipes the local database**).

Server logs: `npm run spacetime:logs:local`.

**Dev cheats.** In `npm run dev`, Settings has a Dev cheats card: reveal every item,
enemy and area, unlock all zones, grant gold and Dust, and give any gear or unique. The
server only accepts them when the database's `DEV_CHEATS` environment value is `1`, which
`spacetime:publish:local` sets and `npm run deploy` never does, so they're dead on
Maincloud (`spacetime env list --server maincloud <db>` to check).

Tests: with the local server running and the module published,
`npm run test:smoke` runs an end-to-end check with two guest clients.

## Enabling login (SpacetimeAuth)

Without this the game is guest-only, which is fine for development.

1. On spacetimedb.com, create a SpacetimeAuth project and open its default client.
2. Add redirect URIs **and** post-logout redirect URIs: `http://localhost:5173/` plus your
   production URL (with the trailing `/`).
3. Put the client ID in `OIDC_CLIENT_IDS` in `spacetimedb/src/config.ts` and republish.
4. Put the same ID in `.env` as `VITE_SPACETIMEAUTH_CLIENT_ID` and restart `npm run dev`.
5. Optional: enable Google/Discord/GitHub under Identity Providers (magic-link email works
   out of the box).
6. To make yourself admin, set `ADMIN_EMAILS=you@example.com` (comma-separated for more) in
   `.env.production` for Maincloud and `.env` for local, then republish (`npm run deploy`,
   `npm run spacetime:publish:local`). The scripts pass it to the database, so no address
   is ever in git. Every login with that email gets Admin on connect (Google, magic link,
   …), but only when SpacetimeAuth marks the email verified; a magic-link login always is.
   Removing it takes Admin away on the next connect. For one specific login instead, use its `sub` claim in
   `ADMIN_SUBJECTS`. Both are shown in the browser console while logged in:
   `JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('oidc.user:')))).profile`.

SpacetimeAuth is in beta. Login sessions expire; the client sends the player back through
login when that happens (usually instant).

## Sending mail

Mail is sent by an admin identity (`ADMIN_IDENTITIES` in `config.ts`, which holds the CLI
login: `spacetime login show`) with `spacetime call`. Arguments are JSON, in order:
recipients, subject, body, gift, days.

```sh
# To two characters (names in any case), with attachments, expiring in 30 days:
spacetime call --server maincloud <db> send_mail '["Alice","Bob"]' '"Sorry about the outage"' '"Here is something for the trouble."' '"gold:50000 dust:2000 mat:101x20 supply:311x3"' 30
# To every character, no attachments, never expiring:
spacetime call --server maincloud <db> send_mail '[]' '"Patch 0.2 is live"' '"The notes are in What is new."' '""' 0
```

- **Recipients:** `[]` sends to every character that exists now (later characters don't
  get it). One unknown name fails the whole send.
- **Gift tokens** (space separated, repeat to add up): `gold:N`, `dust:N`, `tokens:N` (raid
  tokens), `mat:ID×N`, `supply:ID×N`, `cosmetic:ID`, `item:BASE/TIER/RARITY`, `unique:ID`
  (`×` may be written `x`). IDs are the ones in `spacetimedb/src/data/`. Every recipient
  gets their own freshly rolled items. A typo fails the send, so nothing goes out half-made.
- **Days:** the mail and its unclaimed attachments are deleted that long after sending; `0`
  keeps it until the player deletes it.
- **Audit and recall:** every send is a `sent_mail` row
  (`spacetime sql <db> "SELECT * FROM sent_mail"`). `spacetime call <db> recall_mail <id>`
  deletes the copies nobody has claimed yet.

## Deploying to Maincloud (free tier)

```sh
spacetime login
npm run spacetime:publish -- <your-unique-db-name>
```

Then point the production build at it in `.env.production` (see
[Environment files](#environment-files)):

```
VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DB_NAME=<your-unique-db-name>
```

`npm run build` outputs a static site in `dist/` that can be hosted anywhere.

### Environment files

Vite loads `.env`, then the file for the current mode on top of it. All are gitignored
(only `.env.example` is committed). Later wins; `.env.local` overrides everything.

| File | Used by | Contents |
|-|-|-|
| `.env` | every mode | `VITE_SPACETIMEAUTH_CLIENT_ID` (omit for guest-only) |
| `.env.development` | `npm run dev` | `VITE_SPACETIMEDB_HOST=ws://localhost:3000`, `VITE_SPACETIMEDB_DB_NAME=mmo-idle-rpg` |
| `.env.production` | `npm run build` | `VITE_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com`, `VITE_SPACETIMEDB_DB_NAME=<your-unique-db-name>` |
| `.env.local` | every mode | Optional personal override, e.g. run `npm run dev` against Maincloud |

### Hosting the client (Cloudflare Pages)

The live client is a Cloudflare Pages project, `mmo-idle-rpg-test`
(https://mmo-idle-rpg-test.pages.dev). Vite inlines the `VITE_*` values from `.env` and
`.env.production` at build time, so build on a machine that has them set.

```sh
npx wrangler login        # first time only
npm run build
npx wrangler pages deploy dist --project-name mmo-idle-rpg-test
```

Always use the same `--project-name`; a different name creates a separate site with a
different URL. The hashed URL printed after each deploy is a snapshot of that deploy, share
the stable `*.pages.dev` URL instead.

### What to run after a change

Publish the server first, then the client, so a new client never talks to an old module.

| Changed|Do|
|-|-|
| Client only (`src/`, CSS, `index.html`) | `npm run build`, then `wrangler pages deploy` |
| Server logic only (reducers, data, balance in `spacetimedb/src/`; no table/column changes) | `npm run spacetime:publish -- <db-name>`, then rebuild and deploy the client if it imports shared files from `spacetimedb/src/` (it does for game data) |
| Tables, columns, or reducer signatures | `npm run spacetime:publish -- <db-name>`, `npm run spacetime:generate`, `npm run typecheck`, `npm run build`, `wrangler pages deploy` |
| Breaking schema change (removing or changing columns) | Same as above, but publish with `--delete-data`. This **wipes all players**, so warn testers first |
| `.env*` values (`VITE_*`) | Rebuild and redeploy the client; the module is unaffected |
| `OIDC_CLIENT_IDS` or `ADMIN_SUBJECTS` in `config.ts`, or `ADMIN_EMAILS` in `.env*` | Publish the module (add `--delete-data` only if the schema also broke) |
| New site URL or project name | Add it to the SpacetimeAuth redirect and post-logout redirect URIs (with trailing `/`) |

Checklist before deploying: `npm run typecheck`, then the relevant `npm run test:*` scripts
against a local server, and make sure `dist/` was built after the last change.

### Changelog

Players see `src/changelog.ts` in the "What's new" popup: every entry newer than the
version they last saw. Write it for players: a `new`, `balance` or `fix` tag per line,
concrete numbers with the old value ("37,000, was 35,000"), and nothing internal (tests,
refactors, docs). Group the lines by tag: all `new` first, then `fix`, then `balance`.
Adding to an entry, put each line at the end of its group, not at the end of the list.

**Commit and push without deploying.** Changes that players will notice still get notes
right away, in a *pending* entry at the top of the list:

1. If the top entry is already pending (it has a `commit` field), add to it. Otherwise
   start one: bump `version` (minor for new content, patch for tuning and fixes) and give
   it a `title`.
2. Find what it doesn't cover yet: `git log <commit>..HEAD` (or `npm run changes`, which
   lists everything since the last deploy).
3. Set `date` to today and `commit` to the short hash of the last commit the notes now
   cover (`git rev-parse --short HEAD` before committing the changelog).
4. Commit the changelog on its own ("Changelog 0.1.1: ...").

**Deploy.** `npm run deploy` refuses when something changed since the last deploy but
`src/changelog.ts` didn't (`--no-changelog` skips that, for art and internal fixes). Before
deploying:

1. Catch up the pending entry with anything since its `commit` (step 2 above).
2. Set `date` to the deploy day and remove `commit`.
3. Commit, then deploy. The deploy moves the local `deployed` tag to HEAD, so the next
   `npm run changes` starts from there.

An entry players have already seen stays as it was; corrections go in the next one.

Free-tier notes: reducer calls, bandwidth, and storage use energy. With no server tick, cost
scales with player actions only. Chat keeps the newest 200 messages. Guest accounts that
never return are never deleted yet.
