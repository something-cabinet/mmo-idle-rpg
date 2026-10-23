// The Shifting Rift's run (shifting-rift.md; rift-plan.md, R3): one pure state machine for
// the reducers (load the rows into a `RunState`, `apply` an action, write it back), the
// client and the `test:rift` bots, so the bots play the real rules. A solo run is a party
// of one. Every roll comes from the run's seed and where the run stands (rift.ts `runRng`,
// `memberRng`), never from the call, so the same actions always play the same run.

import { combatStats, matchup, type CombatStats, type GearItem } from './combat';
import { fightEvents, type Fight } from './fight';
import { simulateBattle, type BattleResult, type BattleSetup, type FoeSpec, type PlayerSpec } from './battle';
import { withEliteAffix } from './abyss';
import { ELITE_AFFIXES } from './data/abyss';
import { SLOTS, ZONE_BASES, base, type Slot } from './data/bases';
import { Effect, effectAmount } from './data/legendary';
import {
  BOONS_BY_ID, BOSS_HEAL, Boon, CURSES, EVENT_NUM, EVENTS_BY_ID, FLOORS, Gift, MOTES, Mutation, NODE_TIME_LIMIT,
  RIFT_HEART, RIFT_PURSE, ROWS, RiftEffect, SHOP_HEAL, THEMES, Theme, boonAmount, canUpgrade, rerollPrice, riftEffects, setBonusId,
  type BoonRarity, type RiftBuild, type RiftSlot, type ThemeId,
} from './data/rift';
import { affixRef, fromStored, roundStat, toStored, type StatId } from './data/stats';
import { ENEMIES_BY_ID } from './data/zones';
import {
  ECHOES_BY_ID, Purpose, RIFT_ECHOES, bossOptions, boonOffer, floorMap, freshBoons, lineupSlot, mainTheme, memberRng, mutatedEnemy, nodeLineup,
  riftEnemy, riftFoe, rollBoon, rollEthereal, rollHeadlines, runRng, shopStock, themeCounts, thresholdGifts,
  type BoonChoice, type EtherealItem, type GiftRoll, type HeldBoon, type Headlines, type OfferContext, type ShopOffer,
} from './rift';
import { rollAffix, type NewItem, type Rng } from './loot';
import { UNIQUES_BY_ID } from './data/uniques';

// ---------------------------------------------------------------- state

/** An item in the Rift loadout: a locked copy of a real item (no headlines), or an Ethereal one. */
export type RiftItem = NewItem & { headlines?: Headlines; guaranteed?: 'trophy' | 'echo' };

/** A choice waiting for a member (answered in order with a `choose` action). */
export type Pending =
  /** The Threshold: 1 of 3 gifts. */
  | { kind: 'gifts'; gifts: GiftRoll[] }
  /** A boon offer: 1 of its choices, or none. */
  | { kind: 'boons'; choices: BoonChoice[] }
  /** Wear or discard. */
  | { kind: 'item'; item: EtherealItem }
  /** Thane's Vault: 1 of these, then wear or discard it. */
  | { kind: 'items'; items: EtherealItem[] }
  /** A shop: buy, reroll, leave. Prices are final (discounts in). */
  | { kind: 'shop'; stock: ShopOffer[]; sold: boolean[]; rerolls: number }
  /** An event; `used` are a Blood Merchant's choices already taken. */
  | { kind: 'event'; event: number; used: number[] };

export interface MemberState {
  characterId: bigint;
  /** Locked at the start. */
  level: number;
  hp: number;
  motes: number;
  boons: HeldBoon[];
  curses: number[];
  /** Marked Path's marks (worn Ethereal items carry their own). */
  marks: number[];
  thickBlood: boolean;
  /** The Rift loadout, in SLOTS order. */
  gear: (RiftItem | undefined)[];
  /** Second Wind left this floor, as a share of max HP. */
  secondWind: number;
  /** Hold the Line not spent this floor. */
  holdTheLine: boolean;
  /** Fight nodes won this floor (Bloodrush). */
  won: number;
  /** Down until the floor boss falls. */
  downed: boolean;
  /** Pressed Ready (a party; solo, moving is being ready). */
  ready: boolean;
  pending: Pending[];
  /** Weeping Statue: the next fight node gives no boon pick. */
  skipBoon: boolean;
  /** The Fortune 5-set's free Rare boon was given this floor. */
  freeRare: boolean;
  /** Motes spent not yet turned into Spendthrift's healing. */
  spent: number;
}

export interface RunState {
  seed: bigint;
  tier: number;
  mutation: number;
  floor: number;
  /** The row of the node the party stands on (0 to ROWS − 1), −1 before a floor's first. */
  row: number;
  col: number;
  phase: 'map' | 'ended';
  /** How it ended: the boss of floor 5 fell, everyone fell, a node ran out of time, everyone left, or the week ended. */
  end?: 'cleared' | 'dead' | 'timeout' | 'left' | 'week';
  /** Floors whose boss fell this run. */
  cleared: number;
  members: MemberState[];
}

export type RiftAction =
  /** The leader moves to node `node` of the next row (`online`: members who must be ready; default all). */
  | { type: 'move'; node: number; online?: readonly bigint[] }
  /** The leader fights boss option `option` after the last row. */
  | { type: 'boss'; option: number; online?: readonly bigint[] }
  /** A member answers their first pending choice: `target` a slot, a boon or a curse; `theme` a theme. */
  | { type: 'choose'; member: bigint; choice: number; target?: number; theme?: number }
  | { type: 'ready'; member: bigint }
  | { type: 'leave'; member: bigint };

/** Where a fight's generator comes from: the run's (`member` 0) or a member's, for `purpose` and `parts` (rift.ts `runRng`, `memberRng`). */
export interface RiftRng {
  member: bigint;
  purpose: number;
  parts: number[];
}

