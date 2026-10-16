// "While you were away" (ui.md): shown once per login, from the login settle's log row.

import { useEffect, useState } from 'react';
import type { Presence, SettleLog } from '../module_bindings/types';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { RESPAWN_SECONDS } from '../../spacetimedb/src/sim';
import { SKILLS_BY_ID } from '../../spacetimedb/src/data/skills';
import { recipeOf } from '../../spacetimedb/src/data/recipes';
import { SUPPLIES_BY_ID } from '../../spacetimedb/src/data/supplies';
import { offlineCapMicros } from '../../spacetimedb/src/game';
import { RARITIES } from '../../spacetimedb/src/loot';
import { duration, fmtBig } from './format';
import { materialsText, rarityCls, rarityLabel } from './items';
import { Icon } from './Icon';
import { foundName } from './discovery';
import { encounterText } from './encounters';
import { CardHead, Modal } from './shared';
import type { Snapshot } from './snapshot';

/** Shorter absences (a reload) don't get a report. */
const MIN_AWAY_MICROS = 60_000_000n;
let shownFor: bigint | undefined;

/** A life skill's line: gathering actions, or what a production queue made, and the inputs it used. */
function SkillLine({ l, salvage }: { l: SettleLog; /** Show what the keep rule salvaged (the report's own lines cover the last settle). */ salvage?: boolean }) {
  const skill = SKILLS_BY_ID.get(l.skillId);
  const r = recipeOf(l.skillId, l.recipe);
  const name = r?.name;
  const scrappedCount = (l.scrapped ?? []).reduce((a, b) => a + b, 0);
  return (
    <>
      <p>
        <strong>{skill?.name}</strong> × {l.actions.toLocaleString()} {name ?? 'actions'} · +{fmtBig(l.skillXp)} XP
        {l.skillLevelTo > l.skillLevelFrom ? ` · Level ${l.skillLevelFrom} → ${l.skillLevelTo}` : ''}
      </p>
      {l.used.length > 0 && <p className="muted">Used: {materialsText(l.used)}</p>}
      {l.recipe !== 0 && r?.output.kind !== 'item' && l.materials.length > 0 && <p className="muted">Made: {materialsText(l.materials)}</p>}
      {salvage && l.salvaged.some(n => n > 0) && (
        <p className="muted">Salvaged by the keep rule: {l.salvaged.reduce((a, b) => a + b, 0)} (+{fmtBig(l.dust)} Dust, +{fmtBig(l.gold)} gold)</p>
      )}
      {salvage && scrappedCount > 0 && (
        <p className="muted">Recycled by the keep rule: {scrappedCount}{r?.output.kind === 'item' && l.materials.length > 0 && ` (+${materialsText(l.materials)})`}</p>
      )}
    </>
  );
}

