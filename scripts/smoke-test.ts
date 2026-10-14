// End-to-end smoke test against a local SpacetimeDB:
//   npm run spacetime:start; npm run spacetime:publish:local:reset; npm run test:smoke
import { DbConnection } from '../src/module_bindings';
import type { Identity } from 'spacetimedb';
import { combatStats, matchup } from '../spacetimedb/src/combat';
import { ENEMIES_BY_ID } from '../spacetimedb/src/data/zones';
import { RAIDS_BY_ID } from '../spacetimedb/src/data/raids';
import { decodeSetup, raidRng, simulateRaid } from '../spacetimedb/src/raid';
import { RARITIES } from '../spacetimedb/src/loot';

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
/** The active loadout's items, as the server's combat formulas see them. */
const starterGear = (c: Client) => {
  const lo = [...c.conn.db.myLoadouts.iter()].find(l => l.index === charOf(c)!.activeLoadout)!;
  return lo.slots.map(id => (id === 0n ? undefined : c.conn.db.myItems.id.find(id) ?? undefined));
};
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

await a.conn.reducers.setLootFilter({ minRarity: { tag: 'Rare' }, keepAffixes: [22, 22, 6], keepTypes: [1, 1, 8], minAffixTier: 3 });
await sleep(200);
{
  const filter = [...a.conn.db.myLootFilter.iter()][0];
  check('loot filter saved (deduplicated)',
    filter?.minRarity.tag === 'Rare' && filter.keepAffixes.join() === '22,6' && filter.keepTypes.join() === '1,8' && filter.minAffixTier === 3,
    `${filter?.keepAffixes.join()} / ${filter?.keepTypes.join()} / ${filter?.minAffixTier}`);
}
const badFilter = { minRarity: { tag: 'Rare' as const }, keepAffixes: [], keepTypes: [], minAffixTier: 1 };
await expectError('unknown affix in filter rejected', a.conn.reducers.setLootFilter({ ...badFilter, keepAffixes: [999] }), 'Unknown affix');
await expectError('unknown item type in filter rejected', a.conn.reducers.setLootFilter({ ...badFilter, keepTypes: [999] }), 'Unknown item type');
await expectError('affix tier 0 in filter rejected', a.conn.reducers.setLootFilter({ ...badFilter, minAffixTier: 0 }), 'Bad affix tier');

await sleep(1100);
await a.conn.reducers.sendChat({ text: 'hello world' });
await expectError('chat rate limit', a.conn.reducers.sendChat({ text: 'spam' }), 'Slow down');

await expectError('unknown enemy rejected', a.conn.reducers.setTarget({ enemyId: 999 }), 'No such enemy');
await expectError('secret enemy hidden until its area is found', a.conn.reducers.setTarget({ enemyId: 107 }), 'No such enemy');
await expectError('locked zone rejected', a.conn.reducers.setTarget({ enemyId: 201 }), 'Zone is locked');
{
  // A starter sword kills a Field Rat every ~8.3 s (5 s walk + ~3.3 s live fight, which varies).
  const wait = createdAt + 11_000 - Date.now();
  console.log(`… waiting ${(wait / 1000).toFixed(1)} s for a rat kill`);
  await sleep(wait);
  const before = charOf(a)!.lastSettledAt.microsSinceUnixEpoch;
  await a.conn.reducers.setTarget({ enemyId: 102 });
  await sleep(200);
  const ch = charOf(a)!;
  check('target change settles and switches target', ch.targetEnemyId === 102 && ch.lastSettledAt.microsSinceUnixEpoch > before);
  check('starter kit earns idle XP and gold from rats', ch.xp >= 7n && ch.gold >= 2n, `xp=${ch.xp} gold=${ch.gold}`);
  const logs = [...a.conn.db.mySettleLog.iter()].sort((x, y) => (x.id < y.id ? -1 : 1));
  const login = logs.find(l => l.offline);
  check('entering the world logs the login settle', !!login && login.at.microsSinceUnixEpoch === presOf(a)!.since.microsSinceUnixEpoch);
  const last = logs.at(-1)!;
  check('a settle with kills is logged with its rewards', !last.offline && last.kills > 0 && last.enemyId === 101 &&
    last.xp === BigInt(last.kills * 7) && last.gold === BigInt(last.kills * 2) && last.viable &&
    last.salvaged.length === RARITIES.length && last.levelFrom === 1, `kills=${last.kills} xp=${last.xp} gold=${last.gold}`);
}

