// The Shifting Rift (docs/design/shifting-rift.md): a weekly roguelike run of 5 floors.
// Pure data and formulas, shared. What the effects do in a fight is the engine's
// (battle.ts, fighter.ts); generation (maps, line-ups, offers, items) is rift.ts.
//
// PERMANENT IDS: boon IDs (300 + theme × 10 + n, Wildcard 380), rift effect IDs (201–214),
// Trophy IDs (250 + Elite affix), curse IDs (401+), set bonus IDs (`setBonusId`), gift, event and mutation IDs, and the
// Rift Heart's enemy ID (9200) are stored in run state and logs; never reuse or renumber
// them. Boon, rift effect, Trophy, curse and set bonus IDs share one space with the legendary and
// unique effects (1–99), so they can sit in `CombatStats.effects` without clashing.

import { EliteAffix } from './abyss';

// ---------------------------------------------------------------- rules

/** The zone whose boss's first kill opens the Rift (Brightvein Hold: the Last Thane). */
export const RIFT_UNLOCK_ZONE = 5;
/** The lowest run tier offered. */
export const RIFT_MIN_TIER = 5;
export const FLOORS = 5;
/** Choice rows per floor (nodes 1–5); node 6 is the boss. */
export const ROWS = 5;
/** Nodes per row. */
export const ROW_MIN = 2;
export const ROW_MAX = 4;
/** Seconds a node's fight may last, shared by its enemies; past it the node is lost. */
export const NODE_TIME_LIMIT = 180;
/** A floor boss heals this share of your missing HP; a downed party member comes back at this share of max HP. */
export const BOSS_HEAL = 0.5;

// ---------------------------------------------------------------- enemies

/** × enemy HP and DPS per floor past the first (tuned by the `test:rift` bots with RIFT_HP and RIFT_DPS). */
export const FLOOR_STEP = 1.6;
/** × enemy HP and DPS on floor `f` (1–5): floor 1 is the run tier as it is. */
export const floorMult = (f: number) => FLOOR_STEP ** (f - 1);
/** Enemy level on floor `f` of a tier-`tier` run. */
export const riftLevel = (tier: number, f: number) => 10 * tier + 2 * (f - 1);
/** × every Rift enemy's HP and DPS, for HP carrying over between nodes: tuned by the `test:rift` bots (a random picker clears floor 5 about 1 run in 7 at T5, a greedy theme builder about half). */
export const RIFT_HP = 0.85;
export const RIFT_DPS = 0.15;

export type RiftSlot = 'fight1' | 'fight2' | 'fight3' | 'elite' | 'boss' | 'heart';
/** × HP and DPS by slot: a fight's 1–3 enemies share it out, an Elite or a boss is one of them. */
export const RIFT_SLOT: Record<RiftSlot, { hp: number; dps: number }> = {
  fight1: { hp: 1, dps: 1 },
  fight2: { hp: 0.6, dps: 1 },
  fight3: { hp: 0.45, dps: 1 },
  elite: { hp: 2.5, dps: 1.3 },
  boss: { hp: 5, dps: 1.5 },
  heart: { hp: 7, dps: 1.7 },
};
/** Enemy HP × this for a party of 1–4 (damage unchanged). */
export const PARTY_HP = [1, 1.8, 2.5, 3.2];

/** The final boss: its own enemy, not an echo. Shifts damage type and defense every SHIFT_EVERY seconds. */
export const RIFT_HEART = { id: 9200, name: 'The Rift Heart', damageType: 'Magic', defense: 'Balanced', speed: 1 } as const;
export const SHIFT_EVERY = 15;

// ---------------------------------------------------------------- boons

export const Theme = { Fury: 1, Bastion: 2, Blood: 3, Storm: 4, Mist: 5, Aegis: 6, Fortune: 7 } as const;
export type ThemeId = (typeof Theme)[keyof typeof Theme];

export interface ThemeDef {
  id: ThemeId;
  name: string;
  leansOn: string;
  /** Set bonus with 3 distinct boons of the theme, and with 5. */
  set3: string;
  set5: string;
}

