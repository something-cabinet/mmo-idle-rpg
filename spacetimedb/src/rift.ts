// The Shifting Rift (docs/design/shifting-rift.md): everything a run rolls. Pure and
// deterministic, shared by the server, the client and the `test:rift` bots. The map, the
// line-ups and the boss options come from the run's seed alone (`runRng`), so a party shares
// them; offers, shops, events and items also take the character (`memberRng`), so nobody
// shares another's luck. Only the weekly mutation is the same for everyone.

import { ELITE_AFFIXES, PROFILE } from './data/abyss';
import { ZONE_BASES } from './data/bases';
import { materialAt, untieredMaterial } from './data/materials';
import {
  AFFIX_TIER_SPAN, BOONS, BOONS_BY_ID, Boon, CURSES, ETHEREAL_AFFIXES, EVENTS, FLOOR_REWARDS, FLOORS, GIFTS, GIFT_CHOICES, Gift,
  HEADLINE_CHANCE, HEADLINE_KINDS, KEYSTONE_FLOOR, MATERIALS_PER_HOUR, MUTATIONS, MUTATION_NUM, Mutation, NODE_TIME_LIMIT, PARTY_HP, PRICE, RIFT_DPS, RIFT_EFFECTS,
  RIFT_HEART, RIFT_HP, RIFT_SLOT, ROWS, ROW_MAX, ROW_MIN, SHIFT_EVERY, SHOP_MAX, SHOP_MIN, THEMES, Theme, canUpgrade, floorMult, rarityOdds, riftLevel, trophyId,
  type BoonDef, type BoonGate, type BoonRarity, type HeadlineKind, type RiftSlot, type ThemeId,
} from './data/rift';
import { ELIXIRS, SUPPLY_TIERS, elixirSupplyId, gradeOf } from './data/supplies';
import { UNIQUES } from './data/uniques';
import { ZONES, averageEnemyDps, averageEnemyHp, effectiveHp, farmingReward, referenceAccuracy, type Defense, type EnemyDef } from './data/zones';
import type { FoeSpec } from './battle';
import { fightFoe, type FightMods } from './fight';
import { makeItem, rollAffix, seededRng, type NewItem, type Rng } from './loot';

const RIFT_SALT = 0x72696674n; // "rift"
const MUTATION_SALT = 0x6d757461n; // "muta"

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/** Fisher–Yates, in place. */
function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** A pick by weight from [value, weight] pairs. */
function weighted<T>(rng: Rng, xs: readonly (readonly [T, number])[]): T {
  let r = rng() * xs.reduce((sum, [, w]) => sum + w, 0);
  return (xs.find(([, w]) => (r -= w) < 0) ?? xs[xs.length - 1])[0];
}

// ---------------------------------------------------------------- weeks and seeds

const DAY_MICROS = 86_400_000_000n;

/** The Rift week of a time: weeks start Monday 00:00 UTC (1970-01-01 was a Thursday). */
export const riftWeek = (micros: bigint) => Number((micros / DAY_MICROS + 3n) / 7n);
/** When week `week` starts, in microseconds since the epoch. */
export const weekStartMicros = (week: number) => (BigInt(week) * 7n - 3n) * DAY_MICROS;

/** The mutations in a seeded order for weeks `block × n` to `block × n + n − 1`. */
function mutationOrder(block: number): number[] {
  return shuffle(seededRng(BigInt(block), MUTATION_SALT), MUTATIONS.map(m => m.id));
}

