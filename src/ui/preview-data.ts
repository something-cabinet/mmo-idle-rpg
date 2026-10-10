// Static preview data taken from docs/design (zone-content.md, bases.md, the T1
// warrior simulation). Used to lay out screens whose systems aren't built yet.
// Replace with server data as each system lands.

export type DamageType = 'Phys' | 'Magic';
export type Defense = 'Balanced' | 'Armored' | 'Warded';
export type Rarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary' | 'unique';

export interface Enemy {
  name: string;
  level: number;
  dmg: DamageType;
  def: Defense;
  speed: number;
  hp: number;
  dps: number;
  armor: number;
  resist: number;
  xp: number;
  gold: number;
  drops: string[];
  boss?: boolean;
}

export interface Zone {
  tier: number;
  name: string;
  blurb: string;
  levels: string;
  enemies: Enemy[];
  unlocked: boolean;
}

export const ZONES: Zone[] = [
  {
    tier: 1,
    name: 'Greenhollow',
    blurb: 'Farmland and woods at the edge of the starting village.',
    levels: '1–15',
    unlocked: true,
    enemies: [
      { name: 'Field Rat', level: 1, dmg: 'Phys', def: 'Balanced', speed: 1.5, hp: 23, dps: 4.5, armor: 2.5, resist: 2.5, xp: 7, gold: 2,
        drops: ['Copper Dagger', 'Gnarled Wand', 'Rawhide Cap', 'Linen Shoes', 'Copper Gauntlets', 'Rough Emerald Ring', 'Rough Amber Amulet'] },
      { name: 'Wild Boar', level: 4, dmg: 'Phys', def: 'Armored', speed: 0.8, hp: 35, dps: 6.9, armor: 24, resist: 4, xp: 10, gold: 3,
        drops: ['Copper Mace', 'Gnarled Bow', 'Copper Helm', 'Rawhide Boots', 'Linen Robe', 'Copper Shield', 'Rough Ruby Ring'] },
      { name: 'Goblin Scout', level: 7, dmg: 'Phys', def: 'Balanced', speed: 1.2, hp: 53, dps: 10.5, armor: 17.5, resist: 17.5, xp: 14, gold: 4,
        drops: ['Copper Sword', 'Copper Katana', 'Rawhide Bracers', 'Linen Hood', 'Rough Sapphire Amulet', 'Rough Emerald Amulet'] },
      { name: 'Bog Wisp', level: 10, dmg: 'Magic', def: 'Warded', speed: 1.0, hp: 80, dps: 16, armor: 10, resist: 60, xp: 20, gold: 5,
        drops: ['Gnarled Fire Staff', 'Gnarled Healing Staff', 'Worn Tome', 'Linen Gloves', 'Rough Sapphire Ring', 'Rough Ruby Amulet'] },
      { name: 'Goblin Brute', level: 13, dmg: 'Phys', def: 'Armored', speed: 0.7, hp: 101, dps: 20.2, armor: 78, resist: 13, xp: 28, gold: 7,
        drops: ['Copper Greatsword', 'Copper Scepter', 'Copper Breastplate', 'Copper Greaves', 'Rawhide Vest', 'Rough Amber Ring'] },
      { name: 'Grubnak, Goblin Chief', level: 15, dmg: 'Phys', def: 'Balanced', speed: 0.9, hp: 138, dps: 27.4, armor: 37.5, resist: 37.5, xp: 44, gold: 11,
        drops: ['Any T1 base'], boss: true },
    ],
  },
  {
    tier: 2,
    name: 'Thornwood',
    blurb: 'A dark, overgrown forest where bandits and beasts hide.',
    levels: '16–25',
    unlocked: false,
    enemies: [
      { name: 'Thornback Spider', level: 16, dmg: 'Phys', def: 'Balanced', speed: 1.5, hp: 140, dps: 16.7, armor: 40, resist: 40, xp: 37, gold: 9,
        drops: ['Bronze Dagger', 'Oak Bow', 'Wool Gloves', 'Tanned Boots', 'Bronze Helm', 'Cut Emerald Ring', 'Cut Sapphire Amulet'] },
      { name: 'Bandit Cutthroat', level: 18, dmg: 'Phys', def: 'Balanced', speed: 1.3, hp: 164, dps: 19.5, armor: 45, resist: 45, xp: 46, gold: 12,
        drops: ['Bronze Sword', 'Bronze Katana', 'Tanned Cap', 'Tanned Vest', 'Wool Shoes', 'Cut Ruby Ring', 'Cut Emerald Amulet'] },
      { name: 'Briar Shaman', level: 20, dmg: 'Magic', def: 'Warded', speed: 0.9, hp: 191, dps: 22.7, armor: 20, resist: 120, xp: 58, gold: 14,
        drops: ['Oak Wand', 'Oak Fire Staff', "Scribe's Tome", 'Wool Hood', 'Wool Robe', 'Cut Sapphire Ring'] },
      { name: 'Ironbark Treant', level: 22, dmg: 'Phys', def: 'Armored', speed: 0.6, hp: 223, dps: 26.5, armor: 132, resist: 22, xp: 73, gold: 18,
        drops: ['Bronze Greatsword', 'Oak Healing Staff', 'Bronze Breastplate', 'Bronze Greaves', 'Bronze Shield', 'Cut Amber Ring'] },
      { name: 'Dire Wolf', level: 24, dmg: 'Phys', def: 'Balanced', speed: 1.4, hp: 260, dps: 30.9, armor: 60, resist: 60, xp: 91, gold: 23,
        drops: ['Bronze Mace', 'Bronze Scepter', 'Tanned Bracers', 'Bronze Gauntlets', 'Cut Ruby Amulet', 'Cut Amber Amulet'] },
      { name: 'Morgra, the Thorn Witch', level: 25, dmg: 'Magic', def: 'Warded', speed: 0.8, hp: 328, dps: 38.9, armor: 25, resist: 150, xp: 128, gold: 32,
        drops: ['Any T2 base'], boss: true },
    ],
  },
];

