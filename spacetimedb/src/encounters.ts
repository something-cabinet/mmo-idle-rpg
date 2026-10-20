// Rare encounters: small-chance events while farming, rolled per settle like drops
// (decision log in docs/design/README.md). Pure and seeded, shared by server and client. All numbers
// *illustrative*.

import { matchup, type CombatStats } from './combat';
import { rewardScale, type EnemyDef, type ZoneDef } from './data/zones';
import { makeItem, materialMeans, samplePoisson, type MaterialDrop, type NewItem, type RarityName, type Rng } from './loot';

/** Chance per kill of an encounter: about one every 150 kills (~35 min at the 15 s design pace). */
export const ENCOUNTER_CHANCE = 1 / 150;

/** PERMANENT IDS: stored in settle logs. */
export const EncounterKind = {
  /** Gold worth GOBLIN_KILLS kills. */
  TreasureGoblin: 1,
  /** The enemy's materials worth STASH_KILLS kills. */
  Stash: 2,
  /** One Rare or better item from any of the zone's bases. */
  Cache: 3,
  /** A tougher copy of the target: beat it for ELITE_REWARD_KILLS kills of XP and gold, or flee. */
  Elite: 4,
} as const;
export type EncounterKind = (typeof EncounterKind)[keyof typeof EncounterKind];

const WEIGHTS: readonly [EncounterKind, number][] = [
  [EncounterKind.TreasureGoblin, 35],
  [EncounterKind.Stash, 30],
  [EncounterKind.Cache, 20],
  [EncounterKind.Elite, 15],
];

export const GOBLIN_KILLS = 30;
export const STASH_KILLS = 30;
export const ELITE_REWARD_KILLS = 15;
/** An elite's HP and DPS against its normal self (a boss is ~1.7×). */
export const ELITE_MULT = 1.5;
const CACHE_RARITY: readonly [RarityName, number][] = [
  ['Rare', 75],
  ['Epic', 22],
  ['Legendary', 3],
];

/** The elite version of `e`: Elite rank, whatever `e`'s is. */
export const eliteOf = (e: EnemyDef): EnemyDef =>
  ({ ...e, name: `Elite ${e.name}`, rank: 'Elite', hp: e.hp * ELITE_MULT, dps: e.dps * ELITE_MULT, ...(e.regen && { regen: e.regen * ELITE_MULT }) });

export interface EncounterRoll {
  kind: EncounterKind;
  /** An elite was beaten (always true for the other kinds). */
  won: boolean;
  xp: bigint;
  gold: bigint;
  materials: MaterialDrop[];
  /** A cache's item. */
  item?: NewItem;
}

export interface EncounterInput {
  kills: number;
  zone: ZoneDef;
  enemy: EnemyDef;
  /** The character's stats now: rewards follow its gold and XP gains, elites are fought with them. */
  stats: CombatStats;
}

function weighted<T>(rng: Rng, xs: readonly (readonly [T, number])[]): T {
  let r = rng() * xs.reduce((sum, [, w]) => sum + w, 0);
  for (const [x, w] of xs) if ((r -= w) < 0) return x;
  return xs[xs.length - 1][0];
}

/** The encounters met during `kills` kills of the target. Elites never come from a boss. */
export function rollEncounters(rng: Rng, d: EncounterInput): EncounterRoll[] {
  const count = samplePoisson(rng, d.kills * ENCOUNTER_CHANCE);
  const m = matchup(d.stats, d.enemy);
  const weights = d.enemy.boss ? WEIGHTS.filter(([k]) => k !== EncounterKind.Elite) : WEIGHTS;
  const bases = [...new Set(d.zone.enemies.flatMap(e => e.drops))];
  const out: EncounterRoll[] = [];
  for (let i = 0; i < count; i++) {
    const kind = weighted(rng, weights);
    const roll: EncounterRoll = { kind, won: true, xp: 0n, gold: 0n, materials: [] };
    if (kind === EncounterKind.TreasureGoblin) {
      roll.gold = BigInt(Math.round(GOBLIN_KILLS * m.goldPerKill));
    } else if (kind === EncounterKind.Stash) {
      roll.materials = materialMeans(d.enemy, d.zone.tier, rewardScale(d.zone, d.enemy)).map(({ materialId, mean }) => ({
        materialId,
        count: Math.max(1, Math.round(STASH_KILLS * mean)),
      }));
    } else if (kind === EncounterKind.Cache) {
      const baseId = bases[Math.floor(rng() * bases.length)];
      roll.item = makeItem(rng, baseId, d.zone.tier, weighted(rng, CACHE_RARITY));
    } else {
      roll.won = matchup(d.stats, eliteOf(d.enemy)).viable;
      if (roll.won) {
        roll.xp = BigInt(Math.round(ELITE_REWARD_KILLS * m.xpPerKill));
        roll.gold = BigInt(Math.round(ELITE_REWARD_KILLS * m.goldPerKill));
      }
    }
    out.push(roll);
  }
  return out;
}
