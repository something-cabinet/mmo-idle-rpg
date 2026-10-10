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
    /** Crafting material from salvage. */
    essence: t.u64().default(0n),
    bagSize: t.u16().default(200),
    /** Index (0-3) of the loadout in use. */
    activeLoadout: t.u8().default(0),
    /** Zone and enemy being farmed (IDs from data/zones.ts). */
    zoneId: t.u16().default(1),
    targetEnemyId: t.u16().default(101),
  }
);

export const Rarity = t.enum('Rarity', {
  Common: t.unit(),
  Magic: t.unit(),
  Rare: t.unit(),
  Epic: t.unit(),
  Legendary: t.unit(),
  Unique: t.unit(),
});

export const DamageType = t.enum('DamageType', { Physical: t.unit(), Magic: t.unit() });
export const HealTarget = t.enum('HealTarget', { Single: t.unit(), All: t.unit() });

/** A stat on an item. Values are hundredths of the display unit (data/stats.ts). */
export const StatValue = t.object('StatValue', {
  stat: t.u16(),
  value: t.i64(),
});

export const Affix = t.object('Affix', {
  stat: t.u16(),
  /** 1..item tier: which slice of the item's range this rolled in. */
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
    /** Set on handcrafted uniques. */
    uniqueId: t.u16().optional(),
    weapon: WeaponStats.optional(),
    /** Protected from salvage. */
    locked: t.bool(),
    createdAt: t.timestamp(),
  }
);

export const EquipProfile = t.enum('EquipProfile', {
  Damage: t.unit(),
  Survival: t.unit(),
  Loot: t.unit(),
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
  }
);

/** Drops below `minRarity` are salvaged unless they carry a whitelisted affix. */
export const lootFilter = table(
  { name: 'loot_filter' },
  {
    characterId: t.u64().primaryKey(),
    minRarity: Rarity,
    /** Stat IDs: a drop with any of these affixes is always kept. */
    keepAffixes: t.array(t.u16()),
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
    lastChatAt: t.timestamp(),
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

export const spacetimedb = schema({
  account,
  character,
  presence,
  linkOffer,
  chatMessage,
  item,
  loadout,
  lootFilter,
  bossKill,
  settleTimer,
});
