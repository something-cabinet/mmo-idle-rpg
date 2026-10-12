// Publishes the module to Maincloud, then builds and deploys the client to Cloudflare Pages.
// The database name comes from the same env files `vite build` reads, so the module and the
// client always point at the same database.
//   npm run deploy                    # typecheck, publish module, regenerate bindings, build, deploy
//   npm run deploy -- --client-only   # skip the module publish (client-only change)
//   npm run deploy -- --server-only   # publish the module only
//   npm run deploy -- --delete-data   # breaking schema change: WIPES ALL PLAYERS on Maincloud
//   npm run deploy -- --skip-checks   # skip typecheck
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const PAGES_PROJECT = 'mmo-idle-rpg-test';

const args = new Set(process.argv.slice(2));
const clientOnly = args.has('--client-only');
const serverOnly = args.has('--server-only');
const deleteData = args.has('--delete-data');
const skipChecks = args.has('--skip-checks');

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