export function AwayReport({ s, pres }: { s: Snapshot; pres: Presence }) {
  // Newest first: a production queue that ran out logs its part, then combat logs the rest.
  const [logs, setLogs] = useState<SettleLog[]>();
  useEffect(() => {
    if (shownFor === pres.since.microsSinceUnixEpoch) return;
    // The login settle runs in the same transaction that inserts our presence row.
    const ls = s.logs.filter(l => l.offline && l.at.microsSinceUnixEpoch === pres.since.microsSinceUnixEpoch);
    if (!ls.length) return;
    shownFor = pres.since.microsSinceUnixEpoch;
    if (ls.reduce((sum, l) => sum + l.elapsedMicros, 0n) >= MIN_AWAY_MICROS) setLogs(ls);
  }, [s, pres]);
  if (!logs) return null;

  const close = () => setLogs(undefined);
  const log = logs[0];
  const queues = logs.slice(1).reverse();
  const elapsed = logs.reduce((sum, l) => sum + l.elapsedMicros, 0n);
  const xp = logs.reduce((sum, l) => sum + l.xp, 0n);
  const levelFrom = logs[logs.length - 1].levelFrom;
  const enemy = ENEMIES_BY_ID.get(log.enemyId)?.enemy;
  const skill = SKILLS_BY_ID.get(log.skillId);
  const elixir = SUPPLIES_BY_ID.get(log.elixirId);
  const discovered = logs.flatMap(l => l.discovered);
  const kept = logs.flatMap(l => l.keptItemIds).map(id => s.items.get(id)).filter(it => it !== undefined);
  // Counts per rarity, highest first, so a big haul stays one line.
  const keptByRarity = [...RARITIES].reverse()
    .map(r => [r, kept.filter(it => it.rarity.tag === r).length] as const)
    .filter(([, n]) => n > 0);
  // Identical encounters (same goblin gold, same stash) share a line, in first-met order.
  const encounterCounts = new Map<string, number>();
  for (const e of log.encounters) {
    const text = encounterText(e, log.enemyId, id => s.items.get(id));
    encounterCounts.set(text, (encounterCounts.get(text) ?? 0) + 1);
  }
  const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
  const scrapped = RARITIES.map((r, i) => [r, log.scrapped[i] ?? 0] as const).filter(([, n]) => n > 0);
  return (
    <Modal onClose={close}>
      <CardHead title={`While you were away (${duration(elapsed)})`} />
      {log.capped && <p className="muted">Offline progress is capped at {duration(offlineCapMicros(s.stats))}.</p>}
      {queues.map(q => <SkillLine key={String(q.id)} l={q} salvage />)}
      {queues.length > 0 && <p className="muted">The queue ran out, then:</p>}
      {skill ? (
        <SkillLine l={log} />
      ) : !enemy ? (
        <p>You were idle: no target. Pick an enemy on the Zones screen.</p>
      ) : log.kills > 0 ? (
        <p><strong>{enemy.name}</strong> × {log.kills.toLocaleString()} kills</p>
      ) : (
        !log.defeated && <p>0 kills of {enemy.name}.</p>
      )}
      {enemy && !skill && log.respawns > 0 && (
        <p className="muted">
          Defeated about {log.respawns.toLocaleString()}× by bad luck, back up each time after {RESPAWN_SECONDS} s.
        </p>
      )}
      {enemy && log.defeated && (
        <p className="c-bad">
          <strong>{enemy.name}</strong> killed you. You spent the last {duration(log.idleMicros)} idle: plan your fights before you leave.
        </p>
      )}
      {elixir && (
        <p>
          <Icon name="flask" className="c-material" />
          {elixir.name} T{elixir.tier}: {log.elixirKills.toLocaleString()} kills
          {log.elixirsUsed > 0 && `, ${log.elixirsUsed} more taken from stock`}
          {log.elixirEmpty && <span className="c-bad"> · ran out: the slot is empty</span>}
        </p>
      )}
      {xp > 0n && (
        <p>+{fmtBig(xp)} XP{log.levelTo > levelFrom ? ` · Level ${levelFrom} → ${log.levelTo}` : ''}</p>
      )}
      {(log.gold > 0n || log.dust > 0n) && (
        <p>
          {log.gold > 0n && <span className="c-gold">+{fmtBig(log.gold)} gold</span>}
          {log.gold > 0n && log.dust > 0n && ' · '}
          {log.dust > 0n && <span className="c-dust">+{fmtBig(log.dust)} Dust</span>}
        </p>
      )}
      {log.encounters.length > 0 && (
        <div className="encounter">
          <p><Icon name="zap" />Encounters ({log.encounters.length}):</p>
          <ul className="encounter-list">
            {[...encounterCounts].map(([text, n]) => <li key={text}>{text}{n > 1 && <span className="muted"> ×{n}</span>}</li>)}
          </ul>
        </div>
      )}
      {discovered.length > 0 && (
        <p className="discovery"><Icon name="sparkles" />New discoveries: {discovered.map(foundName).join(', ')}</p>
      )}
      {log.materials.length > 0 && <p>Materials: <span className="c-material">{materialsText(log.materials)}</span></p>}
      {kept.length > 0 && (
        <p>
          Items kept ({kept.length}):{' '}
          {keptByRarity.map(([r, n], i) => (
            <span key={r}>
              {i > 0 && ', '}
              <span className={`c-${rarityCls(r)}`}>{n}× {rarityLabel(r)}</span>
            </span>
          ))}
        </p>
      )}
      {salvaged.length > 0 && <p className="muted">Salvaged: {salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</p>}
      {scrapped.length > 0 && <p className="muted">Recycled: {scrapped.map(([r, n]) => `${n} ${r}`).join(', ')}</p>}
      {log.overflow > 0 && <p className="c-bad">⚠ Bag full: {log.overflow} kept items were salvaged.</p>}
      <div className="row">
        {kept.length ? <a className="btn small ghost" href="#bag" onClick={close}>View in bag</a> : <span />}
        <button className="btn primary small" onClick={close}>OK</button>
      </div>
    </Modal>
  );
}
