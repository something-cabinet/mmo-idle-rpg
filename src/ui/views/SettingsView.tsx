import { useState } from 'react';
import { bumpVersion } from '../../store';
import { getNumberFormat, setNumberFormat, type NumberFormat } from '../format';
import { setTheme, useTheme, type ThemePref } from '../theme';
import { AccountControls, CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { floatsOn, setFloats } from '../fight';
import { itemArtOn, setItemArt } from '../itemArt';
import { enemyArtOn, setEnemyArt } from '../enemyArt';
import { DevPanel } from '../DevPanel';
import {
  CUSTOM_GEAR_STATS,
  CUSTOM_OUTCOMES,
  CUSTOM_PROFILES,
  DEFAULT_CUSTOM_WEIGHTS,
  MAX_CUSTOM_WEIGHT,
  MIN_GEAR_STAT_WEIGHT,
  PROFILE_LABEL,
  type CustomProfile,
  type GearStatGroup,
} from '../../../spacetimedb/src/equip';
import { getCustomWeights, setCustomWeights } from '../customProfiles';

const GROUPS: GearStatGroup[] = ['Weapon', 'Offense', 'Defense', 'Primary', 'Utility'];

function WeightRow({ label, min, value, onChange }: { label: string; min: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="weight-row">
      <span>{label}</span>
      <input type="range" min={min} max={MAX_CUSTOM_WEIGHT} step={1} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className={`weight-value${value < 0 ? ' neg' : ''}`}>{value}</span>
    </label>
  );
}

/** Gauges for the custom auto-equip profiles' weights. */
function CustomProfiles() {
  const [profile, setProfile] = useState<CustomProfile>('Custom1');
  const [weights, setWeights] = useState(() => getCustomWeights('Custom1'));
  const save = (w: number[]) => {
    setWeights(w);
    // All zero would score every item the same: keep it on screen but don't save it.
    if (w.some(x => x !== 0)) setCustomWeights(profile, w);
  };
  const setAt = (i: number, v: number) => save(weights.map((w, j) => (j === i ? v : w)));
  return (
    <div className="card">
      <CardHead title="Auto-equip profiles" />
      <div className="seg">
        {CUSTOM_PROFILES.map(p => (
          <button
            key={p}
            className={`seg-btn${p === profile ? ' active' : ''}`}
            onClick={() => {
              setProfile(p);
              setWeights(getCustomWeights(p));
            }}
          >
            {PROFILE_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="hint">
        How much each value counts when auto-equip uses this profile. Pick the profile on a loadout in Equipment.
      </p>
      <h3 className="weight-head">Outcomes</h3>
      <p className="hint">
        From the real combat formulas. Equal weights trade evenly in percent: +10% damage is worth as much as +10%
        survival.
      </p>
      <div className="weight-list">
        {CUSTOM_OUTCOMES.map((c, i) => (
          <WeightRow key={c.key} label={c.label} min={0} value={weights[i]} onChange={v => setAt(i, v)} />
        ))}
      </div>
      <details className="weight-stats" open={weights.slice(CUSTOM_OUTCOMES.length).some(w => w !== 0) || undefined}>
        <summary>Fine-tune stats</summary>
        <p className="hint">
          Points per stat on your gear, in top rolls at your level: at the same weight, one top roll is worth about +10%
          of an outcome. Weapon values read the main-hand weapon itself. Negative weights avoid a stat. Stats are added
          up, so they can't see how they multiply each other (the outcomes do).
        </p>
        {GROUPS.map(g => (
          <div key={g}>
            <h3 className="weight-head">{g}</h3>
            <div className="weight-list">
              {CUSTOM_GEAR_STATS.map((c, j) => {
                if (c.group !== g) return null;
                const i = CUSTOM_OUTCOMES.length + j;
                return (
                  <WeightRow key={c.key} label={c.label} min={MIN_GEAR_STAT_WEIGHT} value={weights[i]} onChange={v => setAt(i, v)} />
                );
              })}
            </div>
          </div>
        ))}
      </details>
      {weights.every(w => w === 0) && <p className="hint">Give at least one value a weight (not saved until then).</p>}
      <button className="btn small ghost" onClick={() => save([...DEFAULT_CUSTOM_WEIGHTS])}>
        Reset
      </button>
    </div>
  );
}

export function SettingsView({ s }: { s: Snapshot }) {
  const { pref } = useTheme();
  const [floats, setFloatsState] = useState(floatsOn);
  const [numbers, setNumbers] = useState(getNumberFormat);
  const [art, setArtState] = useState(itemArtOn);
  const [enemyArt, setEnemyArtState] = useState(enemyArtOn);
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
          <label className="check">
            <input
              type="checkbox"
              checked={art}
              onChange={e => {
                setItemArt(e.target.checked);
                setArtState(e.target.checked);
                bumpVersion();
              }}
            />
            Item art (off: simple icons)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={enemyArt}
              onChange={e => {
                setEnemyArt(e.target.checked);
                setEnemyArtState(e.target.checked);
                bumpVersion();
              }}
            />
            Enemy art (off: simple icons)
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
        <CustomProfiles />
        {/* Dev builds only: Vite drops this (and the panel) from production bundles. */}
        {import.meta.env.DEV && <DevPanel s={s} />}
      </div>
    </>
  );
}