/** The generator `r` names in the run of seed `seed`. */
export const riftRng = (seed: bigint, r: RiftRng): Rng => (r.member === 0n ? runRng(seed, r.purpose, ...r.parts) : memberRng(seed, r.member, r.purpose, ...r.parts));

/** A battle `apply` played: its inputs (setup and generator), so a client can replay it, and its result. */
export interface RiftFight {
  kind: 'node' | 'boss' | 'event';
  /** Whose fight an event's was. */
  characterId?: bigint;
  /** Who fought, in the order of side 0's seats. */
  fighters: bigint[];
  setup: BattleSetup;
  rng: RiftRng;
  result: BattleResult;
}

export interface ApplyResult {
  state: RunState;
  fights: RiftFight[];
  /** A floor whose boss just fell (its weekly reward is due). */
  cleared?: number;
}

/** A refused action; the reducers turn it into a SenderError. */
export class RiftError extends Error {}
const fail = (msg: string): never => {
  throw new RiftError(msg);
};

// Choice codes for `choose`.
export const SKIP = -1;
export const SHOP_LEAVE = -1;
export const SHOP_REROLL = -2;
export const WEAR = 1;
export const DISCARD = 0;

// ---------------------------------------------------------------- a member's stats

/** Every effect an item brings into the stat build: its own, its rift effect and Trophies, its Echo's unique effects. */
function itemEffects(it: RiftItem, echoed: Set<number>): number[] {
  const h = it.headlines;
  const fx = [...it.effects];
  if (h?.riftEffect !== undefined) fx.push(h.riftEffect);
  if (h?.trophies) fx.push(...h.trophies);
  // An Echo of a unique already worn or echoed doesn't stack, like two of one unique.
  if (h?.echo !== undefined && !echoed.has(h.echo)) {
    echoed.add(h.echo);
    fx.push(...(UNIQUES_BY_ID.get(h.echo)?.effects ?? []));
  }
  return fx;
}

/** Theme marks a member holds: Marked Path's and their worn Ethereal items'. */
export const memberMarks = (m: MemberState): number[] => [...m.marks, ...m.gear.flatMap(it => (it?.headlines?.mark !== undefined ? [it.headlines.mark] : []))];

/** The boon the Rift Heart turns off for `m` (shown before the fight), or undefined with none held. */
export function unravelled(state: RunState, m: MemberState): number | undefined {
  if (!m.boons.length) return undefined;
  const ids = m.boons.map(b => b.id).sort((a, b) => a - b);
  return ids[Math.floor(memberRng(state.seed, m.characterId, Purpose.Fight, FLOORS, ROWS)() * ids.length)];
}

/** `m`'s fight stats: locked and Ethereal gear, boons (less `unravel`), curses, marks, the mutation, at the locked level; no consumables. */
export function memberStats(state: RunState, m: MemberState, unravel?: number): CombatStats {
  const echoed = new Set(m.gear.flatMap(it => (it?.uniqueId ? [it.uniqueId] : [])));
  const gear: (GearItem | undefined)[] = m.gear.map(it => it && { ...it, effects: itemEffects(it, echoed) });
  const rift: RiftBuild = {
    boons: m.boons.filter(b => b.id !== unravel),
    curses: m.curses,
    marks: memberMarks(m),
    mutation: state.mutation,
    motes: m.motes,
    won: m.won,
    thickBlood: m.thickBlood,
  };
  return combatStats(m.level, gear, undefined, rift);
}

const maxHpOf = (state: RunState, m: MemberState) => memberStats(state, m).maxHp;

/** Which stats a boon can be gated on that `s` has (Glimmerguard's converted crit counts as crit). */
function gates(s: CombatStats): OfferContext['has'] {
  return {
    crit: (s.sources[0]?.critChance ?? 0) > 0 || s.effects.has(Effect.ParryAndThrust),
    evasion: s.evasionRating > 0 || (s.evadeChance ?? 0) > 0,
    block: (s.block ?? 0) > 0 || s.effects.has(Effect.Bulwark),
  };
}

function offerContext(state: RunState, m: MemberState, extra: Partial<OfferContext> = {}): OfferContext {
  return { floor: state.floor, held: m.boons, marks: memberMarks(m), has: gates(memberStats(state, m)), mutation: state.mutation, ...extra };
}

/** Set bonuses `m` has reached (boons, marks, Wildcard). */
const hasSet = (m: MemberState, theme: ThemeId, at: 3 | 5) => riftEffects({ boons: m.boons, marks: memberMarks(m) }).has(setBonusId(theme, at));
const boonValue = (m: MemberState, id: number) => {
  const h = m.boons.find(b => b.id === id);
  return h ? boonAmount(new Map([[id, h.rarity + 1]]), id) : 0;
};
const holds = (m: MemberState, id: number) => m.boons.some(b => b.id === id);
const wears = (m: MemberState, riftEffect: number) => m.gear.some(it => it?.headlines?.riftEffect === riftEffect);
/** × headline chances on Ethereal items `m` finds (Treasure Sense). */
const headlineMult = (m: MemberState) => boonValue(m, Boon.TreasureSense) || 1;

// ---------------------------------------------------------------- small changes

function clone(state: RunState): RunState {
  return { ...state, members: state.members.map(m => ({ ...m, boons: m.boons.slice(), curses: m.curses.slice(), marks: m.marks.slice(), gear: m.gear.slice(), pending: m.pending.slice() })) };
}

function heal(state: RunState, m: MemberState, share: number) {
  const max = maxHpOf(state, m);
  m.hp = Math.min(max, m.hp + share * max);
}

/** An event's HP cost: a share of current HP, so it never kills. */
const hpCost = (m: MemberState, share: number) => (m.hp -= share * m.hp);

function addBoon(m: MemberState, c: BoonChoice) {
  m.boons = m.boons.some(b => b.id === c.id) ? m.boons.map(b => (b.id === c.id ? { id: b.id, rarity: c.rarity } : b)) : [...m.boons, { id: c.id, rarity: c.rarity }];
}

