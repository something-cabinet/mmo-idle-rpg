// End-to-end smoke test against a local SpacetimeDB:
//   npm run spacetime:start; npm run spacetime:publish:local:reset; npm run test:smoke
import { DbConnection } from '../src/module_bindings';
import type { Identity } from 'spacetimedb';

const HOST = process.env.SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB = process.env.SPACETIMEDB_DB_NAME ?? 'mmo-idle-rpg';

type Client = { conn: DbConnection; me: Identity; token: string };

function connect(token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn, me, t) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, me, token: t }))
          .subscribeToAllTables();
      })
      .onConnectError((_c, e) => reject(e))
      .build();
  });
}

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
async function expectError(name: string, p: Promise<unknown>, match: string) {
  try {
    await p;
    check(name, false, 'expected an error');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, msg.includes(match), msg);
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const charOf = (c: Client) => [...c.conn.db.character.iter()].find(ch => ch.owner.isEqual(c.me));
const presOf = (c: Client) => c.conn.db.presence.identity.find(c.me);
const suffix = Date.now().toString(36).slice(-5);

const a = await connect();
const acc = [...a.conn.db.myAccount.iter()][0];
check('guest gets an account', acc?.kind.tag === 'Guest' && acc.role.tag === 'Player');
check('new account has no character', !charOf(a) && !presOf(a));

await expectError('invalid name rejected', a.conn.reducers.createCharacter({ name: 'x' }), 'Name must be');
await a.conn.reducers.createCharacter({ name: `Alice_${suffix}` });
await sleep(200);
check('character created and in world', !!charOf(a) && !!presOf(a));
await expectError('second character rejected', a.conn.reducers.createCharacter({ name: `Other_${suffix}` }), 'already have');

const b = await connect();
await expectError('name taken (case-insensitive)', b.conn.reducers.createCharacter({ name: `alice_${suffix}` }), 'taken');
await expectError('chat without character rejected', b.conn.reducers.sendChat({ text: 'hi' }), 'Not in the world');

await expectError('upgrade without gold rejected', a.conn.reducers.buyUpgrade({}), 'Not enough gold');
await sleep(1100);
await a.conn.reducers.sendChat({ text: 'hello world' });
await expectError('chat rate limit', a.conn.reducers.sendChat({ text: 'spam' }), 'Slow down');

console.log('… waiting 10s of idle time for 10 gold');
await sleep(10_500);
await a.conn.reducers.buyUpgrade({});
await sleep(200);
const ch = charOf(a)!;
check('idle gold earned and spent on upgrade', ch.power === 2, `power=${ch.power} gold=${ch.gold}`);

// Second tab of the same account takes over; closing it leaves the world.
const a2 = await connect(a.token);
await sleep(200);
check('second tab takes over presence', presOf(a2)?.connectionId.isEqual(a2.conn.connectionId) ?? false);
a2.conn.disconnect();
await sleep(500);
check('closing the playing tab leaves the world', !presOf(a));
await a.conn.reducers.playHere({});
await sleep(200);
check('play here re-enters', presOf(a)?.connectionId.isEqual(a.conn.connectionId) ?? false);

await expectError('non-admin cannot ban', a.conn.reducers.setBanned({ target: b.me, banned: true }), 'Admins only');
await b.conn.reducers.offerLink({ target: a.me });
await expectError('guest cannot accept a link', a.conn.reducers.acceptLink({ guest: b.me, discardGuestCharacter: false }), 'Log in first');

a.conn.disconnect();
b.conn.disconnect();
console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
