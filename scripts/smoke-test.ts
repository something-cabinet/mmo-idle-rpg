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

await expectError('invalid name rejected', a.conn.reducers.createCharacter({ name: 'x', starterWeapon: 1 }), 'Name must be');
await expectError('non-starter weapon rejected', a.conn.reducers.createCharacter({ name: `Alice_${suffix}`, starterWeapon: 7 }), 'starter weapon');
await a.conn.reducers.createCharacter({ name: `Alice_${suffix}`, starterWeapon: 1 });
const createdAt = Date.now();
await sleep(200);
check('character created and in world', !!charOf(a) && !!presOf(a));
{
  const created = charOf(a)!;
  const loadouts = [...a.conn.db.myLoadouts.iter()];
  const filter = [...a.conn.db.myLootFilter.iter()][0];
  check('new character starts in Greenhollow vs Field Rat', created.zoneId === 1 && created.targetEnemyId === 101);
  const items = [...a.conn.db.myItems.iter()];
  const kit = loadouts.find(l => l.index === 0)?.slots ?? [];
  const idOf = (baseId: number) => items.find(i => i.baseId === baseId)?.id;
  check('new character has 4 loadouts', loadouts.length === 4 && loadouts.every(l => l.slots.length === 9), `${loadouts.length} loadouts`);
  check('starter kit: Common T1 sword, vest and boots', items.length === 3 &&
    items.every(i => i.rarity.tag === 'Common' && i.tier === 1 && i.affixes.length === 0) &&
    [1, 35, 37].every(id => idOf(id) !== undefined), items.map(i => i.baseId).join());
  check('starter kit equipped in loadout 0 (main hand, chest, feet)',
    kit[0] === idOf(1) && kit[3] === idOf(35) && kit[5] === idOf(37) && kit.filter(id => id !== 0n).length === 3);
  check('new character has a loot filter (Magic+)', filter?.minRarity.tag === 'Magic');
  check('bag size 200', created.bagSize === 200);
}
await expectError('second character rejected', a.conn.reducers.createCharacter({ name: `Other_${suffix}`, starterWeapon: 1 }), 'already have');

const b = await connect();
await expectError('name taken (case-insensitive)', b.conn.reducers.createCharacter({ name: `alice_${suffix}`, starterWeapon: 1 }), 'taken');
await expectError('chat without character rejected', b.conn.reducers.sendChat({ text: 'hi' }), 'Not in the world');

await a.conn.reducers.setLootFilter({ minRarity: { tag: 'Rare' }, keepAffixes: [22, 22, 6] });
await sleep(200);
{
  const filter = [...a.conn.db.myLootFilter.iter()][0];
  check('loot filter saved (deduplicated)', filter?.minRarity.tag === 'Rare' && filter.keepAffixes.join() === '22,6', filter?.keepAffixes.join());
}
await expectError('unknown affix in filter rejected', a.conn.reducers.setLootFilter({ minRarity: { tag: 'Rare' }, keepAffixes: [999] }), 'Unknown affix');

await sleep(1100);
await a.conn.reducers.sendChat({ text: 'hello world' });
await expectError('chat rate limit', a.conn.reducers.sendChat({ text: 'spam' }), 'Slow down');

await expectError('unknown enemy rejected', a.conn.reducers.setTarget({ enemyId: 999 }), 'No such enemy');
await expectError('locked zone rejected', a.conn.reducers.setTarget({ enemyId: 201 }), 'Zone is locked');
await expectError('boss needs a first kill', a.conn.reducers.setTarget({ enemyId: 106 }), 'Defeat the boss first');
{
  // A starter sword kills a Field Rat every ~8.3 s (3.3 s fight + 5 s respawn).
  const wait = createdAt + 9_500 - Date.now();
  console.log(`… waiting ${(wait / 1000).toFixed(1)} s for a rat kill`);
  await sleep(wait);
  const before = charOf(a)!.lastSettledAt.microsSinceUnixEpoch;
  await a.conn.reducers.setTarget({ enemyId: 102 });
  await sleep(200);
  const ch = charOf(a)!;
  check('target change settles and switches target', ch.targetEnemyId === 102 && ch.lastSettledAt.microsSinceUnixEpoch > before);
  check('starter kit earns idle XP and gold from rats', ch.xp >= 7n && ch.gold >= 2n, `xp=${ch.xp} gold=${ch.gold}`);
}

