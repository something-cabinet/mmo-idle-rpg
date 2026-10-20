// Admin mail tools in the Mail view (reducers/mail.ts): compose a System mail with
// pickers instead of a hand-typed gift spec, and see or recall what was sent. Shown only
// to admins; the server checks the role on every call anyway.

import { useState } from 'react';
import { BASE_LIST } from '../../spacetimedb/src/data/bases';
import { COSMETICS, COSMETICS_BY_ID } from '../../spacetimedb/src/data/cosmetics';
import { MATERIALS, MATERIALS_BY_ID } from '../../spacetimedb/src/data/materials';
import { MAX_TIER } from '../../spacetimedb/src/data/stats';
import { CHRONOSHARDS, PHIALS, SUPPLIES } from '../../spacetimedb/src/data/supplies';
import { UNIQUES, UNIQUES_BY_ID } from '../../spacetimedb/src/data/uniques';
import { DEV_RARITIES } from '../../spacetimedb/src/loot';
import { MAX_MAIL_BODY, MAX_MAIL_SUBJECT, parseGift } from '../../spacetimedb/src/mail';
import type { DbConnection } from '../module_bindings';
import { call, useSticky } from '../store';
import { Icon } from './Icon';
import { CardHead } from './shared';

type Kind = 'mat' | 'supply' | 'cosmetic' | 'item' | 'unique';
interface Attachment {
  kind: Kind;
  id: number;
  count: number;
  tier: number;
  rarity: string;
}

const KIND_LABEL: Record<Kind, string> = { mat: 'Material', supply: 'Supply', cosmetic: 'Cosmetic', item: 'Item', unique: 'Unique' };
const COUNTED: Kind[] = ['mat', 'supply', 'item', 'unique'];
const SUPPLY_GROUPS = [
  ['Chronoshards', CHRONOSHARDS],
  ['Elixirs', SUPPLIES],
  ['Phials', PHIALS],
] as const;
const ALL_SUPPLIES = SUPPLY_GROUPS.flatMap(([, list]) => list as readonly { id: number; name: string }[]);
const firstId: Record<Kind, number> = { mat: MATERIALS[0].id, supply: CHRONOSHARDS[0].id, cosmetic: COSMETICS[0].id, item: BASE_LIST[0].id, unique: UNIQUES[0].id };

const baseLabel = (id: number, tier = 1) => {
  const b = BASE_LIST.find(x => x.id === id);
  return b ? (b.id === b.typeId ? b.family : `${b.family} · ${b.name(tier)}`) : `Base ${id}`;
};

function describe(a: Attachment): string {
  const n = a.count > 1 ? `${a.count} × ` : '';
  switch (a.kind) {
    case 'mat': return `${n}${MATERIALS_BY_ID.get(a.id)?.name}`;
    case 'supply': return `${n}${ALL_SUPPLIES.find(s => s.id === a.id)?.name}`;
    case 'cosmetic': return `${COSMETICS_BY_ID.get(a.id)?.name} (cosmetic)`;
    case 'item': return `${n}T${a.tier} ${a.rarity} ${baseLabel(a.id, a.tier)}`;
    case 'unique': return `${n}${UNIQUES_BY_ID.get(a.id)?.name} (unique)`;
  }
}

/** The gift spec `sendMail` takes (mail.ts `parseGift`). */
function giftSpec(gold: string, dust: string, tokens: string, list: Attachment[]): string {
  const parts: string[] = [];
  if (gold) parts.push(`gold:${gold}`);
  if (dust) parts.push(`dust:${dust}`);
  if (tokens) parts.push(`tokens:${tokens}`);
  for (const a of list) {
    if (a.kind === 'mat' || a.kind === 'supply') parts.push(`${a.kind}:${a.id}x${a.count}`);
    else if (a.kind === 'cosmetic') parts.push(`cosmetic:${a.id}`);
    else for (let i = 0; i < a.count; i++) parts.push(a.kind === 'item' ? `item:${a.id}/${a.tier}/${a.rarity}` : `unique:${a.id}`);
  }
  return parts.join(' ');
}

