// "While you were away" (ui.md): shown once per login, from the login settle's log row.

import { useEffect, useState } from 'react';
import type { Presence, SettleLog } from '../module_bindings/types';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { MAX_OFFLINE_MICROS } from '../../spacetimedb/src/game';
import { RARITIES } from '../../spacetimedb/src/loot';
import { duration, fmtBig } from './format';
import { itemName, rarityCls } from './items';
import { CardHead, Modal } from './shared';
import type { Snapshot } from './snapshot';

/** Shorter absences (a reload) don't get a report. */
const MIN_AWAY_MICROS = 60_000_000n;
let shownFor: bigint | undefined;

export function AwayReport({ s, pres }: { s: Snapshot; pres: Presence }) {
  const [log, setLog] = useState<SettleLog>();
  useEffect(() => {
    if (shownFor === pres.since.microsSinceUnixEpoch) return;
    // The login settle runs in the same transaction that inserts our presence row.
    const l = s.logs.find(l => l.offline && l.at.microsSinceUnixEpoch === pres.since.microsSinceUnixEpoch);
    if (!l) return;
    shownFor = pres.since.microsSinceUnixEpoch;
    if (l.elapsedMicros >= MIN_AWAY_MICROS) setLog(l);
  }, [s, pres]);
  if (!log) return null;

  const close = () => setLog(undefined);
  const enemy = ENEMIES_BY_ID.get(log.enemyId)?.enemy;
  const kept = log.keptItemIds.map(id => s.items.get(id)).filter(it => it !== undefined);
  const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
  return (
    <Modal onClose={close}>
      <CardHead title={`While you were away (${duration(log.elapsedMicros)})`} />
      {log.capped && <p className="muted">Offline progress is capped at {duration(MAX_OFFLINE_MICROS)}.</p>}
      {!enemy ? (
        <p>No target: pick an enemy on the Zones screen.</p>
      ) : log.kills > 0 ? (
        <p><strong>{enemy.name}</strong> × {log.kills.toLocaleString()} kills</p>
      ) : log.viable ? (
        <p>0 kills of {enemy.name}.</p>
      ) : (
        <p className="c-bad">0 kills: your build loses to {enemy.name}.</p>
      )}
      {log.xp > 0n && (
        <p>+{fmtBig(log.xp)} XP{log.levelTo > log.levelFrom ? ` · Level ${log.levelFrom} → ${log.levelTo}` : ''}</p>
      )}
      {(log.gold > 0n || log.essence > 0n) && (
        <p>
          {log.gold > 0n && <span className="c-gold">+{fmtBig(log.gold)} gold</span>}
          {log.gold > 0n && log.essence > 0n && ' · '}
          {log.essence > 0n && <span className="c-essence">+{fmtBig(log.essence)} Essence</span>}
        </p>
      )}
      {kept.length > 0 && (
        <p>
          Items kept ({kept.length}):{' '}
          {kept.map((it, i) => (
            <span key={String(it.id)}>
              {i > 0 && ', '}
              <span className={`c-${rarityCls(it.rarity.tag)}`}>{it.rarity.tag} {itemName(it)}</span>
            </span>
          ))}
        </p>
      )}
      {salvaged.length > 0 && <p className="muted">Salvaged: {salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</p>}
      {log.overflow > 0 && <p className="c-bad">⚠ Bag full: {log.overflow} kept items were salvaged.</p>}
      <div className="row">
        {kept.length ? <a className="btn small ghost" href="#bag" onClick={close}>View in bag</a> : <span />}
        <button className="btn primary small" onClick={close}>OK</button>
      </div>
    </Modal>
  );
}
