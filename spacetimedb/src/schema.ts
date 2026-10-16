import { schema, table, t } from 'spacetimedb/server';

export const AccountKind = t.enum('AccountKind', {
  /** Anonymous SpacetimeDB identity; lives only in one browser's storage. */
  Guest: t.unit(),
  /** Logged in through SpacetimeAuth; same identity on every device. */
  Registered: t.unit(),
});

export const Role = t.enum('Role', {
  Player: t.unit(),
  Admin: t.unit(),
});

/**
 * One row per identity (= login). Private: holds email and moderation state.
 * Clients read their own row through the `my_account` view.
 */
export const account = table(
  { name: 'account' },
  {
    identity: t.identity().primaryKey(),
    kind: AccountKind,
    role: Role,
    banned: t.bool(),
    email: t.string().optional(),
    createdAt: t.timestamp(),
    lastLoginAt: t.timestamp(),
  }
);

/**
 * The account's one character (one per account by design: alts would just be
 * extra idle farms). Progress is a snapshot as of `lastSettledAt`; idle gains
 * after that are computed with `project()` from game.ts.
 */
export const character = table(
  { name: 'character', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().unique(),
    name: t.string(),
    /** Lowercased name, for case-insensitive uniqueness. */
    nameKey: t.string().unique(),
    level: t.u32(),
    xp: t.u64(),
    gold: t.u64(),
    lastSettledAt: t.timestamp(),
    createdAt: t.timestamp(),
    // New columns need defaults so existing rows migrate.
    /** Deprecated: replaced by `dust`; settle moves what's left here into it. Drop on the next wipe. */
    essence: t.u64().default(0n),
    bagSize: t.u16().default(200),
    /** Index (0-3) of the loadout in use. */
    activeLoadout: t.u8().default(0),
    /** Zone and enemy being farmed (IDs from data/zones.ts); enemy 0 = idle (fled or defeated). */
    zoneId: t.u16().default(1),
    targetEnemyId: t.u16().default(101),
    /** Crafting material from salvage (was `essence`). */
    dust: t.u64().default(0n),
    /** Currency from raid kills (raids.md), to trade for things later. */
    raidTokens: t.u64().default(0n),
    /**
     * The life skill being worked (data/skills.ts ID), or 0 for combat against `targetEnemyId`
     * (life-skills.md: one activity at a time). The target is kept while skilling.
     */
    activitySkill: t.u8().default(0),
    /** What the skill works on: gathering `node × 100 + tier` (data/skills.ts `gatherSpotId`), the recipe (data/recipes.ts) for production. */
    activityRecipe: t.u16().default(0),
    /** Production actions still queued; when the queue runs out the character goes back to `targetEnemyId`. */
    activityCountLeft: t.u32().default(0),
    /** The active elixir (data/supplies.ts supply ID), or 0 for none. */
    elixirId: t.u16().default(0),
    /** Kills the active elixir has left (life-skills.md, "Buff rules"). */
    elixirKillsLeft: t.u32().default(0),
    /** When the elixir runs out, take another of the same from stock. */
    elixirAutoRenew: t.bool().default(true),
    /** Unused: the item of a queued temper, before tempering became instant. Drop on the next wipe. */
    activityItemId: t.u64().default(0n),
  }
);

export const Rarity = t.enum('Rarity', {
  Common: t.unit(),
  Magic: t.unit(),
  Rare: t.unit(),
  Epic: t.unit(),
  Legendary: t.unit(),
  Unique: t.unit(),
  // Reserved, unused yet.
  Ethereal: t.unit(),
  Mythic: t.unit(),
  // Never named in the game (loot.ts `makeAnomaly`). New variants go at the end.
  Anomaly: t.unit(),
});

// A weapon's damage. Split: half physical, half magic (bases.md). New variants go at the end.
export const DamageType = t.enum('DamageType', { Physical: t.unit(), Magic: t.unit(), Split: t.unit() });
export const HealTarget = t.enum('HealTarget', { Single: t.unit(), All: t.unit() });

/** A stat on an item. Values are hundredths of the display unit (data/stats.ts). */
export const StatValue = t.object('StatValue', {
  stat: t.u16(),
  value: t.i64(),
});

