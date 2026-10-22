// Raids (docs/design/raids.md): the raid boss, its rewards, the raid parties, and the
// party's fight replayed from the stored setup (raid.ts). Online only.

import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Item, RaidLog, RaidMember, RaidParty } from '../../module_bindings/types';
import { combatStats, matchup, type CombatStats } from '../../../spacetimedb/src/combat';
import { Effect, effectAmount } from '../../../spacetimedb/src/data/legendary';
import { RAIDS, RAID_PARTY_SIZE, NPC_POWER, RAID_RARITY_ODDS, bossPhases, empoweredArtId, empoweredBoss, empoweredSignature, phaseAt, raidBosses, type RaidDef, type RaidSignature } from '../../../spacetimedb/src/data/raids';
import { raidUniques } from '../../../spacetimedb/src/data/uniques';
import { BASE_LIST } from '../../../spacetimedb/src/data/bases';
import { ZONES_BY_ID, bossOf } from '../../../spacetimedb/src/data/zones';
import { aggroShares, clearsToday, decodeSetup, duoThreat, lockoutEnd, npcStats, raidRng, simulateRaid, threatWeight, type RaidEvent, type RaidFighter } from '../../../spacetimedb/src/raid';
import { call, useSticky } from '../../store';
import { nowMicros } from '../clock';
import { UNKNOWN, baseFound, uniqueFound } from '../discovery';
import { DefTag, DmgTag, EnemyStats } from '../enemy';
import { EnemyArt, RaidBanner } from '../enemyArt';
import { duration, fmt, fmtBig, pct } from '../format';
import { Icon } from '../Icon';
import { PlayerName } from '../PlayerName';
import { ItemCard, materialIconName, rarityCls, rarityLabel } from '../items';
import { untieredMaterial } from '../../../spacetimedb/src/data/materials';
import { PHIALS_BY_ID, phialBuffs } from '../../../spacetimedb/src/data/supplies';
import { PhialPicker, usablePhial } from '../PhialPicker';
import { CardHead, Modal, ViewHeader } from '../shared';
import { gearFor, type Snapshot } from '../snapshot';
import { HIT_FLASH, HealGlow, HealShimmer, hitClass, lastHeals, type LastHit } from '../fightFx';
import { rarityRank } from '../../../spacetimedb/src/loot';

/** "1:32". */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const byJoin = (a: RaidMember, b: RaidMember) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1);
const fightingNow = (p: RaidParty) => !!p.fight && !p.fight.finished;
/** A boss's short name: "Brokk, the Hammer" → "Brokk". */
const short = (name: string) => name.split(',')[0];
/** The raid's boss or bosses, short: "Skaldrith", "Brokk and Sindri". */
const bossTitle = (raid: RaidDef) => raidBosses(raid).map(b => short(b.name)).join(' and ');
/** Seconds the frost flash and damage numbers stay up after the special attack. */
const BREATH_FLASH = 1.4;
/** How long a floating number stays up, s (the `raid-float-up` animation). */
const FLOAT_SECONDS = 1.8;
/** Most floating numbers on one fighter at a time. */
const MAX_FLOATS = 5;
/** Most floating numbers on one boss at a time (the whole party hits it). */
const MAX_BOSS_FLOATS = 8;

interface RaidFloat {
  key: number;
  text: string;
  cls: string;
  /** The fighter it comes from, when it isn't the one it shows over (a hit on the boss, a heal from an ally). */
  from?: number;
  left: number;
}

/**
 * Floating numbers for the events of the last FLOAT_SECONDS: each fighter's hits and misses
 * over the boss they attack, marked with who dealt them; the boss's hits, blocks and dodges,
 * and every heal (marked when from an ally), over the fighter. The Breath has its own.
 */
function raidFloats(events: readonly RaidEvent[], t: number, maxHp: readonly number[], bosses: number): { boss: RaidFloat[][]; party: RaidFloat[][] } {
  const boss: RaidFloat[][] = Array.from({ length: bosses }, () => []);
  const party: RaidFloat[][] = maxHp.map(() => []);
  const left = (i: number) => 15 + ((i * 37) % 70);
  for (let i = events.length - 1; i >= 0 && t - events[i].t < FLOAT_SECONDS; i--) {
    const e = events[i];
    const prev = events[i - 1];
    if (e.by >= 0) {
      boss[e.boss ?? 0].push(e.kind === 'dodge'
        ? { key: i, text: 'Miss', cls: 'dodge', from: e.by, left: left(i) }
        : { key: i, text: `${fmt(e.damage)}${e.kind === 'crit' ? '!' : ''}`, cls: e.kind, from: e.by, left: left(i) });
      // Heals and lifesteal from this swing (regen since the last event is too small to show).
      e.hp.forEach((h, j) => {
        const gain = h - (prev?.hp[j] ?? maxHp[j]);
        if (gain >= Math.max(1, 0.005 * maxHp[j])) party[j].push({ key: -i - 1 - j * 1e6, text: `+${fmt(gain)}`, cls: 'heal', from: j === e.by ? undefined : e.by, left: left(i + j) });
      });
    } else if (e.kind === 'dodge' && e.target >= 0) {
      party[e.target].push({ key: i, text: 'Dodge', cls: 'dodge', left: left(i) });
    } else if ((e.kind === 'hit' || e.kind === 'special') && e.target >= 0) {
      const hpLost = (prev?.hp[e.target] ?? maxHp[e.target]) - e.hp[e.target];
      const cls = e.blocked ? 'block' : hpLost < 0.5 && e.shield ? 'shielded' : 'taken';
      party[e.target].push({ key: i, text: `${e.blocked ? 'Block ' : ''}−${fmt(e.dealt ?? e.damage)}`, cls, left: left(i) });
    }
    for (const j of e.saved ?? []) party[j].push({ key: -i - 1 - 4e6, text: 'Second Wind', cls: 'heal', left: 35 });
  }
  return { boss: boss.map(f => f.slice(0, MAX_BOSS_FLOATS)), party: party.map(f => f.slice(0, MAX_FLOATS)) };
}

/** One floating number, with the dot of the fighter it comes from when that is not who it shows over. */
function FloatNumber({ f }: { f: RaidFloat }) {
  return (
    <span className={`float raid-float ${f.cls}`} style={{ left: `${f.left}%`, ...(f.from !== undefined && { '--who': `var(--party-${f.from % RAID_PARTY_SIZE})` }) } as CSSProperties}>
      {f.from !== undefined && <i className="raid-who" />}
      {f.text}
    </span>
  );
}

