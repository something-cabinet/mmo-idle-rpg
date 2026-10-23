// Rift rows to a run's state (riftRun.ts `RunState`), shared by the reducers (reducers/rift.ts)
// and the client (src/ui/views/RiftView.tsx), so both see the very state `apply` works on.
// The row shapes are structural: the server's table rows and the client bindings both fit.

import { SLOT_COUNT } from './data/bases';
import type { BoonRarity } from './data/rift';
import type { Headlines } from './rift';
import { decodeRift, type MemberState, type Pending, type RiftItem, type RunState } from './riftRun';

export interface RiftRunRow {
  seed: bigint;
  tier: number;
  mutation: number;
  floor: number;
  row: number;
  col: number;
  cleared: number;
}

export interface RiftMemberRow {
  characterId: bigint;
  joinedAt: { microsSinceUnixEpoch: bigint };
  level: number;
  hp: number;
  motes: number;
  boons: readonly { id: number; rarity: number }[];
  curses: readonly number[];
  /** A u8 array: a Uint8Array in the client bindings. */
  marks: ArrayLike<number>;
  thickBlood: boolean;
  secondWind: number;
  holdTheLine: boolean;
  won: number;
  downed: boolean;
  ready: boolean;
  pending: string;
  skipBoon: boolean;
  freeRare: boolean;
  spent: number;
}

export interface RiftHeadlinesRow {
  riftEffect: number;
  mark: number;
  growth: boolean;
  trophies: readonly number[];
  echo: number;
}

/** A `rift_item` row: the item's columns plus who wears it where. */
export type RiftItemRow = Omit<RiftItem, 'headlines' | 'guaranteed'> & {
  characterId: bigint;
  slot: number;
  headlines?: RiftHeadlinesRow;
  guaranteed: number;
};

const GUARANTEED = [undefined, 'trophy', 'echo'] as const;

export const headlinesOf = (h: RiftHeadlinesRow | undefined): Headlines | undefined =>
  h && {
    ...(h.riftEffect && { riftEffect: h.riftEffect }),
    ...(h.mark && { mark: h.mark as Headlines['mark'] }),
    ...(h.growth && { growth: true }),
    ...(h.trophies.length && { trophies: [...h.trophies] }),
    ...(h.echo && { echo: h.echo }),
  };

/** A worn item as the run sees it. */
export function itemOf(r: RiftItemRow & { id?: bigint; runId?: bigint }): RiftItem {
  const { id: _i, runId: _r, characterId: _c, slot: _s, headlines, guaranteed, ...it } = r;
  return { ...it, effects: [...it.effects], headlines: headlinesOf(headlines), ...(GUARANTEED[guaranteed] && { guaranteed: GUARANTEED[guaranteed] }) } as RiftItem;
}

/** Members in join order (the first is the party's first; a party's seats). */
export const byJoin = <T extends RiftMemberRow>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1));

export function memberOf(r: RiftMemberRow, items: readonly RiftItemRow[]): MemberState {
  const gear: (RiftItem | undefined)[] = new Array(SLOT_COUNT).fill(undefined);
  for (const it of items) if (it.characterId === r.characterId) gear[it.slot] = itemOf(it);
  return {
    characterId: r.characterId, level: r.level, hp: r.hp, motes: r.motes, boons: r.boons.map(b => ({ id: b.id, rarity: b.rarity as BoonRarity })),
    curses: [...r.curses], marks: Array.from(r.marks), thickBlood: r.thickBlood, gear, secondWind: r.secondWind, holdTheLine: r.holdTheLine, won: r.won,
    downed: r.downed, ready: r.ready, pending: r.pending ? decodeRift<Pending[]>(r.pending) : [], skipBoon: r.skipBoon, freeRare: r.freeRare, spent: r.spent,
  };
}

/** The run's state from its rows (`items`: the run's worn items, anyone's). */
export function stateFromRows(run: RiftRunRow, members: readonly RiftMemberRow[], items: readonly RiftItemRow[]): RunState {
  return {
    seed: run.seed, tier: run.tier, mutation: run.mutation, floor: run.floor, row: run.row, col: run.col, phase: 'map', cleared: run.cleared,
    members: byJoin(members).map(r => memberOf(r, items)),
  };
}