function addCurse(rng: Rng, m: MemberState) {
  const free = CURSES.filter(c => !m.curses.includes(c.id));
  if (free.length) m.curses.push(free[Math.floor(rng() * free.length)].id);
}

/** Motes a member earns: Lucky Coin on everything; a fight's also Thief's Glove and Bargain Bin. */
function earn(state: RunState, m: MemberState, motes: number, fight: boolean) {
  let k = 1 + boonValue(m, Boon.LuckyCoin) / 100;
  if (fight && wears(m, RiftEffect.ThiefsGlove)) k *= 1.5;
  if (fight && state.mutation === Mutation.BargainBin) k *= 0.7;
  m.motes += Math.round(motes * k);
}

/** Pays `price` Motes; every 10 spent heals 1% max HP with Spendthrift. */
function spend(state: RunState, m: MemberState, price: number) {
  if (price > m.motes) fail(`Needs ${price} Motes`);
  m.motes -= price;
  if (!holds(m, Boon.Spendthrift)) return;
  m.spent += price;
  heal(state, m, 0.01 * Math.floor(m.spent / 10));
  m.spent %= 10;
}

/** `it` with every affix `steps` tiers higher (attuning, Growth), values scaled along the stat's curve. */
export function raiseAffixes<T extends RiftItem>(it: T, steps = 1): T {
  return {
    ...it,
    affixes: it.affixes.map(a => {
      const t = a.tier + steps;
      const v = fromStored(a.value) * (affixRef(a.stat as StatId, t) / affixRef(a.stat as StatId, a.tier));
      return { ...a, tier: t, value: toStored(roundStat(a.stat as StatId, v)) };
    }),
  };
}

const MAIN = SLOTS.indexOf('MainHand');
const OFF = SLOTS.indexOf('OffHand');
const anchored = (it: RiftItem | undefined) => it?.headlines?.riftEffect === RiftEffect.RiftAnchor;

/**
 * Where `item` would go in `m`'s loadout and what it would discard, or why it can't be worn:
 * its base's slot (a ring: `ring` 6 or 7, else an empty one, else Ring 1); a two-handed weapon
 * takes the off-hand too; an off-hand needs a one-handed weapon; a Rift Anchor's slot is kept.
 */
export function wearPlan(m: MemberState, item: RiftItem, ring?: number): { slot: number; discards: number[] } | string {
  const slots = base(item.baseId).slots.map(s => SLOTS.indexOf(s as Slot));
  const slot = slots.length > 1 ? (ring !== undefined && slots.includes(ring) ? ring : (slots.find(s => !m.gear[s]) ?? slots[0])) : slots[0];
  const discards = m.gear[slot] ? [slot] : [];
  if (item.weapon?.twoHanded && m.gear[OFF]) discards.push(OFF);
  if (slot === OFF && !(m.gear[MAIN]?.weapon && !m.gear[MAIN]!.weapon!.twoHanded)) return 'Needs a one-handed weapon';
  if (discards.some(s => anchored(m.gear[s]))) return "A Rift Anchor can't be replaced";
  return { slot, discards };
}

function wear(m: MemberState, item: RiftItem, ring?: number) {
  const plan = wearPlan(m, item, ring);
  if (typeof plan === 'string') fail(plan);
  else {
    for (const s of plan.discards) m.gear[s] = undefined;
    m.gear[plan.slot] = item;
  }
}

/** A worn Ethereal item at slot `target`, or a refusal. */
function etherealAt(m: MemberState, target: number | undefined): RiftItem {
  const it = target === undefined ? undefined : m.gear[target];
  if (!it?.headlines) fail('Pick a worn Ethereal item');
  return it!;
}

function attune(m: MemberState, target: number | undefined) {
  const it = etherealAt(m, target);
  m.gear[target!] = raiseAffixes(it);
}

/** A held boon by ID (`target`), or a refusal. */
function heldBoon(m: MemberState, target: number | undefined, belowEpic = false): HeldBoon {
  const h = m.boons.find(b => b.id === target);
  if (!h) fail('Pick a boon you hold');
  if (belowEpic && !canUpgrade(BOONS_BY_ID.get(h!.id)!, h!.rarity)) fail('Pick a boon below Epic');
  return h!;
}

// ---------------------------------------------------------------- fights

interface FoeRoll {
  enemyId: number;
  slot: RiftSlot;
  affixes: number[];
}

/**
 * The battle of `foes` against `fighters` (members, as they are now): a chain with HP, Second
 * Wind and Hold the Line carried in, enemy HP × the party factor, the shared 3:00 limit. The
 * Rift Heart's fight Unravels a boon of each member.
 */
export function nodeSetup(state: RunState, fighters: readonly MemberState[], foes: readonly FoeRoll[]): BattleSetup {
  const heart = foes.some(f => f.enemyId === RIFT_HEART.id);
  const players: PlayerSpec[] = fighters.map(m => ({
    kind: 'player',
    stats: memberStats(state, m, heart ? unravelled(state, m) : undefined),
    start: { hp: m.hp, secondWind: m.secondWind, holdTheLine: m.holdTheLine, renewal: 0 },
  }));
  const lead = players[0].stats;
  const foeSpecs: FoeSpec[] = foes.map(f => {
    let enemy = mutatedEnemy(riftEnemy(state.tier, state.floor, f.enemyId, f.slot, fighters.length), state.mutation);
    let mods = {};
    for (const a of f.affixes) ({ enemy, mods } = withEliteAffix(lead, enemy, a, mods));
    return riftFoe(enemy, state.mutation, mods, f.enemyId === RIFT_HEART.id ? runRng(state.seed, Purpose.Fight, state.floor, ROWS, 1) : undefined);
  });
  return { sides: [players, foeSpecs], chain: true, firstSwing: 'half', timeLimit: NODE_TIME_LIMIT, onTimeout: 'draw', followThrough: true };
}