const digits = (v: string) => v.replace(/\D/g, '');

function AttachmentPicker({ onAdd }: { onAdd: (a: Attachment) => void }) {
  const [kind, setKind] = useState<Kind>('supply');
  const [id, setId] = useState(firstId.supply);
  const [count, setCount] = useState('1');
  const [tier, setTier] = useState(1);
  const [rarity, setRarity] = useState('Rare');
  const pickKind = (k: Kind) => {
    setKind(k);
    setId(firstId[k]);
  };
  return (
    <div className="dev-row">
      <label>
        Type
        <select value={kind} onChange={e => pickKind(e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label>
        {KIND_LABEL[kind]}
        <select value={id} onChange={e => setId(Number(e.target.value))}>
          {kind === 'mat' &&
            [...new Set(MATERIALS.map(m => m.tier))].map(t => (
              <optgroup key={t} label={t ? `Tier ${t}` : 'Untiered'}>
                {MATERIALS.filter(m => m.tier === t).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          {kind === 'supply' &&
            SUPPLY_GROUPS.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          {kind === 'cosmetic' && COSMETICS.map(c => <option key={c.id} value={c.id}>{c.name} ({c.slot})</option>)}
          {kind === 'item' && BASE_LIST.map(b => <option key={b.id} value={b.id}>{baseLabel(b.id)}</option>)}
          {kind === 'unique' && UNIQUES.map(u => <option key={u.id} value={u.id}>T{u.tier} {u.name}</option>)}
        </select>
      </label>
      {kind === 'item' && (
        <>
          <label>
            Tier
            <select value={tier} onChange={e => setTier(Number(e.target.value))}>
              {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => <option key={t} value={t}>T{t}</option>)}
            </select>
          </label>
          <label>
            Rarity
            <select value={rarity} onChange={e => setRarity(e.target.value)}>
              {DEV_RARITIES.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
        </>
      )}
      {COUNTED.includes(kind) && (
        <label>Count <input inputMode="numeric" value={count} onChange={e => setCount(digits(e.target.value))} /></label>
      )}
      <button className="btn small" disabled={COUNTED.includes(kind) && !Number(count)} onClick={() => onAdd({ kind, id, count: Math.max(1, Number(count) || 1), tier, rarity })}>
        Add
      </button>
    </div>
  );
}

export function MailCompose({ conn }: { conn: DbConnection }) {
  const [everyone, setEveryone] = useSticky('mailEveryone', false);
  const [names, setNames] = useSticky('mailNames', '');
  const [subject, setSubject] = useSticky('mailSubject', '');
  const [body, setBody] = useSticky('mailBody', '');
  const [days, setDays] = useSticky('mailDays', '30');
  const [gold, setGold] = useSticky('mailGold', '');
  const [dust, setDust] = useSticky('mailDust', '');
  const [tokens, setTokens] = useSticky('mailTokens', '');
  const [list, setList] = useSticky<Attachment[]>('mailList', []);
  const [sending, setSending] = useState(false);

  const to = everyone ? [] : [...new Set(names.split(/[\s,]+/).filter(Boolean))];
  const gift = giftSpec(gold, dust, tokens, list);
  let problem: string | undefined;
  try {
    parseGift(gift);
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  if (!subject.trim()) problem ??= 'Write a subject';
  if (!everyone && !to.length) problem ??= 'Name at least one character, or send to everyone';

  const reset = () => {
    setSubject('');
    setBody('');
    setGold('');
    setDust('');
    setTokens('');
    setList([]);
  };
  const send = () => {
    const who = everyone ? 'EVERY character' : to.join(', ');
    const what = gift ? `\n\nAttachments: ${gift}` : '';
    if (!confirm(`Send "${subject.trim()}" to ${who}?${what}`)) return;
    setSending(true);
    call(
      conn.reducers
        .sendMail({ to, subject, body, gift, days: Number(days) || 0 })
        .then(reset)
        .finally(() => setSending(false)),
      'Mail sent'
    );
  };

  return (
    <div className="card mail-compose">
      <CardHead title="Send System mail"><span className="tag preview">admin</span></CardHead>

      <h4 className="dev-h">To</h4>
      <div className="seg">
        <button className={`seg-btn${!everyone ? ' active' : ''}`} onClick={() => setEveryone(false)}>Characters</button>
        <button className={`seg-btn${everyone ? ' active' : ''}`} onClick={() => setEveryone(true)}>Everyone</button>
      </div>
      {everyone ? (
        <p className="muted hint">Every character that exists now. Characters made later don't get it.</p>
      ) : (
        <input className="mail-input" placeholder="Character names, separated by commas or spaces" value={names} onChange={e => setNames(e.target.value)} />
      )}

      <h4 className="dev-h">Message</h4>
      <input className="mail-input" placeholder="Subject" maxLength={MAX_MAIL_SUBJECT} value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea className="mail-input" placeholder="Message (optional)" rows={5} maxLength={MAX_MAIL_BODY} value={body} onChange={e => setBody(e.target.value)} />

      <h4 className="dev-h">Attachments</h4>
      <div className="dev-row">
        <label>Gold <input inputMode="numeric" value={gold} onChange={e => setGold(digits(e.target.value))} /></label>
        <label>Dust <input inputMode="numeric" value={dust} onChange={e => setDust(digits(e.target.value))} /></label>
        <label>Raid tokens <input inputMode="numeric" value={tokens} onChange={e => setTokens(digits(e.target.value))} /></label>
      </div>
      <AttachmentPicker onAdd={a => setList([...list, a])} />
      {list.length > 0 && (
        <ul className="mail-attach-list">
          {list.map((a, i) => (
            <li key={i}>
              {describe(a)}
              <button className="btn icon ghost" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4 className="dev-h">Expires</h4>
      <div className="dev-row">
        <label>Days (0 = never) <input inputMode="numeric" value={days} onChange={e => setDays(digits(e.target.value))} /></label>
      </div>
      <p className="muted hint">Unclaimed attachments are deleted with the mail when it expires.</p>

      <div className="mail-actions">
        <button className="btn primary" disabled={!!problem || sending} title={problem} onClick={send}>
          <Icon name="mail" />
          {everyone ? 'Send to everyone' : `Send to ${to.length || ''} character${to.length === 1 ? '' : 's'}`}
        </button>
        <button className="btn ghost" onClick={reset}>Clear</button>
        {problem && <span className="muted hint">{problem}</span>}
      </div>
    </div>
  );
}

export function MailSent({ conn }: { conn: DbConnection }) {
  const sent = [...conn.db.adminSentMail.iter()].sort((a, b) => (a.id > b.id ? -1 : 1));
  if (!sent.length) return <div className="card"><p className="muted">Nothing sent yet.</p></div>;
  return (
    <div className="card">
      <CardHead title="Sent mail" />
      <ul className="mail-sent-list">
        {sent.map(m => (
          <li key={String(m.id)}>
            <div>
              <strong>{m.subject}</strong>
              <div className="muted hint">
                #{String(m.id)} · {new Date(Number(m.sentAt.microsSinceUnixEpoch / 1000n)).toLocaleString()} · to{' '}
                {m.to.length ? m.to.join(', ') : 'everyone'} ({m.recipients}){m.recalled ? ` · ${m.recalled} recalled` : ''}
              </div>
              {m.gift && <div className="muted hint">{m.gift}</div>}
            </div>
            <button
              className="btn small ghost"
              title="Delete every copy nobody has claimed yet"
              onClick={() => confirm(`Recall the unclaimed copies of "${m.subject}"?`) && call(conn.reducers.recallMail({ sentMailId: m.id }), 'Recalled')}
            >
              Recall
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