// Bosses: a fresh character loses to Grubnak (winning needs gear the test can't get).
await expectError('locked zone boss rejected', a.conn.reducers.setTarget({ enemyId: 206 }), 'Zone is locked');
await a.conn.reducers.setTarget({ enemyId: 106 });
check('a boss can be challenged as a target', charOf(a)!.targetEnemyId === 106);
{
  const stats = combatStats(charOf(a)!.level, starterGear(a));
  const m = matchup(stats, ENEMIES_BY_ID.get(106)!.enemy);
  // The live fight starts after the walk and varies in length: settle until it ends.
  const expected = stats.walkTime + m.timeToDie;
  await sleep(Math.ceil(expected * 1000));
  const lastLog = () => [...a.conn.db.mySettleLog.iter()].sort((x, y) => (x.id < y.id ? -1 : 1)).at(-1)!;
  for (let i = 0; i < 20 && !lastLog().defeated; i++) {
    await a.conn.reducers.settleNow({});
    await sleep(500);
  }
  const defeat = lastLog();
  check('the starter kit loses to Grubnak after the fight: a logged defeat', defeat.defeated && defeat.enemyId === 106 && !defeat.offline,
    `expected after ${expected.toFixed(1)} s`);
  check('… which leaves the character idle', charOf(a)!.targetEnemyId === 0);
  check('a lost challenge records no kill', [...a.conn.db.myBossKills.iter()].length === 0);
}

// Flee: back to a target, then idle on purpose.
await a.conn.reducers.setTarget({ enemyId: 101 });
await a.conn.reducers.flee({});
await sleep(200);
check('flee goes idle', charOf(a)!.targetEnemyId === 0);
await a.conn.reducers.setTarget({ enemyId: 101 });

// Life skills: gathering takes the place of combat; the target is kept for afterwards.
{
  const tools = [...a.conn.db.myTools.iter()];
  check('a new character has its skills and T1 tools', [...a.conn.db.mySkills.iter()].length === 5 && tools.length === 3 && tools.every(t => t.tier === 1));
  await expectError('unknown skill rejected', a.conn.reducers.startGathering({ skillId: 99, tier: 1 }), 'No such skill');
  await expectError('gathering a locked tier rejected', a.conn.reducers.startGathering({ skillId: 1, tier: 2 }), 'Unlock the tier 2 zone');
  await a.conn.reducers.startGathering({ skillId: 1, tier: 1 });
  await sleep(200);
  let ch = charOf(a)!;
  check('start gathering keeps the target', ch.activitySkill === 1 && ch.activityRecipe === 1 && ch.targetEnemyId === 101);
  // One action every 12 s.
  console.log('… waiting 13 s for a mining action');
  await sleep(13_000);
  await a.conn.reducers.settleNow({});
  await sleep(300);
  const log = [...a.conn.db.mySettleLog.iter()].sort((x, y) => (x.id < y.id ? -1 : 1)).at(-1)!;
  check('a gathering settle is logged', log.skillId === 1 && log.enemyId === 0 && log.kills === 0 && log.actions >= 1 &&
    log.skillXp === BigInt(log.actions * 2) && log.materials.some(m => m.materialId === 11 && m.count >= log.actions),
    `actions=${log.actions} xp=${log.skillXp}`);
  check('… with as much character XP as skill XP', log.xp === log.skillXp && log.gold === 0n, `xp=${log.xp}`);
  const mining = [...a.conn.db.mySkills.iter()].find(r => r.skillId === 1)!;
  check('… and its XP goes to the skill', mining.level === 1 && mining.xp >= 2n, `xp=${mining.xp}`);
  await a.conn.reducers.stopSkill({});
  await sleep(200);
  ch = charOf(a)!;
  check('stopping a skill goes back to the target', ch.activitySkill === 0 && ch.targetEnemyId === 101);
  await a.conn.reducers.startGathering({ skillId: 3, tier: 1 });
  await a.conn.reducers.setTarget({ enemyId: 101 });
  await sleep(200);
  check('picking a target stops the skill', charOf(a)!.activitySkill === 0);
}