// Bosses: a fresh character loses to Grubnak (winning needs gear the test can't get).
await expectError('unknown zone rejected', a.conn.reducers.challengeBoss({ zoneId: 9 }), 'No such zone');
await expectError('locked zone boss rejected', a.conn.reducers.challengeBoss({ zoneId: 2 }), 'Zone is locked');
await expectError('starter kit loses to Grubnak, with the numbers', a.conn.reducers.challengeBoss({ zoneId: 1 }), 'Grubnak, Goblin Chief wins');
check('a lost challenge records no kill', [...a.conn.db.myBossKills.iter()].length === 0);

// Equipment: slots, loadouts, auto-equip, lock and salvage.
{
  const lo = (i: number) => [...a.conn.db.myLoadouts.iter()].find(l => l.index === i)!;
  const items = () => [...a.conn.db.myItems.iter()];
  const idOf = (baseId: number) => items().find(i => i.baseId === baseId)!.id;
  const vest = idOf(35);
  const boots = idOf(37);

  await expectError("item in the wrong slot rejected", a.conn.reducers.equip({ loadout: 0, slot: 2, itemId: vest }), "doesn't fit");
  await expectError('unknown item rejected', a.conn.reducers.equip({ loadout: 0, slot: 3, itemId: 999_999n }), 'No such item');
  await a.conn.reducers.unequip({ loadout: 0, slot: 3 });
  await sleep(200);
  check('unequip empties the slot', lo(0).slots[3] === 0n);
  await a.conn.reducers.equip({ loadout: 0, slot: 3, itemId: vest });
  await sleep(200);
  check('equip fills the slot', lo(0).slots[3] === vest);

  await a.conn.reducers.renameLoadout({ loadout: 1, name: '  Raid  ' });
  await a.conn.reducers.setProfile({ loadout: 1, profile: { tag: 'Survival' } });
  await expectError('empty loadout name rejected', a.conn.reducers.renameLoadout({ loadout: 1, name: ' ' }), 'Name must be');
  await a.conn.reducers.autoEquip({ loadout: 1 });
  await sleep(200);
  check('rename and profile saved', lo(1).name === 'Raid' && lo(1).profile.tag === 'Survival');
  check('auto-equip fills an empty loadout from owned items', lo(1).slots.filter(id => id !== 0n).length === 3, lo(1).slots.join());

  await a.conn.reducers.switchLoadout({ loadout: 1 });
  await sleep(200);
  check('switch loadout', charOf(a)!.activeLoadout === 1);
  await expectError('unknown loadout rejected', a.conn.reducers.switchLoadout({ loadout: 7 }), 'No such loadout');
  await a.conn.reducers.switchLoadout({ loadout: 0 });

  await expectError('equipped item cannot be salvaged', a.conn.reducers.salvage({ itemIds: [boots] }), 'in a loadout');
  await a.conn.reducers.unequip({ loadout: 0, slot: 5 });
  await a.conn.reducers.unequip({ loadout: 1, slot: 5 });
  await a.conn.reducers.lockItem({ itemId: boots, locked: true });
  await expectError('locked item cannot be salvaged', a.conn.reducers.salvage({ itemIds: [boots] }), 'locked');
  await a.conn.reducers.lockItem({ itemId: boots, locked: false });
  const essence = charOf(a)!.essence;
  await a.conn.reducers.salvage({ itemIds: [boots] });
  await sleep(200);
  check('salvage turns a bag item into Essence', !items().some(i => i.id === boots) && charOf(a)!.essence === essence + 1n,
    `essence ${essence} → ${charOf(a)!.essence}`);
}

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
