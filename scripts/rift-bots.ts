// Bots that play the Shifting Rift through the real rules (riftRun.ts `apply`), for
// `test:rift`: a random picker and a greedy theme builder, on a reference player of the run's
// tier (rift-plan.md, R3). Not part of the game.
import { SLOTS, ZONE_BASES } from '../spacetimedb/src/data/bases';
import { matchup, type CombatStats } from '../spacetimedb/src/combat';
import { autoEquip, type OwnedItem, type Profile } from '../spacetimedb/src/equip';
import { makeItem, seededRng, type NewItem, type RarityName, type Rng } from '../spacetimedb/src/loot';
import { BOONS_BY_ID, EVENTS_BY_ID, THEMES, ROWS } from '../spacetimedb/src/data/rift';
import { floorMap, bossOptions, mainTheme, riftEnemy, RIFT_ECHOES } from '../spacetimedb/src/rift';
import {
  DISCARD, RiftError, SHOP_LEAVE, WEAR, apply, isReady, memberMarks, memberStats, reachable, startRun, wearPlan,
  type MemberState, type RiftAction, type RunState,
} from '../spacetimedb/src/riftRun';

export type Bot = 'random' | 'greedy';

/** The reference player of tier `tier` (shifting-rift.md, "Target"): level 10T + 2, the best of 60 random tier-T items (Rare 60%, Epic 30%, Legendary 10%). */
export function referencePlayer(tier: number, seed: number): { level: number; gear: (NewItem | undefined)[] } {
  const level = 10 * tier + 2;
  const rng = seededRng(BigInt(seed), 4242n);
  const items: (OwnedItem & NewItem)[] = Array.from({ length: 60 }, (_, i) => {
    const x = rng();
    const rarity: RarityName = x < 0.6 ? 'Rare' : x < 0.9 ? 'Epic' : 'Legendary';
    const b = ZONE_BASES[Math.floor(rng() * ZONE_BASES.length)];
    return { ...makeItem(rng, b.id, tier, rarity), id: BigInt(i + 1) };
  });
  const profiles: Profile[] = ['Damage', 'DamageMagic', 'Survival'];
  const slots = autoEquip(level, items, SLOTS.map(() => 0n), profiles[seed % profiles.length]);
  return { level, gear: slots.map(id => items.find(i => i.id === id)) };
}

/** How well `s` fights this floor's average enemy: damage × staying power. */
function power(state: RunState, s: CombatStats): number {
  const e = riftEnemy(state.tier, state.floor, RIFT_ECHOES[0].enemy.id, 'fight1');
  const m = matchup(s, { ...e, damageType: 'Physical' });
  const n = matchup(s, { ...e, damageType: 'Magic' });
  const dps = (m.dps + n.dps) / 2;
  const incoming = Math.max(1e-6, (m.incoming + n.incoming) / 2 - s.regen);
  return dps * (s.maxHp / incoming);
}

const tryApply = (state: RunState, a: RiftAction): RunState | undefined => {
  try {
    return apply(state, a).state;
  } catch (e) {
    if (e instanceof RiftError) return undefined;
    throw e;
  }
};

/** One `choose` for `m`'s first pending choice, as `bot` would answer it. */
function decide(state: RunState, m: MemberState, bot: Bot, rng: Rng): RunState {
  const p = m.pending[0];
  const id = m.characterId;
  const go = (choice: number, extra: { target?: number; theme?: number } = {}) => tryApply(state, { type: 'choose', member: id, choice, ...extra });
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const theme = () => (bot === 'greedy' ? (mainTheme(m.boons, memberMarks(m)) ?? pick(THEMES).id) : pick(THEMES).id);
  /** Every target worth trying: worn slots, boons, curses. */
  const targets = [...SLOTS.map((_, i) => i), ...m.boons.map(b => b.id), ...m.curses];
  const hpShare = m.hp / memberStats(state, m).maxHp;

  if (p.kind === 'gifts') {
    const order = bot === 'greedy' ? [...p.gifts.keys()].sort((a, b) => giftRank(p.gifts[a].gift) - giftRank(p.gifts[b].gift)) : [Math.floor(rng() * p.gifts.length)];
    for (const i of order) {
      const next = go(i, { theme: theme() });
      if (next) return next;
    }
    throw new Error('no gift applies');
  }
  if (p.kind === 'boons') {
    if (bot === 'random') return go(Math.floor(rng() * p.choices.length))!;
    const main = mainTheme(m.boons, memberMarks(m));
    const rank = (i: number) => {
      const c = p.choices[i];
      const def = BOONS_BY_ID.get(c.id)!;
      return (def.theme === main ? 3 : 0) + (c.upgrade ? 1.5 : 0) + c.rarity + (def.theme === 7 ? -2 : 0) + rng() * 0.1;
    };
    const best = [...p.choices.keys()].sort((a, b) => rank(b) - rank(a))[0];
    return go(best)!;
  }
  if (p.kind === 'item') {
    if (typeof wearPlan(m, p.item) === 'string') return go(DISCARD)!;
    if (bot === 'random') return go(rng() < 0.5 ? WEAR : DISCARD)!;
    const worn = go(WEAR);
    if (!worn) return go(DISCARD)!;
    const after = worn.members.find(x => x.characterId === id)!;
    return power(worn, memberStats(worn, after)) > power(state, memberStats(state, m)) ? worn : go(DISCARD)!;
  }
  if (p.kind === 'items') return go(Math.floor(rng() * p.items.length))!;
  if (p.kind === 'shop') {
    const open = p.stock.map((o, i) => ({ o, i })).filter(({ o, i }) => !p.sold[i] && o.price <= m.motes);
    let order: number[];
    if (bot === 'random') order = rng() < 0.6 && open.length ? [pick(open).i] : [];
    else {
      const main = mainTheme(m.boons, memberMarks(m));
      const want = (o: (typeof open)[number]['o']) =>
        o.kind === 'heal' ? (hpShare < 0.6 ? 10 : -1) :
        o.kind === 'upgrade' ? 6 :
        o.kind === 'boon' ? (BOONS_BY_ID.get(o.boon.id)!.theme === main ? 7 : 4) + o.boon.rarity :
        o.kind === 'removeCurse' ? 5 :
        o.kind === 'item' ? 3 :
        o.kind === 'attune' ? 2 : -1;
      order = open.filter(x => want(x.o) > 0).sort((a, b) => want(b.o) - want(a.o)).map(x => x.i);
    }
    for (const i of order) {
      const o = p.stock[i];
      for (const t of o.kind === 'attune' || o.kind === 'removeCurse' || o.kind === 'removeBoon' ? targets : [undefined]) {
        const next = go(i, { target: t });
        if (next) return next;
      }
    }
    return go(SHOP_LEAVE)!;
  }
  // An event: a random choice that applies (greedy: heal when hurt, else the first that applies, never the last-resort risks when low).
  const def = EVENTS_BY_ID.get(p.event)!;
  const choices = [...def.choices.keys()];
  const order = bot === 'random'
    ? choices.sort(() => rng() - 0.5)
    : choices.sort((a, b) => eventRank(p.event, b, def.choices[b], hpShare) - eventRank(p.event, a, def.choices[a], hpShare));
  for (const c of order) {
    for (const t of [undefined, ...targets]) {
      const next = go(c, { target: t, theme: theme() });
      if (next) return next;
    }
  }
  throw new Error(`stuck on event ${p.event}`);
}

