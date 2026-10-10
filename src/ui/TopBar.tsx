import type { ReactNode } from 'react';
import { useApp } from '../store';
import { Icon } from './Icon';
import { effectiveTheme, setTheme, useTheme } from './theme';

/** The bar across the top; the game screen fills in the character stats. */
export function TopBar({ stats, right }: { stats?: ReactNode; right?: ReactNode }) {
  const { status, offline } = useApp();
  const { theme } = useTheme();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Icon name="swords" /></span>
        <span className="brand-name">MMO Idle RPG</span>
      </div>
      {stats}
      <div className="top-right">
        {right}
        <span id="status" data-ok={String(status.ok)}>{status.text}</span>
        {offline && <button className="btn small ghost" onClick={() => window.location.reload()}>Reconnect</button>}
        <button
          className="btn icon ghost"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark')}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
    </header>
  );
}