// Production: Smithing and Alchemy run a queue instead of fighting, then go back to the target.
{
  const r = a.conn.reducers;
  await expectError('production without materials rejected', r.startProduction({ skillId: 12, recipe: 111, count: 1 }), 'Not enough materials');
  await expectError('a gathering skill has no recipes', r.startProduction({ skillId: 1, recipe: 111, count: 1 }), 'No such skill');
  await expectError('unknown recipe rejected', r.startProduction({ skillId: 12, recipe: 999, count: 1 }), 'No such recipe');
  await r.devGrantMaterials({ count: 1000 });
  await expectError('a locked tier rejected', r.startProduction({ skillId: 12, recipe: 112, count: 1 }), 'Unlock the tier 2 zone');
  await expectError('a tool upgrade needs its zone', r.startProduction({ skillId: 11, recipe: 1012, count: 1 }), 'Unlock the tier 2 zone');
  await expectError('a tool upgrade is one at a time', r.startProduction({ skillId: 11, recipe: 1012, count: 2 }), 'one at a time');
  await r.startProduction({ skillId: 12, recipe: 111, count: 3 });
  await sleep(200);
  let ch = charOf(a)!;
  check('a queue starts and keeps the target', ch.activitySkill === 12 && ch.activityRecipe === 111 && ch.activityCountLeft === 3 && ch.targetEnemyId === 101);
  await r.startProduction({ skillId: 11, recipe: 11, count: 2 }); // forge 2 T1 Rusted Swords
  await sleep(200);
  ch = charOf(a)!;
  check('another queue replaces it', ch.activitySkill === 11 && ch.activityRecipe === 11 && ch.activityCountLeft === 2);
  await r.stopSkill({});
  await sleep(200);
  check('stopping a queue goes back to the target', charOf(a)!.activitySkill === 0 && charOf(a)!.targetEnemyId === 101);

  // Elixirs: drink one, kills use its charges.
  await expectError('drinking with none in stock rejected', r.drinkElixir({ supplyId: 111 }), 'None in stock');
  await r.devGrantSupplies({ count: 2 });
  await r.drinkElixir({ supplyId: 111 });
  await sleep(200);
  ch = charOf(a)!;
  const stock = () => Number([...a.conn.db.mySupplies.iter()].find(x => x.supplyId === 111)?.count ?? 0n);
  check('drinking sets the elixir and takes one from stock', ch.elixirId === 111 && ch.elixirKillsLeft === 240 && stock() === 1, `${ch.elixirId} ${ch.elixirKillsLeft} ${stock()}`);
  console.log('… waiting 8 s for kills with the elixir');
  await sleep(8_000);
  await r.settleNow({});
  await sleep(300);
  ch = charOf(a)!;
  const log = [...a.conn.db.mySettleLog.iter()].sort((x, y) => (x.id < y.id ? -1 : 1)).at(-1)!;
  check('kills use its charges and are logged', log.kills > 0 && log.elixirId === 111 && log.elixirKills === log.kills && ch.elixirKillsLeft === 240 - log.kills,
    `kills=${log.kills} elixirKills=${log.elixirKills} left=${ch.elixirKillsLeft}`);
  await r.setElixirAutoRenew({ on: false });
  await sleep(200);
  check('auto-renew can be turned off', charOf(a)!.elixirAutoRenew === false);
  await r.setElixirAutoRenew({ on: true });
}

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
  await a.conn.reducers.autoEquip({ loadout: 1, profile: 'Survival', weights: [] });
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
  const dust = charOf(a)!.dust;
  await a.conn.reducers.salvage({ itemIds: [boots] });
  await sleep(200);
  check('salvage turns a bag item into Dust', !items().some(i => i.id === boots) && charOf(a)!.dust === dust + 1n,
    `dust ${dust} → ${charOf(a)!.dust}`);
}