/** Plays `setup` for `fighters` and carries the outcome back onto them (HP, Second Wind, Hold the Line, a burned Plume, the fallen). */
function fight(fighters: MemberState[], setup: BattleSetup, rng: Rng, record: boolean): BattleResult {
  const result = simulateBattle({ ...setup, record }, rng);
  fighters.forEach((m, i) => {
    const f = result.fighters[i]!;
    m.hp = f.hp;
    m.secondWind = f.secondWind;
    m.holdTheLine = f.holdTheLine;
    if (f.burned) m.gear = m.gear.map(it => (it?.headlines?.riftEffect === RiftEffect.PhoenixPlume ? undefined : it));
    if (m.hp <= 0) m.downed = true;
  });
  return result;
}

const living = (state: RunState) => state.members.filter(m => !m.downed);

/** A fight node's enemies. */
function lineupFoes(state: RunState, kind: 'fight' | 'elite'): FoeRoll[] {
  const l = nodeLineup(state.seed, state.floor, state.row, state.col, kind, state.mutation);
  return l.enemies.map((enemyId, i) => ({ enemyId, slot: lineupSlot(l, i), affixes: l.elite?.index === i ? l.elite.affixes : [] }));
}

/** An offer of boons for `m` after a won fight (none after a Weeping Statue's prayer). */
function offerBoons(state: RunState, m: MemberState, rng: Rng, minRarity?: BoonRarity) {
  if (m.skipBoon) {
    m.skipBoon = false;
    return;
  }
  const choices = boonOffer(rng, offerContext(state, m, { ...(minRarity !== undefined && { minRarity }) }));
  if (choices.length) m.pending.push({ kind: 'boons', choices });
}

function playNode(state: RunState, kind: 'fight' | 'elite', record: boolean, out: RiftFight[]) {
  const fighters = living(state);
  const foes = lineupFoes(state, kind);
  const setup = nodeSetup(state, fighters, foes);
  const rng: RiftRng = { member: 0n, purpose: Purpose.Fight, parts: [state.floor, state.row, state.col] };
  const result = fight(fighters, setup, riftRng(state.seed, rng), record);
  out.push({ kind: 'node', fighters: fighters.map(m => m.characterId), setup, rng, result });
  if (!finishFight(state, result)) return;
  const elite = foes.find(f => f.affixes.length);
  for (const m of living(state)) {
    earn(state, m, kind === 'elite' ? MOTES.elite : MOTES.fight, true);
    m.won += 1;
    heal(state, m, boonValue(m, Boon.Afterglow) / 100);
    offerBoons(state, m, memberRng(state.seed, m.characterId, Purpose.Offer, state.floor, state.row, state.col), kind === 'elite' ? 1 : undefined);
    if (elite) {
      const rng = memberRng(state.seed, m.characterId, Purpose.Item, state.floor, state.row, state.col);
      m.pending.push({ kind: 'item', item: rollEthereal(rng, state.tier, { eliteAffixes: elite.affixes, mult: headlineMult(m) }) });
    }
  }
}

/** After a fight: the run ends when everyone is down or time ran out. Returns whether it was won. */
function finishFight(state: RunState, result: BattleResult): boolean {
  if (!living(state).length) {
    state.phase = 'ended';
    state.end = 'dead';
    return false;
  }
  if (result.winner !== 0) {
    state.phase = 'ended';
    state.end = 'timeout';
    return false;
  }
  return true;
}

function playBoss(state: RunState, option: number, record: boolean, out: RiftFight[]): number | undefined {
  const opt = bossOptions(state.seed, state.floor)[option] ?? fail('No such boss');
  const fighters = living(state);
  const heart = opt.enemyId === RIFT_HEART.id;
  const setup = nodeSetup(state, fighters, [{ enemyId: opt.enemyId, slot: heart ? 'heart' : 'boss', affixes: opt.affixes }]);
  const rng: RiftRng = { member: 0n, purpose: Purpose.Fight, parts: [state.floor, ROWS, 0] };
  const result = fight(fighters, setup, riftRng(state.seed, rng), record);
  out.push({ kind: 'boss', fighters: fighters.map(m => m.characterId), setup, rng, result });
  if (!finishFight(state, result)) return undefined;
  const floor = state.floor;
  const echo = heart ? ('any' as const) : (ENEMIES_BY_ID.get(opt.enemyId)?.zone.tier ?? 'any');
  for (const m of state.members) {
    if (m.downed) {
      // The fallen come back at half of max HP.
      m.downed = false;
      m.hp = BOSS_HEAL * maxHpOf(state, m);
      continue;
    }
    earn(state, m, MOTES.boss, true);
    // Growth: worn Ethereal items with it gain an affix tier.
    m.gear = m.gear.map(it => (it?.headlines?.growth ? raiseAffixes(it) : it));
    const max = maxHpOf(state, m);
    m.hp += BOSS_HEAL * (max - m.hp);
    const rng = memberRng(state.seed, m.characterId, Purpose.Item, floor, ROWS);
    m.pending.push({ kind: 'item', item: rollEthereal(rng, state.tier, { echo, mult: headlineMult(m) }) });
  }
  state.cleared = floor;
  if (floor >= FLOORS) {
    state.phase = 'ended';
    state.end = 'cleared';
  } else startFloor(state, floor + 1);
  return floor;
}

function startFloor(state: RunState, floor: number) {
  state.floor = floor;
  state.row = -1;
  state.col = 0;
  for (const m of state.members) {
    m.secondWind = effectAmount(memberStats(state, m).effects, Effect.SecondWind);
    m.holdTheLine = true;
    m.won = 0;
    m.freeRare = false;
  }
}

// ---------------------------------------------------------------- shops

/** × shop prices for `m`: the Fortune 3-set and Bargain Bin. */
export const shopDiscount = (state: RunState, m: MemberState) => (hasSet(m, Theme.Fortune, 3) ? 0.8 : 1) * (state.mutation === Mutation.BargainBin ? 0.7 : 1);
/** What rerolling a shop rerolled `rerolls` times costs `m`. */
export const rerollCost = (state: RunState, m: MemberState, rerolls: number) => Math.round(rerollPrice(rerolls) * shopDiscount(state, m));