/** How far through its swing a fighter or boss is at `t`, 0–1: from its last swing (or the start) to its next; 0 with none to come. */
function swingAt(times: readonly number[], t: number): number {
  const j = times.findIndex(x => x > t);
  if (j < 0) return 0;
  const from = j > 0 ? times[j - 1] : 0;
  return (t - from) / (times[j] - from);
}


const CLOSED_KEY = 'raidFightsClosed';
/** "partyId:startMicros" of a fight. */
const fightKey = (p: RaidParty) => `${p.id}:${p.fight!.startedAt.microsSinceUnixEpoch}`;
/** Finished fights whose result screen this browser closed; the latest few. */
function closedFights(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
function closeFight(key: string) {
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...closedFights().filter(k => k !== key), key].slice(-20)));
  } catch {
    // storage blocked: the result comes back on the next visit
  }
}

export const RaidsView = memo(function RaidsView({ s }: { s: Snapshot }) {
  return (
    <>
      <ViewHeader title="Raids" icon="crown">
        <span className="chip stat" title="Raid tokens, from raid kills. Traded for rewards later.">
          <Icon name="crown" className="c-gold" />
          <strong>{fmtBig(s.row.raidTokens)}</strong> tokens
        </span>
      </ViewHeader>
      <RaidList s={s} />
    </>
  );
});

/** Every raid as a banner; one opens at a time (the one you're in a party for, to start with). */
function RaidList({ s }: { s: Snapshot }) {
  const mine = [...s.conn.db.raidMember.iter()].find(m => m.characterId === s.row.id);
  const inParty = mine && [...s.conn.db.raidParty.iter()].find(p => p.id === mine.partyId)?.raidId;
  const [open, setOpen] = useSticky<number | undefined>('raidOpen', inParty ?? (RAIDS.length === 1 ? RAIDS[0].id : undefined));
  return (
    <ul className="raid-list">
      {RAIDS.map(raid => (
        <Raid key={raid.id} s={s} raid={raid} open={open === raid.id} toggle={() => setOpen(open === raid.id ? undefined : raid.id)} />
      ))}
    </ul>
  );
}