export const Affix = t.object('Affix', {
  stat: t.u16(),
  /** 1..item tier: which slice of the item's range this rolled in; 0 for a unique's stats. */
  tier: t.u8(),
  value: t.i64(),
});

export const LegendaryAffix = t.object('LegendaryAffix', {
  /** Effect ID from data/legendary.ts. */
  effect: t.u16(),
  /** The small stat bonus that comes with the effect. */
  stat: t.u16(),
  value: t.i64(),
});

/** What one attack of a weapon does, saved literally at drop time. */
export const WeaponStats = t.object('WeaponStats', {
  damageType: DamageType,
  /** Hundredths. */
  hit: t.i64(),
  /** Attacks per second × 1000. */
  speedMilli: t.u32(),
  /** Base crit chance in basis points (500 = 5%). */
  baseCritBp: t.u32(),
  /** Hundredths; 0 for weapons that don't heal. */
  heal: t.i64(),
  healTarget: HealTarget.optional(),
  twoHanded: t.bool(),
});

/**
 * Items are stored literally: every value is computed once at drop time and saved,
 * so rebalancing only changes new drops. Private; owners read theirs via `my_items`.
 */
export const item = table(
  { name: 'item' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    /** Base ID from data/bases.ts. */
    baseId: t.u16(),
    tier: t.u8(),
    rarity: Rarity,
    implicits: t.array(StatValue),
    affixes: t.array(Affix),
    legendary: LegendaryAffix.optional(),
    /** Set on handcrafted uniques (data/uniques.ts); its stats are in `affixes` with tier 0. */
    uniqueId: t.u16().optional(),
    weapon: WeaponStats.optional(),
    /** Protected from salvage. */
    locked: t.bool(),
    createdAt: t.timestamp(),
    /** A unique's effect IDs (data/legendary.ts); empty on other items. */
    effects: t.array(t.u16()).default([]),
    /** Temper level 0–10 (life-skills.md, "Smithing: temper an item"): +2% base stats each, applied when stats are computed. */
    temper: t.u8().default(0),
  }
);

/** A base at one tier, or a unique (uniqueId ≠ 0): one discovery. */
export const Found = t.object('Found', {
  baseId: t.u16(),
  tier: t.u8(),
  /** 0 for a plain base. */
  uniqueId: t.u16(),
});

/** A count of one material (data/materials.ts). */
export const MaterialCount = t.object('MaterialCount', {
  materialId: t.u16(),
  count: t.u32(),
});

/** One rare encounter in a settle (encounters.ts). */
export const Encounter = t.object('Encounter', {
  /** encounters.ts `EncounterKind`. */
  kind: t.u8(),
  /** An elite was beaten; false: the character fled. */
  won: t.bool(),
  xp: t.u64(),
  gold: t.u64(),
  materials: t.array(MaterialCount),
  /** A cache's item; 0 if it was salvaged for a full bag. */
  itemId: t.u64(),
});

/**
 * Materials a character holds: one row per material it has ever had. Private;
 * owners read theirs via `my_materials`.
 */
export const material = table(
  { name: 'material' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    /** Material ID from data/materials.ts. */
    materialId: t.u16(),
    count: t.u64(),
  }
);

/**
 * Auto-equip profiles (equip.ts PROFILES). Damage and Survival are the physical ones (named
 * before the magic ones existed); Loot is retired and auto-equips as Damage. Rename and drop
 * Loot at the M9 save reset: a variant can only be added in place.
 */
export const EquipProfile = t.enum('EquipProfile', {
  Damage: t.unit(),
  Survival: t.unit(),
  Loot: t.unit(),
  DamageMagic: t.unit(),
  Healing: t.unit(),
  SurvivalMagic: t.unit(),
});

/** A saved gear set. Each character has exactly LOADOUT_COUNT of them. */
export const loadout = table(
  { name: 'loadout' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    /** 0..LOADOUT_COUNT-1. */
    index: t.u8(),
    name: t.string(),
    profile: EquipProfile,
    /** Item ID per slot in data/bases.ts SLOTS order; 0 = empty. */
    slots: t.array(t.u64()),
    /** Bit i set: auto-equip leaves slot i as it is (equip.ts `slotLocked`). */
    lockedSlots: t.u16().default(0),
  }
);