function rollShop(state: RunState, m: MemberState, rerolls: number): ShopOffer[] {
  const rng = memberRng(state.seed, m.characterId, Purpose.Shop, state.floor, state.row, state.col, rerolls);
  const stock = shopStock(rng, {
    ...offerContext(state, m),
    tier: state.tier,
    hasEthereal: m.gear.some(it => it?.headlines),
    cursed: m.curses.length > 0,
    headlineMult: headlineMult(m),
  });
  const k = shopDiscount(state, m);
  const priced = stock.map(o => ({ ...o, price: Math.round(o.price * k) }));
  // Haggler: one offer half price.
  if (holds(m, Boon.Haggler)) {
    const i = Math.floor(rng() * priced.length);
    priced[i] = { ...priced[i], price: Math.round(priced[i].price / 2) };
  }
  // The Fortune 5-set: a free Rare boon at the floor's first shop.
  if (hasSet(m, Theme.Fortune, 5) && !m.freeRare && rerolls === 0) {
    const c = rollBoon(rng, offerContext(state, m), 1);
    if (c) priced.push({ kind: 'boon', boon: c, price: 0 });
    m.freeRare = true;
  }
  return priced;
}

function openShop(state: RunState, m: MemberState) {
  const interest = boonValue(m, Boon.Interest);
  if (interest) m.motes += Math.floor((m.motes * interest) / 100);
  const stock = rollShop(state, m, 0);
  m.pending.push({ kind: 'shop', stock, sold: stock.map(() => false), rerolls: 0 });
}

function chooseShop(state: RunState, m: MemberState, p: Extract<Pending, { kind: 'shop' }>, a: Extract<RiftAction, { type: 'choose' }>) {
  if (a.choice === SHOP_LEAVE) {
    m.pending.shift();
    return;
  }
  if (a.choice === SHOP_REROLL) {
    spend(state, m, rerollCost(state, m, p.rerolls));
    const stock = rollShop(state, m, p.rerolls + 1);
    m.pending[0] = { kind: 'shop', stock, sold: stock.map(() => false), rerolls: p.rerolls + 1 };
    return;
  }
  const o = p.stock[a.choice] ?? fail('No such offer');
  if (p.sold[a.choice]) fail('Sold');
  const buy = () => spend(state, m, o.price);
  if (o.kind === 'boon') {
    const h = m.boons.find(b => b.id === o.boon.id);
    if (h && h.rarity >= o.boon.rarity) fail('Already held');
    buy();
    addBoon(m, o.boon);
  } else if (o.kind === 'upgrade') {
    const h = heldBoon(m, o.boonId, true);
    buy();
    addBoon(m, { id: h.id, rarity: (h.rarity + 1) as BoonRarity, upgrade: true });
  } else if (o.kind === 'item') {
    buy();
    m.pending.unshift({ kind: 'item', item: o.item });
  } else if (o.kind === 'heal') {
    buy();
    heal(state, m, SHOP_HEAL);
  } else if (o.kind === 'attune') {
    etherealAt(m, a.target);
    buy();
    attune(m, a.target);
  } else if (o.kind === 'removeCurse') {
    if (!m.curses.includes(a.target ?? -1)) fail('Pick a curse');
    buy();
    m.curses = m.curses.filter(c => c !== a.target);
  } else {
    heldBoon(m, a.target);
    buy();
    m.boons = m.boons.filter(b => b.id !== a.target);
  }
  const sold = p.sold.slice();
  sold[a.choice] = true;
  const at = m.pending.indexOf(p);
  m.pending[at] = { ...p, sold };
}

// ---------------------------------------------------------------- events

/** A fight of the event's own, for `m` alone, on a generator of its own (so it replays from its setup). */
function eventFight(state: RunState, m: MemberState, p: Extract<Pending, { kind: 'event' }>, setup: BattleSetup, record: boolean, out: RiftFight[]): BattleResult {
  const rng: RiftRng = { member: m.characterId, purpose: Purpose.Fight, parts: [state.floor, state.row, state.col, p.event, p.used.length] };
  const result = simulateBattle({ ...setup, record }, riftRng(state.seed, rng));
  out.push({ kind: 'event', characterId: m.characterId, fighters: [m.characterId], setup, rng, result });
  return result;
}

