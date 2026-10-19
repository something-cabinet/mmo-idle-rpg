// Publishes the module to Maincloud, then builds and deploys the client to Cloudflare Pages.
// The database name comes from the same env files `vite build` reads, so the module and the
// client always point at the same database.
//   npm run deploy                    # typecheck, publish module, regenerate bindings, build, deploy
//   npm run deploy -- --client-only   # skip the module publish (client-only change)
//   npm run deploy -- --server-only   # publish the module only
//   npm run deploy -- --delete-data   # breaking schema change: WIPES ALL PLAYERS on Maincloud
//   npm run deploy -- --skip-checks   # skip typecheck
//   npm run deploy -- --no-changelog  # ship without a new src/changelog.ts entry (art, internal fixes)
// Each successful deploy moves the local git tag `deployed` to HEAD; the next deploy refuses
// when something changed since then but src/changelog.ts didn't.
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const PAGES_PROJECT = 'mmo-idle-rpg-test';

const args = new Set(process.argv.slice(2));
const clientOnly = args.has('--client-only');
const serverOnly = args.has('--server-only');
const deleteData = args.has('--delete-data');
const skipChecks = args.has('--skip-checks');
const noChangelog = args.has('--no-changelog');
const DEPLOYED_TAG = 'deployed';

/** Whether `git diff` against the last deploy (working tree included) finds changes in `paths`. */
function changedSinceDeploy(...paths: string[]) {
  return spawnSync('git', ['diff', '--quiet', DEPLOYED_TAG, '--', ...paths]).status === 1;
}

// The dev cheats (reducers/dev.ts) must never be switched on in production: drop the
// value so a shell that happens to have it set can't publish it to Maincloud.
delete process.env.DEV_CHEATS;

function run(cmd: string) {
  console.log(`\n> ${cmd}`);
  const { status } = spawnSync(cmd, { stdio: 'inherit', shell: true });
  if (status !== 0) {
    console.error(`\nDeploy aborted: "${cmd}" exited with ${status}`);
    process.exit(status ?? 1);
  }
}

if (clientOnly && serverOnly) {
  console.error('--client-only and --server-only are mutually exclusive');
  process.exit(1);
}

const env = loadEnv('production', process.cwd(), 'VITE_');
const host = env.VITE_SPACETIMEDB_HOST ?? '';
const dbName = env.VITE_SPACETIMEDB_DB_NAME;
if (!host.includes('maincloud') || !dbName) {
  console.error(
    'Production env must set VITE_SPACETIMEDB_HOST (Maincloud) and VITE_SPACETIMEDB_DB_NAME.\n' +
    `Got host="${host}", db="${dbName ?? ''}". Check .env.production (and .env.local, which overrides it).`,
  );
  process.exit(1);
}
const hasTag = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${DEPLOYED_TAG}^{commit}`]).status === 0;
if (!hasTag) {
  console.log(`No "${DEPLOYED_TAG}" git tag yet: skipping the changelog check.`);
} else if (!noChangelog && changedSinceDeploy('.') && !changedSinceDeploy('src/changelog.ts')) {
  console.error(
    `Nothing new in src/changelog.ts since the last deploy (git tag "${DEPLOYED_TAG}").\n` +
    'Add an entry for what players will notice, or pass --no-changelog if there is nothing to tell.\n' +
    `Changes since then: git log --oneline ${DEPLOYED_TAG}..HEAD`,
  );
  process.exit(1);
}

console.log(`Deploying db "${dbName}" (${host}) -> Cloudflare Pages "${PAGES_PROJECT}"`);

if (!skipChecks) run('npm run typecheck');

if (!clientOnly) {
  // Auto-confirm every prompt except the data wipe, so --delete-data still asks before destroying players.
  const yes = '--yes=remote,migrate,break-clients,skip-login';
  run(`spacetime publish --module-path spacetimedb --server maincloud ${yes}${deleteData ? ' --delete-data' : ''} ${dbName}`);
  run('npm run spacetime:generate');
}

if (!serverOnly) {
  run('npm run build');
  run(`npx wrangler pages deploy dist --project-name ${PAGES_PROJECT}`);
  console.log(`\nLive at https://${PAGES_PROJECT}.pages.dev`);
}

// Marks what went out, for the next deploy's changelog check (uncommitted changes deployed
// along with it aren't recorded: commit first).
spawnSync('git', ['tag', '-f', DEPLOYED_TAG, 'HEAD']);