/** Which drops are kept; the rest are salvaged (loot.ts `passesFilter`). */
export const lootFilter = table(
  { name: 'loot_filter' },
  {
    characterId: t.u64().primaryKey(),
    minRarity: Rarity,
    /** Stat IDs: drops are kept only with one of these affixes (empty or all = any). */
    keepAffixes: t.array(t.u16()),
    /** Unused: base IDs from before item types. Drop at the M9 save reset. */
    keepBases: t.array(t.u16()).default([]),
    /** Drops are kept only with an affix of at least this tier (1 = any). */
    minAffixTier: t.u8().default(1),
    /** Type IDs: drops are kept only of these types (empty = any; a full list is stored as empty). */
    keepTypes: t.array(t.u16()).default([]),
    /** Rejected drops are scrapped into materials (no Dust or gold) instead of being salvaged. */
    scrap: t.bool().default(false),
  }
);

/**
 * The forge keep rule (life-skills.md, "Smithing"): forged bases that fail it are
 * salvaged instead of going to the bag. No row keeps everything. Private; owners read
 * theirs via `my_forge_filter`.
 */
export const forgeFilter = table(
  { name: 'forge_filter' },
  {
    characterId: t.u64().primaryKey(),
    minRarity: Rarity,
    /** Stat IDs: kept only with one of these affixes (empty or all = any). */
    keepAffixes: t.array(t.u16()),
    /** Kept only with an affix of at least this tier (1 = any). */
    minAffixTier: t.u8(),
    /** Rejected bases are scrapped into materials instead of being salvaged. */
    scrap: t.bool().default(false),
  }
);

/**
 * Unused since 2026-10-17: scrap was held here until smelted; scrapping now gives materials
 * at once, and migrate.ts `scrapToMaterials` emptied it. Drop (with `my_scrap`) at the M9 save reset.
 */
export const scrap = table(
  { name: 'scrap' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    /** The material it smelts into (data/recipes.ts `scrapMaterialId`). */
    materialId: t.u16(),
    rarity: Rarity,
    count: t.u64(),
  }
);

/** First kill of a zone boss; unlocks the next zone. */
export const bossKill = table(
  { name: 'boss_kill' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    zoneId: t.u16(),
    killedAt: t.timestamp(),
  }
);

/** Lifetime kills of one enemy by one character, online and offline. */
export const enemyKill = table(
  { name: 'enemy_kill' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    enemyId: t.u16(),
    kills: t.u64(),
  }
);

/**
 * A base (at one tier) or unique a character has seen drop, salvaged drops included:
 * the client shows undiscovered ones as ???. One row per first sighting. Private;
 * owners read theirs via `my_discoveries`.
 */
export const discovery = table(
  { name: 'discovery' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    baseId: t.u16(),
    tier: t.u8(),
    /** 0 for a plain base. */
    uniqueId: t.u16(),
  }
);

/**
 * What one settle granted, for the loot log and the away report. Written for every
 * settle with kills and for every login (`offline`); the newest SETTLE_LOG_KEEP per
 * character are kept. Private; owners read theirs via `my_settle_log`.
 */
