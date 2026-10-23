# The Shifting Rift (weekly roguelike)

*Design, not built.* A solo roguelike run through **5 floors of 6 nodes**. You lock your
gear in, pick a path through each floor's fights, shops and events, collect **boons**
(run-long buffs) and **Ethereal** gear that exists only inside the Rift, and finish each
floor with a boss. The rewards are big and paid **once a week**. After that, runs are just
for fun. Numbers are *illustrative*.

Next to the other endgame modes:

| Mode | Asks | Rewards |
|-|-|-|
| Raids | A party, a role, the active loadout | Daily, items + tokens |
| The Moonwell Deep (abyss.md) | How far one fixed build goes | First clear per depth, leaderboard |
| **The Shifting Rift** | Decisions: path, boons, gear swaps, risk | **Weekly**, resources only |

It's the only mode where the player makes choices *during* the content. Everywhere else the
build is set before the fight. That gives an auto-combat game an active, replayable break
from idling, without breaking the idle pillar: nothing in here is ever settled offline.

## Name

**The Shifting Rift** ("the Rift" for short). Lore (story.md): the rift beneath Brightvein
Hold (T5), opened when the Last Thane dies and his seal breaks. Inside, pieces of every
zone collide and shift every time you enter, with echoes of old enemies, and gear made of rift-stuff
that falls apart when you leave. "Shifting" is also the rule: a new layout every run.

## Rules at a glance

- **Unlocks** once the character has killed the **T5 boss** (the Last Thane, story.md):
  his death breaks the seal on the rift.
- **Run tier: T5 or higher.** You pick a tier whose zone boss you've killed, from T5 up
  (default: the highest). T1–T4 are never offered: the Rift belongs to the late game, and
  a low tier would be a safe weekly payout for no challenge.
- **Solo at launch, built for co-op** (see "Later: co-op"), and online only: never
  settled offline, never a farming target.
  **Farming continues** during a run, with the active loadout.
- **A run is 5 floors of 6 nodes.** Nodes 1–5 are each a choice between 2–4 nodes
  (fight, shop or event) on a small branching map. **Node 6 is always the floor boss.**
- **Gear is locked in at the start.** You pick one of your 4 loadouts. Its items are
  **copied** into the run and can't change for the rest of it. You can still swap in
  **Ethereal** items found in the run (see "Gear").
- **HP carries over** between nodes. Dying ends the run.
- **Rewards are weekly.** Each floor cleared pays once per week (Monday 00:00 UTC).
  Later runs that week pay nothing for floors already cleared, at any tier. After a full clear,
  runs are for fun.
- **Only the mutation is weekly.** The weekly mutation is the same for everyone all week.
  Everything else (maps, enemy line-ups, Elite affixes, events, boss options, offers, shop
  stock, Ethereal drops) is rolled fresh **per run** from the run's seed, so every run is a
  new dungeon.
- **A run can be paused.** The state is stored, so you can stop after any node and come
  back hours later. The weekly reset ends any unfinished run, and you keep what its cleared
  floors paid.

## Keeping Rift gear apart from normal gear

This is the core rule: **nothing equippable enters or leaves the Rift.** Only resources
come out.

| | Normal items | Ethereal items |
|-|-|-|
| Table | `item` | `rift_item` (own table, own ID space) |
| Rarity | Common … Unique (Anomaly secret) | **Ethereal** (already reserved in the rarity enum, unused) |
| Comes from | Zones, raids, crafting | Only inside a run |
| Lives | Until salvaged, recycled or traded | **Until the run ends**, then it's deleted |
| Used in | Loadouts 1–4 | The run's **Rift loadout** only |
| Crafting, salvage, trade, gift, loot filter | Yes | **Never** |
| Counts toward the bag | Yes | No (worn or discarded, never stored) |

- **Separate table, not a flag.** Equip, salvage, reroll, trade and gift reducers all take
  `item` IDs. An Ethereal item isn't in that table, so no current or future reducer can touch
  one by mistake. Separation is a property of the schema, not something each reducer has to
  check.
- **The locked gear is a copy.** At the start, the chosen loadout's items (their stored
  stats and effects, literally) are copied into the run. The real items stay free: you can
  salvage, trade or re-equip them mid-run and the run doesn't change. Nothing has to be
  marked "in use", and no reducer needs to know about runs.
- **Your level is locked too**, taken at the start. A level-up from farming mid-run applies
  from the next run.
- **Look.** Ethereal items have their own color (a shifting pale teal, not near Rare,
  Legendary or Unique), a "Rift only" tag, and never show in the bag, Item Index or
  loot log. The Rift has its own **Rift Codex** (Discovery) for boons, Ethereal bases
  and rift effects seen.

## A run

### Threshold

Before node 1, at the rift's threshold, you pick **1 of 3 gifts** that shape the run from
the first click. Rolled per run, e.g.:

| Gift | What you start with |
|-|-|
| **Ember of Will** | An Epic boon of a random theme |
| **Rift Purse** | 150 Motes |
| **Shard of Rift-stuff** | An Ethereal item with one guaranteed headline (random slot), wear or discard as usual |
| **Bargain in the Dark** | A keystone of a random theme, plus a random curse |
| **Marked Path** | A theme mark of your choice, held like a headline (counts as 1 boon of that theme) |
| **Thick Blood** | Max HP +15% for the run |

### The Rift loadout

The run's own 9 slots. It starts as the locked copy of your loadout. Kept simple:

- **Wear it or discard it.** When you find or buy an Ethereal item, you choose right away
  (never during a fight): **wear** it in the slot that matches its base (a helm in the
  helm slot), or **discard** it. There's no stash, and nothing is sold or salvaged.