export const THEMES: ThemeDef[] = [
  { id: Theme.Fury, name: 'Fury', leansOn: 'Raw damage', set3: '+15% damage', set5: 'Your first hit on each enemy deals triple' },
  { id: Theme.Bastion, name: 'Bastion', leansOn: 'Mitigation, bulk', set3: '+10% max HP', set5: 'Every 10 s, a shield of 10% max HP' },
  { id: Theme.Blood, name: 'Blood', leansOn: 'Sustain, HP as a resource', set3: 'Lifesteal cap +5%', set5: 'Kills heal 8% max HP' },
  { id: Theme.Storm, name: 'Storm', leansOn: 'Speed, crits', set3: '+15% attack speed', set5: 'Crits chain 30% of the hit to the next swing' },
  { id: Theme.Mist, name: 'Mist', leansOn: 'Evasion', set3: 'Evade chance +6%', set5: 'Every evade makes your next attack crit (Glimmerguard: +50% crit damage on those attacks instead)' },
  { id: Theme.Aegis, name: 'Aegis', leansOn: 'Block', set3: 'Block chance +8%', set5: 'Each block reflects 50% of the whole hit (before the block halves it)' },
  { id: Theme.Fortune, name: 'Fortune', leansOn: 'Motes, shops, events', set3: 'Shops −20%', set5: 'One free Rare boon per floor at its first shop' },
];
export const THEMES_BY_ID: ReadonlyMap<number, ThemeDef> = new Map(THEMES.map(t => [t.id, t]));
/** Distinct boons of one theme for its set bonuses. */
export const SET_AT = [3, 5] as const;

/** Boon rarity: 0 Common, 1 Rare, 2 Epic. */
export type BoonRarity = 0 | 1 | 2;
export const BOON_RARITIES = ['Common', 'Rare', 'Epic'] as const;
/** A stat a boon needs before it is offered, or grants. */
export type BoonGate = 'crit' | 'evasion' | 'block';

export interface BoonDef {
  id: number;
  name: string;
  /** 0: no theme (Wildcard). */
  theme: ThemeId | 0;
  /** `{v}` in `text` is the value at the boon's rarity: Common / Rare / Epic. */
  values?: [number, number, number];
  text: string;
  /** Epic only, one per theme, offered from KEYSTONE_FLOOR. */
  keystone?: boolean;
  /** Exists at this rarity only (keystones, Wildcard: Epic; Second Look: Rare; Haggler: Common). Can't be upgraded. */
  only?: BoonRarity;
  /** Offered only once you have this stat. */
  needs?: BoonGate;
  /** Gives this stat, so the boons that need it open up. */
  grants?: BoonGate;
}

export const KEYSTONE_FLOOR = 3;

const b = (theme: ThemeId | 0, n: number) => 300 + theme * 10 + n;

export const Boon = {
  SharpenedWill: b(1, 1), OpeningSalvo: b(1, 2), CoupDeGrace: b(1, 3), Sunder: b(1, 4), Bloodrush: b(1, 5), Frenzy: b(1, 6),
  IronHide: b(2, 1), ThickSkin: b(2, 2), Stubborn: b(2, 3), Braced: b(2, 4), HoldTheLine: b(2, 5), Fortress: b(2, 6),
  Leech: b(3, 1), RedTithe: b(3, 2), Afterglow: b(3, 3), Transfusion: b(3, 4), Clotting: b(3, 5), BloodPrice: b(3, 6),
  Quickened: b(4, 1), Keen: b(4, 2), Cruel: b(4, 3), Static: b(4, 4), Tailwind: b(4, 5), Thunderhead: b(4, 6),
  Fleetfoot: b(5, 1), Smoke: b(5, 2), Counterstep: b(5, 3), SlipAway: b(5, 4), Opening: b(5, 5), Phantom: b(5, 6),
  RaisedShield: b(6, 1), Bracing: b(6, 2), ShieldBash: b(6, 3), SteadyGuard: b(6, 4), DeepGuard: b(6, 5), Shieldwall: b(6, 6),
  LuckyCoin: b(7, 1), Haggler: b(7, 2), Interest: b(7, 3), TreasureSense: b(7, 4), SecondLook: b(7, 5), Spendthrift: b(7, 6),
  Wildcard: b(0, 80),
} as const;

