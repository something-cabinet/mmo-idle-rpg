import { memo } from "react";
import { CardHead, EffectsCard, StatBoard, ViewHeader } from "../shared";
import type { Snapshot } from "../snapshot";
import { statSheet } from "../statSheet";
import { touchFirst } from "../TapTip";
import { LevelCard, SkillTabs } from "./SkillView";
import { LookCard } from "./LookCard";
import { MAX_LEVEL } from "../../../spacetimedb/src/combat";
import { xpToNext } from "../../../spacetimedb/src/game";
import { ELIXIR_KILLS } from "../../../spacetimedb/src/data/supplies";
import { Icon } from "../Icon";
import { elixirText } from "../lifeSkills";

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
                <ElixirCard s={s} />
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

/** The active elixir: its effect and the kills it has left. The stats above leave it out. */
function ElixirCard({ s }: { s: Snapshot }) {
  const e = s.elixir;
  return (
    <div className="card">
      <CardHead title="Elixir">
        <a className="btn small ghost" href="#bag">Bag</a>
      </CardHead>
      {e ? (
        <div className="stat-row">
          <span>
            <Icon name="flask" className={e.infused ? "c-magic" : "c-material"} />
            {e.infused ? "Infused " : ""}{e.supply.name}
          </span>
          <span className="muted">
            {elixirText(e.supply, e.infused)} · {e.killsLeft} / {ELIXIR_KILLS} kills
          </span>
        </div>
      ) : (
        <p className="muted">None active. Drink one from the bag.</p>
      )}
      <p className="muted hint">Farming only: raids, the Moonwell Deep and other modes ignore it and use no charges.</p>
    </div>
  );
}
