// Raid fights (docs/design/raids.md): a party of up to RAID_PARTY_SIZE against a raid
// boss, online only. Pure and deterministic, like sim.ts: the server plays the whole
// fight when the leader starts it (that decides the outcome), and every client in the
// party replays the very same fight from the stored setup and seed to animate it.

import { matchup, type CombatStats } from './combat';
import { DRAWING_FIRE, Effect } from './data/legendary';
import { NPC_POWER, RAID_RARITY_ODDS, bossPhases, raidBosses, type RaidDef, type RaidSignature } from './data/raids';
import { raidUniques } from './data/uniques';
import { base } from './data/bases';
import type { EnemyDef } from './data/zones';
import { accuracyAtLevel } from './data/stats';
import { makeItem, makeUnique, seededRng, type NewItem, type Rng } from './loot';
import { simulateBattle, threatWeight, type FoeSpec, type PlayerSpec } from './battle';

const RAID_SALT = 0x72616964n; // "raid"
const RAID_LOOT_SALT = 0x726c6f6f74n; // "rloot"
/** Raids behind the odds estimate. */
export const RAID_ODDS_SAMPLES = 200;

export interface RaidFighter {
  /** 0 for a hired NPC. */
  characterId: bigint;
  name: string;
  /** With the Phial drunk for this fight, if any (`phialId`). */
  stats: CombatStats;
  /** The Phial drunk for this fight (data/supplies.ts); absent for none. */
  phialId?: number;
  /** A duo raid: the brother this fighter attacks (index in `raidBosses`), as the leader assigned. */
  target?: number;
}

/** What a fight is played from: stored on the party when it starts, so every client replays the same fight. */
export interface RaidSetup {
  raidId: number;
  fighters: RaidFighter[];
}

export interface RaidEvent {
  t: number;
  /** Fighter index that swung, or -1: the boss. */
  by: number;
  /**
   * 'phase': the boss turns to its next Lunar Phase (`phase`). 'special': a boss's single-target
   * signature (Anvil Slam). 'fall': a duo brother falls (the other starts absorbing him).
   * 'empower': the survivor finished absorbing and empowers.
   */
  kind: 'hit' | 'crit' | 'dodge' | 'aoe' | 'special' | 'phase' | 'fall' | 'empower';
  /** The boss's target (fighter index); -1 when a fighter hits the boss, for the boss's AoE and a phase change. */
  target: number;
  /** The boss it's about (index in `raidBosses`): the one hit, attacking, falling or empowering. */
  boss?: number;
  /** Damage dealt (to the boss by a fighter; to the target, or to each fighter for an AoE, before their own mitigation is shown). */
  damage: number;
  /** Every fighter's HP after the event. */
  hp: number[];
  /** Every boss's HP after the event (`raidBosses` order). */
  bossHp: number[];
  /** Fighters Second Wind saved in this event. */
  saved?: number[];
  /** A boss hit: what reached the target after Stoneskin, Bulwark and Last Stand (the shield's share included). */
  dealt?: number;
  /** A boss hit Bulwark blocked half of. */
  blocked?: boolean;
  /** Every fighter's Second Skin shield after the event, when anyone in the party has one. */
  shield?: number[];
  /** A phase change: the phase the boss is now in (its index in `RaidDef.phases.list`). */
  phase?: number;
}

export interface RaidResult {
  events: RaidEvent[];
  maxHp: number[];
  /** Seconds from the start to the kill, the wipe or the enrage. */
  end: number;
  won: boolean;
  /** The party lasted to the enrage timer (a wipe). */
  enraged: boolean;
}

export const raidRng = (partyId: bigint, startMicros: bigint): Rng => seededRng(partyId, startMicros, RAID_SALT);

export { threatWeight };

/** Each fighter's share of the boss's attacks while all of `threats` are alive. */
export function aggroShares(threats: readonly number[]): number[] {
  const w = threats.map(threatWeight);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / total);
}