- **Wearing replaces for good.** The item it replaces, a locked copy or an earlier
  Ethereal, is discarded for the rest of the run. Locked items can't be changed, only
  replaced. (Your real items are never touched: the copies are what's discarded.)
- **Two-handed weapons** take both hands:
  - wearing a two-handed weapon discards your weapon and your off-hand;
  - wearing a one-handed weapon discards a two-handed one;
  - an off-hand can be worn only while a one-handed weapon is in the weapon slot
    (otherwise it can only be discarded).

  The wear-or-discard card warns first, e.g. "Also discards your Kite Shield", or "Needs a
  one-handed weapon".
- **Boons** sit next to the loadout. They aren't gear and take no slot.

### Floor map

```
 node 1     [F]      [F]      [F]
            / \       |      /
 node 2   [F]  [S]   [F]   [E]
            \  /  \   |   /
 node 3     [E]    [F*]  [F]
              \   /   \   |
 node 4        [F]     [S]
              /   \   /   \
 node 5     [S]    [F]    [E]
              \     |     /
 node 6          [BOSS]
```

F fight · F* fight with an Elite · S shop · E event. Nodes 1–5 each offer 2–4 nodes, and
each links to 1–2 nodes in the next row. Node 6 is the boss, the same for every path (you pick which one, below). So a
floor is 5 choices and at most 6 fights. Rules for the generator:

- **Node 1 is always a fight**, never with an Elite, so a run starts by earning its first
  boon.
- At least one **shop** per floor, in nodes 2–5.
- At least one path per floor avoids every Elite.
- Every path has **at least 2 fights before the boss**, so nobody can event-skip a floor.

| Node | What happens |
|-|-|
| **Fight** | 1–3 enemies back to back, HP carrying between them (like a Deep depth). Win: **Motes**, then **pick 1 of 3 boons** |
| **Fight with an Elite** | One of the enemies is an Elite echo with an Elite affix. Win: more Motes, **1 of 3 boons (Rare or better)**, and **an Ethereal item** with that Elite's affix as a Trophy |
| **Shop** | Spend Motes (below) |
| **Event** | A short text scene with 2–3 choices, often a risk for a reward (below) |
| **Boss** | Node 6, the floor boss. On floors 1–4 you **pick 1 of 2** zone-boss echoes, each shown with its mechanic and the zone its Echo comes from; floor 5 is always the Rift Heart. Win: the floor is cleared (weekly reward), an **Ethereal item** with an Echo, and you heal **50% of missing HP** before the next floor |

There are no rest nodes. Healing between fights comes from shops, events, boons and boss
kills, so every heal costs a node, Motes or a pick.

**Motes** are the run's currency: earned from fights and events, spent in shops, gone when
the run ends. They aren't gold, so the run's economy can't leak into the real one, and a
shop price means the same thing at every tier.

### Shop

Stock rolled when you enter, 6–8 offers:

| Offer | Price (Motes) |
|-|-|
| Boon (Common / Rare / Epic) | 40 / 75 / 130 |
| Upgrade a boon you hold one rarity | 60 (to Rare) / 110 (to Epic) |
| Ethereal item | 90 |
| Heal 30% max HP | 50 |
| Attune an Ethereal item (+1 affix tier on every affix) | 60 |
| Remove a curse | 75 |
| Remove a boon (thin a build) | 50 |
| Reroll the shop | 25, +25 each time |

A floor's fights pay ~150–250 Motes in all, so a shop stop is 2–3 purchases.

### Fights

Each fight node is one fight against 1–3 enemies, one seeded battle played in full by the
server and replayed by the client, like the Deep and raids. The server's outcome is final.

- **It's a battle, like every fight.** The engine (battle.ts) already plays a chain of
  foes with HP carried over (a Deep depth), a starting HP, Second Wind and Renewal left per
  player, a time limit, and N players against M foes. A Rift node is a chained battle of
  the node's enemies, with the run's stats: locked gear + Ethereal gear + boons + level.
  The Elite affixes are already foe traits (drain, ramp, Thorned, heal ×).
- **HP carries over** between fights and nodes. Regen and lifesteal only work inside
  fights, as usual. So sustain is a real build axis here, and so is plain bulk.
- **A node is one fight.** A fight goes on until your HP is reset to full. A node's
  enemies come in back to back with your HP carried over, so they're all the same fight.
  Everything "per fight" happens once per node and keeps going across its enemies: no
  second Ambush on the next enemy, Waxing Moon and Fading Rally keep their bonus, Opening
  Salvo, Smoke, Tailwind, Bracing and Stubborn are spent on the first enemy, Thunderhead
  keeps its stacks, and Bloodrush counts nodes won. Only effects that say "each enemy"
  (the Fury 5-set) start over per enemy.
- **One shield.** Every shield (Stubborn, Hold the Line, Blood Price, the Bastion 5-set,
  Second Skin) adds to the same pool, which damage hits before HP. Sources stack: the
  Bastion 5-set adds 10% max HP every 10 s on top of whatever is left. Each source's own
  cap still holds (Blood Price's 20%). The pool doesn't carry over to the next node; a fight
  starts it at Second Skin's amount (plus Stubborn's).
  The Deep works the same way (a depth is one fight); the Rift's exception is that HP
  also carries over from one fight to the next.
- **Second Wind** triggers **once per floor**, not once per fight (the Deep carries it
  once per depth the same way).
- **Elixirs, meals and Phials don't apply.** The run is self-contained: a snapshot of gear
  and level, and everything else is earned inside. It also keeps the weekly reward from
  costing a stack of consumables. Phials are the Deep's and raids' consumable, not the
  Rift's.
- **Time limit: 3:00 per node**, shared by its enemies like a Deep depth, then the node is
  lost. That stops stalls for unkillable builds that can't deal damage.
- Replays have **2× / 4× and Skip**. A run is 30 nodes and ~25 fight nodes at most (about
  20 on a usual path, bosses included), so pacing matters: the target is **~20 minutes**
  for a full run at 4×.

## Boons

Run-long buffs, picked 1 of 3 after fights, or bought. They're the roguelike heart of the
mode: each run builds a different character on top of the same locked gear. They're online
only, so no closed form is needed.

### How picks work

- **Duplicates upgrade.** Picking a boon you already hold raises its rarity (Common →
  Rare → Epic) instead of adding a copy. A boon at its top isn't offered again, as a pick
  or a shop upgrade: an Epic, and the boons that come in one version only (Second Look,
  the keystones, Wildcard) once held. A run gives ~15–20 picks but holds only **~8–12
  distinct boons**, so every pick is wide (a new boon) or deep (an upgrade).
- **Each offer has three fixed slots** instead of theme weighting, so a run can commit to a
  plan without every offer looking the same:
  1. A boon of your **main theme** (the one you hold most of), or an upgrade of one.
  2. A boon of **another theme you hold**.
  3. A boon of **any theme**.

  With nothing held yet, all three slots are any theme. A slot with nothing left to offer
  (every boon of the theme held at its top) falls back to any theme. The weekly mutation can tilt slot 3.
- **Stat gating.** A boon that needs a stat (block chance, evasion, crit) is only offered
  once you have that stat, from gear or from another boon. Each such theme has a boon that
  grants the stat, so no boon is ever dead on arrival.
- **Keystones** are Epic only, one per theme, offered from floor 3 on. Each one changes how
  the build plays rather than adding numbers.
- **Rarity odds** go up by floor: floor 1 70 / 25 / 5%, floor 5 35 / 45 / 20%.
- **Where a boon works** depends on what it changes:
  - **Stat boons** go into the stat build (`combatStats`): Keen, Fleetfoot and Raised Shield
    add flat chances; Sunder and Iron Hide change armor and resistance before mitigation;
    the plain percentage ones (Sharpened Will, Thick Skin, Quickened…) are "more"
    multipliers after gear, like elixirs. Glimmerguard's crit-to-evasion conversion runs
    after all of them.
  - **Combat boons and rift effects** go into `Fighter`, like any effect, so every mode and
    co-op get them for free: shields, timed ones (Opening Salvo, Smoke, Tailwind), per-swing
    ones (Static, Echo Strike, Gambler's Edge, Overclock, Thunderhead), per-dodge and
    per-block ones. They're read from `CombatStats.effects`: rift effects under their own
    IDs (200+), boons under theirs.
  - **Foe-side rules** go into `FoeSpec` traits: Wither Aura, the weekly mutations, the
    Elite affixes, the Rift Heart's Shift.
- **Names never reuse a legendary or unique effect's name**, so a tooltip is never
  ambiguous.

### Themes and set bonuses

**Seven themes.** With **3 distinct boons of one theme** you get its set bonus, and a
stronger one at **5**.

| Theme | Leans on | Set bonus (3 / 5) |
|-|-|-|
| **Fury** | Raw damage | +15% damage / your first hit on each enemy deals triple |
| **Bastion** | Mitigation, bulk | +10% max HP / every 10 s, a shield of 10% max HP |
| **Blood** | Sustain, HP as a resource | Lifesteal cap +5% / kills heal 8% max HP |
| **Storm** | Speed, crits | +15% attack speed / crits chain 30% of the hit to the next swing |
| **Mist** | Evasion | Evade chance +6% / every evade makes your next attack crit (a Glimmerguard wearer, who already gets that, gets +50% crit damage on those attacks instead) |
| **Aegis** | Block | Block chance +8% / each block reflects 50% of the whole hit (before the block shrinks it) |
| **Fortune** | Motes, shops, events | Shops −20% / one free Rare boon per floor at its first shop |

### Roster (43)

Values are Common / Rare / Epic. *Keystones* (in italics) are Epic only.

**Fury**

| Boon | Effect |
|-|-|
| Sharpened Will | Damage +8 / 14 / 22% |
| Opening Salvo | First 5 s of each fight: damage +40 / 70 / 110% |
| Coup de Grâce | +20 / 35 / 55% damage against enemies below 30% HP |
| Sunder | Ignore 10 / 18 / 28% of armor and resistance |
| Bloodrush | +1.5 / 2.5 / 4% damage per fight won this floor (resets each floor) |
| *Frenzy* | +1% damage for each 1% of HP you're missing |

**Bastion**

| Boon | Effect |
|-|-|
| Iron Hide | Armor and resistance +15 / 25 / 40% |
| Thick Skin | Max HP +8 / 14 / 22% |
| Stubborn | Each fight starts with a shield of 8 / 14 / 22% max HP |
| Braced | 10 / 16 / 24% less damage taken from Elites and bosses |
| Hold the Line | Once per floor, the first drop below 30% HP gives a shield of 20 / 30 / 45% max HP |
| *Fortress* | 25% less damage taken; 15% less attack speed |

**Blood**

| Boon | Effect |
|-|-|
| Leech | Lifesteal +1 / 2 / 3%, and the lifesteal cap by as much |
| Red Tithe | Max HP −10%, damage +12 / 20 / 30% |
| Afterglow | Win a fight node: heal 4 / 7 / 11% max HP |
| Transfusion | Each kill heals 3 / 5 / 8% max HP |
| Clotting | Regen +50 / 90 / 140% while below 50% HP |
| *Blood Price* | Lifesteal past full HP becomes a shield, up to 20% max HP |

**Storm**

| Boon | Effect |
|-|-|
| Quickened | Attack speed +8 / 14 / 22% |
| Keen | Crit chance +3 / 5 / 8% (flat, added after base crit). Grants the stat |
| Cruel | Crit damage +15 / 25 / 40% (needs crit chance) |
| Static | Every 5th swing adds +100 / 170 / 260% as a shock that can't be dodged: it lands even when the swing misses |
| Tailwind | The first 3 attacks of each fight are 50 / 80 / 120% faster |
| *Thunderhead* | Each crit gives +3% attack speed for the fight, up to +30% (needs crit chance) |

**Mist**

| Boon | Effect |
|-|-|
| Fleetfoot | Evade chance +4 / 7 / 11% (flat, added after rating). Grants the stat |
| Smoke | First 5 s of each fight: evade chance +20 / 35 / 50% |
| Counterstep | Each evade counters for 30 / 50 / 80% of your average hit |
| Slip Away | Each evade heals 1 / 1.5 / 2.5% max HP |
| Opening | After an evade, your next attack deals +15 / 25 / 40% |
| *Phantom* | An enemy hit must pass your evade check twice; max HP −20% |

**Aegis**

| Boon | Effect |
|-|-|
| Raised Shield | Block chance +6 / 10 / 15% (a block stops half the hit; stacks with Bulwark). Grants the stat |
| Bracing | The first 1 / 2 / 3 enemy hits of each fight are always blocked |
| Shield Bash | Each block deals 40 / 70 / 100% of your average hit back |
| Steady Guard | Each block heals 1 / 1.5 / 2.5% max HP |
| Deep Guard | Blocks stop 60 / 70 / 80% of the hit instead of 50% |
| *Shieldwall* | Blocks stop the whole hit; 20% less attack speed |

**Fortune**

| Boon | Effect |
|-|-|
| Lucky Coin | Motes +20 / 35 / 55% |
| Haggler | One shop offer per shop is half price |
| Interest | Entering a shop pays 5 / 8 / 12% of the Motes you hold |
| Treasure Sense | Headline chances on the Ethereal items you find × 1.5 / 2 / 3 |
| Second Look | Boon offers show 4 choices instead of 3 (Rare only) |
| *Spendthrift* | Every 10 Motes spent heal 1% max HP |

**No theme:** **Wildcard** counts as one boon of every theme for set bonuses (Epic only;
not a keystone, so it can show from floor 1). It doesn't count toward your main theme for
offers, or every theme would tie.

- **Glimmerguard** (Parry and Thrust) turns your **final** crit chance into evasion rating
  (4 per 1%, combat.ts). In the Rift the conversion runs **last, after boons**, so Keen and
  any other crit chance help a Glimmerguard build, and Cruel helps too (parried crits use
  your crit damage). For stat gating, its converted crit chance counts as having crit.
- **Balance isn't a goal inside the Rift.** Nothing equippable comes out and the rewards
  are capped weekly, so a broken run is a fun run. Boons, rift effects and their combos are
  kept unless they're buggy or unintuitive, never cut for being too strong.
- **Curses** are negative boons from events (e.g. *Frail*: max HP −15%; *Hexed*: heals −30%;
  *Weighted*: attack speed −10%). They don't count as boons for offers or sets, can be
  removed at a shop, and some events pay well for taking one.

## Gear: Ethereal items

The "unusual powerful gear", potentially overpowered on purpose. One grade only: an
Ethereal item is a base of the **run's tier** with **3 regular affixes (tier ≥ T − 2)**,
and on top of that it can carry any of five **headlines**, each rolled **independently**:

| Headline | Chance | What it is |
|-|-|-|
| **Rift effect** | 30% | One effect from the rift effect table (below), found only in the Rift |
| **Theme mark** | 20% | Counts as 1 boon of a random theme for set bonuses ("Storm-marked") |
| **Growth** | 15% | Each floor boss you clear while wearing it raises its 3 affixes one tier, with no cap |
| **Trophy** | 10% | One of the six Elite affixes, turned to your side (below) |
| **Echo** | 6% | All of a real unique's effects, whatever the slot ("Echo of Glimmerguard") |

- **The source guarantees one headline:** an Elite's drop always has a **Trophy** (that
  Elite's own affix); a floor boss's drop always has an **Echo** (a unique from that boss's
  zone; the Rift Heart's from any unique, raid ones included). The other four still roll as in the table.
- **Multi-headline items are meant to be a WOW.** All five on one item:

  | Item | All 5 headlines |
  |-|-|
  | Shop or event (no guarantee) | 1 in ~18,500 |
  | Elite drop (Trophy guaranteed) | 1 in ~1,850 |
  | Boss drop (Echo guaranteed) | 1 in ~1,100 |

  With ~13 Ethereal items seen in a full run (5 Elite, 5 boss, ~3 from shops and events),
  the best item of the run has:

  | Best item of a run | How often |
  |-|-|
  | 2+ headlines | Every run |
  | 3+ headlines | ~4 runs in 5 |
  | 4+ headlines | ~1 run in 6 |
  | All 5 | ~1 run in 140 |

  Locked gear is the floor, Ethereal gear is the climb, and a lucky run should feel like
  it's breaking the game's usual limits.
- **Bases:** any zone base of the run's tier. No Rift-only bases (yet).
- **Trophies**, the Elite affixes on your side: **Vampiric** (you heal 50% of the damage
  you deal, past the lifesteal cap), **Warded Shell** (against each enemy's damage type you
  defend with the higher of your armor and resistance, like Juggernaut and Spellward),
  **Swift** (50% faster, hits 25% weaker), **Thorned** (reflect 10%
  of damage taken, 30% less max HP), **Unyielding** (regenerate 1.5% max HP per second),
  **Ravenous** (your damage grows 5% every 5 s).
- **Growth has no cap.** Affix tiers keep rising past T9 (T10, T20, T100…), with ranges
  from each stat's curve formula past T9 (`affixRange` already extends, crafting.md). In
  practice a run has 5 bosses, but nothing stops it.
- **Echoes** copy every legendary and unique effect of that unique, so an Echo of a
  two-effect unique brings both. A rolled Echo (not a boss's) picks from every unique, zone
  and raid alike. Any unique can be echoed, party-only effects (Drawing
  Fire, Twin Flame) included, since the Rift may get a multiplayer mode later; solo they
  simply do nothing, but both sit on uniques with a second effect (Twinstep Sabatons:
  Bulwark; Sindri's Bellows: Zealot's Oath), so no Echo is ever a dud.
  Two copies of the same Echo, or an Echo of a unique you're also wearing, don't stack,
  like two of the same unique.
- **Theme marks** count toward set bonuses and toward your "main theme" for boon offers,
  but aren't boons: Unravel and the boon-removal offer don't touch them.
- **Rift effects** get their own ID range (e.g. 200+), separate from the legendary and
  unique effects (1–99), so they can never be rolled outside. Two copies of the same rift
  effect don't stack; anything else does, including an effect that copies a unique.
  Being online only, they can be wild.

| Rift effect | Effect |
|-|-|
| **Glass Heart** | Damage × 2, max HP × 0.5 |
| **Echo Strike** | Every 4th attack repeats at 100% |
| **Overclock** | Attack speed × 1.6; each swing costs 1% max HP |
| **Gambler's Edge** | Each hit deals 0–300% damage at random (average ×1.5) |
| **Phoenix Plume** | Once per run, a killing blow leaves you at 40% HP instead (like Second Wind). The item burns away when the node ends, with all its headlines, and the slot is empty; its stats last until then |
| **Bloodbound** | No lifesteal cap; your regen is 0 |
| **Mirror Mail** | Reflects 60% of damage taken, like Thornshell; you take 15% more |
| **Hoarder's Band** | +1% damage per 10 unspent Motes (max +40%) |
| **First Blood** | The first hit on each enemy deals 5× damage |
| **Voidheart** | All your damage becomes magic, +25% |
| **Rift Conduit** | Each boon you hold gives +2% damage and +2% max HP |
| **Wither Aura** | Enemies lose 1% max HP per second |
| **Thief's Glove** | Fights pay +50% Motes |
| **Rift Anchor** | Can't be replaced this run (items for its slot can only be discarded); the affixes on your other items +20% (not base damage, armor or effect amounts) |

### When effects meet

Rift effects stack freely with legendary and unique effects, and with boons: Glass Heart
and Glass Cannon together are ×4 damage at a quarter of the HP, and First Blood, Ambush and
the Fury 5-set multiply on the first hit. Only a few cases need a rule:

| Case | Rule |
|-|-|
| **Overrides.** Voidheart with Spellblade or Moonlight (all damage becomes magic, so the swap or conversion does nothing more; Moonlight keeps its double hit). Bloodbound with Frozen Blood (lifesteal still does nothing) or with Bloodthirst and the Blood 3-set (no cap left to raise) | Allowed. The wear-or-discard card **warns** first, e.g. "Overrides your Spellblade", since wearing is for the rest of the run |
| **Same trigger.** Phoenix Plume and Second Wind both catch a killing blow | Second Wind goes first; the Plume only burns once Second Wind is spent for the floor |
| **Order of damage changes** | Type changes apply in a fixed order: Spellblade, then Moonlight, then Voidheart (the last one wins) |
| **Reflects.** Mirror Mail, Thornshell, the Aegis 5-set | One rule (battle.ts): a reflect is a share of what reached your HP (after your defenses and the shield), dealt through the attacker's mitigation; the Aegis 5-set reflects 50% of the whole hit, before the block shrinks it. Reflect adds up with no cap |

## Events

Short text scenes, 2–3 choices, rolled from a pool of 20 at launch. They're where the
risk/reward choices live, and with no rest nodes, one of the ways to heal:

| Event | Choices |
|-|-|
| **Blood Altar** | Lose 20% max HP (current), gain an Epic Blood boon / leave |
| **Gambler** | Bet 50 Motes: 50% double, 50% lose / bet 100 / leave |
| **Wandering Smith** | Attune an Ethereal item for 40 Motes / reroll one of its affixes for 20 / leave |
| **Cursed Chest** | Open: an Ethereal item with 3 random headlines, and a random curse / leave |
| **Your Reflection** | Fight a copy of your current run build (reuses duels): win a free Epic boon; lose 30% HP and nothing else / leave |
| **Healing Spring** | Heal 25% / take a Rare boon of a theme you don't have |
| **Quiet Alcove** | Heal 35% / attune an Ethereal item for free |
| **Goblin in the Rift** | Chase it: a 20 s fight against a fleeing goblin that pays Motes per hit (callback to the Treasure Goblin) |
| **Shrine of Change** | Reroll all your boons into random ones of the same rarity (the offer rules hold: no keystone before floor 3, one per theme) / leave |
| **Lost Satchel** | 60 Motes / an Ethereal item |
| **Broken Mirror** | Swap a boon below Epic for a random boon one rarity higher; 25% chance it's a curse instead |
| **Thane's Vault** | Open it: pick 1 of 3 Ethereal items (shown first), and a dart trap takes 15% of your current HP / leave |
| **Lurking Echo** | Fight it: a lone Elite echo; a win pays like an Elite in a fight (1 of 3 boons, Rare or better, and an Ethereal item with its Trophy) but no Motes / sneak past |
| **Moon Shard** | Touch it: a boon below Epic goes up one rarity, and a random curse / pry it loose: 80 Motes / leave |
| **Blood Merchant** | Pay in blood, 15% of your current HP each, any of: an Ethereal item / a Rare boon of your main theme / attune an Ethereal item; leave when done |
| **Forgotten Forge** | Reforge an Ethereal item: its headlines roll again (the source's guaranteed one stays) / attune it for 30 Motes / leave |
| **Weeping Statue** | Pray: heal to full, but your next fight node gives no boon pick / leave |
| **Ashen Brazier** | Burn a boon: heal 40% max HP and gain 60 Motes / burn a curse away / leave |
| **Rift Tear** | Reach in: a random slot (never a Rift Anchor's) gets an Ethereal item with at least 2 headlines, worn at once, no wear-or-discard / leave |
| **Runecarver** | Carve: one of your Ethereal items gets your main theme's mark (replacing any mark it has) / pay 40 Motes: a theme of your choice / leave |

Which events are on the map and what each one rolls (which boon, which item) come from
the run's seed. A choice that can't apply (no Ethereal item to reforge, no boon to burn, no
curse to remove) is shown greyed out, so every event keeps a way to leave. HP costs take a
share of current HP, so an event never kills you. The Lurking Echo's fight is optional, so
it doesn't count against "a path that avoids every Elite".

## Enemies

**Echoes.** The Rift reuses every existing zone enemy and boss, rescaled to the run's
tier. Very cheap in art and data, and it fits the lore: pieces of every zone, mixed. A T5
run can face an echo of a T1 Bog Wisp with T5 numbers.

```
HP(f, slot)  = avgHP(T)  × floorMult(f) × kind.hp  × slot.hp  × RIFT_HP
DPS(f, slot) = avgDPS(T) × floorMult(f) × kind.dps × slot.dps × RIFT_DPS
level        = 10 × T + 2 × (f − 1)                  // T5 run: 50 → 58
floorMult    = 1.6^(f − 1) = 1, 1.6, 2.56, 4.1, 6.55    // floors 1–5 (tuned in test:rift)
```

`avgHP(T)` and `avgDPS(T)` are the zone tier's average enemy (zones.md), the T5 step
included. `kind` is the original enemy's shape (its damage type, defense profile and traits
come along as they are). `RIFT_HP` and `RIFT_DPS` account for HP carrying over and are
tuned in `test:rift`.

**`floorMult` scales HP and damage only.** Armor, resistance, accuracy and evasion stay at
the run tier's values. Floor 1 is the tier as it is; each floor after has 60% more HP and
damage.

| Slot | HP × | DPS × | Extra |
|-|-|-|-|
| Fight, 1 enemy | 1 | 1 | none |
| Fight, 2 / 3 enemies | 0.6 / 0.45 each | 1 | none |
| Elite (in a fight) | 2.5 | 1.3 | 1 Elite affix (the Deep's six: Vampiric, Warded Shell, Swift, Thorned, Unyielding, Ravenous) |
| Floor boss (1–4) | 5 | 1.5 | An echo of a **zone boss** you picked from 2 (any tier's boss, rescaled), with its own mechanic plus 1 Elite affix |
| Final boss (5) | 7 | 1.7 | **The Rift Heart**, its own boss (below) |

- **Why floors ramp at all:** the player gets stronger inside the run through boons and
  Ethereal gear, so each floor is × 1.6 HP and damage (the bots found × 1.25 too flat: builds outgrew it). Floor 1 is the run tier as it is; floor 5 wants the
  run's build. A run you play well is meant to end far stronger than it started.
- **Target:** a reference player for tier T (random Rare+ tier-T gear) with *random* picks
  clears floors 1–2, usually dies on 3–4, and clears 5 maybe 1 time in 10. With
  *sensible* picks, they clear 5 about half the time. `test:rift` plays two bots (random
  picks and a greedy theme-builder) to check both.

### The Rift Heart (final boss)

The shifting core of the rift. HP × 7, DPS × 1.7, plus:

- **Shift:** every 15 s it takes a new damage type and defense profile at random
  (phys/magic × Armored/Warded/Balanced). That tests a rounded build, and it's a
  harder-to-read version of Lunar Phases.
- **Unravel:** it **turns off one of your boons** at random for the whole fight, shown
  before the fight starts (the boon doesn't count toward set bonuses either). A one-trick
  build gets punished, and the fight is different every run.
- The **weekly mutation** (below) applies to it twice as strongly: its bonus doubles
  (Storm Front +60% attack speed, Glass World × 4 damage).

## Weekly mutation

One rule for the whole week, the same for everyone, shown on the Rift page. It changes
what's good, so even a player who replays for fun meets a new puzzle every week. Examples:

| Mutation | Effect |
|-|-|
| **Blood Moon** | All enemies have 20% lifesteal; offer slot 3 is always a Blood boon |
| **Storm Front** | Everyone (you and enemies) has +30% attack speed |
| **Iron Week** | Enemies are Armored; armor penetration counts double |
| **Bargain Bin** | Shops −30%, fights pay −30% Motes |
| **Echoes of the Deep** | Every Elite has 2 affixes, and its drop carries both as Trophies |
| **Wild Magic** | Offer slot 3 is always Epic, keystones included from floor 1 |
| **Glass World** | You and enemies deal double damage |

## Rewards

**Weekly, per floor, once.** Each floor has a weekly reward, paid the first time that week
you clear it, right when its boss falls, at the run's tier: a higher tier pays more. Once a
floor is cleared, clearing it again that week pays nothing, on any tier (2026-10-23), so
replays are free fun and the weekly total is a hard cap. Pick the tier before the first clear.

Paid in **hours of farming at the run's tier** (T5 or higher), so it scales like
everything else (× 2.9 per tier):

| Floor | Gold + XP | Dust | Materials | Extra |
|-|-|-|-|-|
| 1 | 0.75 h | 0.75 h | 0.75 h of the tier's materials, all kinds | none |
| 2 | 1 h | 1 h | 1 h | 2 **Riftstone** |
| 3 | 1.5 h | 1.5 h | 1.5 h | 3 Riftstone, 2 elixirs of the tier's grade |
| 4 | 2 h | 2 h | 2 h | 4 Riftstone, 2 **rare herbs** |
| 5 | 2.75 h | 2.75 h | 2.75 h | 10 Riftstone, **Essences** (once Essence drops ship), 1 Greater meal |
| **Total** | **8 h** | **8 h** | **8 h** | **19 Riftstone** |

- **"A lot", in numbers:** a full clear is ~8 h of farming in ~20 minutes, once a week.
  That's on the order of a full night's offline session. It's a strong reason to play
  weekly, but small next to a week of farming (~1/20), so it never replaces the core loop.
- **Riftstone** is a new Rift-only **permanent** material (normal storage, unlike
  everything else from the run). What it crafts is decided later; it's paid from launch
  anyway, so players bank it until then.
- **No items come out.** Only resources. It keeps the separation rule absolute, and it
  keeps the Rift from competing with zone drops and raid loot.
- The run tier is picked at the start, from T5 up, among tiers whose zone boss you've
  killed (default: the highest). A player can drop to a lower one (never below T5) to clear
  floors safely, but a floor pays only its first clear of the week.
- **Leftover Motes and Ethereal items are lost** when the run ends. Nothing converts, so
  there's no reason to hoard.

### Later: Rift Rank (for the fun runs)

After a full clear on your highest tier, **Rift Ranks 1–10** unlock: each adds a modifier
(enemies +10% HP, one fewer boon offer, shops cost more, the boss Unravels twice…). They're
for players who replay for fun and want a harder puzzle. Rank gives **no extra rewards**,
only a Codex mark, and a title at Rank 10 (cosmetics.md). Possibly a weekly board for the
highest rank cleared, with the build snapshot like the Deep.

## Later: co-op

Not at launch, but every piece above is built so it can come without a rewrite. The rule:
**the path is shared, everything else is personal, and the party moves together.**

- **Party:** 2–4 players, formed like a raid party (create, invite, the leader starts).
  Everyone needs the T5 unlock; the run tier is capped by the lowest member's unlock. Each
  member locks their own loadout and gets their own Threshold. A Rift party is its own
  thing: you can be in one and in a raid party at the same time.
- **Shared:** the map (from the run seed), the node, the boss choice, the fights. The
  leader picks the path and the boss.
- **Personal:** boons, curses, Motes, shops, Ethereal items, event choices, Threshold.
  Each member's offers come from run seed + character, so nobody copies another's luck.
  An event that is a fight (Your Reflection, Goblin in the Rift) is your own fight, played
  when you answer.
- **Ready:** after each node, every member answers their own choices (boon pick, wear or
  discard, shop, event), then presses **Ready**. The leader can only move on once every
  online member is ready. Offline members count as ready: their choices wait for them, and
  they fight with what they have.
- **Fights:** every member fights every node together in one battle; threat spreads the
  hits. Enemy **HP** × party size factor (1 / 1.8 / 2.5 / 3.2 for 1–4 players); damage
  unchanged.
- **Rewards:** each member is paid from their own `rift_week`, as solo.
- **Disconnect and reconnect:**
  - Fights settle inside one reducer call, so a disconnect can never happen *during* a
    fight, only between nodes.
  - Reconnecting is free: the run lives in server tables; the player subscribes and finds
    their queued choices waiting.
  - A disconnected member **still fights** as their snapshot (locked gear, boons), like a
    hired NPC, so nobody wipes over someone's Wi-Fi and enemy scaling stays fair.
  - Leader offline: the next online member in join order can move the party; the leader
    takes it back on return. "Online" is the world presence, as chat shows it.
  - Everyone offline: the run waits, as solo.
- **Leave and kick:** a member can leave any time (floors already cleared stay paid; they
  stop fighting from the next node). The leader can kick a member offline for 10+ minutes.
  Enemy scaling follows the new party size from the next node.
- **Death:** a downed member sits out until the floor boss falls, then returns at 50% of
  max HP (everyone else gets the usual heal of 50% of missing HP). The run ends when
  everyone is down.
- **Weekly reset:** ends the run for everyone, as solo.

## Cost (SpacetimeDB)

A run is many small decisions, so unlike a raid it's many reducer calls, all cheap:

- **~45–60 calls per run:** pick node, pick boon, buy, event choice, equip. Each fight
  node plays its fights in the call (well under 1 ms). No tick, no schedule.
- **State:** one `rift_run` row per run (map seed, floor, node, leader, mutation week),
  one `rift_member` row per player in it (HP, Motes, boons, curses, locked-gear copy,
  queued choices, downed flag), and ≤ 10 `rift_item` rows per member (9 worn, 1 waiting for
  wear-or-discard). A solo run is a party of one. All are deleted at the end of the run, so
  storage stays flat however many runs are played.
- **Weekly claims:** one `rift_week` row per character (week, highest tier paid per
  floor).
- **Logs:** `rift_log` keeps the last ~10 runs (floor reached, boons, final build,
  rewards) for the run history page.
- Fun runs cost the same as rewarded ones, and every call is a player action. Cost scales
  with play, as the "cheap to run" pillar wants.

## Implementation sketch

| Piece | What |
|-|-|
| `data/rift.ts` | Boons (permanent IDs), themes and set bonuses, curses, rift effects (200+), events, mutations, floor multipliers, reward table |
| `rift.ts` (pure, shared) | `weeklyMutation(week)`, `runMap(seed)` (maps, line-ups, Elite affixes, events, boss options), `nodeEnemies(..., partySize)`, `memberStats(member)` (locked gear + Ethereal + boons + level), `simulateNode(...)` (a chain of the node's enemies against **every member**: starting HP per member, per-floor Second Wind, shared time limit), offer rolls seeded by run + character |
| Sim | **The battle engine (battle.ts)**, a solo run being a party of one, so co-op needs no sim rewrite. It already has N players against M foes, a chain of foes, threat, starting HP, Second Wind and Renewal per player, a time limit, the Elite affixes as foe traits, party effects (Drawing Fire, Twin Flame) and player against player (duels, for Your Reflection). Needed: boons and rift effects where "Where a boon works" puts them (stat build, `Fighter`, `FoeSpec`), and Phial Renewal forced to 0 |
| Schema | `Ethereal` rarity (already reserved), `rift_run` (per run), `rift_member` (per player in a run), `rift_item` (the same columns as `item`, so the stat build reads it like gear, plus its run, owner, worn slot and headlines), `rift_week`, `rift_log`, `rift_codex` (discovery). No per-character run state outside `rift_member`. Riftstone is a new untiered material, like Voidglass |
| Weeks | Week index from Monday 00:00 UTC: `floor((days since epoch + 3) / 7)` |
| Reducers | Split by who may call them from the start. **Leader:** `riftStart(loadoutIndex, tier)` (tier ≥ 5), `riftMove(node)`, `riftBoss(option)`. **Each member, for themselves:** `riftPick(option)` (Threshold, boons, events), `riftBuy(offer)`, `riftTake(wear)`, `riftReady()`, `riftLeave()`. `riftMove` waits for every online member's `riftReady` (solo, moving is being ready). Weekly reset handled lazily (a call in a new week ends the old run and pays each member's cleared floors) |
| Client | A **Shifting Rift** page under Adventure: the floor map, Rift loadout with a wear-or-discard compare, boons with set progress, replays with speed controls, shop and event dialogs, run history, Codex |
| Check | `npm run test:rift`: random and greedy bots per tier, clear rate per floor, every generated map is valid; for floor difficulty only, never to tone down a boon or rift effect |

## Decided

- **Name:** The Shifting Rift.
- **Shape:** 5 floors × 6 nodes; nodes are fights (1–3 enemies), shops or events; node 6
  is always the boss. No rest nodes, no separate Elite nodes.
- **Tier:** T5 and above only.
- **No consumables:** elixirs, meals and Phials stay out.
- **No Rift-only bases (yet):** Twin Fang, Prism Orb and Hourglass are cut.
- **No Scout odds.**
- **Per run, not weekly:** only the mutation is weekly; maps, line-ups, events and offers roll per run.
- **Threshold:** pick 1 of 3 starting gifts before node 1.
- **Floor scaling:** enemy HP and damage × 1.6 per floor (× 1.25 at first; the `test:rift` bots found it too flat, 2026-10-23), floor 1 at × 1; other stats don't scale.
- **Boss choice:** floors 1–4 offer 2 zone-boss echoes; floor 5 is always the Rift Heart.
- **Gear:** wear or discard on the spot, no stash, no selling; wearing discards what was in the slot.
- **Ethereal items:** one grade (Radiant dropped); 3 affixes (tier ≥ T − 2) plus five independent headlines, rolled independently: rift effect 30%, theme mark 20%, growth 15% (uncapped), Trophy 10% (guaranteed on Elite drops), Echo 6% (guaranteed on boss drops; party-only effects allowed).
- **Balance isn't a goal:** effects stay unless buggy or unintuitive; clashes warn, never block.
- **Co-op later, never blocked:** solo at launch, but the schema, sim and reducers are built for parties ("Later: co-op").
- **Rulings (review, 2026-10-22):** Leech raises the cap; Warded Shell Trophy uses the higher of armor and resistance; Wildcard doesn't count toward the main theme; Static's shock lands on a miss; one reflect rule, the Aegis 5-set reflecting the whole hit; Rift Anchor boosts affixes only; Thief's Glove stays a Motes effect; the tier picker stays though T5 is the only tier at launch; Riftstone is paid before it has a use; one-version boons (Second Look, keystones, Wildcard) and Epics aren't offered again once held; First Blood stays (a stronger Ambush: per enemy, no attack speed cost); the 20 launch events are written; two-handed weapons take both hands (an off-hand needs a one-handed weapon); raid uniques can be Echoes (rolled ones, and the Rift Heart's).
- **Boons:** duplicates upgrade rarity; offers have three fixed slots (main theme, another held theme, any); stat-gated boons; a keystone per theme; seven themes (Mist and Aegis added for evasion and block), 43 boons. Glimmerguard converts crit to evasion after boons.
- **Rewards:** a floor pays when its boss falls.
- **Co-op:** the party moves on once every online member is ready; event fights are personal; a downed member returns at 50% of max HP after the floor boss.

## Open questions

- **Riftstone:** what it crafts. Later. Could share the answer with the raid token shop
  and Voidglass (abyss.md).