export const settleLog = table(
  { name: 'settle_log' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    at: t.timestamp(),
    /** The login settle (time away, capped at the gear's `offlineCapMicros`). */
    offline: t.bool(),
    /** Time since the previous settle, before the offline cap. */
    elapsedMicros: t.u64(),
    capped: t.bool(),
    enemyId: t.u16(),
    /** The target could be beaten with the gear worn (false: no rewards). */
    viable: t.bool(),
    kills: t.u32(),
    levelFrom: t.u32(),
    levelTo: t.u32(),
    xp: t.u64(),
    gold: t.u64(),
    /** Deprecated: replaced by `dust` (always 0 now). Drop on the next wipe. */
    essence: t.u64(),
    /** Items added to the bag (they may since have been salvaged). */
    keptItemIds: t.array(t.u64()),
    /** Salvaged drops per rarity, in loot.ts RARITIES order. */
    salvaged: t.array(t.u32()),
    /** Kept by the filter but salvaged for a full bag. */
    overflow: t.u32(),
    /** `enemyId` killed the character; it went idle. */
    defeated: t.bool().default(false),
    /** Time spent idle after the defeat, up to this settle. */
    idleMicros: t.u64().default(0n),
    /** Materials dropped. */
    materials: t.array(MaterialCount).default([]),
    /** Dust gained (was `essence`). */
    dust: t.u64().default(0n),
    /** Bases and uniques this settle's drops showed for the first time (discovery). */
    discovered: t.array(Found).default([]),
    /** Rare encounters met (encounters.ts); their gains are in the totals above. */
    encounters: t.array(Encounter).default([]),
    /** The life skill worked in this settle (data/skills.ts), or 0 for combat (then `enemyId` is 0). */
    skillId: t.u8().default(0),
    /** Gathering or production actions done. */
    actions: t.u32().default(0),
    skillXp: t.u64().default(0n),
    skillLevelFrom: t.u8().default(0),
    skillLevelTo: t.u8().default(0),
    /** The production recipe worked (data/recipes.ts), or 0. Forged items are in `keptItemIds`. */
    recipe: t.u16().default(0),
    /** Production inputs used up. */
    used: t.array(MaterialCount).default([]),
    /** The elixir active at the start of the settle (data/supplies.ts), or 0. */
    elixirId: t.u16().default(0),
    /** Kills made with an elixir active. */
    elixirKills: t.u32().default(0),
    /** Elixirs auto-renew took from stock. */
    elixirsUsed: t.u32().default(0),
    /** The elixir ran out with no stock left: the slot is empty now. */
    elixirEmpty: t.bool().default(false),
    /** Drops (or forged bases) scrapped instead of salvaged, per rarity in loot.ts RARITIES order. */
    scrapped: t.array(t.u32()).default([]),
    /** Live fights lost to `enemyId` in a matchup won on average: each cost a respawn, not the target (sim.ts). */
    respawns: t.u32().default(0),
  }
);

/** A character's level in one life skill (data/skills.ts). Private; owners read theirs via `my_skills`. */
export const skill = table(
  { name: 'skill' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    skillId: t.u8(),
    level: t.u8(),
    /** XP toward the next level. */
    xp: t.u64(),
  }
);

/** A character's stock of one supply (data/supplies.ts): elixirs. Private; owners read theirs via `my_supplies`. */
export const supply = table(
  { name: 'supply' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    supplyId: t.u16(),
    count: t.u64(),
  }
);

/**
 * A character's gathering tool for one skill, as a tier (life-skills.md, "Tools"): not a bag
 * item. Every character starts with tier 1. Private; owners read theirs via `my_tools`.
 */
export const tool = table(
  { name: 'tool' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    /** The gathering skill it serves (data/skills.ts `tool`). */
    skillId: t.u8(),
    tier: t.u8(),
  }
);