export const BOONS: BoonDef[] = [
  // Fury
  { id: Boon.SharpenedWill, name: 'Sharpened Will', theme: Theme.Fury, values: [8, 14, 22], text: 'Damage +{v}%' },
  { id: Boon.OpeningSalvo, name: 'Opening Salvo', theme: Theme.Fury, values: [40, 70, 110], text: 'First 5 s of each fight: damage +{v}%' },
  { id: Boon.CoupDeGrace, name: 'Coup de Grâce', theme: Theme.Fury, values: [20, 35, 55], text: '+{v}% damage against enemies below 30% HP' },
  { id: Boon.Sunder, name: 'Sunder', theme: Theme.Fury, values: [10, 18, 28], text: 'Ignore {v}% of armor and resistance' },
  { id: Boon.Bloodrush, name: 'Bloodrush', theme: Theme.Fury, values: [1.5, 2.5, 4], text: '+{v}% damage per fight won this floor (resets each floor)' },
  { id: Boon.Frenzy, name: 'Frenzy', theme: Theme.Fury, keystone: true, only: 2, text: "+1% damage for each 1% of HP you're missing" },
  // Bastion
  { id: Boon.IronHide, name: 'Iron Hide', theme: Theme.Bastion, values: [15, 25, 40], text: 'Armor and resistance +{v}%' },
  { id: Boon.ThickSkin, name: 'Thick Skin', theme: Theme.Bastion, values: [8, 14, 22], text: 'Max HP +{v}%' },
  { id: Boon.Stubborn, name: 'Stubborn', theme: Theme.Bastion, values: [8, 14, 22], text: 'Each fight starts with a shield of {v}% max HP' },
  { id: Boon.Braced, name: 'Braced', theme: Theme.Bastion, values: [10, 16, 24], text: '{v}% less damage taken from Elites and bosses' },
  { id: Boon.HoldTheLine, name: 'Hold the Line', theme: Theme.Bastion, values: [20, 30, 45], text: 'Once per floor, the first drop below 30% HP gives a shield of {v}% max HP' },
  { id: Boon.Fortress, name: 'Fortress', theme: Theme.Bastion, keystone: true, only: 2, text: '25% less damage taken; 15% less attack speed' },
  // Blood
  { id: Boon.Leech, name: 'Leech', theme: Theme.Blood, values: [1, 2, 3], text: 'Lifesteal +{v}%, and the lifesteal cap rises by as much' },
  { id: Boon.RedTithe, name: 'Red Tithe', theme: Theme.Blood, values: [12, 20, 30], text: 'Max HP −10%, damage +{v}%' },
  { id: Boon.Afterglow, name: 'Afterglow', theme: Theme.Blood, values: [4, 7, 11], text: 'Win a fight node: heal {v}% max HP' },
  { id: Boon.Transfusion, name: 'Transfusion', theme: Theme.Blood, values: [3, 5, 8], text: 'Each kill heals {v}% max HP' },
  { id: Boon.Clotting, name: 'Clotting', theme: Theme.Blood, values: [50, 90, 140], text: 'Regen +{v}% while below 50% HP' },
  { id: Boon.BloodPrice, name: 'Blood Price', theme: Theme.Blood, keystone: true, only: 2, text: 'Lifesteal past full HP becomes a shield, up to 20% max HP' },
  // Storm
  { id: Boon.Quickened, name: 'Quickened', theme: Theme.Storm, values: [8, 14, 22], text: 'Attack speed +{v}%' },
  { id: Boon.Keen, name: 'Keen', theme: Theme.Storm, values: [3, 5, 8], text: 'Crit chance +{v}% (flat, added after base crit)', grants: 'crit' },
  { id: Boon.Cruel, name: 'Cruel', theme: Theme.Storm, values: [15, 25, 40], text: 'Crit damage +{v}%', needs: 'crit' },
  { id: Boon.Static, name: 'Static', theme: Theme.Storm, values: [100, 170, 260], text: "Every 5th swing adds +{v}% of your hit as a shock that can't be dodged (it lands even when the swing misses)" },
  { id: Boon.Tailwind, name: 'Tailwind', theme: Theme.Storm, values: [50, 80, 120], text: 'The first 3 attacks of each fight are {v}% faster' },
  { id: Boon.Thunderhead, name: 'Thunderhead', theme: Theme.Storm, keystone: true, only: 2, text: 'Each crit gives +3% attack speed for the fight, up to +30%', needs: 'crit' },
  // Mist
  { id: Boon.Fleetfoot, name: 'Fleetfoot', theme: Theme.Mist, values: [4, 7, 11], text: 'Evade chance +{v}% (flat, added after rating)', grants: 'evasion' },
  { id: Boon.Smoke, name: 'Smoke', theme: Theme.Mist, values: [20, 35, 50], text: 'First 5 s of each fight: evade chance +{v}%' },
  { id: Boon.Counterstep, name: 'Counterstep', theme: Theme.Mist, values: [30, 50, 80], text: 'Each evade counters for {v}% of your average hit', needs: 'evasion' },
  { id: Boon.SlipAway, name: 'Slip Away', theme: Theme.Mist, values: [1, 1.5, 2.5], text: 'Each evade heals {v}% max HP', needs: 'evasion' },
  { id: Boon.Opening, name: 'Opening', theme: Theme.Mist, values: [15, 25, 40], text: 'After an evade, your next attack deals +{v}%', needs: 'evasion' },
  { id: Boon.Phantom, name: 'Phantom', theme: Theme.Mist, keystone: true, only: 2, text: 'An enemy hit must pass your evade check twice; max HP −20%', needs: 'evasion' },
  // Aegis
  { id: Boon.RaisedShield, name: 'Raised Shield', theme: Theme.Aegis, values: [6, 10, 15], text: 'Block chance +{v}% (a block stops half the hit; stacks with Bulwark)', grants: 'block' },
  { id: Boon.Bracing, name: 'Bracing', theme: Theme.Aegis, values: [1, 2, 3], text: 'The first {v} enemy hits of each fight are always blocked' },
  { id: Boon.ShieldBash, name: 'Shield Bash', theme: Theme.Aegis, values: [40, 70, 100], text: 'Each block deals {v}% of your average hit back', needs: 'block' },
  { id: Boon.SteadyGuard, name: 'Steady Guard', theme: Theme.Aegis, values: [1, 1.5, 2.5], text: 'Each block heals {v}% max HP', needs: 'block' },
  { id: Boon.DeepGuard, name: 'Deep Guard', theme: Theme.Aegis, values: [60, 70, 80], text: 'Blocks stop {v}% of the hit instead of 50%', needs: 'block' },
  { id: Boon.Shieldwall, name: 'Shieldwall', theme: Theme.Aegis, keystone: true, only: 2, text: 'Blocks stop the whole hit; 20% less attack speed', needs: 'block' },
  // Fortune
  { id: Boon.LuckyCoin, name: 'Lucky Coin', theme: Theme.Fortune, values: [20, 35, 55], text: 'Motes +{v}%' },
  { id: Boon.Haggler, name: 'Haggler', theme: Theme.Fortune, only: 0, text: 'One shop offer per shop is half price' },
  { id: Boon.Interest, name: 'Interest', theme: Theme.Fortune, values: [5, 8, 12], text: 'Entering a shop pays {v}% of the Motes you hold' },
  { id: Boon.TreasureSense, name: 'Treasure Sense', theme: Theme.Fortune, values: [1.5, 2, 3], text: 'Headline chances on the Ethereal items you find × {v}' },
  { id: Boon.SecondLook, name: 'Second Look', theme: Theme.Fortune, only: 1, text: 'Boon offers show 4 choices instead of 3' },
  { id: Boon.Spendthrift, name: 'Spendthrift', theme: Theme.Fortune, keystone: true, only: 2, text: 'Every 10 Motes spent heal 1% max HP' },
  // No theme
  { id: Boon.Wildcard, name: 'Wildcard', theme: 0, only: 2, text: "Counts as one boon of every theme for set bonuses (not toward your main theme for offers)" },
];
export const BOONS_BY_ID: ReadonlyMap<number, BoonDef> = new Map(BOONS.map(x => [x.id, x]));