/** A boss's special attack as the fight plays it: a duo brother's signature, or a raid's `aoe` (split or not). */
type Special = RaidSignature & { split?: boolean };

/** Each boss of a raid with its special: a duo's brothers with their signatures, or the boss with the raid's `aoe`. */
export function raidSpecials(raid: RaidDef): { def: EnemyDef; special?: Special }[] {
  if (raid.duo) return raid.duo.bosses.map(b => ({ def: b.enemy, special: b.signature }));
  const a = raid.aoe;
  return [{ def: raid.boss, special: a && { name: a.name, icon: a.icon, every: a.every, damage: a.damage, damageType: a.damageType, aoe: true, split: a.split } }];
}

/**
 * Threat a fighter has against boss `b` of a duo: +`focusThreat` against the brother it attacks,
 * and Drawing Fire's × DRAWING_FIRE against the one it doesn't. One boss: just its threat.
 */
export function duoThreat(raid: RaidDef, s: CombatStats, target: number, b: number): number {
  if (!raid.duo) return s.threat;
  return target === b ? s.threat + raid.duo.focusThreat : s.threat * (s.effects.has(Effect.DrawingFire) ? DRAWING_FIRE : 1);
}

/**
 * One raid fight, as a battle (battle.ts). Every fighter swings at its boss on its own timer
 * (mitigation, penetration, crits, ±10% variance). Each boss attack picks a living
 * fighter weighted by threat (`threatWeight`, `duoThreat`): the more threat, the more of the
 * attacks, but anyone can be hit. It is dodged at the target's evasion. A boss's special
 * (a raid's `aoe`, a duo brother's signature) hits every living fighter, shares its damage
 * (`split`), or hits one fighter picked by threat, every `every` seconds; it can't be dodged.
 * With Lunar Phases (`raid.phases`) the boss turns to its next phase every `phases.every`
 * seconds and takes that phase's armor, resistance and damage type.
 *
 * A duo (`raid.duo`): each fighter attacks the brother it was assigned (`RaidFighter.target`),
 * and the other when its own falls. When one falls the survivor absorbs him for
 * `absorbSeconds`; still standing then, he empowers (his `empowered` twist).
 *
 * Heals go to the most hurt living ally ("single", and Twin Flame's share to the next) or
 * are split across the living party ("all"); lifesteal and regen heal yourself. The highest
 * Frostbite chill in the party shrinks all the bosses' damage. Executioner, Bully,
 * Berserker, Ambush, Riposte, Second Wind, Second Skin, Stoneskin, Bulwark, Last Stand,
 * Thornshell, Zealot's Oath, Moonlight, Waxing Moon, Fading Rally (the wearer's swings
 * only), Parry and Thrust and Afterimage work as in a solo fight, and so do Phials (Warding
 * shrinks the hits taken, Renewal heals once below half HP). Stoke the Fire counts every
 * fallen fighter and boss. Follow-through does nothing here: there is no next enemy.
 * `record: false` skips the events (odds). The
 * party wins when every boss is dead, and loses when everyone is dead or at the enrage timer.
 */