const giftRank = (g: number) => [0, 1, 4, 2, 5, 3, 0][g] ?? 9;

function eventRank(event: number, c: number, text: string, hp: number): number {
  if (/heal|Heal/.test(text) && !/HP\)/.test(text)) return hp < 0.7 ? 10 : 1;
  if (text === 'Leave' || text === 'Sneak past') return hp < 0.4 ? 5 : 0;
  if (/current HP|Lose|Fight it|copy of your build/.test(text)) return hp > 0.6 ? 4 : -5;
  if (event === 9 || event === 11) return -1; // rerolls of a built theme: skip
  return 3 - c * 0.1;
}

/** Where the leader goes next. */
function chooseNode(state: RunState, bot: Bot, rng: Rng): number {
  const options = reachable(state);
  if (bot === 'random') return options[Math.floor(rng() * options.length)];
  const map = floorMap(state.seed, state.floor);
  const row = map.rows[state.row + 1];
  const hp = Math.min(...state.members.map(m => m.hp / memberStats(state, m).maxHp));
  const motes = Math.min(...state.members.map(m => m.motes));
  const want = (k: string) => (k === 'shop' ? (hp < 0.5 || motes >= 120 ? 4 : 1) : k === 'fight' ? 3 : k === 'elite' ? (hp > 0.65 ? 3.5 : 0) : 2);
  return options.slice().sort((a, b) => want(row[b].kind) - want(row[a].kind) + (rng() - 0.5) * 0.01)[0];
}

export interface BotRun {
  /** Floors cleared. */
  cleared: number;
  end: RunState['end'];
  fights: number;
  /** Milliseconds of compute per node fight. */
  msPerFight: number;
  /** Where the run ended: floor, row (6: the boss) and node kind, with the HP share going in. */
  lastNode?: string;
}

/** A whole run by bots (one per member), from the Threshold to the end. */
export function playRun(seed: number, tier: number, bots: Bot[], mutation = 0): BotRun {
  const rng = seededRng(BigInt(seed), 777n);
  const members = bots.map((_, i) => ({ characterId: BigInt(i + 1), ...referencePlayer(tier, seed * 7 + i) }));
  let state = startRun(BigInt(seed) * 1000n + 17n, tier, mutation, members);
  let fights = 0;
  let ms = 0;
  let lastNode: string | undefined;
  for (let guard = 0; guard < 5000 && state.phase !== 'ended'; guard++) {
    const waiting = state.members.find(m => m.pending.length);
    if (waiting) {
      state = decide(state, waiting, bots[Number(waiting.characterId) - 1], rng);
      continue;
    }
    if (state.members.length > 1) for (const m of state.members) if (!isReady(state, m)) state = apply(state, { type: 'ready', member: m.characterId }).state;
    const t0 = performance.now();
    const leader = bots[Number(state.members[0].characterId) - 1];
    const action: RiftAction = state.row === ROWS - 1
      ? { type: 'boss', option: Math.floor(rng() * bossOptions(state.seed, state.floor).length) }
      : { type: 'move', node: chooseNode(state, leader, rng) };
    const r = apply(state, action);
    if (r.fights.length) {
      const kind = action.type === 'boss' ? 'boss' : floorMap(state.seed, state.floor).rows[state.row + 1][action.node].kind;
      const hp = Math.min(...state.members.map(m => m.hp / memberStats(state, m).maxHp));
      lastNode = `${state.floor}.${action.type === 'boss' ? 6 : state.row + 2} ${kind} ${(100 * hp).toFixed(0)}%`;
      fights += r.fights.length;
      ms += performance.now() - t0;
    }
    state = r.state;
  }
  if (state.phase !== 'ended') throw new Error('a bot run never ended');
  return { cleared: state.cleared, end: state.end, fights, msPerFight: fights ? ms / fights : 0, lastNode };
}

