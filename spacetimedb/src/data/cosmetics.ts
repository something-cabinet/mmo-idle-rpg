// Cosmetics (docs/design/cosmetics.md): titles, name effects and nameplates. No power;
// each is unlocked by a milestone the game already records (helpers.ts `grantCosmetics`).
//
// PERMANENT IDS: stored in `cosmetic_unlock` and `look` rows; never reuse or renumber.
// Titles 1–999, name effects 1001–1999, nameplates 2001–2999.

import { SkillId } from './skills';
import { ZONES_BY_ID, bossOf } from './zones';

export type CosmeticSlot = 'title' | 'visual' | 'plate';

/** What unlocks a cosmetic. All are milestones that are never lost. */
export type CosmeticUnlock =
  /** `count` lifetime kills of the enemy (default 1; `enemy_kill`, offline kills too): zone bosses, secret enemies, raid bosses (a raid win records one). */
  | { kind: 'kill'; enemyId: number; count?: number }
  | { kind: 'level'; level: number }
  /** A life skill at `level`; no `skillId`: any of them. */
  | { kind: 'skill'; skillId?: number; level: number }
  /** Moonwell Deep depth cleared (this season's record). */
  | { kind: 'depth'; depth: number };

export interface CosmeticDef {
  id: number;
  slot: CosmeticSlot;
  name: string;
  /** How to unlock it, for the Character page. */
  how: string;
  unlock: CosmeticUnlock;
  /** Visuals and plates: a few words on the look. */
  text?: string;
  /** Visuals and plates: the CSS class suffix (`nv-<css>`, `np-<css>`). */
  css?: string;
}

const WYRM = 9001;
const UMBRIEL = 9002;
const BELLRINGER = 107;
const MOONLIT_CHAMPION = 407;

const title = (id: number, name: string, how: string, unlock: CosmeticUnlock): CosmeticDef => ({ id, slot: 'title', name, how, unlock });
/** Zone boss titles take this many kills of the boss, not just the first. */
export const BOSS_TITLE_KILLS = 5000;
const zoneBoss = (zoneId: number) => bossOf(ZONES_BY_ID.get(zoneId)!)!;
const bossTitle = (id: number, name: string, zoneId: number) =>
  title(id, name, `Defeat ${zoneBoss(zoneId).name} ${BOSS_TITLE_KILLS.toLocaleString('en-US')} times`, { kind: 'kill', enemyId: zoneBoss(zoneId).id, count: BOSS_TITLE_KILLS });

export const COSMETICS: readonly CosmeticDef[] = [
  bossTitle(1, 'Goblin Bane', 1),
  bossTitle(2, 'Thornbreaker', 2),
  bossTitle(3, 'Jarlslayer', 3),
  bossTitle(4, 'Queenslayer', 4),
  title(5, 'Bellringer', 'Defeat the Drowned Bellringer (secret)', { kind: 'kill', enemyId: BELLRINGER }),
  title(6, 'Moonlit', 'Defeat the Moonlit Champion (secret)', { kind: 'kill', enemyId: MOONLIT_CHAMPION }),
  title(7, 'Wyrmslayer', 'Win Wyrm Hollow', { kind: 'kill', enemyId: WYRM }),
  title(8, 'Eclipsed', 'Win The Drowned Moon', { kind: 'kill', enemyId: UMBRIEL }),
  title(9, 'Deepdiver', 'Clear Moonwell depth 10', { kind: 'depth', depth: 10 }),
  title(10, 'Moonless', 'Clear Moonwell depth 25', { kind: 'depth', depth: 25 }),
  title(11, 'Lightless', 'Clear Moonwell depth 50', { kind: 'depth', depth: 50 }),
  title(12, 'Voidborn', 'Clear Moonwell depth 75', { kind: 'depth', depth: 75 }),
  title(13, 'Moonfallen', 'Clear Moonwell depth 100', { kind: 'depth', depth: 100 }),
  title(14, 'Centurion', 'Reach level 100', { kind: 'level', level: 100 }),
  title(20, 'Master Miner', 'Mining at 99', { kind: 'skill', skillId: SkillId.Mining, level: 99 }),
  title(21, 'Master Woodcutter', 'Woodcutting at 99', { kind: 'skill', skillId: SkillId.Woodcutting, level: 99 }),
  title(22, 'Master Forager', 'Foraging at 99', { kind: 'skill', skillId: SkillId.Foraging, level: 99 }),
  title(23, 'Master Smith', 'Smithing at 99', { kind: 'skill', skillId: SkillId.Smithing, level: 99 }),
  title(24, 'Master Alchemist', 'Alchemy at 99', { kind: 'skill', skillId: SkillId.Alchemy, level: 99 }),

  { id: 1001, slot: 'visual', name: 'Rime', css: 'rime', text: 'Ice blue, soft frost glow', how: 'Win Wyrm Hollow', unlock: { kind: 'kill', enemyId: WYRM } },
  { id: 1002, slot: 'visual', name: 'Moonlight', css: 'moonlight', text: 'Silver, a shimmer sweeping across', how: 'Win The Drowned Moon', unlock: { kind: 'kill', enemyId: UMBRIEL } },
  { id: 1003, slot: 'visual', name: 'Voidflicker', css: 'voidflicker', text: 'Violet, flickers like a failing light', how: 'Clear Moonwell depth 50', unlock: { kind: 'depth', depth: 50 } },
  { id: 1004, slot: 'visual', name: 'Eclipse', css: 'eclipse', text: 'Black with a pulsing gold corona', how: 'Clear Moonwell depth 100', unlock: { kind: 'depth', depth: 100 } },
  { id: 1005, slot: 'visual', name: 'Ember', css: 'ember', text: 'Orange, a warm flickering glow', how: 'Reach level 100', unlock: { kind: 'level', level: 100 } },
  { id: 1006, slot: 'visual', name: 'Gilded', css: 'gilded', text: 'Gold, a slow shimmer', how: 'Any life skill at 99', unlock: { kind: 'skill', level: 99 } },

  { id: 2001, slot: 'plate', name: 'Moonwell', css: 'moonwell', text: 'Deep blue, a silver crescent', how: 'Clear Moonwell depth 25', unlock: { kind: 'depth', depth: 25 } },
  { id: 2002, slot: 'plate', name: 'Night Sky', css: 'nightsky', text: 'Black, stars gathered on the right', how: 'Clear Moonwell depth 75', unlock: { kind: 'depth', depth: 75 } },
  { id: 2003, slot: 'plate', name: 'Moon Garden', css: 'moongarden', text: 'Sage green, pale leaves', how: 'Defeat the Moonlit Champion (secret)', unlock: { kind: 'kill', enemyId: MOONLIT_CHAMPION } },
  { id: 2004, slot: 'plate', name: 'Veteran', css: 'veteran', text: 'Dark leather, gold trim and bar', how: 'Reach level 100', unlock: { kind: 'level', level: 100 } },
];

export const COSMETICS_BY_ID = new Map(COSMETICS.map(c => [c.id, c]));

/** The cosmetic `id` if it exists and belongs to `slot`. */
export function cosmeticOf(id: number, slot: CosmeticSlot): CosmeticDef | undefined {
  const c = COSMETICS_BY_ID.get(id);
  return c?.slot === slot ? c : undefined;
}

/** Enemies whose kills can unlock something: a combat settle against one checks for new unlocks. */
export const COSMETIC_ENEMIES: ReadonlySet<number> = new Set(COSMETICS.flatMap(c => (c.unlock.kind === 'kill' ? [c.unlock.enemyId] : [])));
