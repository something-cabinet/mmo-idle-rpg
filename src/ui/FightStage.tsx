// The fight scene's markup: you on the left, the enemy on the right, each with an HP bar,
// an attack-speed bar and floating numbers. fight.ts `startFight` fills it in by element
// ID, so only one stage is on screen at a time (Combat, or the Moonwell Deep's replay).

import type { ReactNode } from 'react';

export interface FighterLook {
  portrait: ReactNode;
  name: ReactNode;
}

function Fighter({ who, look }: { who: 'you' | 'enemy'; look: FighterLook }) {
  return (
    <div className="fighter" id={`fighter-${who}`}>
      <div className={`portrait ${who}`}>{look.portrait}</div>
      <div className="fighter-name">{look.name}</div>
      <div className={`hpbar${who === 'enemy' ? ' enemy' : ''}`}>
        <div className="hp-fill" />
        {who === 'you' && <div className="hp-shield" />}
        <span className="hp-text" />
      </div>
      <div className="swing">
        <div className="swing-fill" />
      </div>
      <div className="floats" />
    </div>
  );
}

export function FightStage({ you, enemy }: { you: FighterLook; enemy: FighterLook }) {
  return (
    <div className="scene card" id="scene">
      <Fighter who="you" look={you} />
      <div className="versus">VS</div>
      <Fighter who="enemy" look={enemy} />
      <div className="scene-flavor" id="scene-flavor" />
      <div className="scene-status" id="scene-status" />
    </div>
  );
}
