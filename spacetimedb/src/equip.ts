// Equipping rules and auto-equip (equipment.md). Pure: shared by server and client.

import { SLOTS, base } from './data/bases';
import { combatStats, evasionChance, matchup, mitigation, type GearItem, type GearWeapon } from './combat';
import type { EnemyDef } from './data/zones';

/** An owned item: what equipping and scoring need from an `item` row. */
export interface OwnedItem extends GearItem {
  id: bigint;
  baseId: number;
  weapon?: GearWeapon & { twoHanded: boolean };
}

export type Profile = 'Damage' | 'Survival' | 'Loot';

const MAIN = SLOTS.indexOf('MainHand');
const OFF = SLOTS.indexOf('OffHand');

export const fitsSlot = (baseId: number, slot: number) => base(baseId).slots.includes(SLOTS[slot]);
const twoHanded = (it: OwnedItem | undefined) => !!it?.weapon?.twoHanded;

/**
 * `slots` with `item` put into `slot`, or an error message. The item leaves any other
 * slot of the loadout (so one ring can't fill both ring slots); a two-handed main
 * hand empties the off-hand, and an off-hand can't go next to one.
 */
export function placeItem(
  slots: readonly bigint[],
  slot: number,
  item: OwnedItem,
  lookup: (id: bigint) => OwnedItem | undefined
): bigint[] | string {
  if (!fitsSlot(item.baseId, slot)) return "That item doesn't fit this slot";
  const next = slots.map(id => (id === item.id ? 0n : id));
  if (slot === OFF && twoHanded(lookup(next[MAIN]))) return 'Unequip the two-handed weapon first';
  next[slot] = item.id;
  if (slot === MAIN && twoHanded(item)) next[OFF] = 0n;
  return next;
}

// ---------------------------------------------------------------- reference dummy

/**
 * The fixed opponent auto-equip scores against (equipment.md): the character's level,
 * Balanced defenses (2.5 × level armor and resistance = 33% mitigation), and the
 * average enemy's DPS for that level (zones.md), half physical and half magic.
 */
export function referenceDummy(level: number): EnemyDef {
  return {
    id: 0,
    name: 'Reference dummy',
    level,
    damageType: 'Physical',
    defense: 'Balanced',
    speed: 1,
    hp: 1,
    dps: 16 * 1.42 ** (level / 10 - 1),
    armor: 2.5 * level,
    resistance: 2.5 * level,
    xp: 0,
    gold: 0,
    drops: [],
  };
}

export interface LoadoutScore {
  /** DPS against the dummy. */
  dps: number;
  /** Seconds the dummy needs to kill you; Infinity if you out-sustain it. */
  timeToDie: number;
  itemFind: number;
  goldFind: number;
  xpGain: number;
}

export function scoreGear(level: number, gear: readonly (GearItem | undefined)[]): LoadoutScore {
  const s = combatStats(level, gear);
  const dummy = referenceDummy(level);
  const m = matchup(s, dummy);
  // Half the dummy's damage is physical, half magic.
  const incoming =
    (dummy.dps / 2) *
    (2 - mitigation(s.armor, 0, level) - mitigation(s.resistance, 0, level)) *
    (1 - evasionChance(s.evasionRating, level));
  const net = incoming - s.regen - s.lifesteal * m.dps - m.hps;
  return {
    dps: m.dps,
    timeToDie: net <= 0 ? Infinity : s.maxHp / net,
    itemFind: s.itemFind,
    goldFind: s.goldFind,
    xpGain: s.xpGain,
  };
}

/** Values compared in order: the profile's goal, then tie-breakers. */
function ranking(p: Profile, s: LoadoutScore): number[] {
  switch (p) {
    case 'Damage':
      return [s.dps, s.timeToDie];
    case 'Survival':
      return [s.timeToDie, s.dps];
    case 'Loot':
      return [s.dps * (1 + s.itemFind), s.goldFind, s.xpGain, s.timeToDie];
  }
}

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    return a[i] > b[i] + 1e-9 * Math.abs(b[i]);
  }
  return false;
}

// ---------------------------------------------------------------- auto-equip

/**
 * Best slots for `profile` from `items`, starting from `slots` (equipment.md): slot by
 * slot, try every item that fits (or empty) and keep the best, until a pass changes
 * nothing. Hands are tried as whole options: a two-hander alone, or a one-hander
 * with each off-hand. Never looks at the target enemy.
 */
export function autoEquip(level: number, items: readonly OwnedItem[], slots: readonly bigint[], profile: Profile): bigint[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const gearOf = (ids: readonly bigint[]) => ids.map(id => byId.get(id));
  const rank = (ids: readonly bigint[]) => ranking(profile, scoreGear(level, gearOf(ids)));

  let best = slots.map(id => (byId.has(id) ? id : 0n));
  let bestRank = rank(best);
  const consider = (ids: bigint[]) => {
    const r = rank(ids);
    if (better(r, bestRank)) {
      best = ids;
      bestRank = r;
    }
  };
  const fitting = (slot: number) => items.filter(i => fitsSlot(i.baseId, slot));
  const offHands = [undefined, ...fitting(OFF)];

  for (let pass = 0; pass < 4; pass++) {
    const before = best.join();
    // Hands as whole options.
    for (const main of [undefined, ...fitting(MAIN)]) {
      for (const off of twoHanded(main) ? [undefined] : offHands) {
        const ids = best.map(id => (id === main?.id || id === off?.id ? 0n : id));
        ids[MAIN] = main?.id ?? 0n;
        ids[OFF] = off?.id ?? 0n;
        consider(ids);
      }
    }
    // Every other slot on its own.
    for (let slot = 0; slot < SLOTS.length; slot++) {
      if (slot === MAIN || slot === OFF) continue;
      for (const it of [undefined, ...fitting(slot)]) {
        const ids = best.map(id => (id === it?.id ? 0n : id));
        ids[slot] = it?.id ?? 0n;
        consider(ids);
      }
    }
    if (best.join() === before) break;
  }
  return best;
}
