// Raids (docs/design/raids.md): the raid boss, its rewards, the raid parties, and the
// party's fight replayed from the stored setup (raid.ts). Online only.

import { memo, useEffect, useMemo, useState } from 'react';
import type { RaidMember, RaidParty } from '../../module_bindings/types';
import { combatStats, matchup, type CombatStats } from '../../../spacetimedb/src/combat';
import { RAIDS, RAID_PARTY_SIZE, NPC_POWER, RAID_RARITY_ODDS, type RaidDef } from '../../../spacetimedb/src/data/raids';
import { raidUniques } from '../../../spacetimedb/src/data/uniques';
import { ZONES_BY_ID, bossOf } from '../../../spacetimedb/src/data/zones';
import { RAID_ODDS_SAMPLES, decodeSetup, encodeSetup, lockoutEnd, lockoutStart, npcStats, raidOdds, raidRng, simulateRaid, type RaidEvent, type RaidFighter } from '../../../spacetimedb/src/raid';
import { call } from '../../store';
import { nowMicros } from '../clock';
import { UNKNOWN, uniqueFound } from '../discovery';
import { DefTag, DmgTag } from '../enemy';
import { duration, fmt, fmtBig, pct } from '../format';
import { Icon } from '../Icon';
import { ItemCard } from '../items';
import { CardHead, ViewHeader } from '../shared';
import { gearFor, type Snapshot } from '../snapshot';

/** "1:32". */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const byJoin = (a: RaidMember, b: RaidMember) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1);
const fightingNow = (p: RaidParty) => !!p.fight && !p.fight.finished;

export const RaidsView = memo(function RaidsView({ s }: { s: Snapshot }) {
  return (
    <>
      <ViewHeader title="Raids" icon="crown">
        <span className="chip stat" title="Raid tokens, from raid kills. Traded for rewards later.">
          <Icon name="crown" className="c-gold" />
          <strong>{fmtBig(s.row.raidTokens)}</strong> tokens
        </span>
      </ViewHeader>
      {RAIDS.map(raid => <Raid key={raid.id} s={s} raid={raid} />)}
    </>
  );
});