function chooseEvent(state: RunState, m: MemberState, p: Extract<Pending, { kind: 'event' }>, a: Extract<RiftAction, { type: 'choose' }>, record: boolean, out: RiftFight[]) {
  const def = EVENTS_BY_ID.get(p.event)!;
  const c = a.choice;
  if (c < 0 || c >= def.choices.length) fail('No such choice');
  const leave = def.choices[c] === 'Leave' || def.choices[c] === 'Sneak past';
  const rng = memberRng(state.seed, m.characterId, Purpose.Event, state.floor, state.row, state.col, c, p.used.length);
  const done = () => m.pending.splice(m.pending.indexOf(p), 1);
  if (leave) return done();
  const ctx = () => offerContext(state, m);
  const item = (o: Parameters<typeof rollEthereal>[2] = {}) => rollEthereal(rng, state.tier, { mult: headlineMult(m), ...o });
  const E = EVENT_NUM;
  switch (p.event) {
    case 1: { // Blood Altar
      const b = rollBoon(rng, ctx(), 2, Theme.Blood) ?? fail('No Blood boon left to give');
      hpCost(m, E.altarHp);
      addBoon(m, b);
      break;
    }
    case 2: { // Gambler
      const bet = E.gamble[c];
      spend(state, m, bet);
      if (rng() < 0.5) m.motes += 2 * bet;
      break;
    }
    case 3: { // Wandering Smith
      const it = etherealAt(m, a.target);
      if (c === 0) {
        spend(state, m, E.smithAttune);
        attune(m, a.target);
      } else {
        spend(state, m, E.smithReroll);
        const k = Math.floor(rng() * it.affixes.length);
        const affixes = it.affixes.slice();
        affixes[k] = rollAffix(rng, state.tier, it.affixes[k].tier);
        m.gear[a.target!] = { ...it, affixes };
      }
      break;
    }
    case 4: // Cursed Chest
      m.pending.splice(m.pending.indexOf(p) + 1, 0, { kind: 'item', item: item({ atLeast: 3 }) });
      addCurse(rng, m);
      break;
    case 5: { // Your Reflection: a duel against your own build, from your HP
      const s = memberStats(state, m);
      const me: PlayerSpec = { kind: 'player', stats: s, start: { hp: m.hp, secondWind: 0, renewal: 0 } };
      const r = eventFight(state, m, p, { sides: [[me], [{ ...me }]], firstSwing: 'half', timeLimit: E.reflectionSeconds, onTimeout: 'points' }, record, out);
      if (r.winner === 0) {
        const b = rollBoon(rng, ctx(), 2);
        if (b) addBoon(m, b);
      } else hpCost(m, E.reflectionLoss);
      break;
    }
    case 6: // Healing Spring
      if (c === 0) heal(state, m, E.springHeal);
      else {
        const counts = themeCounts(m.boons, memberMarks(m));
        const missing = THEMES.filter(t => !counts.has(t.id));
        const theme = missing.length ? missing[Math.floor(rng() * missing.length)].id : undefined;
        const b = rollBoon(rng, ctx(), 1, theme) ?? fail('No boon left to give');
        addBoon(m, b);
      }
      break;
    case 7: // Quiet Alcove
      if (c === 0) heal(state, m, E.alcoveHeal);
      else attune(m, a.target);
      break;
    case 8: { // Goblin in the Rift: Motes per hit landed in 20 s
      const echo = ECHOES_BY_ID.get(103) ?? RIFT_ECHOES[0];
      const goblin = { ...riftEnemy(state.tier, state.floor, echo.enemy.id, 'fight1'), name: 'Rift Goblin', hp: 1e15, dps: 0 };
      const me: PlayerSpec = { kind: 'player', stats: memberStats(state, m), start: { hp: m.hp, renewal: 0 } };
      const r = eventFight(state, m, p, { sides: [[me], [{ kind: 'foe', def: goblin }]], firstSwing: 'half', timeLimit: E.goblinSeconds, onTimeout: 'draw' }, true, out);
      const hits = r.events.filter(e => e.by === 0 && (e.kind === 'hit' || e.kind === 'crit')).length;
      earn(state, m, hits * E.goblinMotesPerHit, false);
      if (!record) r.events.length = 0;
      break;
    }
    case 9: { // Shrine of Change
      const next: HeldBoon[] = [];
      const taken = new Set<number>();
      for (const h of m.boons) {
        const choices = freshBoons(offerContext(state, m, { held: next }), h.rarity, taken);
        const pick = choices.length ? choices[Math.floor(rng() * choices.length)] : { id: h.id, rarity: h.rarity };
        taken.add(pick.id);
        next.push({ id: pick.id, rarity: pick.rarity });
      }
      m.boons = next;
      break;
    }
    case 10: // Lost Satchel
      if (c === 0) earn(state, m, E.satchel, false);
      else m.pending.splice(m.pending.indexOf(p) + 1, 0, { kind: 'item', item: item() });
      break;
    case 11: { // Broken Mirror
      const h = heldBoon(m, a.target, true);
      m.boons = m.boons.filter(b => b.id !== h.id);
      if (rng() < E.mirrorCurse) addCurse(rng, m);
      else {
        const choices = freshBoons(ctx(), (h.rarity + 1) as BoonRarity, new Set([h.id]));
        if (choices.length) addBoon(m, choices[Math.floor(rng() * choices.length)]);
      }
      break;
    }
    case 12: // Thane's Vault
      hpCost(m, E.vaultHp);
      m.pending.splice(m.pending.indexOf(p) + 1, 0, { kind: 'items', items: Array.from({ length: E.vaultItems }, () => item()) });
      break;
    case 13: { // Lurking Echo: a lone Elite, alone
      const enemyId = RIFT_ECHOES[Math.floor(rng() * RIFT_ECHOES.length)].enemy.id;
      const affix = ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)].id;
      const setup = nodeSetup(state, [m], [{ enemyId, slot: 'elite', affixes: [affix] }]);
      const r = eventFight(state, m, p, setup, record, out);
      const f = r.fighters[0]!;
      m.hp = f.hp;
      m.secondWind = f.secondWind;
      m.holdTheLine = f.holdTheLine;
      if (f.burned) m.gear = m.gear.map(it => (it?.headlines?.riftEffect === RiftEffect.PhoenixPlume ? undefined : it));
      if (m.hp <= 0) {
        m.downed = true;
        break;
      }
      if (r.winner === 0) {
        const at = m.pending.indexOf(p) + 1;
        m.pending.splice(at, 0, { kind: 'item', item: item({ eliteAffixes: [affix] }) });
        const choices = boonOffer(rng, offerContext(state, m, { minRarity: 1 }));
        if (choices.length) m.pending.splice(at, 0, { kind: 'boons', choices });
      }
      break;
    }
    case 14: // Moon Shard
      if (c === 0) {
        const h = heldBoon(m, a.target, true);
        addBoon(m, { id: h.id, rarity: (h.rarity + 1) as BoonRarity, upgrade: true });
        addCurse(rng, m);
      } else earn(state, m, E.shard, false);
      break;
    case 15: { // Blood Merchant: each choice once, then leave
      if (p.used.includes(c)) fail('Already bought');
      if (c === 0) m.pending.splice(m.pending.indexOf(p) + 1, 0, { kind: 'item', item: item() });
      else if (c === 1) {
        const b = rollBoon(rng, ctx(), 1, mainTheme(m.boons, memberMarks(m))) ?? fail('No boon left to give');
        addBoon(m, b);
      } else attune(m, a.target);
      hpCost(m, E.merchantHp);
      m.pending[m.pending.indexOf(p)] = { ...p, used: [...p.used, c] };
      return;
    }
    case 16: { // Forgotten Forge
      const it = etherealAt(m, a.target);
      if (c === 0) {
        const h = rollHeadlines(rng, { mult: headlineMult(m) });
        if (it.guaranteed === 'trophy') h.trophies = it.headlines!.trophies;
        if (it.guaranteed === 'echo') h.echo = it.headlines!.echo;
        m.gear[a.target!] = { ...it, headlines: h };
      } else {
        spend(state, m, E.forgeAttune);
        attune(m, a.target);
      }
      break;
    }
    case 17: // Weeping Statue
      heal(state, m, 1);
      m.skipBoon = true;
      break;
    case 18: // Ashen Brazier
      if (c === 0) {
        heldBoon(m, a.target);
        m.boons = m.boons.filter(b => b.id !== a.target);
        heal(state, m, E.brazierHeal);
        earn(state, m, E.brazierMotes, false);
      } else {
        if (!m.curses.includes(a.target ?? -1)) fail('Pick a curse');
        m.curses = m.curses.filter(x => x !== a.target);
      }
      break;
    case 19: { // Rift Tear: worn at once
      const mainOk = !!m.gear[MAIN]?.weapon && !m.gear[MAIN]!.weapon!.twoHanded;
      const slots = SLOTS.map((_, i) => i).filter(i => !anchored(m.gear[i]) && (i !== OFF || mainOk));
      const slot = slots[Math.floor(rng() * slots.length)];
      const bases = ZONE_BASES.filter(b => b.slots.includes(SLOTS[slot]) && !(slot === MAIN && b.weapon?.twoHanded && anchored(m.gear[OFF])));
      const it = item({ atLeast: E.tearHeadlines, baseId: bases[Math.floor(rng() * bases.length)].id });
      wear(m, it, slot);
      break;
    }
    case 20: { // Runecarver
      const it = etherealAt(m, a.target);
      let mark: number | undefined;
      if (c === 0) mark = mainTheme(m.boons, memberMarks(m)) ?? fail('No main theme yet');
      else {
        if (!THEMES.some(t => t.id === a.theme)) fail('Pick a theme');
        spend(state, m, E.runecarver);
        mark = a.theme;
      }
      m.gear[a.target!] = { ...it, headlines: { ...it.headlines, mark: mark as ThemeId } };
      break;
    }
    default:
      fail(`Unknown event ${p.event}`);
  }
  done();
}