/** A boon's value at `rarity` (0 for a boon without values). */
export const boonValue = (def: BoonDef, rarity: BoonRarity) => def.values?.[rarity] ?? 0;
/** A boon's text at `rarity`, or with every rarity's value ("8 / 14 / 22") when `rarity` is undefined. */
export function boonText(def: BoonDef, rarity?: BoonRarity): string {
  if (!def.values) return def.text;
  return def.text.replace('{v}', rarity === undefined ? def.values.join(' / ') : String(def.values[rarity]));
}
/** Whether a held boon at `rarity` can still go one rarity higher. */
export const canUpgrade = (def: BoonDef, rarity: BoonRarity) => def.only === undefined && rarity < 2;

/** Boon rarity odds (Common, Rare, Epic) on floor `f`: 70 / 25 / 5% on floor 1 to 35 / 45 / 20% on floor 5, in even steps. */
export function rarityOdds(f: number): [number, number, number] {
  const k = (Math.min(FLOORS, Math.max(1, f)) - 1) / (FLOORS - 1);
  return [0.7 - 0.35 * k, 0.25 + 0.2 * k, 0.05 + 0.15 * k];
}

// ---------------------------------------------------------------- curses

export const Curse = { Frail: 401, Hexed: 402, Weighted: 403 } as const;

export interface CurseDef {
  id: number;
  name: string;
  text: string;
}

export const CURSES: CurseDef[] = [
  { id: Curse.Frail, name: 'Frail', text: 'Max HP −15%' },
  { id: Curse.Hexed, name: 'Hexed', text: 'Heals −30%' },
  { id: Curse.Weighted, name: 'Weighted', text: 'Attack speed −10%' },
];
export const CURSES_BY_ID: ReadonlyMap<number, CurseDef> = new Map(CURSES.map(c => [c.id, c]));

// ---------------------------------------------------------------- Ethereal items

/** Rift-only effects (headline "Rift effect"). Two copies don't stack. */
export const RiftEffect = {
  GlassHeart: 201, EchoStrike: 202, Overclock: 203, GamblersEdge: 204, PhoenixPlume: 205, Bloodbound: 206, MirrorMail: 207,
  HoardersBand: 208, FirstBlood: 209, Voidheart: 210, RiftConduit: 211, WitherAura: 212, ThiefsGlove: 213, RiftAnchor: 214,
} as const;

export interface RiftEffectDef {
  id: number;
  name: string;
  text: string;
}

