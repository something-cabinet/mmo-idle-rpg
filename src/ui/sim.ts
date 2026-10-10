// Client-side copy of the combat formulas (docs/design/combat.md) for previews.
// When combat lands on the server, these move into spacetimedb/src/game.ts and are shared.

import { RESPAWN, type Enemy, type PREVIEW_PLAYER } from './preview-data';

type Player = typeof PREVIEW_PLAYER;

export const mitigation = (def: number, level: number) => Math.min(0.85, def / (def + 5 * level));

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

export function matchup(p: Player, e: Enemy): Matchup {
  const enemyMit =
    p.dmg === 'Phys' ? mitigation(e.armor * (1 - p.armorPen), e.level) : mitigation(e.resist, e.level);
  const critMult = 1 + Math.min(1, p.crit) * (p.critDmg - 1);
  const dps = p.hit * p.speed * critMult * (1 - enemyMit);
  const playerMit = mitigation(e.dmg === 'Phys' ? p.armor : p.resist, p.level);
  const incoming = e.dps * (1 - playerMit) * (1 - p.evasion);
  const net = incoming - p.regen;
  const ttk = e.hp / dps;
  const ttd = net <= 0 ? Infinity : p.hp / net;
  const win = ttk < ttd;
  const killsPerHour = win ? 3600 / (ttk + RESPAWN) : 0;
  return {
    enemyMit,
    playerMit,
    critMult,
    dps,
    incoming,
    ttk,
    ttd,
    win,
    margin: ttd / ttk,
    killsPerHour,
    xpPerHour: killsPerHour * e.xp * (1 + p.xpGain),
    goldPerHour: killsPerHour * e.gold * (1 + p.goldFind),
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