// ---------------------------------------------------------------- the Threshold

function chooseGift(m: MemberState, p: Extract<Pending, { kind: 'gifts' }>, a: Extract<RiftAction, { type: 'choose' }>) {
  const g = p.gifts[a.choice] ?? fail('No such gift');
  m.pending.shift();
  if (g.gift === Gift.EmberOfWill && g.boon) addBoon(m, g.boon);
  else if (g.gift === Gift.RiftPurse) m.motes += RIFT_PURSE;
  else if (g.gift === Gift.ShardOfRiftStuff && g.item) m.pending.unshift({ kind: 'item', item: g.item });
  else if (g.gift === Gift.BargainInTheDark) {
    if (g.boon) addBoon(m, g.boon);
    if (g.curse) m.curses.push(g.curse);
  } else if (g.gift === Gift.MarkedPath) {
    if (!THEMES.some(t => t.id === a.theme)) fail('Pick a theme');
    m.marks.push(a.theme!);
  } else if (g.gift === Gift.ThickBlood) m.thickBlood = true;
}

// ---------------------------------------------------------------- the run

export interface RunMember {
  characterId: bigint;
  level: number;
  /** The locked copy of the chosen loadout, in SLOTS order. */
  gear: readonly (NewItem | undefined)[];
}

/** A new run at its Threshold: every member at full HP with 3 gifts to pick from. */
export function startRun(seed: bigint, tier: number, mutation: number, members: readonly RunMember[]): RunState {
  const state: RunState = { seed, tier, mutation, floor: 1, row: -1, col: 0, phase: 'map', cleared: 0, members: [] };
  for (const r of members) {
    const m: MemberState = {
      characterId: r.characterId, level: r.level, hp: 0, motes: 0, boons: [], curses: [], marks: [], thickBlood: false, gear: [...r.gear],
      secondWind: 0, holdTheLine: true, won: 0, downed: false, ready: false, pending: [], skipBoon: false, freeRare: false, spent: 0,
    };
    const s = memberStats(state, m);
    m.hp = s.maxHp;
    m.secondWind = effectAmount(s.effects, Effect.SecondWind);
    m.pending.push({ kind: 'gifts', gifts: thresholdGifts(memberRng(seed, r.characterId, Purpose.Threshold), tier, { floor: 1, held: [], has: gates(s), mutation }) });
    state.members.push(m);
  }
  return state;
}

/** Whether `m` lets the party move on: no choice waiting, and Ready pressed in a party (the downed have nothing to answer). */
export const isReady = (state: RunState, m: MemberState) => m.downed || (m.pending.length === 0 && (state.members.length === 1 || m.ready));

function checkReady(state: RunState, online?: readonly bigint[]) {
  const waiting = state.members.filter(m => (!online || online.includes(m.characterId)) && !isReady(state, m));
  if (waiting.length) fail('Waiting for the party');
}

/** Nodes of the next row the party can move to. */
export function reachable(state: RunState): number[] {
  if (state.row >= ROWS - 1) return [];
  const map = floorMap(state.seed, state.floor);
  return state.row < 0 ? map.rows[0].map((_, i) => i) : map.rows[state.row][state.col].links;
}