/** The week's mutation, the same for everyone: every mutation once per stretch of 7 weeks, never the same two weeks running. */
export function weeklyMutation(week: number): number {
  const n = MUTATIONS.length;
  const block = Math.floor(week / n);
  const order = mutationOrder(block);
  if (order[0] === mutationOrder(block - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[week % n];
}

/** What a roll is for, so each one draws from its own generator. */
export const Purpose = { Map: 1, Lineup: 2, Boss: 3, Threshold: 4, Offer: 5, Shop: 6, Event: 7, Item: 8, Fight: 9 } as const;

/** A run's seed, stored on the run. */
export const runSeed = (runId: bigint, startMicros: bigint): bigint =>
  BigInt(Math.floor(seededRng(runId, startMicros, RIFT_SALT)() * 2 ** 53));

/** A roll the whole party shares (the map, line-ups, boss options). */
export const runRng = (seed: bigint, purpose: number, ...parts: number[]): Rng =>
  seededRng(seed, 0n, BigInt(purpose), ...parts.map(p => BigInt(p)), RIFT_SALT);

/** A member's own roll (offers, shops, events, items). */
export const memberRng = (seed: bigint, characterId: bigint, purpose: number, ...parts: number[]): Rng =>
  seededRng(seed, characterId, BigInt(purpose), ...parts.map(p => BigInt(p)), RIFT_SALT);

// ---------------------------------------------------------------- floor maps

export type NodeKind = 'fight' | 'elite' | 'shop' | 'event';

export interface MapNode {
  kind: NodeKind;
  /** Indexes of the nodes it leads to in the next row (none in the last row: the boss follows). */
  links: number[];
  /** An event node's event (data/rift.ts EVENTS). */
  event?: number;
}

/** A floor's rows of nodes 1–5; node 6, the boss, follows every last-row node. */
export interface FloorMap {
  floor: number;
  rows: MapNode[][];
}

const KIND_WEIGHTS: [NodeKind, number][] = [['fight', 45], ['elite', 15], ['shop', 15], ['event', 25]];
const MAP_TRIES = 1000;

/**
 * Links between a row of `m` nodes and the next of `n`, as a staircase from the first pair
 * to the last: no two links cross, every node on both rows has one, and none leads to more
 * than 2. Undefined when the draw gets stuck (the caller draws again).
 */
function drawLinks(rng: Rng, m: number, n: number): number[][] | undefined {
  const links = Array.from({ length: m }, () => [] as number[]);
  let i = 0;
  let j = 0;
  links[0].push(0);
  while (i < m - 1 || j < n - 1) {
    const steps: ('i' | 'j' | 'both')[] = [];
    if (i < m - 1) steps.push('i');
    if (j < n - 1 && links[i].length < 2) steps.push('j');
    if (i < m - 1 && j < n - 1) steps.push('both');
    if (!steps.length) return undefined;
    const step = pick(rng, steps);
    if (step !== 'j') i++;
    if (step !== 'i') j++;
    if (!links[i].includes(j)) links[i].push(j);
  }
  return links;
}

function drawMap(rng: Rng, floor: number): FloorMap | undefined {
  const sizes = Array.from({ length: ROWS }, () => ROW_MIN + Math.floor(rng() * (ROW_MAX - ROW_MIN + 1)));
  const events = shuffle(rng, EVENTS.map(e => e.id));
  const rows: MapNode[][] = sizes.map((size, r) =>
    Array.from({ length: size }, () => {
      const kind = r === 0 ? 'fight' : weighted(rng, KIND_WEIGHTS);
      return { kind, links: [], ...(kind === 'event' && { event: events.length ? events.pop()! : pick(rng, EVENTS).id }) };
    })
  );
  for (let r = 0; r < ROWS - 1; r++) {
    const links = drawLinks(rng, sizes[r], sizes[r + 1]);
    if (!links) return undefined;
    rows[r].forEach((node, i) => (node.links = links[i]));
  }
  return { floor, rows };
}

/** The best (`min` or `max`) total of `cost` over every path from row 1 to the boss. */
function overPaths(map: FloorMap, cost: (n: MapNode) => number, better: (a: number, b: number) => number): number {
  let next: number[] = map.rows[ROWS - 1].map(cost);
  for (let r = ROWS - 2; r >= 0; r--) next = map.rows[r].map(n => cost(n) + n.links.map(j => next[j]).reduce((a, b) => better(a, b)));
  return next.reduce((a, b) => better(a, b));
}

const isFight = (n: MapNode) => n.kind === 'fight' || n.kind === 'elite';

/** What breaks the generator's rules on `map` (shifting-rift.md, "Floor map"); empty when it's valid. */
export function mapProblems(map: FloorMap): string[] {
  const out: string[] = [];
  const { rows } = map;
  if (rows.length !== ROWS) return [`${rows.length} rows`];
  rows.forEach((row, r) => {
    if (row.length < ROW_MIN || row.length > ROW_MAX) out.push(`row ${r + 1} has ${row.length} nodes`);
    row.forEach((node, i) => {
      const last = r === ROWS - 1;
      if (last ? node.links.length !== 0 : node.links.length < 1 || node.links.length > 2) out.push(`node ${r + 1}.${i + 1} has ${node.links.length} links`);
      if (node.links.some(j => j < 0 || j >= (rows[r + 1]?.length ?? 0))) out.push(`node ${r + 1}.${i + 1} links outside the next row`);
      if ((node.kind === 'event') !== (node.event !== undefined)) out.push(`node ${r + 1}.${i + 1}: event mismatch`);
      const next = row[i + 1];
      if (next && node.links.length && next.links.length && Math.max(...node.links) > Math.min(...next.links)) out.push(`links from row ${r + 1} cross`);
    });
    if (r > 0 && rows[r].some((_, j) => !rows[r - 1].some(n => n.links.includes(j)))) out.push(`a node in row ${r + 1} can't be reached`);
  });
  if (out.length) return out;
  if (rows[0].some(n => n.kind !== 'fight')) out.push('node 1 is not always a plain fight');
  if (!rows.slice(1).some(row => row.some(n => n.kind === 'shop'))) out.push('no shop');
  if (overPaths(map, n => (n.kind === 'elite' ? 1 : 0), Math.min) > 0) out.push('every path meets an Elite');
  if (overPaths(map, n => (isFight(n) ? 1 : 0), Math.min) < 2) out.push('a path has fewer than 2 fights');
  return out;
}

/** Floor `floor`'s map, drawn again until it follows every rule. */
export function floorMap(seed: bigint, floor: number): FloorMap {
  const rng = runRng(seed, Purpose.Map, floor);
  for (let k = 0; k < MAP_TRIES; k++) {
    const map = drawMap(rng, floor);
    if (map && !mapProblems(map).length) return map;
  }
  throw new Error(`No valid map for floor ${floor}`);
}

// ---------------------------------------------------------------- enemies

/** A zone enemy as the Rift echoes it: its shape (damage type, defenses, traits, HP-to-DPS lean) without its strength. */
export interface EchoKind {
  enemy: EnemyDef;
  /** × the run's average HP and DPS: the original's lean, normalized so a kind is as strong as the average (traits still paid with HP). */
  hp: number;
  dps: number;
}

function echoOf(tier: number, e: EnemyDef): EchoKind {
  const eh = effectiveHp(e) / averageEnemyHp(tier);
  const d = e.dps / averageEnemyDps(tier);
  const s = Math.sqrt(eh * d);
  return { enemy: e, hp: e.hp / averageEnemyHp(tier) / s, dps: d / s };
}

/** Every zone enemy, as fight-node echoes. */
export const RIFT_ECHOES: EchoKind[] = ZONES.flatMap(z => z.enemies.filter(e => !e.boss).map(e => echoOf(z.tier, e)));
/** Every zone boss, as floor-boss echoes. */
export const RIFT_BOSS_ECHOES: EchoKind[] = ZONES.flatMap(z => z.enemies.filter(e => e.boss).map(e => echoOf(z.tier, e)));
export const ECHOES_BY_ID: ReadonlyMap<number, EchoKind> = new Map([...RIFT_ECHOES, ...RIFT_BOSS_ECHOES].map(k => [k.enemy.id, k]));

/**
 * A Rift enemy before its affixes (abyss.ts `withEliteAffix`, applied against the fighter):
 * the run tier's average enemy × the floor × the kind × the slot × RIFT_HP / RIFT_DPS, HP also
 * × the party's factor. Level, armor, resistance and evasion are the run tier's; only HP and
 * damage grow by floor. `enemyId` is an echo's source ID or the Rift Heart's.
 */
export function riftEnemy(tier: number, floor: number, enemyId: number, slot: RiftSlot, partySize = 1): EnemyDef {
  const level = riftLevel(tier, floor);
  const echo = ECHOES_BY_ID.get(enemyId);
  const src = echo?.enemy;
  if (!src && enemyId !== RIFT_HEART.id) throw new Error(`No Rift enemy ${enemyId}`);
  const m = floorMult(floor);
  const hp = averageEnemyHp(tier) * m * (echo?.hp ?? 1) * RIFT_SLOT[slot].hp * RIFT_HP * PARTY_HP[Math.min(PARTY_HP.length, Math.max(1, partySize)) - 1];
  const dps = averageEnemyDps(tier) * m * (echo?.dps ?? 1) * RIFT_SLOT[slot].dps * RIFT_DPS;
  const defense = src?.defense ?? RIFT_HEART.defense;
  const boss = slot === 'boss' || slot === 'heart';
  return {
    id: enemyId,
    name: src?.name ?? RIFT_HEART.name,
    level,
    rank: boss ? 'Boss' : slot === 'elite' ? 'Elite' : 'Basic',
    damageType: src?.damageType ?? RIFT_HEART.damageType,
    defense,
    speed: src?.speed ?? RIFT_HEART.speed,
    hp,
    dps,
    armor: 2.5 * level * PROFILE[defense].armor,
    resistance: 2.5 * level * PROFILE[defense].resistance,
    xp: 0,
    gold: 0,
    drops: [],
    materials: [],
    ...(boss && { boss: true }),
    ...(src?.evasionRating && { evasionRating: (src.evasionRating / referenceAccuracy(src.level)) * referenceAccuracy(level) }),
    ...(src?.regen && { regen: (src.regen / src.hp) * hp }),
  };
}

/** A fight node's enemies (echo source IDs, in the order they enter) and its Elite, if any. */
export interface Lineup {
  enemies: number[];
  elite?: { index: number; affixes: number[] };
}

const COUNT_WEIGHTS: [number, number][] = [[1, 45], [2, 35], [3, 20]];

/** The fight slot of a node's enemy `index` (its HP share, or the Elite's). */
export const lineupSlot = (l: Lineup, index: number): RiftSlot =>
  l.elite?.index === index ? 'elite' : (`fight${l.enemies.length}` as RiftSlot);

/** Elite affixes for one Elite: 1, or 2 under Echoes of the Deep. */
function eliteAffixes(rng: Rng, mutation: number): number[] {
  const ids = shuffle(rng, ELITE_AFFIXES.map(a => a.id));
  return ids.slice(0, mutation === Mutation.EchoesOfTheDeep ? 2 : 1);
}

/** The enemies of fight node `col` in row `row` (0-based) of floor `floor`: 1–3 distinct echoes, one an Elite on an Elite node. */
export function nodeLineup(seed: bigint, floor: number, row: number, col: number, kind: 'fight' | 'elite', mutation = 0): Lineup {
  const rng = runRng(seed, Purpose.Lineup, floor, row, col);
  const count = weighted(rng, COUNT_WEIGHTS);
  const enemies = shuffle(rng, RIFT_ECHOES.map(k => k.enemy.id)).slice(0, count);
  if (kind === 'fight') return { enemies };
  return { enemies, elite: { index: Math.floor(rng() * count), affixes: eliteAffixes(rng, mutation) } };
}

/** A floor boss to pick: a zone boss's echo with an Elite affix, or the Rift Heart (no affix). */
export interface BossOption {
  enemyId: number;
  affixes: number[];
}

/** Floor `floor`'s boss options: 2 zone-boss echoes on floors 1–4, the Rift Heart on floor 5. */
export function bossOptions(seed: bigint, floor: number): BossOption[] {
  if (floor >= FLOORS) return [{ enemyId: RIFT_HEART.id, affixes: [] }];
  const rng = runRng(seed, Purpose.Boss, floor);
  return shuffle(rng, RIFT_BOSS_ECHOES.map(k => k.enemy.id)).slice(0, 2).map(enemyId => ({ enemyId, affixes: [pick(rng, ELITE_AFFIXES).id] }));
}

// ---------------------------------------------------------------- the foe side of a fight

/** How strongly the weekly mutation applies to `enemy`: twice on the Rift Heart. */
const mutationPower = (enemy: EnemyDef) => (enemy.id === RIFT_HEART.id ? 2 : 1);

/**
 * `enemy` under the weekly mutation, before its Elite affixes: Storm Front's attack speed,
 * Glass World's damage, Iron Week's Armored profile. The Rift Heart takes the bonus twice
 * (+60% attack speed, × 4 damage).
 */
export function mutatedEnemy(enemy: EnemyDef, mutation: number): EnemyDef {
  const k = mutationPower(enemy);
  if (mutation === Mutation.StormFront) {
    const m = 1 + k * (MUTATION_NUM.stormFrontSpeed - 1);
    return { ...enemy, speed: enemy.speed * m, dps: enemy.dps * m };
  }
  if (mutation === Mutation.GlassWorld) return { ...enemy, dps: enemy.dps * MUTATION_NUM.glassWorldDamage ** k };
  if (mutation === Mutation.IronWeek) return withDefense(enemy, 'Armored');
  return enemy;
}

const withDefense = (e: EnemyDef, defense: Defense): EnemyDef => ({
  ...e,
  defense,
  armor: 2.5 * e.level * PROFILE[defense].armor,
  resistance: 2.5 * e.level * PROFILE[defense].resistance,
});

/**
 * The Rift Heart's Shift: a damage type and defense profile every SHIFT_EVERY seconds, at
 * random (never the same twice running) for the whole node; Iron Week keeps it Armored.
 * The first entry is how it starts.
 */
export function heartShift(heart: EnemyDef, rng: Rng, mutation = 0): EnemyDef[] {
  const kinds = (['Physical', 'Magic'] as const).flatMap(damageType =>
    (mutation === Mutation.IronWeek ? (['Armored'] as const) : (['Armored', 'Warded', 'Balanced'] as const)).map(defense => ({ damageType, defense })));
  const list: EnemyDef[] = [];
  let last = -1;
  for (let i = 0; i < Math.ceil(NODE_TIME_LIMIT / SHIFT_EVERY); i++) {
    let k = Math.floor(rng() * (kinds.length - 1));
    if (k >= last && last >= 0) k += 1;
    last = k;
    list.push({ ...withDefense(heart, kinds[k].defense), damageType: kinds[k].damageType });
  }
  return list;
}

/**
 * A Rift enemy as a battle foe (after `mutatedEnemy` and abyss.ts `withEliteAffix`), with
 * its affixes' `mods`, Blood Moon's lifesteal (as drain, twice on the Rift Heart, on top of
 * Vampiric's), and the Heart's Shift drawn from `shift`.
 */
export function riftFoe(enemy: EnemyDef, mutation: number, mods: FightMods = {}, shift?: Rng): FoeSpec {
  const drain = (mods.drain ?? 0) + (mutation === Mutation.BloodMoon ? MUTATION_NUM.bloodMoonDrain * mutationPower(enemy) : 0);
  const foe = fightFoe(enemy, { ...mods, ...(drain > 0 && { drain }) });
  if (enemy.id === RIFT_HEART.id && shift) {
    const list = heartShift(enemy, shift, mutation);
    return { ...foe, def: list[0], phases: { every: SHIFT_EVERY, list } };
  }
  return foe;
}

// ---------------------------------------------------------------- boons

export interface HeldBoon {
  id: number;
  rarity: BoonRarity;
}

/** A boon on offer: new at `rarity`, or `upgrade` of a held one to `rarity`. */
export interface BoonChoice {
  id: number;
  rarity: BoonRarity;
  upgrade: boolean;
}

export interface OfferContext {
  floor: number;
  held: readonly HeldBoon[];
  /** Theme marks on worn Ethereal items: each counts as a boon of its theme. */
  marks?: readonly number[];
  /** Stats the build has from gear; boons that grant one count by themselves. */
  has?: Partial<Record<BoonGate, boolean>>;
  mutation?: number;
}

/** Boons (distinct, Wildcard aside) plus marks per theme. */
export function themeCounts(held: readonly HeldBoon[], marks: readonly number[] = []): Map<ThemeId, number> {
  const counts = new Map<ThemeId, number>();
  const add = (t: number) => counts.set(t as ThemeId, (counts.get(t as ThemeId) ?? 0) + 1);
  for (const h of held) {
    const t = BOONS_BY_ID.get(h.id)?.theme;
    if (t) add(t);
  }
  for (const t of marks) add(t);
  return counts;
}

/** The theme you hold most of (Wildcard aside; ties go to the first theme), or undefined with none. */
export function mainTheme(held: readonly HeldBoon[], marks: readonly number[] = []): ThemeId | undefined {
  let best: ThemeId | undefined;
  let most = 0;
  for (const [t, n] of [...themeCounts(held, marks)].sort(([a], [b]) => a - b)) {
    if (n > most) [best, most] = [t, n];
  }
  return best;
}

function rollRarity(rng: Rng, floor: number): BoonRarity {
  const [c, r] = rarityOdds(floor);
  const x = rng();
  return x < c ? 0 : x < c + r ? 1 : 2;
}

/** Whether `ctx`'s build has `gate`: from gear, or from a held boon that grants it. */
const hasGate = (ctx: OfferContext, gate: BoonGate) => !!ctx.has?.[gate] || ctx.held.some(h => BOONS_BY_ID.get(h.id)?.grants === gate);

/** Whether `def` can be offered new at `rarity`: its rarity fits, its stat is there, a keystone's floor is reached. */
function offerable(def: BoonDef, rarity: BoonRarity, ctx: OfferContext): boolean {
  if (def.only !== undefined && def.only !== rarity) return false;
  if (def.needs && !hasGate(ctx, def.needs)) return false;
  if (def.keystone && ctx.floor < KEYSTONE_FLOOR && ctx.mutation !== Mutation.WildMagic) return false;
  return true;
}

/**
 * Choices for one offer slot: new boons of `theme` (any with undefined) that fit `rarity`,
 * and upgrades of held ones that can still go higher. Held boons that can't are left out.
 */
function slotChoices(ctx: OfferContext, theme: ThemeId | undefined, rarity: BoonRarity, taken: ReadonlySet<number>, upgrades = true): BoonChoice[] {
  const held = new Map(ctx.held.map(h => [h.id, h.rarity]));
  const out: BoonChoice[] = [];
  for (const def of BOONS) {
    if (taken.has(def.id) || (theme !== undefined && def.theme !== theme)) continue;
    const h = held.get(def.id);
    if (h !== undefined) {
      if (upgrades && canUpgrade(def, h)) out.push({ id: def.id, rarity: (h + 1) as BoonRarity, upgrade: true });
    } else if (offerable(def, rarity, ctx)) {
      out.push({ id: def.id, rarity: def.only ?? rarity, upgrade: false });
    }
  }
  return out;
}

/**
 * A boon offer (shifting-rift.md, "How picks work"): 3 slots, your main theme, another theme
 * you hold, any theme (all any while you hold none); a 4th any-theme slot with Second Look.
 * Each slot rolls its rarity by floor; Blood Moon makes slot 3 Blood, Wild Magic makes it Epic.
 * A slot with nothing to offer in its theme offers any theme.
 */
export function boonOffer(rng: Rng, ctx: OfferContext): BoonChoice[] {
  const counts = themeCounts(ctx.held, ctx.marks);
  const main = mainTheme(ctx.held, ctx.marks);
  const others = [...counts.keys()].filter(t => t !== main).sort((a, b) => a - b);
  const slots: (ThemeId | undefined)[] = main === undefined ? [undefined, undefined, undefined] : [main, others.length ? pick(rng, others) : undefined, undefined];
  if (ctx.mutation === Mutation.BloodMoon) slots[2] = Theme.Blood;
  if (ctx.held.some(h => h.id === Boon.SecondLook)) slots.push(undefined);
  const taken = new Set<number>();
  const out: BoonChoice[] = [];
  slots.forEach((theme, k) => {
    const rarity = ctx.mutation === Mutation.WildMagic && k === 2 ? 2 : rollRarity(rng, ctx.floor);
    let choices = slotChoices(ctx, theme, rarity, taken);
    if (!choices.length && theme !== undefined) choices = slotChoices(ctx, undefined, rarity, taken);
    if (!choices.length) return;
    const c = pick(rng, choices);
    taken.add(c.id);
    out.push(c);
  });
  return out;
}

// ---------------------------------------------------------------- Ethereal items

/** What an Ethereal item carries on top of its 3 affixes; any can be missing. */
export interface Headlines {
  riftEffect?: number;
  /** Theme mark: counts as a boon of this theme for set bonuses and offers. */
  mark?: ThemeId;
  /** Each floor boss cleared while wearing it raises its affixes one tier. */
  growth?: boolean;
  /** Trophy IDs (data/rift.ts `trophyId`): one, or an Echoes of the Deep Elite's two. */
  trophies?: number[];
  /** A unique whose effects it carries. */
  echo?: number;
}

export type EtherealItem = NewItem & { headlines: Headlines };

export interface EtherealOptions {
  /** An Elite's drop: its affixes as Trophies (guaranteed). */
  eliteAffixes?: readonly number[];
  /** A boss's drop: an Echo (guaranteed) of a unique of this tier, or of any unique. */
  echo?: number | 'any';
  /** A Shard of Rift-stuff: one headline at random is guaranteed. */
  oneHeadline?: boolean;
  /** × every headline's chance (Treasure Sense). */
  mult?: number;
  baseId?: number;
}

/** The uniques an Echo of tier `tier` can copy (raid uniques belong to their raids); every unique for undefined. */
export const echoPool = (tier?: number) => {
  const pool = UNIQUES.filter(u => tier === undefined || (u.tier === tier && u.raidId === undefined));
  return pool.length ? pool : UNIQUES;
};

/** Each headline rolled on its own (HEADLINE_CHANCE), the source's one guaranteed. */
export function rollHeadlines(rng: Rng, o: EtherealOptions = {}): Headlines {
  const mult = o.mult ?? 1;
  const forced: HeadlineKind | undefined = o.oneHeadline ? pick(rng, HEADLINE_KINDS) : undefined;
  const roll = (k: HeadlineKind) => forced === k || rng() < Math.min(1, HEADLINE_CHANCE[k] * mult);
  const h: Headlines = {};
  if (roll('riftEffect')) h.riftEffect = pick(rng, RIFT_EFFECTS).id;
  if (roll('mark')) h.mark = pick(rng, THEMES).id;
  if (roll('growth')) h.growth = true;
  if (o.eliteAffixes?.length) h.trophies = o.eliteAffixes.map(trophyId);
  else if (roll('trophy')) h.trophies = [trophyId(pick(rng, ELITE_AFFIXES).id)];
  if (o.echo !== undefined) h.echo = pick(rng, echoPool(o.echo === 'any' ? undefined : o.echo)).id;
  else if (roll('echo')) h.echo = pick(rng, echoPool()).id;
  return h;
}

/** How many of the five headlines `h` carries. */
export const headlineCount = (h: Headlines) =>
  (h.riftEffect !== undefined ? 1 : 0) + (h.mark !== undefined ? 1 : 0) + (h.growth ? 1 : 0) + (h.trophies?.length ? 1 : 0) + (h.echo !== undefined ? 1 : 0);

/** An Ethereal item: a base of the run's tier, 3 affixes at affix tier T − 2 to T, and its headlines. */
export function rollEthereal(rng: Rng, tier: number, o: EtherealOptions = {}): EtherealItem {
  const item = makeItem(rng, o.baseId ?? pick(rng, ZONE_BASES).id, tier, 'Ethereal');
  const lo = Math.max(1, tier - AFFIX_TIER_SPAN);
  item.affixes = Array.from({ length: ETHEREAL_AFFIXES }, () => rollAffix(rng, tier, lo + Math.floor(rng() * (tier - lo + 1))));
  return { ...item, headlines: rollHeadlines(rng, o) };
}

// ---------------------------------------------------------------- shops

export type ShopOffer =
  | { kind: 'boon'; boon: BoonChoice; price: number }
  /** Raise a held boon one rarity. */
  | { kind: 'upgrade'; boonId: number; price: number }
  | { kind: 'item'; item: EtherealItem; price: number }
  | { kind: 'heal' | 'attune' | 'removeCurse' | 'removeBoon'; price: number };

export interface ShopContext extends OfferContext {
  tier: number;
  /** Wears an Ethereal item (attuning needs one). */
  hasEthereal: boolean;
  cursed: boolean;
  /** Treasure Sense. */
  headlineMult?: number;
}

/**
 * A shop's stock, 6–8 offers at their base prices (discounts are the run's): 3 boons, an
 * Ethereal item and a heal, then what applies of an upgrade, attuning, curse and boon removal,
 * topped up with boons and items.
 */
export function shopStock(rng: Rng, ctx: ShopContext): ShopOffer[] {
  const size = SHOP_MIN + Math.floor(rng() * (SHOP_MAX - SHOP_MIN + 1));
  const taken = new Set<number>();
  const boon = (): ShopOffer | undefined => {
    const choices = slotChoices(ctx, undefined, rollRarity(rng, ctx.floor), taken, false);
    if (!choices.length) return undefined;
    const c = pick(rng, choices);
    taken.add(c.id);
    return { kind: 'boon', boon: c, price: PRICE.boon[c.rarity] };
  };
  const item = (): ShopOffer => ({ kind: 'item', item: rollEthereal(rng, ctx.tier, { mult: ctx.headlineMult }), price: PRICE.item });

  const offers: ShopOffer[] = [];
  for (let k = 0; k < 3; k++) {
    const o = boon();
    if (o) offers.push(o);
  }
  offers.push(item(), { kind: 'heal', price: PRICE.heal });

  const extras: ShopOffer[] = [];
  const upgradable = ctx.held.filter(h => canUpgrade(BOONS_BY_ID.get(h.id)!, h.rarity));
  if (upgradable.length) {
    const h = pick(rng, upgradable);
    extras.push({ kind: 'upgrade', boonId: h.id, price: PRICE.upgrade[h.rarity as 0 | 1] });
  }
  if (ctx.hasEthereal) extras.push({ kind: 'attune', price: PRICE.attune });
  if (ctx.cursed) extras.push({ kind: 'removeCurse', price: PRICE.removeCurse });
  if (ctx.held.length) extras.push({ kind: 'removeBoon', price: PRICE.removeBoon });
  for (const o of shuffle(rng, extras)) if (offers.length < size) offers.push(o);
  while (offers.length < size) offers.push((rng() < 0.5 && boon()) || item());
  return offers;
}

// ---------------------------------------------------------------- the Threshold

/** A Threshold gift as rolled: what it gives is fixed when it's offered (Marked Path's theme is picked with it). */
export interface GiftRoll {
  gift: number;
  boon?: BoonChoice;
  item?: EtherealItem;
  curse?: number;
}

/** The Threshold's 3 gifts (distinct), each rolled. `ctx` is the start: no boons, floor 1. */
export function thresholdGifts(rng: Rng, tier: number, ctx: OfferContext): GiftRoll[] {
  return shuffle(rng, GIFTS.map(g => g.id)).slice(0, GIFT_CHOICES).map(gift => {
    if (gift === Gift.EmberOfWill) {
      const theme = pick(rng, THEMES).id;
      const choices = slotChoices(ctx, theme, 2, new Set());
      const fallback = slotChoices(ctx, undefined, 2, new Set());
      return { gift, boon: pick(rng, choices.length ? choices : fallback) };
    }
    if (gift === Gift.ShardOfRiftStuff) return { gift, item: rollEthereal(rng, tier, { oneHeadline: true }) };
    if (gift === Gift.BargainInTheDark) {
      const keystones = BOONS.filter(b => b.keystone && (!b.needs || hasGate(ctx, b.needs)));
      return { gift, boon: { id: pick(rng, keystones).id, rarity: 2, upgrade: false }, curse: pick(rng, CURSES).id };
    }
    return { gift };
  });
}

// ---------------------------------------------------------------- rewards

export interface FloorReward {
  gold: bigint;
  xp: bigint;
  dust: bigint;
  /** [material ID, count]: the tier's materials, rare herbs, Riftstone. */
  materials: [number, number][];
  /** Power elixirs' supply IDs (of the tier's grade). */
  elixirs: number[];
}

const MAX_MATERIAL_TIER = Math.max(...SUPPLY_TIERS);
const REWARD_SALT = 0x72696674726en; // "riftrn"

/** What clearing floor `floor` of a tier-`tier` run pays, the first time in week `week` (FLOOR_REWARDS). */
export function floorReward(floor: number, tier: number, week: number): FloorReward {
  const def = FLOOR_REWARDS[floor - 1];
  const matTier = Math.min(tier, MAX_MATERIAL_TIER);
  const materials: [number, number][] = [];
  for (const [kind, perHour] of Object.entries(MATERIALS_PER_HOUR)) {
    const m = materialAt(matTier, kind as keyof typeof MATERIALS_PER_HOUR);
    if (m) materials.push([m.id, Math.round(perHour * def.hours)]);
  }
  const herb = materialAt(matTier, 'Herb');
  if (def.herbs && herb) materials.push([herb.id, def.herbs]);
  if (def.riftstone) materials.push([untieredMaterial('Riftstone').id, def.riftstone]);
  const rng = seededRng(BigInt(week), BigInt(floor), BigInt(tier), REWARD_SALT);
  const power = ELIXIRS.filter(e => e.group === 'Power');
  const elixirs = Array.from({ length: def.elixirs }, () => elixirSupplyId(pick(rng, power).kind, gradeOf(matTier)));
  return { ...farmingReward(tier, { gold: def.hours, xp: def.hours, dust: def.hours }), materials, elixirs };
}
