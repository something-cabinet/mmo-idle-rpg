import { useState } from 'react';
import { bumpVersion } from '../../store';
import { getNumberFormat, setNumberFormat, type NumberFormat } from '../format';
import { setTheme, useTheme, type ThemePref } from '../theme';
import { AccountControls, CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { floatsOn, setFloats } from '../fight';

export function SettingsView({ s }: { s: Snapshot }) {
  const { pref } = useTheme();
  const [floats, setFloatsState] = useState(floatsOn);
  const [numbers, setNumbers] = useState(getNumberFormat);
  return (
    <>
      <ViewHeader title="Settings" icon="settings" />
      <div className="grid-2">
        <div className="card">
          <CardHead title="Appearance" />
          <div className="seg">
            {(['system', 'dark', 'light'] as ThemePref[]).map(t => (
              <button key={t} className={`seg-btn${t === pref ? ' active' : ''}`} onClick={() => setTheme(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={floats}
              onChange={e => {
                setFloats(e.target.checked);
                setFloatsState(e.target.checked);
              }}
            />
            Floating damage numbers
          </label>
          <div className="card-head" style={{ marginTop: 12 }}><h2>Numbers</h2></div>
          <div className="seg">
            {([['short', '1.2k'], ['full', '1,234']] as [NumberFormat, string][]).map(([f, label]) => (
              <button
                key={f}
                className={`seg-btn${f === numbers ? ' active' : ''}`}
                onClick={() => {
                  setNumberFormat(f);
                  setNumbers(f);
                  bumpVersion();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <CardHead title="Account" />
          <div className="account-controls">
            <AccountControls conn={s.conn} />
          </div>
        </div>
      </div>
    </>
  );
}