export const RIFT_EFFECTS: RiftEffectDef[] = [
  { id: RiftEffect.GlassHeart, name: 'Glass Heart', text: 'Damage × 2, max HP × 0.5' },
  { id: RiftEffect.EchoStrike, name: 'Echo Strike', text: 'Every 4th attack repeats at 100%' },
  { id: RiftEffect.Overclock, name: 'Overclock', text: 'Attack speed × 1.6; each swing costs 1% max HP' },
  { id: RiftEffect.GamblersEdge, name: "Gambler's Edge", text: 'Each hit deals 0–300% damage at random (average × 1.5)' },
  { id: RiftEffect.PhoenixPlume, name: 'Phoenix Plume', text: 'Once per run, a killing blow leaves you at 40% HP instead (after Second Wind). The item burns away when the node ends' },
  { id: RiftEffect.Bloodbound, name: 'Bloodbound', text: 'No lifesteal cap; your regen is 0' },
  { id: RiftEffect.MirrorMail, name: 'Mirror Mail', text: 'Reflects 60% of damage taken, like Thornshell; you take 15% more' },
  { id: RiftEffect.HoardersBand, name: "Hoarder's Band", text: '+1% damage per 10 unspent Motes (max +40%)' },
  { id: RiftEffect.FirstBlood, name: 'First Blood', text: 'The first hit on each enemy deals 5× damage' },
  { id: RiftEffect.Voidheart, name: 'Voidheart', text: 'All your damage becomes magic, +25%' },
  { id: RiftEffect.RiftConduit, name: 'Rift Conduit', text: 'Each boon you hold gives +2% damage and +2% max HP' },
  { id: RiftEffect.WitherAura, name: 'Wither Aura', text: 'Enemies lose 1% max HP per second' },
  { id: RiftEffect.ThiefsGlove, name: "Thief's Glove", text: 'Fights pay +50% Motes' },
  { id: RiftEffect.RiftAnchor, name: 'Rift Anchor', text: "Can't be replaced this run (items for its slot can only be discarded); the affixes on your other items +20%" },
];
export const RIFT_EFFECTS_BY_ID: ReadonlyMap<number, RiftEffectDef> = new Map(RIFT_EFFECTS.map(e => [e.id, e]));

/** An Elite affix turned to your side: its Trophy ID. */
export const trophyId = (eliteAffix: number) => 250 + eliteAffix;

export interface TrophyDef {
  id: number;
  eliteAffix: number;
  name: string;
  text: string;
}

export const TROPHIES: TrophyDef[] = [
  { id: trophyId(EliteAffix.Vampiric), eliteAffix: EliteAffix.Vampiric, name: 'Vampiric', text: 'You heal 50% of the damage you deal, past the lifesteal cap' },
  { id: trophyId(EliteAffix.WardedShell), eliteAffix: EliteAffix.WardedShell, name: 'Warded Shell', text: "Against the enemy's damage type you defend with the higher of your armor and resistance" },
  { id: trophyId(EliteAffix.Swift), eliteAffix: EliteAffix.Swift, name: 'Swift', text: 'You attack 50% faster, each hit 25% weaker' },
  { id: trophyId(EliteAffix.Thorned), eliteAffix: EliteAffix.Thorned, name: 'Thorned', text: 'Reflect 10% of damage taken; 30% less max HP' },
  { id: trophyId(EliteAffix.Unyielding), eliteAffix: EliteAffix.Unyielding, name: 'Unyielding', text: 'Regenerate 1.5% of max HP per second' },
  { id: trophyId(EliteAffix.Ravenous), eliteAffix: EliteAffix.Ravenous, name: 'Ravenous', text: 'Your damage grows 5% every 5 s' },
];
export const TROPHIES_BY_ID: ReadonlyMap<number, TrophyDef> = new Map(TROPHIES.map(t => [t.id, t]));

/** The five headlines an Ethereal item can carry, each rolled on its own at these chances. */
export const HEADLINE_CHANCE = { riftEffect: 0.3, mark: 0.2, growth: 0.15, trophy: 0.1, echo: 0.06 } as const;
export type HeadlineKind = keyof typeof HEADLINE_CHANCE;
export const HEADLINE_KINDS = Object.keys(HEADLINE_CHANCE) as HeadlineKind[];
/** Ethereal items' 3 affixes roll at affix tier T − AFFIX_TIER_SPAN to T. */
export const ETHEREAL_AFFIXES = 3;
export const AFFIX_TIER_SPAN = 2;

// ---------------------------------------------------------------- Motes and shops

/** Motes a won node pays (before Lucky Coin, Thief's Glove and the mutation). */
export const MOTES = { fight: 45, elite: 75, boss: 60 } as const;