function Raid({ s, raid }: { s: Snapshot; raid: RaidDef }) {
  const conn = s.conn;
  const zone = ZONES_BY_ID.get(raid.unlockZoneId)!;
  const unlocked = s.killedZones.has(zone.id);
  const boss = raid.boss;
  const parties = [...conn.db.raidParty.iter()].filter(p => p.raidId === raid.id);
  const members = [...conn.db.raidMember.iter()].sort(byJoin);
  const mine = members.find(m => m.characterId === s.row.id);
  const party = mine && parties.find(p => p.id === mine.partyId);
  const now = nowMicros();
  const claimed = [...conn.db.myRaidLog.iter()].some(l => l.raidId === raid.id && l.rewarded && l.startedAt.microsSinceUnixEpoch >= lockoutStart(now));

  return (
    <>
      <div className="card">
        <div className="zone-head">
          <div>
            <h2>{raid.name} <span className="muted">T{raid.tier} · {RAID_PARTY_SIZE} players · online only</span></h2>
            <p className="muted">{raid.blurb}</p>
          </div>
          {!unlocked && <div className="lock-note"><Icon name="lock" />Defeat {bossOf(zone)?.name} to unlock</div>}
        </div>
        <div className="raid-boss">
          <div className="foe-name"><Icon name="skull" className="boss" />{boss.name}</div>
          <div className="tags">
            <span className="tag">Lv {boss.level}</span>
            <DmgTag magic={boss.damageType === 'Magic'} />
            <DefTag defense={boss.defense} />
          </div>
          <ul className="raid-facts muted">
            <li>HP {fmt(boss.hp)} · DPS {fmt(boss.dps)}, against whoever has the most <strong>threat</strong></li>
            <li>{raid.aoe.name}: {fmt(raid.aoe.damage)} {raid.aoe.damageType.toLowerCase()} damage to everyone every {raid.aoe.every} s (can't be dodged)</li>
            <li>Enrages after {clock(raid.enrageSeconds)}: the party wipes</li>
          </ul>
        </div>
        <div className="raid-rewards">
          <h3>Rewards <span className="muted">each player, once a day (resets 00:00 UTC)</span></h3>
          <ul>
            <li>
              One T{raid.tier} item, <span className="c-epic">Epic</span> or better: <span className="c-legendary">Legendary</span> {pct(RAID_RARITY_ODDS.Legendary)},{' '}
              <span className="c-unique">Unique</span> {pct(RAID_RARITY_ODDS.Unique)} from its own pool:{' '}
              {raidUniques(raid.id).map((u, i) => (
                <span key={u.id}>{i > 0 && ', '}<span className={uniqueFound(s, u) ? 'c-unique' : 'muted'}>{uniqueFound(s, u) ? u.name : UNKNOWN}</span></span>
              ))}
            </li>
            <li>{raid.tokens} raid tokens · {fmt(boss.gold)} gold · {fmt(boss.xp)} XP</li>
          </ul>
          <p className={claimed ? 'muted' : 'c-ok'}>
            {claimed ? `Today's reward claimed. Resets in ${duration(lockoutEnd(now) - now)}: you can still fight to help others.` : "Today's reward is waiting."}
          </p>
        </div>
      </div>

      {unlocked && (party ? (
        <PartyPanel s={s} raid={raid} party={party} members={members.filter(m => m.partyId === party.id)} />
      ) : (
        <div className="card">
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
        </div>
      ))}
    </>
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

  // Every member's stats as the server would take them at the start (yours projected to now).
  const players = members.map((m): RaidFighter | undefined => {
    if (m.characterId === me) return { characterId: me, name: m.name, stats: s.stats };
    const ch = chars.get(m.characterId);
    const lo = loadouts.get(m.characterId);
    return ch && lo && { characterId: ch.id, name: m.name, stats: combatStats(ch.level, gearFor(lo.slots, items)) };
  });
  const known = players.every(p => p) ? (players as RaidFighter[]) : undefined;
  const npc = known && party.hired > 0 ? npcStats(known.map(p => p.stats), raid) : undefined;
  const setup = known && { raidId: raid.id, fighters: [...known, ...Array.from({ length: party.hired }, (_, i) => ({ characterId: 0n, name: `Hireling ${i + 1}`, stats: npc! }))] };
  const key = setup && encodeSetup(setup);
  const odds = useMemo(() => (key ? raidOdds(decodeSetup(key), raid, party.id) : undefined), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key is the setup
  const target = setup?.fighters.reduce((m, f, i) => (f.stats.threat > setup.fighters[m].stats.threat ? i : m), 0);

  const offline = members.filter(m => !online.has(m.characterId));
  const cost = BigInt(party.hired) * BigInt(raid.hireCost);
  const empty = RAID_PARTY_SIZE - members.length - party.hired;
  const startBlock = fighting ? 'The fight is on'
    : offline.length ? `${offline.map(m => m.name).join(', ')} offline`
    : s.gold < cost ? `Need ${fmtBig(cost - s.gold)} more gold to hire` : undefined;
  const leader = members.find(m => m.characterId === party.leaderId);

  const seat = (stats: CombatStats | undefined, i: number) =>
    stats && (
      <div className="raid-seat-stats muted">
        HP {fmt(stats.maxHp)} · DPS {fmt(matchup(stats, raid.boss).dps)} · Threat {pct(stats.threat)}
        {stats.sources[0]?.heal ? ` · Heals ${stats.sources[0].healAll ? 'all' : 'one'}` : ''}
        {i === target && <span className="tag raid-target" title="Most threat: the boss attacks this seat"><Icon name="shield" />Boss target</span>}
      </div>
    );

  return (
    <div className="card">
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
              <strong>{m.name}</strong>
              <span className="muted">Lv {m.characterId === me ? s.level : (chars.get(m.characterId)?.level ?? '?')}</span>
              {!online.has(m.characterId) && <span className="tag">Offline</span>}
              {leading && m.characterId !== me && !fighting && (
                <button className="btn icon ghost small" title={`Remove ${m.name}`} onClick={() => call(conn.reducers.kickFromRaid({ characterId: m.characterId }))}>
                  <Icon name="x" />
                </button>
              )}
            </div>
            {seat(players[i]?.stats, i)}
          </div>
        ))}
        {Array.from({ length: party.hired }, (_, i) => (
          <div key={`npc${i}`} className="raid-seat npc">
            <div className="raid-seat-name">
              <strong>Hireling {i + 1}</strong>
              <span className="muted">NPC, {NPC_POWER}× the party's average</span>
              {leading && !fighting && (
                <button className="btn icon ghost small" title="Dismiss" onClick={() => call(conn.reducers.setRaidHires({ count: party.hired - 1 }))}>
                  <Icon name="x" />
                </button>
              )}
            </div>
            {seat(npc, members.length + i)}
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

      {odds !== undefined && !fighting && (
        <div className="duel-odds" title={`${RAID_ODDS_SAMPLES} simulated fights with this party`}>
          <span>Win odds</span>
          <div className="duel-odds-bar"><div style={{ width: `${odds * 100}%` }} /></div>
          <strong>{pct(odds)}</strong>
        </div>
      )}

      {!fighting && (
        <div className="row raid-actions">
          {leading ? (
            <button className="btn primary" disabled={!!startBlock} title={startBlock} onClick={() => call(conn.reducers.startRaid({}))}>
              <Icon name="swords" />
              Start the raid{cost > 0n ? ` · ${fmtBig(cost)} gold` : ''}
            </button>
          ) : (
            <span className="muted">Waiting for {leader?.name ?? 'the leader'} to start.</span>
          )}
          {startBlock && leading && <span className="muted">{startBlock}</span>}
        </div>
      )}
      <p className="muted hint">
        Everyone fights with their current level and active loadout. The boss attacks whoever has the most threat (Vitality and
        Threat raise it), so bring a tank; heals land on allies. Hired NPCs have {NPC_POWER}× the stats of the party's average player,
        paid by the leader at the start.
      </p>

      {party.fight && <RaidFight key={String(party.fight.startedAt.microsSinceUnixEpoch)} s={s} raid={raid} party={party} />}
    </div>
  );
}

/** The party's latest fight, replayed in step with the server's clock; then its result and your reward. */
function RaidFight({ s, raid, party }: { s: Snapshot; raid: RaidDef; party: RaidParty }) {
  const fight = party.fight!;
  const start = fight.startedAt.microsSinceUnixEpoch;
  const setup = useMemo(() => decodeSetup(fight.setup), [fight.setup]);
  const result = useMemo(() => simulateRaid(setup, raid, raidRng(party.id, start)), [setup, raid, party.id, start]);
  const elapsed = () => Number(nowMicros() - start) / 1e6;
  const [t, setT] = useState(elapsed);
  useEffect(() => {
    if (t >= result.end) return;
    const timer = window.setInterval(() => setT(elapsed()), 200);
    return () => window.clearInterval(timer);
  }, [result.end]); // eslint-disable-line react-hooks/exhaustive-deps -- runs until the end

  const live = t < result.end;
  const shown = live ? result.events.filter(e => e.t <= t) : result.events;
  const last = shown.at(-1);
  const hp = last?.hp ?? result.maxHp;
  const bossHp = last?.bossHp ?? raid.boss.hp;
  const names = setup.fighters.map(f => f.name);
  const log = [...s.conn.db.myRaidLog.iter()].find(l => l.partyId === party.id && l.startedAt.microsSinceUnixEpoch === start);
  const loot = log && log.itemId !== 0n ? s.items.get(log.itemId) : undefined;

  return (
    <div className="raid-fight">
      <div className="raid-boss-bar">
        <div className="duelist-name"><Icon name="skull" className="boss" />{raid.boss.name}</div>
        <div className="hpbar enemy">
          <div className="hp-fill" style={{ width: `${(bossHp / raid.boss.hp) * 100}%` }} />
          <span className="hp-text">{fmt(bossHp)} / {fmt(raid.boss.hp)}</span>
        </div>
      </div>
      <div className="raid-party-bars">
        {names.map((name, i) => (
          <div key={i} className={`duelist${hp[i] <= 0 ? ' lost' : ''}`}>
            <div className="duelist-name">{name}{setup.fighters[i].characterId === s.row.id ? ' (you)' : ''}</div>
            <div className="hpbar">
              <div className="hp-fill" style={{ width: `${(hp[i] / result.maxHp[i]) * 100}%` }} />
              <span className="hp-text">{fmt(hp[i])} / {fmt(result.maxHp[i])}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="duel-status">
        {live ? (
          <span className="muted">{clock(t)} · enrage at {clock(raid.enrageSeconds)}</span>
        ) : (
          <strong className={fight.won ? 'c-ok' : 'c-bad'}>
            {fight.won ? `Victory! ${raid.boss.name} falls at ${clock(result.end)}.` : result.enraged ? `${raid.boss.name} enrages: the party wipes.` : `The party wipes at ${clock(result.end)}.`}
          </strong>
        )}
      </div>
      {live && (
        <ul className="duel-log">
          {shown.slice(-6).reverse().map((e, i) => (
            <li key={shown.length - i} className={`${e.by < 0 ? 'theirs' : 'mine'}${e.kind === 'crit' ? ' crit' : ''}`}>{eventLine(e, names, raid)}</li>
          ))}
        </ul>
      )}
      {!live && fight.won && (
        log ? (
          log.rewarded ? (
            <div className="raid-loot">
              <span>Your reward: {fmt(Number(log.tokens))} tokens · {fmtBig(log.gold)} gold · {fmtBig(log.xp)} XP</span>
              {loot && <ItemCard it={loot} compact />}
            </div>
          ) : (
            <p className="muted">You already claimed today's reward: nothing this time.</p>
          )
        ) : setup.fighters.some(f => f.characterId === s.row.id) ? (
          <p className="muted">Collecting the loot…</p>
        ) : null
      )}
    </div>
  );
}

function eventLine(e: RaidEvent, names: string[], raid: RaidDef): string {
  const boss = raid.boss.name.split(',')[0];
  if (e.kind === 'aoe') return `${boss} breathes ${raid.aoe.name}!${e.saved?.length ? ` (Second Wind: ${e.saved.map(i => names[i]).join(', ')})` : ''}`;
  if (e.by < 0) {
    if (e.kind === 'dodge') return `${names[e.target]} dodges ${boss}`;
    return `${boss} hits ${names[e.target]} for ${fmt(e.damage)}${e.saved?.length ? ' (Second Wind!)' : ''}`;
  }
  return `${names[e.by]} ${e.kind === 'crit' ? 'crits' : 'hits'} for ${fmt(e.damage)}`;
}
