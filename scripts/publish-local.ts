// Publishes the module to the local server with the dev cheats on (DEV_CHEATS=1,
// reducers/dev.ts). Maincloud never gets this value (scripts/deploy.ts strips it).
//   npm run spacetime:publish:local            # keep data
//   npm run spacetime:publish:local:reset      # wipe the local database
import { spawnSync } from 'node:child_process';

const reset = process.argv.includes('--delete-data');
const cmd = `spacetime publish --module-path spacetimedb --server local${reset ? ' --delete-data' : ''} mmo-idle-rpg`;
console.log(`> DEV_CHEATS=1 ${cmd}`);
const { status } = spawnSync(cmd, { stdio: 'inherit', shell: true, env: { ...process.env, DEV_CHEATS: '1' } });
process.exit(status ?? 1);
