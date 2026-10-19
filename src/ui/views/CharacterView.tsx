import { memo } from "react";
import { EffectsCard, StatBoard, ViewHeader } from "../shared";
import type { Snapshot } from "../snapshot";
import { statSheet } from "../statSheet";
import { touchFirst } from "../TapTip";
import { LevelCard, SkillTabs } from "./SkillView";
import { LookCard } from "./LookCard";
import { MAX_LEVEL } from "../../../spacetimedb/src/combat";
import { xpToNext } from "../../../spacetimedb/src/game";

export const CharacterView = memo(function CharacterView({
  s,
}: {
  s: Snapshot;
}) {
  const sheet = statSheet(s.level, s.gear, s.stats);

  return (
    <>
      <ViewHeader title="Character" icon="user" />
      <SkillTabs
        id="character"
        tabs={[
          {
            key: "status",
            label: "Status",
            body: (
              <>
                <LevelCard level={s.level} xp={s.xp} need={xpToNext(s.level)} maxed={s.level >= MAX_LEVEL} />
                <StatBoard sheet={sheet} />
                <EffectsCard effects={s.stats.effects} />
                <p className="muted hint">
                  {touchFirst ? 'Tap' : 'Hover'} a stat name to see what it does, or the rest of its row to see
                  where it comes from. Evasion and DPS are against an average Lv {s.level}{" "}
                  enemy (your level).
                </p>
              </>
            ),
          },
          { key: "customize", label: "Customize", body: <LookCard s={s} /> },
        ]}
      />
    </>
  );
});
