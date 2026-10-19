// "What's new": pops up once per changelog entry the player hasn't read, and opens from the
// version link in the sidebar footer for the full history.

import { useState } from 'react';
import type { DbConnection } from '../module_bindings';
import { CHANGELOG, LATEST_VERSION, unseenEntries, type ChangeTag, type ChangelogEntry } from '../changelog';
import { call } from '../store';
import { CardHead, Modal } from './shared';

const TAG_LABEL: Record<ChangeTag, string> = { new: 'New', balance: 'Balance', fix: 'Fix' };

const dateText = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

function Entries({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="changelog">
      {entries.map(e => (
        <section key={e.version}>
          <h4>
            {dateText(e.date)} <span className="muted" title="Version">v{e.version}</span>
          </h4>
          <p><strong>{e.title}</strong></p>
          <ul>
            {e.changes.map(c => (
              <li key={c.text}>
                <span className={`change-tag tag-${c.tag}`}>{TAG_LABEL[c.tag]}</span>
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The full changelog, opened on demand. */
export function ChangelogPopup({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <CardHead title="What's new" />
      <Entries entries={CHANGELOG} />
      <div className="row">
        <span />
        <button className="btn primary small" onClick={onClose}>OK</button>
      </div>
    </Modal>
  );
}

/** Pops up on login with the entries the account hasn't read; closing it marks them read. */
export function WhatsNew({ conn }: { conn: DbConnection }) {
  const account = [...conn.db.myAccount.iter()][0];
  // Read once: marking them seen updates the account row, which shouldn't empty the open popup.
  const [entries] = useState(() => (account ? unseenEntries(account.changelogSeen) : []));
  const [open, setOpen] = useState(entries.length > 0);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    call(conn.reducers.seeChangelog({ version: LATEST_VERSION }));
  };
  return (
    <Modal onClose={close}>
      <CardHead title="What's new since you were last here" />
      <Entries entries={entries} />
      <div className="row">
        <span />
        <button className="btn primary small" onClick={close}>OK</button>
      </div>
    </Modal>
  );
}
