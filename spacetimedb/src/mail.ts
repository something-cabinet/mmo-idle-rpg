// Mail attachments (reducers/mail.ts): the gift spec admins write on the CLI, parsed
// and checked against the game data. Pure, so the client and scripts can use it too.

import { BASES } from './data/bases';
import { COSMETICS_BY_ID } from './data/cosmetics';
import { MATERIALS_BY_ID } from './data/materials';
import { MAX_TIER } from './data/stats';
import { isSupplyId } from './data/supplies';
import { UNIQUES_BY_ID } from './data/uniques';
import { DEV_RARITIES, type RarityName } from './loot';

/** `item.characterId` of items attached to mail and not claimed yet. No character has ID 0. */
export const MAIL_ESCROW = 0n;
/** Shown as the sender of `System` mail. */
export const SYSTEM_SENDER_NAME = 'System';
export const MAX_MAIL_SUBJECT = 80;
export const MAX_MAIL_BODY = 2000;
/** Items one mail can carry (each takes a bag slot on claim). */
export const MAX_MAIL_ITEMS = 20;
export const DAY_MICROS = 86_400_000_000n;

/** An item to roll for each recipient: a base at a tier and rarity, or a unique. */
export type GiftItem = { baseId: number; tier: number; rarity: RarityName } | { uniqueId: number };

export interface Gift {
  gold: bigint;
  dust: bigint;
  raidTokens: bigint;
  materials: { materialId: number; count: number }[];
  supplies: { supplyId: number; count: number }[];
  cosmetics: number[];
  items: GiftItem[];
}

export const GIFT_HELP =
  'Gift tokens, space separated: gold:N dust:N tokens:N mat:ID×N supply:ID×N cosmetic:ID item:BASE/TIER/RARITY unique:ID (× may be written x)';

const num = (s: string, what: string): number => {
  if (!/^\d+$/.test(s)) throw new Error(`${what}: "${s}" is not a number`);
  return Number(s);
};
const big = (s: string, what: string): bigint => {
  if (!/^\d+$/.test(s)) throw new Error(`${what}: "${s}" is not a number`);
  return BigInt(s);
};
/** "ID×N" or "IDxN" (N defaults to 1). */
const idCount = (s: string, what: string): [number, number] => {
  const [id, n = '1'] = s.split(/[x×]/);
  const count = num(n, what);
  if (count < 1 || count > 0xffff_ffff) throw new Error(`${what}: bad count ${n}`);
  return [num(id, what), count];
};

/**
 * Parses a gift spec such as `gold:5000 mat:101x20 item:12/5/Rare unique:7`. Repeated
 * tokens add up (two `item:` tokens are two items). Throws with a readable message on
 * anything unknown, so a typo never sends an empty gift. '' is no attachments.
 */
export function parseGift(spec: string): Gift {
  const g: Gift = { gold: 0n, dust: 0n, raidTokens: 0n, materials: [], supplies: [], cosmetics: [], items: [] };
  for (const token of spec.split(/[\s,]+/).filter(Boolean)) {
    const i = token.indexOf(':');
    const key = token.slice(0, i).toLowerCase();
    const v = token.slice(i + 1);
    if (i < 0 || !v) throw new Error(`Bad gift token "${token}". ${GIFT_HELP}`);
    switch (key) {
      case 'gold': g.gold += big(v, 'gold'); break;
      case 'dust': g.dust += big(v, 'dust'); break;
      case 'tokens': g.raidTokens += big(v, 'tokens'); break;
      case 'mat': {
        const [materialId, count] = idCount(v, 'mat');
        if (!MATERIALS_BY_ID.has(materialId)) throw new Error(`No material ${materialId}`);
        const row = g.materials.find(m => m.materialId === materialId);
        if (row) row.count += count;
        else g.materials.push({ materialId, count });
        break;
      }
      case 'supply': {
        const [supplyId, count] = idCount(v, 'supply');
        if (!isSupplyId(supplyId)) throw new Error(`No supply ${supplyId}`);
        const row = g.supplies.find(s => s.supplyId === supplyId);
        if (row) row.count += count;
        else g.supplies.push({ supplyId, count });
        break;
      }
      case 'cosmetic': {
        const id = num(v, 'cosmetic');
        if (!COSMETICS_BY_ID.has(id)) throw new Error(`No cosmetic ${id}`);
        if (!g.cosmetics.includes(id)) g.cosmetics.push(id);
        break;
      }
      case 'item': {
        const [b, t, r = 'Rare'] = v.split('/');
        const baseId = num(b, 'item base');
        const tier = num(t ?? '', 'item tier');
        const rarity = DEV_RARITIES.find(x => x.toLowerCase() === r.toLowerCase());
        if (!BASES.has(baseId)) throw new Error(`No item base ${baseId}`);
        if (tier < 1 || tier > MAX_TIER) throw new Error(`Item tier must be 1–${MAX_TIER}`);
        if (!rarity) throw new Error(`Item rarity must be one of ${DEV_RARITIES.join(', ')}`);
        g.items.push({ baseId, tier, rarity });
        break;
      }
      case 'unique': {
        const uniqueId = num(v, 'unique');
        if (!UNIQUES_BY_ID.has(uniqueId)) throw new Error(`No unique ${uniqueId}`);
        g.items.push({ uniqueId });
        break;
      }
      default:
        throw new Error(`Unknown gift token "${token}". ${GIFT_HELP}`);
    }
  }
  if (g.items.length > MAX_MAIL_ITEMS) throw new Error(`At most ${MAX_MAIL_ITEMS} items per mail`);
  return g;
}

/** The mail still has something to claim. */
export const hasAttachments = (m: {
  claimed: boolean;
  gold: bigint;
  dust: bigint;
  raidTokens: bigint;
  materials: readonly unknown[];
  supplies: readonly unknown[];
  cosmetics: readonly unknown[];
  itemIds: readonly unknown[];
}) =>
  !m.claimed &&
  (m.gold > 0n || m.dust > 0n || m.raidTokens > 0n || m.materials.length > 0 || m.supplies.length > 0 || m.cosmetics.length > 0 || m.itemIds.length > 0);