/** Shop prices in Motes. */
export const PRICE = {
  boon: [40, 75, 130] as [number, number, number],
  /** Upgrade a held boon to Rare / to Epic. */
  upgrade: [60, 110] as [number, number],
  item: 90,
  heal: 50,
  attune: 60,
  removeCurse: 75,
  removeBoon: 50,
} as const;
/** The shop's heal offer: this share of max HP. */
export const SHOP_HEAL = 0.3;
/** Shop stock size. */
export const SHOP_MIN = 6;
export const SHOP_MAX = 8;
/** Rerolling the shop costs 25, then 25 more each time. */
export const rerollPrice = (rerolls: number) => 25 * (rerolls + 1);

// ---------------------------------------------------------------- the Threshold

export const Gift = { EmberOfWill: 1, RiftPurse: 2, ShardOfRiftStuff: 3, BargainInTheDark: 4, MarkedPath: 5, ThickBlood: 6 } as const;

export interface GiftDef {
  id: number;
  name: string;
  text: string;
}

export const GIFTS: GiftDef[] = [
  { id: Gift.EmberOfWill, name: 'Ember of Will', text: 'An Epic boon of a random theme' },
  { id: Gift.RiftPurse, name: 'Rift Purse', text: '150 Motes' },
  { id: Gift.ShardOfRiftStuff, name: 'Shard of Rift-stuff', text: 'An Ethereal item with one guaranteed headline (random slot)' },
  { id: Gift.BargainInTheDark, name: 'Bargain in the Dark', text: 'A keystone of a random theme, plus a random curse' },
  { id: Gift.MarkedPath, name: 'Marked Path', text: 'A theme mark of your choice, held like a headline (counts as 1 boon of that theme)' },
  { id: Gift.ThickBlood, name: 'Thick Blood', text: 'Max HP +15% for the run' },
];
export const GIFTS_BY_ID: ReadonlyMap<number, GiftDef> = new Map(GIFTS.map(g => [g.id, g]));
export const GIFT_CHOICES = 3;
export const RIFT_PURSE = 150;

// ---------------------------------------------------------------- events

export interface EventDef {
  id: number;
  name: string;
  /** Choices in order; the last is always to leave, unless every choice gives something. */
  choices: string[];
}

/** The launch pool of 20 (outcomes in riftRun.ts). */
export const EVENTS: EventDef[] = [
  { id: 1, name: 'Blood Altar', choices: ['Lose 20% max HP (current), gain an Epic Blood boon', 'Leave'] },
  { id: 2, name: 'Gambler', choices: ['Bet 50 Motes: 50% double, 50% lose', 'Bet 100 Motes', 'Leave'] },
  { id: 3, name: 'Wandering Smith', choices: ['Attune an Ethereal item for 40 Motes', 'Reroll one of its affixes for 20 Motes', 'Leave'] },
  { id: 4, name: 'Cursed Chest', choices: ['Open: an Ethereal item with 3 random headlines, and a random curse', 'Leave'] },
  { id: 5, name: 'Your Reflection', choices: ['Fight a copy of your build: win a free Epic boon; lose 30% HP and nothing else', 'Leave'] },
  { id: 6, name: 'Healing Spring', choices: ['Heal 25%', "Take a Rare boon of a theme you don't have"] },
  { id: 7, name: 'Quiet Alcove', choices: ['Heal 35%', 'Attune an Ethereal item for free'] },
  { id: 8, name: 'Goblin in the Rift', choices: ['Chase it: a 20 s fight against a fleeing goblin that pays Motes per hit', 'Leave'] },
  { id: 9, name: 'Shrine of Change', choices: ['Reroll all your boons into random ones of the same rarity (never a keystone before floor 3, never two of one theme)', 'Leave'] },
  { id: 10, name: 'Lost Satchel', choices: ['60 Motes', 'An Ethereal item'] },
  { id: 11, name: 'Broken Mirror', choices: ['Swap a boon below Epic for a random boon one rarity higher; 25% chance it is a curse instead', 'Leave'] },
  { id: 12, name: "Thane's Vault", choices: ['Open it: pick 1 of 3 Ethereal items; a dart trap takes 15% of your current HP', 'Leave'] },
  { id: 13, name: 'Lurking Echo', choices: ['Fight it: a lone Elite echo; a win pays 1 of 3 boons (Rare or better) and an Ethereal item with its Trophy, but no Motes', 'Sneak past'] },
  { id: 14, name: 'Moon Shard', choices: ['Touch it: a boon below Epic goes up one rarity, and a random curse', 'Pry it loose: 80 Motes', 'Leave'] },
  { id: 15, name: 'Blood Merchant', choices: ['An Ethereal item for 15% of your current HP', 'A Rare boon of your main theme for 15% of your current HP', 'Attune an Ethereal item for 15% of your current HP', 'Leave'] },
  { id: 16, name: 'Forgotten Forge', choices: ["Reforge an Ethereal item: its headlines roll again (the source's guaranteed one stays)", 'Attune it for 30 Motes', 'Leave'] },
  { id: 17, name: 'Weeping Statue', choices: ['Pray: heal to full, but your next fight node gives no boon pick', 'Leave'] },
  { id: 18, name: 'Ashen Brazier', choices: ['Burn a boon: heal 40% max HP and gain 60 Motes', 'Burn a curse away', 'Leave'] },
  { id: 19, name: 'Rift Tear', choices: ["Reach in: a random slot (never a Rift Anchor's) gets an Ethereal item with at least 2 headlines, worn at once", 'Leave'] },
  { id: 20, name: 'Runecarver', choices: ["Carve: one of your Ethereal items gets your main theme's mark", 'Pay 40 Motes: a theme of your choice', 'Leave'] },
];