// Crafting: a fresh character can't pay, so only the checks before payment are reachable.
{
  const vest = [...a.conn.db.myItems.iter()].find(i => i.baseId === 35)!.id;
  await expectError('Common has no affix to reroll', a.conn.reducers.rerollAffix({ itemId: vest, affixIndex: 0 }), 'No such affix');
  await expectError('upgrade needs gold (Common T1: 300)', a.conn.reducers.upgradeRarity({ itemId: vest, removeAffix: undefined }), 'Not enough gold: costs 300');
  await expectError('bag expansion needs gold (50,000)', a.conn.reducers.expandBag({}), 'Not enough gold: costs 50000');
  await expectError('unknown item cannot be crafted', a.conn.reducers.rerollAffix({ itemId: 999_999n, affixIndex: 0 }), 'No such item');
  check('failed crafts change nothing', [...a.conn.db.myItems.iter()].find(i => i.id === vest)?.rarity.tag === 'Common' && charOf(a)!.bagSize === 200);
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

// Inspecting another online player: their character, active loadout and worn items.
await expectError('inspect without character rejected', b.conn.reducers.inspectCharacter({ characterId: charOf(a)!.id }), 'Not in the world');
await b.conn.reducers.createCharacter({ name: `Bob_${suffix}`, starterWeapon: 1 });
await sleep(200);
await expectError('inspect offline character rejected', b.conn.reducers.inspectCharacter({ characterId: 999_999n }), 'not online');
await b.conn.reducers.inspectCharacter({ characterId: charOf(a)!.id });
await sleep(200);
{
  const worn = starterGear(a).filter(Boolean).map(i => String(i!.id)).sort().join();
  const seen = [...b.conn.db.inspectedItems.iter()].map(i => String(i.id)).sort().join();
  check('inspect shows the character', [...b.conn.db.inspectedCharacter.iter()][0]?.id === charOf(a)!.id);
  check('inspect shows the active loadout', [...b.conn.db.inspectedLoadout.iter()][0]?.index === charOf(a)!.activeLoadout);
  check('inspect shows only worn items', worn !== '' && seen === worn, `${seen} vs ${worn}`);
}
await b.conn.reducers.inspectCharacter({ characterId: 0n });
await sleep(200);
check('stop inspecting clears the views', b.conn.db.inspectedCharacter.count() === 0n && b.conn.db.inspectedItems.count() === 0n);

// Raids: party up, hire NPCs, start; the scheduled finish logs it. The dev cheats unlock the raid and pay for the hires.
{
  const partyOf = (c: Client) => {
    const m = c.conn.db.raidMember.characterId.find(charOf(c)!.id);
    return m ? c.conn.db.raidParty.id.find(m.partyId) : undefined;
  };
  await expectError('raid locked before the T3 boss', a.conn.reducers.createRaidParty({ raidId: 1 }), 'to unlock');
  await a.conn.reducers.devUnlockZones({});
  await b.conn.reducers.devUnlockZones({});
  await expectError('unknown raid rejected', a.conn.reducers.createRaidParty({ raidId: 99 }), 'No such raid');
  await a.conn.reducers.createRaidParty({ raidId: 1 });
  await sleep(200);
  const party = partyOf(a)!;
  check('a raid party is formed, led by its creator', party?.leaderId === charOf(a)!.id);
  await expectError('one raid party at a time', a.conn.reducers.createRaidParty({ raidId: 1 }), 'Leave your raid party first');
  await b.conn.reducers.joinRaidParty({ partyId: party.id });
  await expectError('only the leader hires', b.conn.reducers.setRaidHires({ count: 1 }), 'Only the party leader');
  await expectError('no more hires than empty seats', a.conn.reducers.setRaidHires({ count: 3 }), 'Not enough empty seats');
  await a.conn.reducers.setRaidHires({ count: 2 });
  await sleep(200);
  check('two NPCs hired', partyOf(a)!.hired === 2);
  check("members see each other's gear through the party views", b.conn.db.raidPartyCharacters.count() === 2n && b.conn.db.raidPartyLoadouts.count() === 2n &&
    b.conn.db.raidPartyItems.count() > 0n);
  if (charOf(a)!.gold < 4000n) await expectError('hires need gold', a.conn.reducers.startRaid({}), 'costs 4');
  await a.conn.reducers.devGrant({ gold: 4000n, dust: 0n });
  await sleep(200);
  const gold = charOf(a)!.gold;
  await expectError('only the leader starts', b.conn.reducers.startRaid({}), 'Only the party leader');
  await a.conn.reducers.startRaid({});
  await sleep(200);
  const fight = partyOf(a)!.fight!;
  check('the fight starts with 2 players and 2 NPCs', !!fight && !fight.finished && decodeSetup(fight.setup).fighters.map(f => f.characterId === 0n).join() === 'false,false,true,true');
  check('the leader paid 4,000 gold for the hires', fight.hireCost === 4000n && charOf(a)!.gold >= gold - 4000n && charOf(a)!.gold <= gold + 500n - 4000n,
    `${gold} → ${charOf(a)!.gold}`);
  await expectError('no leaving mid-fight', b.conn.reducers.leaveRaid({}), 'wait for it');
  await expectError('no joining mid-fight', a.conn.reducers.joinRaidParty({ partyId: party.id }), 'Leave your raid party first');
  // Level-1 characters wipe within seconds.
  const left = Number(fight.endsAt.microsSinceUnixEpoch / 1000n) - Date.now();
  console.log(`… waiting ${(Math.max(0, left) / 1000 + 1.5).toFixed(1)} s for the raid fight`);
  await sleep(Math.max(0, left) + 1500);
  const done = partyOf(a)!.fight!;
  const logA = [...a.conn.db.myRaidLog.iter()].find(l => l.partyId === party.id);
  const logB = [...b.conn.db.myRaidLog.iter()].find(l => l.partyId === party.id);
  check('the fight is settled when it ends: starter gear wipes', done.finished && !done.won);
  check('the clients replay the very fight the server played', simulateRaid(decodeSetup(done.setup), RAIDS_BY_ID.get(1)!, raidRng(party.id, done.startedAt.microsSinceUnixEpoch)).won === done.won);
  check('each player gets a raid log; a loss rewards nothing', !!logA && !!logB && !logA.rewarded && !logB.rewarded && logA.itemIds.length === 0 &&
    logA.hireCost === 4000n && logB.hireCost === 0n);
  await a.conn.reducers.leaveRaid({});
  await sleep(200);
  check('the leader leaving passes the lead on', partyOf(b)?.leaderId === charOf(b)!.id && partyOf(b)!.hired === 2);
  await b.conn.reducers.leaveRaid({});
  await sleep(200);
  check('an empty party disbands', !a.conn.db.raidParty.id.find(party.id));
}

await expectError('non-admin cannot ban', a.conn.reducers.setBanned({ target: b.me, banned: true }), 'Admins only');
await b.conn.reducers.offerLink({ target: a.me });
await expectError('guest cannot accept a link', a.conn.reducers.acceptLink({ guest: b.me, discardGuestCharacter: false }), 'Log in first');

// Friends: add by name (any case), then inspect them while they're offline.
const aId = charOf(a)!.id;
await expectError('add unknown name rejected', b.conn.reducers.addFriend({ name: `nobody_${suffix}` }), 'No character named');
await expectError('add yourself rejected', b.conn.reducers.addFriend({ name: `bob_${suffix}` }), "can't add yourself");
await b.conn.reducers.addFriend({ name: `ALICE_${suffix}` });
await sleep(200);
check('friend added by name, any case', [...b.conn.db.myFriends.iter()].some(f => f.friendId === aId) &&
  [...b.conn.db.myFriendCharacters.iter()].some(c => c.id === aId));
await expectError('duplicate friend rejected', b.conn.reducers.addFriend({ name: `Alice_${suffix}` }), 'already on your friend list');
a.conn.disconnect();
await sleep(300);
check('friend is offline', ![...b.conn.db.presence.iter()].some(p => p.characterId === aId));
await b.conn.reducers.inspectCharacter({ characterId: aId });
await sleep(200);
check('inspect an offline friend', [...b.conn.db.inspectedCharacter.iter()][0]?.id === aId && b.conn.db.inspectedItems.count() > 0n);
await b.conn.reducers.inspectCharacter({ characterId: 0n });
await b.conn.reducers.removeFriend({ friendId: aId });
await sleep(200);
check('friend removed', b.conn.db.myFriends.count() === 0n && b.conn.db.myFriendCharacters.count() === 0n);
await expectError('inspect an offline non-friend rejected', b.conn.reducers.inspectCharacter({ characterId: aId }), 'not online');

b.conn.disconnect();
console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