/** The simulated level-10 warrior in average T1 Magic gear (bases.md / zone-content.md). */
export const PREVIEW_PLAYER = {
  level: 10,
  primaries: { Might: 30, Finesse: 10, Mind: 10, Vitality: 33 },
  hp: 257,
  regen: 0,
  armor: 40,
  resist: 6,
  evasion: 0,
  hit: 13.8,
  dmg: 'Phys' as DamageType,
  speed: 0.93,
  crit: 0.055,
  critDmg: 1.5,
  armorPen: 0,
  itemFind: 0,
  goldFind: 0,
  xpGain: 0,
};

export const RESPAWN = 5;

export interface Affix {
  text: string;
  tier: number;
}

export interface Item {
  name: string;
  rarity: Rarity;
  tier: number;
  slot: string;
  base: string;
  implicits: string[];
  affixes: Affix[];
  legendary?: { name: string; text: string };
  locked?: boolean;
}

export const SLOTS = ['Main hand', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring 1', 'Ring 2', 'Amulet'] as const;

export const EQUIPPED: Record<(typeof SLOTS)[number], Item> = {
  'Main hand': { name: 'Copper Sword', rarity: 'magic', tier: 1, slot: 'Main hand', base: 'Sword · 1H · Phys',
    implicits: ['Hit 10 · 1.0/s', 'Crit 5%'], affixes: [{ text: '+1 physical damage', tier: 1 }] },
  'Off-hand': { name: 'Copper Shield', rarity: 'magic', tier: 1, slot: 'Off-hand', base: 'Shield',
    implicits: ['+8 armor', '+5 max HP', '+3.3% threat'], affixes: [{ text: '+10 max HP', tier: 1 }] },
  Head: { name: 'Copper Helm', rarity: 'magic', tier: 1, slot: 'Head', base: 'Plate · Head',
    implicits: ['+6 armor', '+1.2 resistance', '+2.7 Vitality', '−1.6% attack speed'], affixes: [{ text: '+10 max HP', tier: 1 }] },
  Chest: { name: 'Copper Breastplate', rarity: 'rare', tier: 1, slot: 'Chest', base: 'Plate · Chest',
    implicits: ['+12 armor', '+2.4 resistance', '+5.3 Vitality', '−3.2% attack speed'],
    affixes: [{ text: '+2.5 armor', tier: 1 }, { text: '+14 max HP', tier: 1 }] },
  Hands: { name: 'Copper Gauntlets', rarity: 'magic', tier: 1, slot: 'Hands', base: 'Plate · Hands',
    implicits: ['+6 armor', '+1.2 resistance', '+2.7 Vitality', '−1.6% attack speed'], affixes: [{ text: '+5% physical damage', tier: 1 }] },
  Feet: { name: 'Copper Greaves', rarity: 'magic', tier: 1, slot: 'Feet', base: 'Plate · Feet',
    implicits: ['+6 armor', '+1.2 resistance', '+2.7 Vitality', '−1.6% attack speed'], affixes: [{ text: '+10 max HP', tier: 1 }] },
  'Ring 1': { name: 'Rough Ruby Ring', rarity: 'magic', tier: 1, slot: 'Ring', base: 'Ring · Ruby',
    implicits: ['+6.7 Might'], affixes: [{ text: '+6.7% increased crit chance', tier: 1 }] },
  'Ring 2': { name: 'Rough Ruby Ring', rarity: 'magic', tier: 1, slot: 'Ring', base: 'Ring · Ruby',
    implicits: ['+6.7 Might'], affixes: [{ text: '+5% physical damage', tier: 1 }] },
  Amulet: { name: 'Rough Amber Amulet', rarity: 'epic', tier: 1, slot: 'Amulet', base: 'Amulet · Amber',
    implicits: ['+10 Vitality'],
    affixes: [{ text: '+6.7 Might', tier: 1 }, { text: '+12 max HP', tier: 1 }, { text: '+4% item find', tier: 1 }] },
};

const BAG_SEED: [string, Rarity, string, string[], Affix[], Item['legendary']?][] = [
  ['Copper Dagger', 'rare', 'Dagger · 1H · Phys', ['Hit 4.75 · 2.0/s', 'Crit 8%'], [{ text: '+2 physical damage', tier: 1 }, { text: '+9% increased crit chance', tier: 1 }]],
  ['Gnarled Wand', 'magic', 'Wand · 1H · Magic', ['Hit 6.25 · 1.5/s', 'Crit 6%'], [{ text: '+4% magic damage', tier: 1 }]],
  ['Rawhide Cap', 'common', 'Leather · Head', ['+3 armor', '+3 resistance', '+2.4 evasion'], []],
  ['Linen Shoes', 'magic', 'Cloth · Feet', ['+1.2 armor', '+6 resistance', '+2.7 Mind'], [{ text: '+13 max HP', tier: 1 }]],
  ['Copper Gauntlets', 'legendary', 'Plate · Hands', ['+6 armor', '+1.2 resistance', '+2.7 Vitality'], [{ text: '+8% physical damage', tier: 1 }, { text: '+15 max HP', tier: 1 }],
    { name: 'Juggernaut', text: "You can't evade, but armor also reduces magic damage." }],
  ['Rough Emerald Ring', 'rare', 'Ring · Emerald', ['+6.7 Finesse'], [{ text: '+2.8% attack speed', tier: 1 }, { text: '+3 evasion rating', tier: 1 }]],
  ['Copper Mace', 'common', 'Mace · 1H · Phys', ['Hit 11.75 · 0.8/s', 'Crit 5%', '+5% armor pen'], []],
  ['Gnarled Bow', 'magic', 'Bow · 2H · Phys', ['Hit 13.25 · 1.0/s', 'Crit 6%'], [{ text: '+1.5 physical damage', tier: 1 }]],
  ['Linen Robe', 'rare', 'Cloth · Chest', ['+2.4 armor', '+12 resistance', '+5.3 Mind'], [{ text: '+18 max HP', tier: 1 }, { text: '+6% heal', tier: 1 }]],
  ['Copper Shield', 'common', 'Shield', ['+8 armor', '+5 max HP', '+3.3% threat'], []],
  ['Copper Katana', 'epic', 'Katana · 2H · Phys', ['Hit 9.5 · 1.4/s', 'Crit 10%', '+13 crit damage'],
    [{ text: '+9% physical damage', tier: 1 }, { text: '+2 physical damage', tier: 1 }, { text: '+10% increased crit chance', tier: 1 }]],
  ['Rawhide Bracers', 'magic', 'Leather · Hands', ['+3 armor', '+3 resistance', '+2.4 evasion'], [{ text: '+4 evasion rating', tier: 1 }]],
  ['Gnarled Healing Staff', 'rare', 'Healing staff · 2H · Magic', ['Hit 5 · 1.0/s', 'Heal 7.5 (all allies)'], [{ text: '+8% heal', tier: 1 }, { text: '+1.5 heal', tier: 1 }]],
  ['Worn Tome', 'magic', 'Tome', ['+10 Mind', '+5% magic damage'], [{ text: '+7% magic damage', tier: 1 }]],
  ['Rough Sapphire Ring', 'common', 'Ring · Sapphire', ['+6.7 Mind'], []],
  ['Copper Greatsword', 'rare', 'Greatsword · 2H · Phys', ['Hit 23.75 · 0.55/s', 'Crit 5%', '+8% armor pen'], [{ text: '+2 physical damage', tier: 1 }, { text: '+15 max HP', tier: 1 }]],
  ['Copper Scepter', 'magic', 'Scepter · 1H · Phys', ['Hit 7.5 · 0.8/s', 'Heal 10 (single)'], [{ text: '+7% heal', tier: 1 }]],
  ['Rawhide Vest', 'common', 'Leather · Chest', ['+6 armor', '+6 resistance', '+4.8 evasion'], []],
  ['Rough Amber Ring', 'magic', 'Ring · Amber', ['+6.7 Vitality'], [{ text: '+3% gold find', tier: 1 }]],
  ['Gnarled Fire Staff', 'magic', 'Fire staff · 2H · Magic', ['Hit 18.75 · 0.8/s', 'Crit 5%'], [{ text: '+9% magic damage', tier: 1 }]],
];

export const BAG: Item[] = BAG_SEED.map(([name, rarity, base, implicits, affixes, legendary], i) => ({
  name,
  rarity,
  tier: 1,
  slot: base.split(' · ')[0],
  base,
  implicits,
  affixes,
  legendary,
  locked: i === 4,
}));

export const AFFIX_NAMES = [
  'Physical damage', 'Physical damage %', 'Magic damage', 'Magic damage %', 'Attack speed %',
  'Increased crit chance %', 'Crit damage', 'Armor penetration %', 'Magic penetration %',
  'Max HP', 'Max HP %', 'Armor', 'Armor %', 'Resistance', 'Resistance %', 'Evasion rating',
  'Evasion rating %', 'HP regen', 'Lifesteal %', 'Heal', 'Heal %', 'Threat %', 'Item find %',
  'Gold find %', 'XP gain %', 'Might', 'Finesse', 'Mind', 'Vitality',
];