/** Events' numbers (EVENTS' text). HP costs take a share of current HP, so an event never kills. */
export const EVENT_NUM = {
  altarHp: 0.2, gamble: [50, 100] as const, smithAttune: 40, smithReroll: 20, reflectionLoss: 0.3, reflectionSeconds: 90,
  springHeal: 0.25, alcoveHeal: 0.35, goblinSeconds: 20, goblinMotesPerHit: 2, mirrorCurse: 0.25, satchel: 60, vaultItems: 3, vaultHp: 0.15,
  shard: 80, merchantHp: 0.15, forgeAttune: 30, brazierHeal: 0.4, brazierMotes: 60, tearHeadlines: 2, runecarver: 40,
} as const;
export const EVENTS_BY_ID: ReadonlyMap<number, EventDef> = new Map(EVENTS.map(e => [e.id, e]));

// ---------------------------------------------------------------- weekly mutations

export const Mutation = { BloodMoon: 1, StormFront: 2, IronWeek: 3, BargainBin: 4, EchoesOfTheDeep: 5, WildMagic: 6, GlassWorld: 7 } as const;

export interface MutationDef {
  id: number;
  name: string;
  text: string;
}

export const MUTATIONS: MutationDef[] = [
  { id: Mutation.BloodMoon, name: 'Blood Moon', text: 'All enemies have 20% lifesteal; offer slot 3 is always a Blood boon' },
  { id: Mutation.StormFront, name: 'Storm Front', text: 'Everyone (you and enemies) has +30% attack speed' },
  { id: Mutation.IronWeek, name: 'Iron Week', text: 'Enemies are Armored; armor penetration counts double' },
  { id: Mutation.BargainBin, name: 'Bargain Bin', text: 'Shops −30%, fights pay −30% Motes' },
  { id: Mutation.EchoesOfTheDeep, name: 'Echoes of the Deep', text: 'Every Elite has 2 affixes, and its drop carries both as Trophies' },
  { id: Mutation.WildMagic, name: 'Wild Magic', text: 'Offer slot 3 is always Epic, keystones included from floor 1' },
  { id: Mutation.GlassWorld, name: 'Glass World', text: 'You and enemies deal double damage' },
];
export const MUTATIONS_BY_ID: ReadonlyMap<number, MutationDef> = new Map(MUTATIONS.map(m => [m.id, m]));

// ---------------------------------------------------------------- rewards

/** Each kind's count per hour of farming (the Deep pays half of this per depth). */
export const MATERIALS_PER_HOUR = { Metal: 20, Hide: 20, Cloth: 20, Wood: 20, Reagent: 20, Core: 8, Gem: 4 } as const;

export interface FloorRewardDef {
  /** Hours of farming at the run tier, for gold + XP, Dust and the tier's materials alike. */
  hours: number;
  riftstone: number;
  /** Power elixirs of the tier's grade. */
  elixirs: number;
  /** Rare herbs of the tier. */
  herbs: number;
}

/**
 * Weekly reward per floor (index 0 = floor 1): 8 h of farming and 19 Riftstone for a full
 * clear. Floor 5's Essences and Greater meal come once those exist.
 */
export const FLOOR_REWARDS: FloorRewardDef[] = [
  { hours: 0.75, riftstone: 0, elixirs: 0, herbs: 0 },
  { hours: 1, riftstone: 2, elixirs: 0, herbs: 0 },
  { hours: 1.5, riftstone: 3, elixirs: 2, herbs: 0 },
  { hours: 2, riftstone: 4, elixirs: 0, herbs: 2 },
  { hours: 2.75, riftstone: 10, elixirs: 0, herbs: 0 },
];

// ---------------------------------------------------------------- in a fight

