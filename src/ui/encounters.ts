// How a rare encounter (spacetimedb/src/encounters.ts) reads in the loot log, the away report and toasts.

import type { Encounter, Item } from '../module_bindings/types';
import { EncounterKind } from '../../spacetimedb/src/encounters';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { fmtBig } from './format';
import { itemName, materialsText } from './items';

/** One line for `e`, met while fighting `enemyId`. `item` finds a cache's item (it may since be gone). */
export function encounterText(e: Encounter, enemyId: number, item: (id: bigint) => Item | undefined): string {
  const enemy = ENEMIES_BY_ID.get(enemyId)?.enemy.name ?? 'enemy';
  switch (e.kind) {
    case EncounterKind.TreasureGoblin:
      return `A Treasure Goblin ran past. You caught it: +${fmtBig(e.gold)} gold`;
    case EncounterKind.Stash:
      return `You found a forager's stash: ${materialsText(e.materials)}`;
    case EncounterKind.Cache: {
      if (e.itemId === 0n) return 'You found a hidden cache, but your bag was full: salvaged';
      const it = item(e.itemId);
      return `You found a hidden cache: ${it ? `${it.rarity.tag} ${itemName(it)}` : 'an item'}`;
    }
    case EncounterKind.Elite:
      return e.won
        ? `You beat an Elite ${enemy}: +${fmtBig(e.xp)} XP, +${fmtBig(e.gold)} gold`
        : `An Elite ${enemy} appeared. Too strong for you: you fled`;
    default:
      return 'Something happened on the road';
  }
}
