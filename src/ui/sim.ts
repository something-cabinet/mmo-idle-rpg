// Preview adapter: runs the shared combat formulas (spacetimedb/src/combat.ts) on the
// preview player and enemies until the views use real data (roadmap milestone 9).

import { matchup as sharedMatchup, type CombatStats } from '../../spacetimedb/src/combat';
import type { EnemyDef } from '../../spacetimedb/src/data/zones';
import type { Enemy, PREVIEW_PLAYER } from './preview-data';

type Player = typeof PREVIEW_PLAYER;

export interface Matchup {
  enemyMit: number;
  playerMit: number;
  critMult: number;
  dps: number;
  incoming: number;
  ttk: number;
  ttd: number;
  win: boolean;
  margin: number;
  killsPerHour: number;
  xpPerHour: number;
  goldPerHour: number;
}

function previewStats(p: Player): CombatStats {
  const type = p.dmg === 'Phys' ? 'Physical' : 'Magic';
  return {
    level: p.level,
    sources: [
      {
        hit: { Physical: type === 'Physical' ? p.hit : 0, Magic: type === 'Magic' ? p.hit : 0 },
        heal: 0,
        attacksPerSec: p.speed,
        critChance: p.crit,
        critMult: 1 + Math.min(1, p.crit) * (p.critDmg - 1),
      },
    ],
    critDamage: p.critDmg,
    armorPen: p.armorPen,
    magicPen: 0,
    maxHp: p.hp,
    regen: p.regen,
    armor: p.armor,
    resistance: p.resist,
    evasionRating: 0, // the preview player has no evasion
    lifesteal: 0,
    threat: 0,
    itemFind: p.itemFind,
    goldFind: p.goldFind,
    xpGain: p.xpGain,
    effects: new Set(),
  };
}

const previewEnemy = (e: Enemy): EnemyDef => ({
  ...e,
  id: 0,
  damageType: e.dmg === 'Phys' ? 'Physical' : 'Magic',
  defense: e.def,
  resistance: e.resist,
  drops: [],
});

export function matchup(p: Player, e: Enemy): Matchup {
  const stats = previewStats(p);
  const m = sharedMatchup(stats, previewEnemy(e));
  const perHour = m.killRate * 3600;
  return {
    enemyMit: m.enemyMitigation[p.dmg === 'Phys' ? 'Physical' : 'Magic'],
    playerMit: m.playerMitigation,
    critMult: stats.sources[0].critMult,
    dps: m.dps,
    incoming: m.incoming,
    ttk: m.timeToKill,
    ttd: m.timeToDie,
    win: m.viable,
    margin: m.timeToDie / m.timeToKill,
    killsPerHour: perHour,
    xpPerHour: perHour * m.xpPerKill,
    goldPerHour: perHour * m.goldPerKill,
  };
}

/** Per-kill drop chances by rarity (zones.md). */
export const DROP_CHANCE = { common: 0.03, magic: 0.015, rare: 0.005, epic: 0.001, legendary: 0.0001, unique: 0.00002 } as const;

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return Math.round(n).toLocaleString();
  if (a >= 10) return n.toFixed(0);
  return n.toFixed(1);
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const secs = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : '∞');