/**
 * A theme's set bonus as an effect ID: 300 + theme × 10 + 7 (3 boons) or + 8 (5 boons). Not
 * held like a boon but derived each stat build; still permanent, since a fight's stats are
 * stored for its replay (abyss.ts `encodeStats`).
 */
export const setBonusId = (theme: ThemeId, at: 3 | 5) => 300 + theme * 10 + (at === 3 ? 7 : 8);

/** Set bonus numbers (THEMES' text). */
export const SET = {
  fury3: 0.15, fury5: 3, bastion3: 0.1, bastion5: { every: 10, share: 0.1 }, blood3: 0.05, blood5: 0.08,
  storm3: 0.15, storm5: 0.3, mist3: 0.06, mist5Glimmer: 0.5, aegis3: 0.08, aegis5: 0.5,
} as const;

/** Keystones' and other one-version boons' numbers, and the fixed parts of valued boons (BOONS' text). */
export const BOON_NUM = {
  /** Opening Salvo and Smoke last this long into a fight, seconds. */
  openingSeconds: 5,
  tailwindAttacks: 3,
  staticEvery: 5,
  /** Coup de Grâce below, and Hold the Line's drop below, this share of HP. */
  coupBelow: 0.3,
  holdBelow: 0.3,
  redTitheHp: 0.9,
  clottingBelow: 0.5,
  fortressTaken: 0.75,
  fortressSpeed: 0.85,
  phantomHp: 0.8,
  shieldwallSpeed: 0.8,
  thunderStep: 0.03,
  thunderMax: 0.3,
  bloodPriceCap: 0.2,
} as const;

/** Rift effects' numbers (RIFT_EFFECTS' text). */
export const RIFT_NUM = {
  glassHeartDamage: 2, glassHeartHp: 0.5, echoEvery: 4, overclockSpeed: 1.6, overclockCost: 0.01, gamblerMax: 3, phoenixHp: 0.4,
  mirrorReflect: 0.6, mirrorTaken: 1.15, hoarderPer10: 0.01, hoarderMax: 0.4, firstBlood: 5, voidheart: 1.25, conduit: 0.02,
  wither: 0.01, anchor: 1.2,
} as const;

/** Trophies' numbers (TROPHIES' text). */
export const TROPHY_NUM = {
  vampiric: 0.5, swiftSpeed: 1.5, swiftHit: 0.75, thornedReflect: 0.1, thornedHp: 0.7, unyielding: 0.015, ravenous: { every: 5, step: 0.05 },
} as const;

export const CURSE_NUM = { frailHp: 0.85, hexedHeal: 0.7, weightedSpeed: 0.9 } as const;
export const MUTATION_NUM = { bloodMoonDrain: 0.2, stormFrontSpeed: 1.3, glassWorldDamage: 2, ironWeekPen: 2 } as const;
/** Thick Blood: max HP × this for the run. */
export const THICK_BLOOD = 1.15;

/** What a member brings to a fight's stat build besides gear and level (combat.ts `combatStats`). */
export interface RiftBuild {
  /** Boons held, an Unravelled one left out. */
  boons: readonly { id: number; rarity: BoonRarity }[];
  curses?: readonly number[];
  /** Theme marks: worn Ethereal items' and Marked Path's. */
  marks?: readonly number[];
  mutation?: number;
  /** Motes held (Hoarder's Band). */
  motes?: number;
  /** Fight nodes won this floor (Bloodrush). */
  won?: number;
  /** The Thick Blood gift. */
  thickBlood?: boolean;
}

/**
 * The effects `rift` adds to a stat build: each boon at its rarity + 1 copies (`boonAmount`
 * reads it back), each curse, and each set bonus reached (Wildcard counting for every theme).
 */
export function riftEffects(rift: RiftBuild): Map<number, number> {
  const fx = new Map<number, number>();
  const counts = new Map<number, number>();
  let wild = 0;
  for (const h of rift.boons) {
    fx.set(h.id, h.rarity + 1);
    const t = BOONS_BY_ID.get(h.id)?.theme;
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    else if (h.id === Boon.Wildcard) wild = 1;
  }
  for (const t of rift.marks ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const c of rift.curses ?? []) fx.set(c, 1);
  for (const t of THEMES) {
    const n = (counts.get(t.id) ?? 0) + wild;
    if (n >= SET_AT[0]) fx.set(setBonusId(t.id, 3), 1);
    if (n >= SET_AT[1]) fx.set(setBonusId(t.id, 5), 1);
  }
  return fx;
}

/** A held boon's value (its text's number at its rarity) from its copies in `effects` (rarity + 1); 0 if not held. */
export function boonAmount(effects: ReadonlyMap<number, number>, id: number): number {
  const n = effects.get(id) ?? 0;
  return n > 0 ? (BOONS_BY_ID.get(id)?.values?.[Math.min(3, n) - 1] ?? 0) : 0;
}
