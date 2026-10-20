// Mailbox (reducers/mail.ts): messages from the game, with attachments to claim.
// Opening a mail marks it read; attached items wait in escrow until claimed.

import { useEffect } from 'react';
import type { DbConnection } from '../../module_bindings';
import type { Mail } from '../../module_bindings/types';
import { COSMETICS_BY_ID } from '../../../spacetimedb/src/data/cosmetics';
import { CHRONOSHARDS_BY_ID, PHIALS_BY_ID, SUPPLIES_BY_ID } from '../../../spacetimedb/src/data/supplies';
import { hasAttachments } from '../../../spacetimedb/src/mail';
import { call, useSticky } from '../../store';
import { nowMicros } from '../clock';
import { duration, fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemCard, materialIconName, materialName } from '../items';
import { CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { MailCompose, MailSent } from '../MailAdmin';

/** The mail still shown: not expired (the server deletes expired mail on the next login). */
export function liveMail(conn: DbConnection): Mail[] {
  const now = nowMicros();
  return [...conn.db.myMail.iter()]
    .filter(m => !m.expiresAt || m.expiresAt.microsSinceUnixEpoch > now)
    .sort((a, b) => (a.id > b.id ? -1 : 1));
}

const when = (m: Mail) => new Date(Number(m.sentAt.microsSinceUnixEpoch / 1000n)).toLocaleString();

function Attachments({ s, m }: { s: Snapshot; m: Mail }) {
  const items = new Map([...s.conn.db.myMailItems.iter()].map(it => [it.id, it]));
  const rows: [string, string, string][] = [];
  if (m.gold > 0n) rows.push(['coins', 'c-gold', `${fmtBig(m.gold)} gold`]);
  if (m.dust > 0n) rows.push(['gem', 'c-dust', `${fmtBig(m.dust)} Dust`]);
  if (m.raidTokens > 0n) rows.push(['crown', 'c-gold', `${fmtBig(m.raidTokens)} raid tokens`]);
  for (const x of m.materials) rows.push([materialIconName(x.materialId), 'c-material', `${x.count.toLocaleString()} × ${materialName(x.materialId)}`]);
  for (const x of m.supplies) {
    const name = SUPPLIES_BY_ID.get(x.supplyId)?.name ?? PHIALS_BY_ID.get(x.supplyId)?.name ?? CHRONOSHARDS_BY_ID.get(x.supplyId)?.name ?? `Supply ${x.supplyId}`;
    rows.push(['flask', 'c-material', `${x.count.toLocaleString()} × ${name}`]);
  }
  for (const id of m.cosmetics) {
    const c = COSMETICS_BY_ID.get(id);
    rows.push(['sparkles', 'c-magic', c ? `${c.name} (${c.slot === 'plate' ? 'nameplate' : c.slot === 'visual' ? 'name effect' : 'title'})` : `Cosmetic ${id}`]);
  }
  const claimable = hasAttachments(m);
  return (
    <div className={`mail-gifts${claimable ? '' : ' claimed'}`}>
      {rows.map(([icon, cls, text]) => (
        <div key={text} className="mail-gift">
          <Icon name={icon} className={cls} />
          {text}
        </div>
      ))}
      {!m.claimed &&
        m.itemIds.map(id => {
          const it = items.get(id);
          return it ? <ItemCard key={String(id)} it={it} compact /> : null;
        })}
      {m.claimed && m.itemIds.length > 0 && <div className="mail-gift muted">{m.itemIds.length} item{m.itemIds.length > 1 ? 's' : ''} (in your bag)</div>}
    </div>
  );
}

function Letter({ s, m }: { s: Snapshot; m: Mail }) {
  const r = s.conn.reducers;
  const claimable = hasAttachments(m);
  const hadGifts = claimable || m.claimed;
  const left = m.expiresAt && m.expiresAt.microsSinceUnixEpoch - nowMicros();
  useEffect(() => {
    if (!m.read) call(r.readMail({ mailId: m.id }));
  }, [m.id, m.read, r]);
  return (
    <div className="card mail-letter">
      <CardHead title={m.subject}>
        <span className="muted">{when(m)}</span>
      </CardHead>
      <div className="mail-from muted">
        From <strong>{m.senderName}</strong>
        {left !== undefined && claimable && <> · expires in {duration(left)}</>}
      </div>
      {m.body && <p className="mail-body">{m.body}</p>}
      {hadGifts && (
        <>
          <h4 className="mail-h">{m.claimed ? 'Claimed' : 'Attached'}</h4>
          <Attachments s={s} m={m} />
        </>
      )}
      <div className="mail-actions">
        {claimable && (
          <button className="btn primary" onClick={() => call(r.claimMail({ mailId: m.id }), 'Claimed')}>
            <Icon name="bag" />
            Claim
          </button>
        )}
        <button
          className="btn ghost"
          disabled={claimable}
          title={claimable ? 'Claim the attachments first' : 'Delete this mail'}
          onClick={() => call(r.deleteMailMessage({ mailId: m.id }))}
        >
          <Icon name="x" />
          Delete
        </button>
      </div>
    </div>
  );
}

export function MailView({ s }: { s: Snapshot }) {
  const mails = liveMail(s.conn);
  const [selected, setSelected] = useSticky<bigint | undefined>('mailSelected', undefined);
  const open = mails.find(m => m.id === selected) ?? mails[0];
  const anyRead = mails.some(m => m.read && !hasAttachments(m));
  const admin = [...s.conn.db.myAccount.iter()][0]?.role.tag === 'Admin';
  const [tab, setTab] = useSticky<'inbox' | 'compose' | 'sent'>('mailTab', 'inbox');
  const shown = admin ? tab : 'inbox';
  return (
    <>
      <ViewHeader title="Mail" icon="mail">
        {shown === 'inbox' && anyRead && (
          <button className="btn small ghost" onClick={() => call(s.conn.reducers.deleteReadMail({}), 'Read mail deleted')}>
            Delete read mail
          </button>
        )}
      </ViewHeader>
      {admin && (
        <div className="seg">
          <button className={`seg-btn${shown === 'inbox' ? ' active' : ''}`} onClick={() => setTab('inbox')}>Inbox</button>
          <button className={`seg-btn${shown === 'compose' ? ' active' : ''}`} onClick={() => setTab('compose')}>Compose</button>
          <button className={`seg-btn${shown === 'sent' ? ' active' : ''}`} onClick={() => setTab('sent')}>Sent</button>
        </div>
      )}
      {shown === 'compose' ? (
        <MailCompose conn={s.conn} />
      ) : shown === 'sent' ? (
        <MailSent conn={s.conn} />
      ) : mails.length === 0 ? (
        <div className="card">
          <p className="muted">No mail. Messages and gifts from the game show up here.</p>
        </div>
      ) : (
        <div className="mail-layout">
          <ul className="card mail-list">
            {mails.map(m => (
              <li key={String(m.id)}>
                <button className={`mail-row${m.id === open?.id ? ' active' : ''}${m.read ? '' : ' unread-mail'}`} onClick={() => setSelected(m.id)}>
                  <span className="mail-row-subject">
                    {!m.read && <span className="dot ok" />}
                    {m.subject}
                    {hasAttachments(m) && <Icon name="star" className="c-gold" />}
                  </span>
                  <span className="muted mail-row-meta">{m.senderName} · {when(m)}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && <Letter key={String(open.id)} s={s} m={open} />}
        </div>
      )}
    </>
  );
}
