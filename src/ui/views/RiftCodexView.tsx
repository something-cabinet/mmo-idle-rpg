// The Rift Codex: the boons, Rift effects and ethereal bases the player has seen in the Shifting Rift.

import { memo } from 'react';
import { BOONS_BY_ID, RIFT_EFFECTS, RIFT_EFFECTS_BY_ID, boonText, type BoonDef } from '../../../spacetimedb/src/data/rift';
import { base } from '../../../spacetimedb/src/data/bases';
import { CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { boonLabel } from './RiftView';

export const RiftCodexView = memo(function RiftCodexView({ s }: { s: Snapshot }) {
  const rows = [...s.conn.db.myRiftCodex.iter()];
  const of = (kind: number) => rows.filter(r => r.kind === kind).map(r => r.entryId);
  const boons = of(1).map(id => BOONS_BY_ID.get(id)).filter(Boolean) as BoonDef[];
  const effects = of(3).map(id => RIFT_EFFECTS_BY_ID.get(id)).filter(Boolean);
  const bases = of(2);
  return (
    <>
      <ViewHeader title="Rift codex" icon="sparkles" />
      <section className="card rift-codex">
        <CardHead title="Rift Codex"><span className="muted">What you've seen in the Rift</span></CardHead>
        {!rows.length && <p className="muted">Nothing yet: boons, Rift effects and ethereal bases appear here once you meet them in the Shifting Rift.</p>}
        <h3>Boons <span className="muted">{boons.length} / {BOONS_BY_ID.size}</span></h3>
        <div className="rift-chips">{boons.sort((a, b) => a.id - b.id).map(b => <span key={b.id} className="tag" title={boonText(b)}>{boonLabel(b)}</span>)}</div>
        <h3>Rift effects <span className="muted">{effects.length} / {RIFT_EFFECTS.length}</span></h3>
        <div className="rift-chips">{effects.map(e => <span key={e!.id} className="tag c-rift" title={e!.text}>{e!.name}</span>)}</div>
        <h3>Ethereal bases <span className="muted">{bases.length}</span></h3>
        <div className="rift-chips">{bases.map(id => <span key={id} className="tag">{base(id).name(5)}</span>)}</div>
      </section>
    </>
  );
});