export function simulateRaid(setup: RaidSetup, raid: RaidDef, rng: Rng, record = true): RaidResult {
  const n = setup.fighters.length;
  const players: PlayerSpec[] = setup.fighters.map(f => ({ kind: 'player', stats: f.stats, ...(raid.duo && { target: f.target ?? 0 }) }));
  const foes: FoeSpec[] = raidSpecials(raid).map(({ def, special }) => ({
    kind: 'foe',
    def,
    ...(special && { special: { every: special.every, damage: special.damage, damageType: special.damageType, aoe: special.aoe, split: special.split } }),
    ...(!raid.duo && raid.phases && { phases: { every: raid.phases.every, list: bossPhases(raid) } }),
  }));
  const r = simulateBattle({ sides: [players, foes], firstSwing: 'random', timeLimit: raid.enrageSeconds, onTimeout: 'lose', duo: raid.duo, record }, rng);
  const events: RaidEvent[] = [];
  for (const e of r.events) {
    const shown = { hp: e.hp.slice(0, n), bossHp: e.hp.slice(n), ...(e.shield && { shield: e.shield.slice(0, n) }), ...(e.saved && { saved: e.saved }) };
    if (e.kind === 'phase') events.push({ ...shown, t: e.t, by: -1, kind: 'phase', target: -1, damage: 0, phase: e.phase });
    else if (e.kind === 'empower') events.push({ ...shown, t: e.t, by: -1, kind: 'empower', target: -1, damage: 0, boss: e.target - n });
    // A brother falling while the other stands (the last boss's fall ends the fight).
    else if (e.kind === 'fall') {
      if (e.hp.slice(n).some(h => h > 0)) events.push({ ...shown, t: e.t, by: -1, kind: 'fall', target: -1, damage: 0, boss: e.target - n });
    } else if (e.by >= 0 && e.by < n) events.push({ ...shown, t: e.t, by: e.by, kind: e.kind === 'crit' ? 'crit' : 'hit', target: -1, damage: e.damage, boss: e.target - n });
    else if (e.by >= n) {
      const boss = e.by - n;
      if (e.kind === 'aoe') events.push({ ...shown, t: e.t, by: -1, kind: 'aoe', target: -1, damage: e.damage, boss });
      else if (e.kind === 'miss') events.push({ ...shown, t: e.t, by: -1, kind: 'dodge', target: e.target, damage: 0, boss });
      else events.push({ ...shown, t: e.t, by: -1, kind: e.kind === 'special' ? 'special' : 'hit', target: e.target, damage: e.damage, dealt: e.dealt, boss, ...(e.blocked && { blocked: true }) });
    }
  }
  return { events, maxHp: r.maxHp.slice(0, n), end: r.end, won: r.winner === 0, enraged: r.timedOut };
}

/**
 * Each brother's time to fall in a duo with `targets` (index per fighter), from DPS alone (no deaths,
 * switching or effects): what the Raids page shows the leader. Infinity for a brother nobody attacks.
 */
export function duoFallTimes(raid: RaidDef, stats: readonly CombatStats[], targets: readonly number[]): number[] {
  return raidBosses(raid).map((boss, b) => {
    const dps = stats.reduce((sum, s, i) => sum + (targets[i] === b ? matchup(s, boss).dps : 0), 0);
    return dps > 0 ? boss.hp / dps : Infinity;
  });
}

/**
 * A duo assignment where both brothers fall as close together as possible (fewest seconds
 * apart, from `duoFallTimes`): every split is tried. One boss: everyone on it.
 */
export function balancedTargets(raid: RaidDef, stats: readonly CombatStats[]): number[] {
  if (!raid.duo) return stats.map(() => 0);
  let best: number[] = stats.map(() => 0);
  let gap = Infinity;
  for (let mask = 0; mask < 1 << stats.length; mask++) {
    const targets = stats.map((_, i) => (mask >> i) & 1);
    const [a, b] = duoFallTimes(raid, stats, targets);
    const g = Math.abs(a - b);
    if (g < gap) [best, gap] = [targets, g];
  }
  return best;
}

/** Share of RAID_ODDS_SAMPLES fights with this setup the party wins. */
export function raidOdds(setup: RaidSetup, raid: RaidDef, seed: bigint): number {
  let wins = 0;
  for (let i = 0; i < RAID_ODDS_SAMPLES; i++) if (simulateRaid(setup, raid, seededRng(seed, BigInt(i), RAID_SALT), false).won) wins++;
  return wins / RAID_ODDS_SAMPLES;
}

// ---------------------------------------------------------------- hired NPCs

