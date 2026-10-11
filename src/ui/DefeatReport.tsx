// "Defeated" popup for a defeat while playing (a lost fight or boss challenge). Defeats
// while away are in the away report instead.

import { useEffect, useState } from 'react';
import type { Presence, SettleLog } from '../module_bindings/types';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { CardHead, Modal } from './shared';
import type { Snapshot } from './snapshot';

const shown = new Set<bigint>();

export function DefeatReport({ s, pres }: { s: Snapshot; pres: Presence }) {
  const [log, setLog] = useState<SettleLog>();
  useEffect(() => {
    const l = s.logs.find(l => l.defeated && !l.offline && l.at.microsSinceUnixEpoch >= pres.since.microsSinceUnixEpoch && !shown.has(l.id));
    if (!l) return;
    shown.add(l.id);
    setLog(l);
  }, [s, pres]);
  if (!log) return null;

  const close = () => setLog(undefined);
  const enemy = ENEMIES_BY_ID.get(log.enemyId)?.enemy;
  return (
    <Modal onClose={close}>
      <CardHead title={<span className="c-bad">Defeated</span>} />
      <p>
        <strong>{enemy?.name ?? 'The enemy'}</strong> killed you{log.kills > 0 ? ` after ${log.kills.toLocaleString()} kills` : ''}.
      </p>
      <p className="muted">You're idle now: no XP, gold or drops until you pick a target. Improve your gear, level up elsewhere, or choose a weaker enemy.</p>
      <div className="row">
        <a className="btn small ghost" href="#zones" onClick={close}>Zones</a>
        <button className="btn primary small" onClick={close}>OK</button>
      </div>
    </Modal>
  );
}