/** Drives `settleOnline`: one interval row, inserted by `init`. */
export const settleTimer = table(
  { name: 'settle_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

/**
 * Who is in the world right now. A row exists while the account is connected
 * and has a character.
 */
export const presence = table(
  { name: 'presence', public: true },
  {
    identity: t.identity().primaryKey(),
    /** The connection that is playing (an account may have several tabs open). */
    connectionId: t.connectionId(),
    characterId: t.u64().unique(),
    characterName: t.string(),
    since: t.timestamp(),
    /** Deprecated: replaced by `chat_cooldown` (writing it re-sent the row to every client). Drop on the next wipe. */
    lastChatAt: t.timestamp(),
  }
);

/** When each player in the world last chatted, for the cooldown. Private, unlike `presence`. */
export const chatCooldown = table(
  { name: 'chat_cooldown' },
  {
    identity: t.identity().primaryKey(),
    lastChatAt: t.timestamp(),
  }
);

/** One-off data migrations already run (migrate.ts), by name. Private. */
export const migration = table(
  { name: 'migration' },
  {
    name: t.string().primaryKey(),
    ranAt: t.timestamp(),
  }
);

/** The character a player is inspecting (online list); read through the `inspected_*` views. */
export const inspect = table(
  { name: 'inspect' },
  {
    viewer: t.identity().primaryKey(),
    characterId: t.u64(),
  }
);

/**
 * Friend list, one-way: `characterId` added `friendId` (no request or acceptance yet).
 * Friends can be inspected while offline. Private; owners read theirs via `my_friends`.
 */
export const friend = table(
  { name: 'friend' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    friendId: t.u64().index('btree'),
    addedAt: t.timestamp(),
  }
);

/** A guest consenting to have its character moved into a registered account. */
export const linkOffer = table(
  { name: 'link_offer' },
  {
    guest: t.identity().primaryKey(),
    target: t.identity(),
    createdAt: t.timestamp(),
  }
);

export const chatMessage = table(
  { name: 'chat_message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    /** Snapshot, so history still reads right after a character is deleted. */
    characterName: t.string(),
    text: t.string(),
    sentAt: t.timestamp(),
  }
);

/** A raid fight, decided when the leader starts it (raid.ts `simulateRaid`); clients replay it from `setup`. */
export const RaidFight = t.object('RaidFight', {
  startedAt: t.timestamp(),
  /** When the fight is over and `finishRaid` grants the rewards. */
  endsAt: t.timestamp(),
  /** raid.ts `RaidSetup` (`encodeSetup`): every fighter's name and combat stats as of the start. */
  setup: t.string(),
  won: t.bool(),
  /** Gold the leader paid for the hired NPCs. */
  hireCost: t.u64(),
  /** `finishRaid` has granted the rewards: the party can start again. */
  finished: t.bool(),
});

/**
 * A raid party (raids.md): players in `raid_member` plus `hired` NPC seats. Public, so
 * players can find a party to join. Online only: members who leave the world leave it.
 */
export const raidParty = table(
  { name: 'raid_party', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    /** Raid ID from data/raids.ts. */
    raidId: t.u16(),
    leaderId: t.u64(),
    hired: t.u8(),
    createdAt: t.timestamp(),
    /** The fight in progress, or the last one (until the next starts). */
    fight: RaidFight.optional(),
  }
);

/** A player in a raid party; seats go in `joinedAt` order. Public, with the party. */
export const raidMember = table(
  { name: 'raid_member', public: true },
  {
    characterId: t.u64().primaryKey(),
    partyId: t.u64().index('btree'),
    /** Snapshot, so the party list needs no character rows. */
    name: t.string(),
    joinedAt: t.timestamp(),
  }
);

/** One raid fight a character took part in, and what it got. Private; owners read theirs via `my_raid_log`. */
export const raidLog = table(
  { name: 'raid_log' },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64().index('btree'),
    raidId: t.u16(),
    partyId: t.u64(),
    /** The fight's start. */
    startedAt: t.timestamp(),
    won: t.bool(),
    /** A win that granted rewards: a clear (false: lost, or no clears left today). */
    rewarded: t.bool(),
    /** Deprecated: replaced by `itemIds` (always 0 now). Drop on the next wipe. */
    itemId: t.u64(),
    tokens: t.u64(),
    gold: t.u64(),
    xp: t.u64(),
    /** Gold this character paid for hired NPCs (the leader). */
    hireCost: t.u64(),
    /** The items granted (`itemsPerClear` on a rewarded win); empty otherwise. */
    itemIds: t.array(t.u64()).default([]),
  }
);

/** Drives `finishRaid`: one row per fight in progress, due when it ends. */
export const raidTimer = table(
  { name: 'raid_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    partyId: t.u64(),
  }
);

export const spacetimedb = schema({
  account,
  character,
  presence,
  inspect,
  friend,
  linkOffer,
  chatMessage,
  chatCooldown,
  item,
  material,
  loadout,
  lootFilter,
  bossKill,
  enemyKill,
  discovery,
  settleLog,
  settleTimer,
  raidParty,
  raidMember,
  raidLog,
  raidTimer,
  skill,
  tool,
  supply,
  forgeFilter,
  scrap,
  migration,
}, {
  // Set only when publishing locally (package.json `spacetime:publish:local`); never on
  // Maincloud, so the dev cheats (reducers/dev.ts) refuse there.
  env: { DEV_CHEATS: t.option(t.string()) },
});