/** A hired NPC (raids.md): NPC_POWER × the raid's reference player, whoever is in the party. No effects, no heals. */
export function npcStats(raid: RaidDef): CombatStats {
  const r = raid.reference;
  const k = NPC_POWER;
  return {
    level: r.level,
    sources: [{
      hit: { Physical: (k * r.physicalPerSec) / r.attacksPerSec, Magic: (k * r.magicPerSec) / r.attacksPerSec },
      heal: 0,
      healAll: false,
      attacksPerSec: r.attacksPerSec,
      critChance: r.critChance,
      critMult: r.critMult,
    }],
    critDamage: 1.5,
    armorPen: r.armorPen,
    magicPen: r.magicPen,
    maxHp: k * r.maxHp,
    regen: k * r.regen,
    armor: k * r.armor,
    resistance: k * r.resistance,
    evasionRating: k * r.evasionRating,
    accuracy: accuracyAtLevel(r.level),
    lifesteal: 0,
    threat: k * r.threat,
    itemFind: 0,
    goldFind: 0,
    xpGain: 0,
    walkTime: 0,
    offlineHours: 0,
    chill: 0,
    effects: new Map(),
  };
}

// ---------------------------------------------------------------- storage

/** `setup` as a string for the party row (bigints and the effects map don't survive JSON on their own). */
export function encodeSetup(setup: RaidSetup): string {
  return JSON.stringify({
    raidId: setup.raidId,
    fighters: setup.fighters.map(f => ({ ...f, characterId: String(f.characterId), stats: { ...f.stats, effects: [...f.stats.effects] } })),
  });
}

export function decodeSetup(json: string): RaidSetup {
  const raw = JSON.parse(json) as { raidId: number; fighters: { characterId: string; name: string; phialId?: number; stats: CombatStats & { effects: [number, number][] } }[] };
  return {
    raidId: raw.raidId,
    fighters: raw.fighters.map(f => ({ ...f, characterId: BigInt(f.characterId), stats: { ...f.stats, effects: new Map(f.stats.effects) } })),
  };
}

// ---------------------------------------------------------------- rewards

/**
 * One fighter's item for a rewarded kill: Epic or better of the raid's tier, a Unique from the raid's own pool.
 * An Epic or Legendary has every affix at the top affix tier (the raid's tier).
 * An Epic or Legendary is one of the raid's own bases `ownBaseShare` of the time, else any zone base.
 */
export function rollRaidItem(rng: Rng, raid: RaidDef): NewItem {
  const r = rng();
  const uniques = raidUniques(raid.id);
  if (r < RAID_RARITY_ODDS.Unique && uniques.length) return makeUnique(rng, uniques[Math.floor(rng() * uniques.length)]);
  const rarity = r < RAID_RARITY_ODDS.Unique + RAID_RARITY_ODDS.Legendary ? 'Legendary' : 'Epic';
  const own = raid.boss.drops.filter(id => base(id).raidId === raid.id);
  const drops = own.length && rng() < raid.ownBaseShare ? own : raid.boss.drops.filter(id => base(id).raidId === undefined);
  return makeItem(rng, drops[Math.floor(rng() * drops.length)], raid.tier, rarity, raid.tier);
}

export const raidLootRng = (partyId: bigint, startMicros: bigint, characterId: bigint): Rng => seededRng(partyId, startMicros, characterId, RAID_LOOT_SALT);

const DAY_MICROS = 86_400_000_000n;
/** Raid rewards are `clearsPerDay` wins per character per raid per day: the current day started here (00:00 UTC). */
export const lockoutStart = (nowMicros: bigint): bigint => nowMicros - (nowMicros % DAY_MICROS);
/** When the current lockout ends. */
export const lockoutEnd = (nowMicros: bigint): bigint => lockoutStart(nowMicros) + DAY_MICROS;

/** Rewarded clears of `raidId` today, from a character's raid logs. */
export const clearsToday = (logs: Iterable<{ raidId: number; rewarded: boolean; startedAt: { microsSinceUnixEpoch: bigint } }>, raidId: number, nowMicros: bigint): number => {
  const since = lockoutStart(nowMicros);
  let n = 0;
  for (const l of logs) if (l.raidId === raidId && l.rewarded && l.startedAt.microsSinceUnixEpoch >= since) n++;
  return n;
};