/**
 * Applies `action` to `state` (unchanged) and returns the new state, with the battles it
 * played (`record`: keep their events, for a client replaying here) and a floor whose boss
 * fell. Throws a RiftError for an action the rules refuse.
 */
export function apply(state: RunState, action: RiftAction, record = false): ApplyResult {
  if (state.phase === 'ended') fail('The run is over');
  const s = clone(state);
  const fights: RiftFight[] = [];
  let cleared: number | undefined;
  const member = (id: bigint) => s.members.find(m => m.characterId === id) ?? fail('Not in this run');

  if (action.type === 'move') {
    checkReady(s, action.online);
    if (!reachable(s).includes(action.node)) fail("Can't reach that node");
    s.row += 1;
    s.col = action.node;
    for (const m of s.members) m.ready = false;
    const node = floorMap(s.seed, s.floor).rows[s.row][s.col];
    if (node.kind === 'fight' || node.kind === 'elite') playNode(s, node.kind, record, fights);
    else for (const m of living(s)) {
      if (node.kind === 'shop') openShop(s, m);
      else m.pending.push({ kind: 'event', event: node.event!, used: [] });
    }
  } else if (action.type === 'boss') {
    checkReady(s, action.online);
    if (s.row !== ROWS - 1) fail('The boss waits after the last row');
    for (const m of s.members) m.ready = false;
    cleared = playBoss(s, action.option, record, fights);
  } else if (action.type === 'ready') {
    member(action.member).ready = true;
  } else if (action.type === 'leave') {
    s.members = s.members.filter(m => m.characterId !== action.member);
    if (!s.members.length) {
      s.phase = 'ended';
      s.end = 'left';
    }
  } else {
    const m = member(action.member);
    const p = m.pending[0] ?? fail('Nothing to choose');
    const before = maxHpOf(s, m);
    if (p.kind === 'gifts') chooseGift(m, p, action);
    else if (p.kind === 'boons') {
      m.pending.shift();
      if (action.choice !== SKIP) addBoon(m, p.choices[action.choice] ?? fail('No such boon'));
    } else if (p.kind === 'item') {
      if (action.choice === WEAR) wear(m, p.item, action.target);
      else if (action.choice !== DISCARD) fail('Wear or discard');
      m.pending.shift();
    } else if (p.kind === 'items') {
      const it = p.items[action.choice] ?? fail('No such item');
      m.pending[0] = { kind: 'item', item: it };
    } else if (p.kind === 'shop') chooseShop(s, m, p, action);
    else chooseEvent(s, m, p, action, record, fights);
    // More max HP comes with as much HP; less trims it.
    const after = maxHpOf(s, m);
    if (!m.downed) m.hp = Math.min(after, m.hp + Math.max(0, after - before));
    if (s.members.every(x => x.downed)) {
      s.phase = 'ended';
      s.end = 'dead';
    }
  }
  return { state: s, fights, ...(cleared !== undefined && { cleared }) };
}

// ---------------------------------------------------------------- storage

/** JSON that keeps bigints and Maps (a run's waiting choices, a fight's setup for its replay). */
export const encodeRift = (x: unknown): string =>
  JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? { $big: String(v) } : v instanceof Map ? { $map: [...v] } : v));

export function decodeRift<T>(json: string): T {
  return JSON.parse(json, (_k, v) => (v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v && typeof v === 'object' && '$map' in v ? new Map(v.$map) : v)) as T;
}

/** A stored fight, without its result (the client plays it again from the setup). */
export type StoredFight = Omit<RiftFight, 'result'>;
export const encodeFights = (fights: readonly RiftFight[]): string => encodeRift(fights.map(({ result: _r, ...f }) => f));
/** Plays a stored fight again, events kept: the same battle the server settled. */
export const replayFight = (seed: bigint, f: StoredFight): BattleResult => simulateBattle({ ...f.setup, record: true }, riftRng(seed, f.rng));

/**
 * A stored node's battle as player `player` (a seat on side 0) saw it, one fight per enemy
 * in the order they entered (the Deep's split, abyss.ts `simulateDepth`), with when each
 * started; undefined for a battle against a player (Your Reflection).
 */
export function fightParts(setup: BattleSetup, result: BattleResult, player = 0): { fights: Fight[]; starts: number[]; foes: number[] } | undefined {
  const players = setup.sides[0].length;
  const foeSpecs = setup.sides[1];
  if (foeSpecs.some(c => c.kind !== 'foe')) return undefined;
  const stats = (setup.sides[0][player] as PlayerSpec).stats;
  const segments = result.segments.length ? result.segments : [{ foe: players, start: 0, end: result.end, hp: result.hp, secondWind: 0, renewal: 0 }];
  const parts: (typeof result.events)[] = segments.map(() => []);
  let k = 0;
  for (const e of result.events) {
    if (e.kind === 'enter') k++;
    parts[Math.min(k, parts.length - 1)].push(e);
  }
  const last = segments.length - 1;
  const fights: Fight[] = segments.map((seg, i) => {
    const enemy = (foeSpecs[seg.foe - players] as FoeSpec).def;
    const m = matchup(stats, enemy);
    return {
      stats, matchup: m, enemy, walk: 0,
      events: fightEvents(parts[i], player, seg.foe, seg.start, m.shield > 0 || result.events.some(e => (e.shield?.[player] ?? 0) > 0), (enemy.regen ?? 0) > 0),
      end: seg.end - seg.start,
      outcome: i < last || result.winner === 0 ? 'kill' : result.winner === 1 ? 'defeat' : 'stalemate',
      startHp: i === 0 ? ((setup.sides[0][player] as PlayerSpec).start?.hp ?? stats.maxHp) : segments[i - 1].hp[player],
      hpLeft: seg.hp[player],
      secondWindLeft: seg.secondWind,
      renewalLeft: 0,
    };
  });
  return { fights, starts: segments.map(seg => seg.start), foes: segments.map(seg => seg.foe - players) };
}
