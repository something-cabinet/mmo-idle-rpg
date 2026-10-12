import { memo } from "react";
import { EffectsCard, StatBoard, ViewHeader } from "../shared";
import type { Snapshot } from "../snapshot";
import { statSheet } from "../statSheet";
import { touchFirst } from "../TapTip";

export const CharacterView = memo(function CharacterView({
  s,
}: {
  s: Snapshot;
}) {
  const sheet = statSheet(s.level, s.gear, s.stats);

  return (
    <>
      <ViewHeader title="Character" icon="user" />
      <StatBoard sheet={sheet} />
      <EffectsCard effects={s.stats.effects} />
      <p className="muted hint">
        {touchFirst ? 'Tap' : 'Hover'} a stat name to see what it does, or the rest of its row to see
        where it comes from. Evasion and DPS are against an average Lv {s.level}{" "}
        enemy (your level).
      </p>
    </>
  );
});