function Raid({ s, raid, open, toggle }: { s: Snapshot; raid: RaidDef; open: boolean; toggle: () => void }) {
  const conn = s.conn;
  const zone = ZONES_BY_ID.get(raid.unlockZoneId)!;
  const unlocked = s.killedZones.has(zone.id);
  const boss = raid.boss;
  const ownBases = BASE_LIST.filter(b => b.raidId === raid.id);
  const parties = [...conn.db.raidParty.iter()].filter(p => p.raidId === raid.id);
  const members = [...conn.db.raidMember.iter()].sort(byJoin);
  const mine = members.find(m => m.characterId === s.row.id);
  const party = mine && parties.find(p => p.id === mine.partyId);
  const now = nowMicros();
  const clears = clearsToday(conn.db.myRaidLog.iter(), raid.id, now);
  const left = raid.clearsPerDay - clears;
  // Its full stats show once you've beaten it (a win counts as a kill; older wins are in the raid log).
  const beaten = (s.kills.get(boss.id) ?? 0) > 0 || [...conn.db.myRaidLog.iter()].some(l => l.raidId === raid.id && l.won);

  return (
    <li className={`raid-entry${open ? ' open' : ''}${unlocked ? '' : ' locked'}${raid.phases ? ' raid-moon' : ''}${raid.duo ? ' raid-forge' : ''}`}>
      <button className="raid-head" aria-expanded={open} onClick={toggle}>
        <RaidBanner raidId={raid.id} fallback={<EnemyArt enemyId={boss.id} className="raid-head-sprite" />} />
        <div className="raid-head-text">
          <div className="raid-head-name">{raid.name}</div>
          <div className="raid-head-boss"><Icon name="skull" className="boss" />{raid.duo ? bossTitle(raid) : boss.name}</div>
          <div className="raid-head-tags">
            <span className="tag">T{raid.tier}</span>
            <span className="tag">Lv {boss.level}</span>
            {!unlocked ? (
              <span className="tag"><Icon name="lock" />Defeat {bossOf(zone)?.name.split(',')[0]}</span>
            ) : party ? (
              <span className="tag raid-head-party"><Icon name="users" />{fightingNow(party) ? 'Fighting' : 'In a party'}</span>
            ) : (
              parties.length > 0 && <span className="tag"><Icon name="users" />{parties.length} {parties.length === 1 ? 'party' : 'parties'}</span>
            )}
            {unlocked && <span className={`tag${left > 0 ? '' : ' muted'}`} title="Rewarded wins today">{Math.min(clears, raid.clearsPerDay)}/{raid.clearsPerDay} clears</span>}
          </div>
        </div>
        <Icon name="chevron" className="caret" />
      </button>
      {open && (
        <div className="raid-body">
          <p className="muted">{raid.blurb} {RAID_PARTY_SIZE} players, online only.</p>
          {!unlocked && <div className="lock-note"><Icon name="lock" />Defeat {bossOf(zone)?.name} to unlock</div>}
          {raid.duo ? <DuoBosses s={s} raid={raid} beaten={beaten} /> : <div className="raid-boss">
            <EnemyArt enemyId={boss.id} className="raid-boss-sprite" />
            <div className="raid-boss-info">
              <div className="tags">
                <span className="tag">Lv {boss.level}</span>
                <DmgTag magic={boss.damageType === 'Magic'} />
                <DefTag defense={boss.defense} />
                {raid.phases && <span className="tag" title="Its damage and defense change with its Lunar Phases">{raid.phases.list[0].name}</span>}
              </div>
              <div className="raid-stats">
                <div><span>HP</span><strong>{boss.hp.toLocaleString()}</strong></div>
                <div><span>DPS</span><strong>{fmt(boss.dps)}</strong></div>
                <div title="The party wipes when the timer runs out"><span>Enrage</span><strong className="c-bad">{clock(raid.enrageSeconds)}</strong></div>
              </div>
              <div className="raid-special">
                <Icon name={raid.aoe!.icon} className="raid-special-icon" />
                <div>
                  <div className="raid-special-label">Special attack</div>
                  <div className="raid-special-name">{raid.aoe!.name}</div>
                  <div className="raid-special-text">
                    Every <strong>{raid.aoe!.every} s</strong>: <strong>{fmt(raid.aoe!.damage)} {raid.aoe!.damageType.toLowerCase()}</strong> damage{' '}
                    {raid.aoe!.split ? 'shared by the living: the fewer left standing, the harder each is hit' : 'to the whole party'}. Can't be dodged.
                  </div>
                </div>
              </div>
              {raid.phases && (
                <div className="raid-special">
                  <Icon name="sun" className="raid-special-icon" />
                  <div>
                    <div className="raid-special-label">Passive</div>
                    <div className="raid-special-name">Lunar Phases</div>
                    <div className="raid-special-text">
                      It starts in <strong>{raid.phases.list[0].name}</strong> and keeps turning between its phases, each with its own defense and attack type:{' '}
                      {raid.phases.list.map((p, i) => (
                        <span key={p.name}>
                          {i > 0 && '; '}
                          <strong>{p.name}</strong>: {p.defense.toLowerCase()}, {p.damageType.toLowerCase()} attacks
                        </span>
                      ))}.
                    </div>
                  </div>
                </div>
              )}
              {beaten ? (
                <details className="raid-boss-stats">
                  <summary>Boss stats</summary>
                  <EnemyStats e={boss} m={matchup(s.stats, boss)} />
                </details>
              ) : (
                <p className="muted"><Icon name="lock" />Beat {boss.name.split(',')[0]} once to reveal its full stats.</p>
              )}
            </div>
          </div>}
          <div className="raid-rewards">
            <h3>Rewards <span className="muted">each player, for {raid.clearsPerDay} wins a day (losses don't count; resets 00:00 UTC)</span></h3>
            <ul>
              <li>
                {raid.itemsPerClear} T{raid.tier} items, each <span className="c-epic">Epic</span> or better: <span className="c-legendary">Legendary</span> {pct(RAID_RARITY_ODDS.Legendary)},{' '}
                <span className="c-unique">Unique</span> {pct(RAID_RARITY_ODDS.Unique)} from its own pool:{' '}
                {raidUniques(raid.id).map((u, i) => (
                  <span key={u.id}>{i > 0 && ', '}<span className={uniqueFound(s, u) ? 'c-unique' : 'muted'}>{uniqueFound(s, u) ? u.name : UNKNOWN}</span></span>
                ))}
              </li>
              {ownBases.length > 0 && (
                <li>
                  Raid boss exclusive equipment bases:{' '}
                  {ownBases.map((b, i) => {
                    const found = baseFound(s, b.id, raid.tier);
                    return (
                      <span key={b.id}>{i > 0 && ', '}<span className={found ? '' : 'muted'} title={found ? b.family : `An undiscovered ${b.family.toLowerCase()}`}>{found ? b.name(raid.tier) : UNKNOWN}</span></span>
                    );
                  })}
                </li>
              )}
              <li>{raid.tokens} raid tokens · {raid.voidglass} Voidglass · {fmt(boss.gold)} gold · {fmt(boss.xp)} XP</li>
            </ul>
            <p className={left > 0 ? 'c-ok' : 'muted'}>
              Clears today: {Math.min(clears, raid.clearsPerDay)}/{raid.clearsPerDay}.{' '}
              {left > 0 ? `${left} rewarded win${left === 1 ? '' : 's'} left today.` : `Resets in ${duration(lockoutEnd(now) - now)}: you can still fight to help others.`}
            </p>
          </div>

        {unlocked && (party ? (
          <PartyPanel s={s} raid={raid} party={party} members={members.filter(m => m.partyId === party.id)} />
        ) : (
          <section className="raid-section">
            <CardHead title="Raid parties">
              <button className="btn small primary" onClick={() => call(conn.reducers.createRaidParty({ raidId: raid.id }))}>
                <Icon name="users" />Form a party
              </button>
            </CardHead>
            {parties.length ? (
              <ul className="raid-parties">
                {parties.map(p => {
                  const ms = members.filter(m => m.partyId === p.id);
                  const leader = ms.find(m => m.characterId === p.leaderId);
                  const full = ms.length + p.hired >= RAID_PARTY_SIZE;
                  return (
                    <li key={String(p.id)}>
                      <span>
                        <strong>{leader?.name ?? '?'}'s party</strong>{' '}
                        <span className="muted">{ms.length + p.hired}/{RAID_PARTY_SIZE}{p.hired ? ` (${p.hired} hired)` : ''} · {ms.map(m => m.name).join(', ')}</span>
                      </span>
                      {fightingNow(p) ? (
                        <span className="tag">Fighting</span>
                      ) : (
                        <button className="btn small" disabled={full} onClick={() => call(conn.reducers.joinRaidParty({ partyId: p.id }))}>
                          {full ? 'Full' : 'Join'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No parties yet. Form one: other players can join it, and you can hire NPCs for the empty seats.</p>
            )}
          </section>
        ))}
        </div>
      )}
    </li>
  );
}

/** A signature attack, in words: "Every 15 s: 1,000 physical damage to one fighter, picked by threat." */
const signatureText = (sg: RaidSignature) => (
  <>
    Every <strong>{sg.every} s</strong>: <strong>{fmt(sg.damage)} {sg.damageType.toLowerCase()}</strong> damage{' '}
    {sg.aoe ? 'to the whole party' : 'to one fighter, picked by threat'}. Can't be dodged.
  </>
);

/** A duo raid's two brothers, each with his signature and his empowered twist, then the rules they share. */
function DuoBosses({ s, raid, beaten }: { s: Snapshot; raid: RaidDef; beaten: boolean }) {
  const duo = raid.duo!;
  // Side by side (wider than the 640px breakpoint of `.raid-duo-pair`), both stats open and close
  // together, so one card isn't stretched by the other's; stacked, each on its own.
  const [statsOpen, setStatsOpen] = useState([false, false]);
  const toggleStats = (k: number, open: boolean) => {
    if (statsOpen[k] === open) return;
    setStatsOpen(window.matchMedia('(min-width: 641px)').matches ? [open, open] : statsOpen.map((o, i) => (i === k ? open : o)));
  };
  return (
    <div className="raid-duo">
      <div className="raid-duo-pair">
        {duo.bosses.map((b, k) => {
          const e = b.enemy;
          return (
            <div key={e.id} className="raid-boss">
              <EnemyArt enemyId={e.id} className="raid-boss-sprite" />
              <div className="raid-boss-info">
                <div className="raid-duo-name"><Icon name="skull" className="boss" />{e.name}</div>
                <div className="tags">
                  <span className="tag">Lv {e.level}</span>
                  <DmgTag magic={e.damageType === 'Magic'} />
                  <DefTag defense={e.defense} />
                </div>
                <div className="raid-stats">
                  <div><span>HP</span><strong>{e.hp.toLocaleString()}</strong></div>
                  <div><span>DPS</span><strong>{fmt(e.dps)}</strong></div>
                  <div title="The party wipes when the timer runs out"><span>Enrage</span><strong className="c-bad">{clock(raid.enrageSeconds)}</strong></div>
                </div>
                <div className="raid-special">
                  <Icon name={b.signature.icon} className="raid-special-icon" />
                  <div>
                    <div className="raid-special-label">Signature</div>
                    <div className="raid-special-name">{b.signature.name}</div>
                    <div className="raid-special-text">{signatureText(b.signature)}</div>
                  </div>
                </div>
                <div className="raid-special raid-empowered">
                  <EnemyArt enemyId={empoweredArtId(e.id)} className="raid-empowered-sprite" fallback={<Icon name="zap" className="raid-special-icon" />} />
                  <div>
                    <div className="raid-special-label">If he absorbs his brother</div>
                    <div className="raid-special-name">{b.empowered.name}</div>
                    <div className="raid-special-text">{b.empowered.text}.</div>
                  </div>
                </div>
                {beaten && (
                  <details className="raid-boss-stats" open={statsOpen[k]} onToggle={ev => toggleStats(k, ev.currentTarget.open)}>
                    <summary>{short(e.name)}'s stats</summary>
                    <EnemyStats e={e} m={matchup(s.stats, e)} />
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="raid-boss raid-duo-rules">
        <ul>
          <li><strong>Brothers in arms:</strong> while both stand, each hits at {pct(duo.together)} strength. Alone, he hits at full strength, and at {pct(duo.absorbed)} once he empowers.</li>
          <li><strong>Absorption:</strong> when one falls, the other absorbs him for <strong>{duo.absorbSeconds} s</strong>. Kill him within that time and he never empowers; if he does, he is back to full health.</li>
          <li><strong>Who attacks whom:</strong> the leader assigns each seat to a brother. Attacking a brother draws his attacks (+{pct(duo.focusThreat)} threat with him).</li>
        </ul>
        {!beaten && <p className="muted"><Icon name="lock" />Beat the brothers once to reveal their full stats.</p>}
      </div>
    </div>
  );
}

function PartyPanel({ s, raid, party, members }: { s: Snapshot; raid: RaidDef; party: RaidParty; members: RaidMember[] }) {
  const conn = s.conn;
  const me = s.row.id;
  const leading = party.leaderId === me;
  const fighting = fightingNow(party);
  const online = new Set([...conn.db.presence.iter()].map(p => p.characterId));
  const chars = new Map([...conn.db.raidPartyCharacters.iter()].map(c => [c.id, c]));
  const loadouts = new Map([...conn.db.raidPartyLoadouts.iter()].map(l => [l.characterId, l]));
  const items = new Map([...conn.db.raidPartyItems.iter()].map(i => [i.id, i]));

  // Every member's stats as the server would take them at the start (yours projected to now), with their Phials
  // (yours only if you have one left; others' stock isn't public, so theirs as picked).
  const myPhial = usablePhial(s, members.find(m => m.characterId === me)?.phialId ?? 0);
  const players = members.map((m): RaidFighter | undefined => {
    if (m.characterId === me) return { characterId: me, name: m.name, stats: myPhial ? combatStats(s.level, s.gear, phialBuffs(myPhial)) : s.stats };
    const ch = chars.get(m.characterId);
    const lo = loadouts.get(m.characterId);
    return ch && lo && { characterId: ch.id, name: m.name, stats: combatStats(ch.level, gearFor(lo.slots, items), phialBuffs(m.phialId)) };
  });
  const known = players.every(p => p) ? (players as RaidFighter[]) : undefined;
  const npc = npcStats(raid);
  const duo = raid.duo;
  const bosses = raidBosses(raid);
  // A duo: each seat's brother (players in join order, then hired NPCs).
  const targets = [...members.map(m => m.target), ...Array.from({ length: party.hired }, (_, i) => (party.hiredTargets >> i) & 1)];
  const setup = known && { raidId: raid.id, fighters: [...known, ...Array.from({ length: party.hired }, (_, i) => ({ characterId: 0n, name: `Hireling ${i + 1}`, stats: npc }))] };
  // Each seat's share of the boss's attacks while everyone is alive; a duo: of each brother's.
  const aggro = setup && aggroShares(setup.fighters.map(f => f.stats.threat));
  const aggroBy = setup && duo && bosses.map((_, b) => {
    const w = setup.fighters.map((f, i) => threatWeight(duoThreat(raid, f.stats, targets[i], b)));
    const total = w.reduce((a, x) => a + x, 0);
    return w.map(x => x / total);
  });

  const offline = members.filter(m => !online.has(m.characterId));
  const cost = BigInt(party.hired) * BigInt(raid.hireCost);
  const empty = RAID_PARTY_SIZE - members.length - party.hired;
  const startBlock = fighting ? 'The fight is on'
    : offline.length ? `${offline.map(m => m.name).join(', ')} offline`
      : s.gold < cost ? `Need ${fmtBig(cost - s.gold)} more gold to hire` : undefined;
  const leader = members.find(m => m.characterId === party.leaderId);
  const clearsLeft = Math.max(0, raid.clearsPerDay - clearsToday(conn.db.myRaidLog.iter(), raid.id, nowMicros()));
  const [confirming, setConfirming] = useState(false);
  const again = !!party.fight?.finished;
  const [closed, setClosed] = useState(closedFights);
  // A finished fight stays on screen until you close it; one you weren't in doesn't show.
  const showFight = !!party.fight && (fighting || (!closed.includes(fightKey(party)) && decodeSetup(party.fight.setup).fighters.some(f => f.characterId === me)));

  const seat = (stats: CombatStats | undefined, i: number) => {
    if (!stats) return undefined;
    const m = matchup(stats, raid.boss);
    // DPS against the boss, averaged over its Lunar Phases (each has its own armor and resistance); a duo: against its brother.
    const phases = duo ? [bosses[targets[i]]] : bossPhases(raid);
    const dps = phases.reduce((sum, b) => sum + matchup(stats, b).dps, 0) / phases.length;
    // Heal per second from the weapon (crits included), given to allies: split across the party or to the most hurt one.
    const hps = m.hps;
    const healAll = !!stats.sources[0]?.healAll;
    return (
      <div className="raid-seat-stats muted">
        HP {fmt(stats.maxHp)} ·{' '}
        <span title={raid.phases ? `Damage per second against the boss, averaged over its ${raid.phases.list.map(p => p.name).join(' and ')}` : duo ? `Damage per second against ${short(bosses[targets[i]].name)}` : 'Damage per second against the boss'}>
          DPS {fmt(dps)}
        </span>{' '}
        ·{' '}
        <span title={hps > 0 ? (healAll ? 'Heal per second, split across the party' : 'Heal per second, to the most hurt ally') : 'Heal per second: no healing weapon'}>
          HPS {fmt(hps)}{hps > 0 ? (healAll ? ' (party)' : ' (one ally)') : ''}
        </span>{' '}
        · Threat {pct(stats.threat)}
        {aggroBy ? (
          <span className="tag" title="Share of each brother's attacks while everyone is alive (more threat, more attacks; attacking a brother draws his)">
            <Icon name="shield" />Aggro {bosses.map((b, k) => `${short(b.name)} ${pct(aggroBy[k][i])}`).join(' · ')}
          </span>
        ) : aggro && (
          <span className={`tag${aggro[i] === Math.max(...aggro) ? ' raid-target' : ''}`} title="Share of the boss's attacks while everyone is alive (more threat, more attacks)">
            <Icon name="shield" />Aggro {pct(aggro[i])}
          </span>
        )}
      </div>
    );
  };

  /** A duo: which brother seat `i` attacks; the leader picks, outside a fight. */
  const picker = (i: number) => duo && (
    <div className="raid-seat-target">
      <span className="muted">Attacks</span>
      <div className="seg">
        {bosses.map((b, k) => (
          <button key={b.id} className={`seg-btn${targets[i] === k ? ' active' : ''}`} disabled={!leading || fighting}
            title={leading ? `Attack ${short(b.name)}` : 'The leader assigns who attacks whom'}
            onClick={() => targets[i] !== k && call(conn.reducers.setRaidTarget({ seat: i, target: k }))}>
            {short(b.name)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="raid-section">
      <CardHead title={`${leader?.name ?? '?'}'s party`}>
        {!fighting && (
          <button className="btn small ghost" onClick={() => call(conn.reducers.leaveRaid({}))}>
            Leave
          </button>
        )}
      </CardHead>
      <div className="raid-seats">
        {members.map((m, i) => (
          <div key={String(m.characterId)} className={`raid-seat${m.characterId === me ? ' me' : ''}`}>
            <div className="raid-seat-name">
              {m.characterId === party.leaderId && <Icon name="crown" className="c-gold" />}
              <strong><PlayerName conn={conn} id={m.characterId} name={m.name} row /></strong>
              <span className="muted">Lv {m.characterId === me ? s.level : (chars.get(m.characterId)?.level ?? '?')}</span>
              {!online.has(m.characterId) && <span className="tag">Offline</span>}
              {leading && m.characterId !== me && !fighting && (
                <button className="btn icon ghost small" title={`Remove ${m.name}`} onClick={() => call(conn.reducers.kickFromRaid({ characterId: m.characterId }))}>
                  <Icon name="x" />
                </button>
              )}
            </div>
            {seat(players[i]?.stats, i)}
            {picker(i)}
            {m.characterId === me && !fighting ? (
              <div className="raid-seat-phial">
                <span className="muted">Phial</span>
                <PhialPicker s={s} value={m.phialId} onChange={phialId => call(conn.reducers.setRaidPhial({ phialId }))} />
              </div>
            ) : PHIALS_BY_ID.has(m.phialId) && (
              <div className="raid-seat-phial muted">Phial: {PHIALS_BY_ID.get(m.phialId)!.name}</div>
            )}
          </div>
        ))}
        {Array.from({ length: party.hired }, (_, i) => (
          <div key={`npc${i}`} className="raid-seat npc">
            <div className="raid-seat-name">
              <strong>Hireling {i + 1}</strong>
              <span className="tag" title={`A hired NPC: ${NPC_POWER}× the stats of an average player ready for this raid`}>NPC {NPC_POWER}×</span>
              {leading && !fighting && (
                <button className="btn icon ghost small" title="Dismiss" onClick={() => call(conn.reducers.setRaidHires({ count: party.hired - 1 }))}>
                  <Icon name="x" />
                </button>
              )}
            </div>
            {seat(npc, members.length + i)}
            {picker(members.length + i)}
          </div>
        ))}
        {Array.from({ length: Math.max(0, empty) }, (_, i) => (
          <div key={`empty${i}`} className="raid-seat empty">
            <span className="muted">Empty seat</span>
            {leading && !fighting && (
              <button className="btn small" onClick={() => call(conn.reducers.setRaidHires({ count: party.hired + 1 }))}>
                Hire an NPC · {fmt(raid.hireCost)} gold
              </button>
            )}
          </div>
        ))}
      </div>

      {showFight && (
        <RaidFight
          key={String(party.fight!.startedAt.microsSinceUnixEpoch)}
          s={s}
          raid={raid}
          party={party}
          onClose={() => {
            closeFight(fightKey(party));
            setClosed(closedFights());
          }}
        />
      )}

      {!fighting && (
        <div className={`raid-launch${leading ? ' leading' : ''}`}>
          <div className="raid-launch-text">
            <div className="raid-launch-title">{again ? 'Fight again?' : 'Ready to fight?'}</div>
            <div className="raid-launch-facts">
              <span>Party <strong>{members.length + party.hired}/{RAID_PARTY_SIZE}</strong>{party.hired > 0 && ` (${party.hired} hired)`}</span>
              <span>Your clears <strong className={clearsLeft ? '' : 'c-bad'}>{clearsLeft}/{raid.clearsPerDay}</strong> left</span>
              {leading && cost > 0n && <span>Hiring <strong>{fmtBig(cost)}</strong> gold</span>}
            </div>
          </div>
          {leading ? (
            <div className="raid-launch-go">
              {startBlock && <span className="c-bad">{startBlock}</span>}
              <button className="btn primary raid-start" disabled={!!startBlock} onClick={() => setConfirming(true)}>
                <Icon name="swords" />
                {again ? 'Start again' : 'Start the raid'}
              </button>
            </div>
          ) : (
            <div className="raid-launch-wait">Waiting for {leader?.name ?? 'the leader'}<span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
          )}
        </div>
      )}

      {confirming && (
        <Modal className="raid-confirm" onClose={() => setConfirming(false)}>
          <CardHead title={`Fight ${bossTitle(raid)}?`} />
          <ul className="raid-confirm-list">
            <li><span>Party</span><strong>{[...members.map(m => m.name), ...Array.from({ length: party.hired }, (_, i) => `Hireling ${i + 1}`)].join(', ')}</strong></li>
            {cost > 0n && <li><span>Hiring {party.hired} NPC{party.hired === 1 ? '' : 's'}</span><strong>{fmtBig(cost)} gold, paid now, win or lose</strong></li>}
            <li><span>Your clears today</span><strong>{clearsLeft}/{raid.clearsPerDay} left</strong></li>
            <li><span>Your Phial</span><strong>{myPhial ? `${PHIALS_BY_ID.get(myPhial)!.name}, used up win or lose` : 'None'}</strong></li>
          </ul>
          {clearsLeft === 0 && <p className="c-bad">You have no clears left today: a win gives you no loot.</p>}
          <div className="row raid-confirm-actions">
            <button className="btn ghost" onClick={() => setConfirming(false)}>Cancel</button>
            <button
              className="btn primary"
              onClick={() => {
                setConfirming(false);
                call(conn.reducers.startRaid({}));
              }}
            >
              <Icon name="swords" />
              Start the fight
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** The party's latest fight, replayed in step with the server's clock; then its result and your reward. */
function RaidFight({ s, raid, party, onClose }: { s: Snapshot; raid: RaidDef; party: RaidParty; onClose: () => void }) {
  const fight = party.fight!;
  const start = fight.startedAt.microsSinceUnixEpoch;
  const setup = useMemo(() => decodeSetup(fight.setup), [fight.setup]);
  const result = useMemo(() => simulateRaid(setup, raid, raidRng(party.id, start)), [setup, raid, party.id, start]);
  // The local clock can lag the server's start by a moment: the replay starts at 0, not before.
  const elapsed = () => Math.max(0, Number(nowMicros() - start) / 1e6);
  // Each fighter's and each boss's swing times, for their attack-speed bars.
  const swings = useMemo(() => {
    const party = setup.fighters.map((): number[] => []);
    const bosses = raidBosses(raid).map((): number[] => []);
    for (const e of result.events) {
      if (e.by >= 0) party[e.by].push(e.t);
      else if (e.kind === 'hit' || e.kind === 'crit' || e.kind === 'dodge') bosses[e.boss ?? 0].push(e.t);
    }
    return { party, bosses };
  }, [setup, raid, result]);
  const [t, setT] = useState(elapsed);
  useEffect(() => {
    if (t >= result.end) return;
    const timer = window.setInterval(() => setT(elapsed()), 50);
    return () => window.clearInterval(timer);
  }, [result.end]); // eslint-disable-line react-hooks/exhaustive-deps -- runs until the end

  const live = t < result.end;
  const shown = live ? result.events.filter(e => e.t <= t) : result.events;
  const last = shown.at(-1);
  const hp = last?.hp ?? result.maxHp;
  const bosses = raidBosses(raid);
  const bossHp = last?.bossHp ?? bosses.map(b => b.hp);
  const names = setup.fighters.map(f => f.name);
  const floats = live ? raidFloats(shown, t, result.maxHp, bosses.length) : undefined;
  // Each fighter's and boss's latest hit taken, to flash their sprite: the boss's hits (its
  // special on its target, its AoE on everyone) and the party's hits on each boss.
  const hitParty: (LastHit | undefined)[] = names.map(() => undefined);
  const hitBoss: (LastHit | undefined)[] = bosses.map(() => undefined);
  const healed = live ? lastHeals(shown, result.maxHp, t) : [];
  for (let n = shown.length - 1; live && n >= 0 && t - shown[n].t < HIT_FLASH; n--) {
    const e = shown[n];
    const hit = { n, at: e.t };
    if (e.by >= 0) {
      if (e.kind !== 'dodge') hitBoss[e.boss ?? 0] ??= hit;
    } else if (e.kind === 'aoe') {
      hitParty.forEach((h, i) => (hitParty[i] = h ?? hit));
    } else if ((e.kind === 'hit' || e.kind === 'special') && e.target >= 0) {
      hitParty[e.target] ??= hit;
    }
  }
  // A duo: who has empowered so far, and who is absorbing his brother now.
  const empowered = new Set(shown.filter(e => e.kind === 'empower').map(e => e.boss ?? 0));
  const lastFall = [...shown].reverse().find(e => e.kind === 'fall');
  const absorbing = raid.duo && lastFall && live && bossHp.filter(h => h > 0).length === 1 && t < lastFall.t + raid.duo.absorbSeconds && empowered.size === 0
    ? { boss: bossHp.findIndex(h => h > 0), left: lastFall.t + raid.duo.absorbSeconds - t } : undefined;
  const bossName = (b: number) => (raid.duo && empowered.has(b) ? empoweredBoss(raid.duo.bosses[b]).name : bosses[b].name);
  /** A boss's special as it is at `at` (a duo brother's empowered signature once he has empowered). */
  const specialOf = (b: number, at: number): RaidSignature | undefined => {
    if (!raid.duo) return raid.aoe && { ...raid.aoe, aoe: true };
    const d = raid.duo.bosses[b];
    return shown.some(e => e.kind === 'empower' && e.boss === b && e.t <= at) ? empoweredSignature(d) : d.signature;
  };
  // Second Skin: each fighter's shield left, drawn over the top end of their HP bar.
  const shield = last?.shield ?? setup.fighters.map((f, i) => effectAmount(f.stats.effects, Effect.SecondSkin) * result.maxHp[i]);
  // The special attack: a frost flash with each fighter's damage for a moment after it lands, and a countdown to the next.
  const lastAoe = live ? [...shown].reverse().find(e => e.kind === 'aoe') : undefined;
  const breath = lastAoe && t - lastAoe.t < BREATH_FLASH ? lastAoe : undefined;
  const beforeBreath = breath && shown[shown.indexOf(breath) - 1];
  const aoeEvery = raid.aoe?.every ?? 1;
  const nextAoe = Math.ceil((t + 1e-9) / aoeEvery) * aoeEvery;
  const charge = 1 - (nextAoe - t) / aoeEvery;
  const log = [...s.conn.db.myRaidLog.iter()].find(l => l.partyId === party.id && l.startedAt.microsSinceUnixEpoch === start);
  const loot = (log?.itemIds ?? []).flatMap(id => s.items.get(id) ?? []);

  return (
    <div className={`raid-fight${breath ? ' breath' : ''}`}>
      {breath && <div key={breath.t} className="raid-frost" aria-hidden="true" />}
      <div className="raid-top">
        <div className="raid-boss-bars" style={{ '--bosses': bosses.length } as CSSProperties}>
          {bosses.map((b, k) => (
            <div key={b.id} className={`raid-boss-bar${bossHp[k] <= 0 ? ' fallen' : ''}${empowered.has(k) ? ' empowered' : ''}`}>
              <div className="duelist-name">
                <Icon name="skull" className="boss" />{bossName(k)}
                {absorbing?.boss === k && <span className="tag c-bad">Absorbing… {Math.ceil(absorbing.left)} s</span>}
                {bossHp[k] <= 0 && bosses.length > 1 && <span className="tag">Fallen</span>}
              </div>
              <div className="hpbar enemy">
                <div className="hp-fill" style={{ width: `${(bossHp[k] / b.hp) * 100}%` }} />
                <span className="hp-text">{fmt(bossHp[k])} / {fmt(b.hp)}</span>
              </div>
            </div>
          ))}
        </div>
        {live && (
          <div className="raid-status">
            <span className="raid-clock">
              <strong>{clock(t)}</strong>
              <span className={raid.enrageSeconds - t < 30 ? 'c-bad' : 'muted'}>enrage in {clock(Math.max(0, raid.enrageSeconds - t))}</span>
            </span>
            {raid.phases && (() => {
              // Lunar Phases: the boss's current face, and how long until it turns.
              const every = raid.phases.every;
              const now = raid.phases.list[phaseAt(raid, t)];
              const next = raid.phases.list[phaseAt(raid, t + every)];
              const left = every - (t % every);
              return (
                <span className={`raid-breath-timer raid-phase-timer${left < 3 ? ' soon' : ''}`}
                  title={`${now.name}: ${now.defense.toLowerCase()}, ${now.damageType.toLowerCase()} attacks`}>
                  <Icon name={now.damageType === 'Magic' ? 'sun' : 'moon'} />
                  {now.name} · {next.name} in {Math.ceil(left)} s
                  <span className="raid-breath-charge"><span style={{ width: `${(1 - left / every) * 100}%` }} /></span>
                </span>
              );
            })()}
            {raid.aoe ? (
              <span className={`raid-breath-timer${breath ? ' now' : nextAoe - t < 3 ? ' soon' : ''}`} title={`${raid.aoe.name} hits the whole party every ${raid.aoe.every} s`}>
                <Icon name={raid.aoe.icon} />
                {breath ? `${raid.aoe.name}!` : `${raid.aoe.name} in ${Math.ceil(nextAoe - t)} s`}
                <span className="raid-breath-charge"><span style={{ width: `${(breath ? 1 : charge) * 100}%` }} /></span>
              </span>
            ) : bosses.map((b, k) => {
              if (bossHp[k] <= 0) return null;
              // Each brother's signature: the next one after his last (or his empowering), on its own timer.
              const sg = specialOf(k, t)!;
              const from = [...shown].reverse().find(e => e.boss === k && (e.kind === 'aoe' || e.kind === 'special' || e.kind === 'empower'))?.t ?? 0;
              const left = Math.max(0, from + sg.every - t);
              return (
                <span key={b.id} className={`raid-breath-timer${left < 3 ? ' soon' : ''}`} title={`${short(b.name)}'s ${sg.name}: every ${sg.every} s, ${sg.aoe ? 'the whole party' : 'one fighter'}`}>
                  <Icon name={sg.icon} />
                  {sg.name} in {Math.ceil(left)} s
                  <span className="raid-breath-charge"><span style={{ width: `${(1 - left / sg.every) * 100}%` }} /></span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="raid-arena">
        <div className="raid-party">
          {names.map((name, i) => (
            <div key={i} className={`raid-fighter${hp[i] <= 0 ? ' lost' : ''}`} style={{ '--who': `var(--party-${i % RAID_PARTY_SIZE})` } as CSSProperties}>
              <div className="raid-floats">
                {breath && beforeBreath && beforeBreath.hp[i] > 0 && (
                  <span key={breath.t} className="float frost">−{fmt(Math.max(0, beforeBreath.hp[i] - breath.hp[i]))}</span>
                )}
                {floats?.party[i].map(f => <FloatNumber key={f.key} f={f} />)}
              </div>
              <div className={`portrait raid-portrait${hitClass(hitParty[i], t)}`}>
                <Icon name="user" />
                <HealGlow heal={healed[i]} t={t} />
              </div>
              <div className="duelist-name">
                <i className="raid-who" />
                <PlayerName conn={s.conn} id={setup.fighters[i].characterId} name={name} row />{setup.fighters[i].characterId === s.row.id ? ' (you)' : ''}
              </div>
              <div className="hpbar">
                <HealShimmer heal={healed[i]} t={t} />
                <div className="hp-fill" style={{ width: `${(hp[i] / result.maxHp[i]) * 100}%` }} />
                {shield[i] > 0 && hp[i] > 0 && (
                  <div className="hp-shield" style={{
                    width: `${Math.min(100, (shield[i] / result.maxHp[i]) * 100)}%`,
                    left: `${Math.max(0, ((hp[i] - shield[i]) / result.maxHp[i]) * 100)}%`,
                  }} />
                )}
                <span className="hp-text">{fmt(hp[i])} / {fmt(result.maxHp[i])}{shield[i] >= 0.5 && hp[i] > 0 ? ` +${fmt(shield[i])}` : ''}</span>
              </div>
              <div className="swing">
                <div className="swing-fill" style={{ width: `${live && hp[i] > 0 ? swingAt(swings.party[i], t) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="raid-foes">
          {bosses.map((b, k) => (
            <div key={b.id} className={`raid-foe${bossHp[k] <= 0 ? ' fallen' : ''}${empowered.has(k) ? ' empowered' : ''}`} title={bossName(k)}>
              <div className="raid-floats">
                {floats?.boss[k].map(f => <FloatNumber key={f.key} f={f} />)}
              </div>
              <EnemyArt enemyId={empowered.has(k) ? empoweredArtId(b.id) : b.id} className={`raid-foe-sprite${hitClass(hitBoss[k], t)}`} fallback={<Icon name="skull" className={`boss raid-foe-glyph${hitClass(hitBoss[k], t)}`} />} />
              {bosses.length > 1 && <div className="raid-foe-name">{short(bossName(k))}</div>}
              <div className="swing enemy">
                <div className="swing-fill" style={{ width: `${live && bossHp[k] > 0 ? swingAt(swings.bosses[k], t) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {!live && (
        <div className="duel-status">
          <RaidResult won={fight.won} text={fight.won ? `${raid.duo ? bossTitle(raid) + ' fall' : raid.boss.name + ' falls'} at ${clock(result.end)}` : result.enraged ? `${raid.duo ? bossTitle(raid) + ' enrage' : raid.boss.name + ' enrages'} at ${clock(raid.enrageSeconds)}: the party wipes` : `The party wipes at ${clock(result.end)}`} />
        </div>
      )}
      {live && (
        <ul className="duel-log">
          {shown.slice(-6).reverse().map((e, i) => (
            <li key={shown.length - i} className={`${e.by < 0 ? 'theirs' : 'mine'}${e.kind === 'crit' ? ' crit' : ''}${e.kind === 'aoe' || e.kind === 'phase' || e.kind === 'special' || e.kind === 'fall' || e.kind === 'empower' ? ' aoe' : ''}`}>
              {(e.kind === 'aoe' || e.kind === 'special') && <Icon name={specialOf(e.boss ?? 0, e.t)?.icon ?? 'skull'} />}
              {e.kind === 'phase' && <Icon name={raid.phases?.list[e.phase ?? 0].damageType === 'Magic' ? 'sun' : 'moon'} />}
              {(e.kind === 'fall' || e.kind === 'empower') && <Icon name={e.kind === 'fall' ? 'skull' : 'zap'} />}
              {eventLine(e, names, raid, bossName, specialOf)}
            </li>
          ))}
        </ul>
      )}
      {!live && fight.won && (
        log ? (
          log.rewarded ? (
            <RaidLoot log={log} loot={loot} />
          ) : (
            <p className="raid-no-loot">No clears left today: no loot this time.</p>
          )
        ) : setup.fighters.some(f => f.characterId === s.row.id) ? (
          <div className="raid-loot-pending">
            {Array.from({ length: raid.itemsPerClear }, (_, i) => <span key={i} style={{ '--delay': `${i * 0.15}s` } as CSSProperties}><Icon name="gem" /></span>)}
            <div className="muted">Opening the hoard…</div>
          </div>
        ) : null
      )}
      {!live && fight.finished && (
        <button className="btn raid-close" onClick={onClose}>
          Continue
        </button>
      )}
    </div>
  );
}

/** Sparks over the victory banner: left position (%) and delay (s). */
const SPARKS = [[8, 0], [18, 0.5], [27, 0.2], [36, 0.8], [45, 0.1], [55, 0.6], [63, 0.3], [72, 0.9], [81, 0.15], [90, 0.55]];

/** The fight's verdict, as a banner. */
function RaidResult({ won, text }: { won: boolean; text: string }) {
  return (
    <div className={`raid-result ${won ? 'victory' : 'defeat'}`}>
      {won && (
        <div className="raid-sparks" aria-hidden="true">
          {SPARKS.map(([x, d], i) => <span key={i} style={{ '--x': `${x}%`, '--d': `${d}s` } as CSSProperties} />)}
        </div>
      )}
      <div className="raid-result-title">{won ? 'Victory!' : 'Defeat'}</div>
      <div className="raid-result-sub">{text}</div>
    </div>
  );
}

/** Your rewards from a win: the gains, then each item revealed in turn, rarer ones louder. */
function RaidLoot({ log, loot }: { log: RaidLog; loot: Item[] }) {
  const step = 0.7;
  const first = 0.9;
  const sorted = [...loot].sort((a, b) => rarityRank(a.rarity.tag) - rarityRank(b.rarity.tag)); // the best comes last
  return (
    <div className="raid-loot">
      <div className="raid-loot-head">Your loot</div>
      <div className="raid-gains">
        <span style={{ '--delay': '0.2s' } as CSSProperties}><Icon name="crown" className="c-gold" />+{fmt(Number(log.tokens))} tokens</span>
        <span style={{ '--delay': '0.35s' } as CSSProperties}><Icon name="coins" className="c-gold" />+{fmtBig(log.gold)} gold</span>
        {log.voidglass > 0 && (
          <span style={{ '--delay': '0.42s' } as CSSProperties}>
            <Icon name={materialIconName(untieredMaterial('Voidglass').id)} className="c-voidglass" />+{log.voidglass} Voidglass
          </span>
        )}
        {log.xp > 0n && <span style={{ '--delay': '0.5s' } as CSSProperties}><Icon name="star" className="c-ok" />+{fmtBig(log.xp)} XP</span>}
      </div>
      <div className="raid-loot-items">
        {sorted.map((it, i) => {
          const big = rarityRank(it.rarity.tag) >= rarityRank('Legendary');
          return (
            <div key={String(it.id)} className={`loot-drop r-${rarityCls(it.rarity.tag)}${big ? ' big' : ''}`} style={{ '--delay': `${first + i * step}s` } as CSSProperties}>
              <div className="loot-drop-label">{rarityLabel(it.rarity.tag)}{big ? '!' : ''}</div>
              <ItemCard it={it} compact />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function eventLine(e: RaidEvent, names: string[], raid: RaidDef, bossName: (b: number) => string, specialOf: (b: number, at: number) => RaidSignature | undefined): string {
  const b = e.boss ?? 0;
  const boss = short(bossName(b));
  const saved = e.saved?.length ? ` (Second Wind: ${e.saved.map(i => names[i]).join(', ')})` : '';
  if (e.kind === 'phase') {
    const p = raid.phases?.list[e.phase ?? 0];
    return p ? `${boss} turns to the ${p.name}: ${p.defense.toLowerCase()}, now striking with ${p.damageType.toLowerCase()} damage` : `${boss} changes`;
  }
  if (e.kind === 'fall') return `${boss} falls! ${raid.duo ? `${short(bossName(1 - b))} begins to absorb him…` : ''}`;
  if (e.kind === 'empower') {
    const d = raid.duo?.bosses[b];
    return d ? `${short(d.enemy.name)} absorbs his brother: ${d.empowered.name}! ${d.empowered.text}.` : `${boss} empowers`;
  }
  const sg = specialOf(b, e.t);
  if (e.kind === 'aoe') return `${boss} unleashes ${sg?.name ?? 'his special'} on the whole party!${saved}`;
  if (e.kind === 'special') return `${boss}'s ${sg?.name ?? 'special'} crushes ${names[e.target]} for ${fmt(e.damage)}${saved}`;
  if (e.by < 0) {
    if (e.kind === 'dodge') return `${names[e.target]} dodges ${boss}`;
    return `${boss} hits ${names[e.target]} for ${fmt(e.damage)}${saved ? ' (Second Wind!)' : ''}`;
  }
  return `${names[e.by]} ${e.kind === 'crit' ? 'crits' : 'hits'}${raid.duo ? ` ${boss}` : ''} for ${fmt(e.damage)}`;
}
