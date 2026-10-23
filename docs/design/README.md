# Game Design

Living design docs. Numbers marked *illustrative* are placeholders for balancing,
not decisions.

| Doc | Covers |
|---|---|
| [combat.md](combat.md) | Auto-combat model, formulas, viability, settlement |
| [raids.md](raids.md) | Raid bosses: party of 4 online, threat, NPC hires, rewards and daily lockout; Wyrm Hollow (T3), The Drowned Moon (T4), the duo The Brothers' Forge (T5) |
| [attributes.md](attributes.md) | Primary attributes, combat stats, stat IDs |
| [equipment.md](equipment.md) | Slots, hands, weapon/armor bases, storage, loadouts |
| [bases.md](bases.md) | Base templates and names per tier |
| [crafting.md](crafting.md) | Dust, salvage, affix reroll, rarity upgrade, bag expansion |
| [life-skills.md](life-skills.md) | Gathering and production skills, tools, buffs, Essences, Hideout |
| [zones.md](zones.md) | Zones, enemy levels, enemy stats, rewards, loot tables |
| [phials.md](phials.md) | Phials: one-fight Alchemy consumables for the Moonwell Deep and raids, made from Voidglass; new Voidglass sources (raid clears, T4+ zone bosses, unique salvage, Mining's Void Geode; the Deep's first clears pay 3× as much) |
| [trading.md](trading.md) | Async gold market (5 listings, 2% listing fee, 10% tax) and friend gifts (5/day); registered level 30+ only |
| [abyss.md](abyss.md) | The Moonwell Deep (first version built): endless solo gauntlet after Selvara: each depth a basic, an Elite and the boss on one HP bar, with Elite and Boss affixes, infinite scaling, first-clear rewards, leaderboard |
| [shifting-rift.md](shifting-rift.md) | The Shifting Rift (designed, not built; was the Chaos Dungeon): weekly roguelike for T5+ (solo at launch, built for co-op), 5 floors of 6 nodes (branching fights, shops and events, the 6th always a boss), gear locked in, run-only boons and Ethereal gear in a separate table and dungeon loadout, weekly resource rewards, free replays |
| [story.md](story.md) | The Broken Moon: the light T1–T9 story that moves the player between zones (a shard per boss), T5 Brightvein Hold and the Shifting Rift |
| [duels.md](duels.md) | Friendly duels against a friend's character (client-only, no rewards) |
| [zone-content.md](zone-content.md) | T1 Greenhollow, T2 Thornwood, T3 Frostmaw Pass, T4 Moonveil Vale, T5 Brightvein Hold: enemies, bosses, drops, starter kit |
| [legendary.md](legendary.md) | Legendary affixes: effects, slot pools, formulas |
| [uniques.md](uniques.md) | Uniques: rules, global drops, the list |
| [cosmetics.md](cosmetics.md) | Titles, name effects and nameplates: earned from milestones, worn from the Character page, shown wherever a player name is |
| [ui.md](ui.md) | Desktop layout and screens (wireframes) |

## Pillars

1. **Idle first.** Offline progress equals online progress. Every mechanic must be
   computable in closed form so the server never has to simulate time passing.
2. **MMO.** Shared world, chat, multiplayer raid bosses. Roles matter in group content.
3. **Classless.** Anyone can use anything. Role and playstyle come from gear choices.
4. **Loot-heavy.** Equipment drops constantly; the design must keep that cheap to store.
5. **Cheap to run.** Built for the SpacetimeDB free tier: no server tick, cost scales
   with player actions.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-22 | Shifting Rift review rulings (shifting-rift.md): boons work where they belong (stat boons in `combatStats`, combat boons and rift effects in `Fighter`, foe rules in `FoeSpec`), not all as "more" multipliers. Leech raises the lifesteal cap; the Warded Shell Trophy defends with the higher of armor and resistance; Wildcard doesn't count toward the main theme; Static's shock lands on a miss; one reflect rule (the Aegis 5-set reflects the whole hit); Rift Anchor boosts affixes only; Thief's Glove stays a Motes effect; two-handed weapons take both hands (an off-hand needs a one-handed weapon); Riftstone is paid before it has a use; one-version boons (Second Look, keystones, Wildcard) and Epics aren't offered again once held; First Blood stays; the 20 launch events are written; raid uniques can be Echoes (rolled ones, and the Rift Heart's). |
| 2026-10-21 | The Chaos Dungeon is renamed **The Shifting Rift** (shifting-rift.md, was chaos-dungeon.md; tables and checks `rift_*`, `test:rift`). Shape settled: 5 floors × 6 nodes, each a fight (1–3 enemies back to back, maybe an Elite), shop or event, node 6 always the boss; no rest or separate Elite nodes (attuning moves to shops and events). Run tier T5 and above only. Elixirs, meals and Phials all stay out. Twin Fang (the dual-wield test) and co-op are cut. Riftstone's use and the boon roster are still open. |
| 2026-10-20 | Raid 3 **The Brothers' Forge** (raids.md), opened by the first Durgrim kill: a duo boss, Brokk (physical, Armored, Anvil Slam) and Sindri (magic, Warded, Fire Bellows). The leader assigns each seat to a brother; attacking one draws his attacks (+20 threat). When one falls the other absorbs him for 5 s and empowers (Molten Hammer: the slam hits everyone, slower; Anvil Hide: armor and resistance 900) unless killed in time. **Brothers in arms**: while both stand each hits at half strength, so a balanced split beats focusing one (simulated 74% vs 47–49%). Enrage 1:55. Six Forgefire variants, three raid uniques with Drawing Fire, Twin Flame and Stoke the Fire (effects 56–58; Stoke also works in the Moonwell Deep). The raid sim takes any number of bosses; Wyrm Hollow and The Drowned Moon play as before. |
| 2026-10-20 | T5 off-hand uniques (uniques.md): **Thane's Failing Breath** (War Horn, Fading Rally: 50% more attack speed on the first attack, 10% less per attack, down to 20% less from the 8th; the wearer only) and **Glimmerguard** (Main Gauche, Parry and Thrust: no normal crits, each 1% crit chance gives 4 evasion rating, the attack after a dodge crits). Effects 54–55, in the matchup formulas and the fight, raid and duel sims. |
| 2026-10-20 | T5 uniques (uniques.md): **Forgefather's Maul** (Anvil Strength: +1 physical damage per point of armor, 25% less attack speed), **Veinseeker** (True Shot: never misses; each 1% accuracy above your level's own gives 1% more damage), **Shardbound Band** (Resonance: 8% more damage and max HP per other unique worn). Effects 51–53. Uniques now carry `uniqueId` into combat so Resonance can count them. |
| 2026-10-20 | **The T5 step**: enemy HP and DPS × 1.1 from T5 on, on top of the × 1.05 climb (`TIER_STEP`), so T5, which opens the Chaos Dungeon, is the first wall. Simulated: the hardest regular enemy 84% won at T4 → 22% at T5 with farming gear; well-geared players beat Selvara 25%, Durgrim 4%. T5's map is a single road down a terraced mine pit to the lair at the bottom, instead of a branching climb. |
| 2026-10-20 | T5 **Brightvein Hold** (zone-content.md): dwarven hold, levels 46–55, boss Durgrim, the Last Thane (phys, Warded: the last damage/defense mix). Glowvein Crawler evades behind armor, Brightsteel Golem regenerates. Bases dealt by theme, not shuffled. No secret area or T5 uniques yet. The Moonwell Deep's reward tier now reaches T5 (capped at the highest zone). |
| 2026-10-20 | Story spine **The Broken Moon** (story.md): Selvara cracked the moon, every zone boss holds a shard that points to the next zone. T5 is **Brightvein Hold**, a dwarven mine the largest shard fell into; the Last Thane's death opens the rift, so the **Chaos Dungeon unlocks with the T5 boss** (was T2). Tier metal words renamed: Mithril → **Brightsteel** (T5), Adamant → **Verdite** (T6); names are built at runtime, so no migration, and the art stays. |
| 2026-10-19 | The Drowned Moon eased back to its target (test:raid: a full party of random T4 gear won 72%, aim 75–92%): Umbriel's HP 38,000 → 35,000, Moonfall 440 → 400, and enrage 4:30 → 3:40 so two players alone still almost never win (they only won near the old enrage). Now 78% for four, 50% for three, 4% for two. |
| 2026-10-19 | Elixirs are for farming only: the Moonwell Deep and raids ignore them and use no charges. **Phials** (phials.md): one-fight consumables for those modes, picked per attempt and used up win or lose, brewed by Alchemy from Voidglass. The Deep's first clears pay 3× the Voidglass (3 a depth, 18 on every 10th; past 100: 6 + 2 per 10 depths), since they pay once. Four slow sources: raid clears, a rare drop from T4+ zone bosses, unique salvage (2, any tier) and Mining's Void Geode. |
| 2026-10-19 | Cosmetics (cosmetics.md): three slots, each picked on the Character page: **title** (small text above the name, "…" when too long), **name effect** (fixed colour and effect: glow, shimmer, flicker) and **nameplate** (background plate, one look in both themes; any effect on any plate, readability is the player's call). All earned from milestones already recorded (bosses, secrets, raid wins, Moonwell depths, level 100, skills at 99), granted on entering the world and when a condition can change; none bought yet; seasonal rewards wait for seasons. Chat shows the effect only only, without motion. |
| 2026-10-19 | Elixirs reworked into **grades** (life-skills.md, "Alchemy"): Elixir (T1–T3 materials), Greater (T4–T6), Divine (T7–T9) at 1× / 1.5× / 2× the bonus, the same in every zone (no more half effect above the tier). The material's place in its grade sets the yield: 2 / 3 / 4 elixirs a brew. The old herb-brewed Greater elixir becomes **Infuse**, a slot toggle: each new elixir uses a rare herb of its grade (any tier) for 1.5× the bonus. 40 items become 15. Abyss milestones give a power elixir of the grade + a rare herb. No wipe: migrate.ts merges old stock into grades, refunds the herbs of old Greater stock, and rewrites the active elixir, running brews and logs. |
| 2026-10-19 | The Moonwell Deep (abyss.md) opens with the first Selvara kill (T4 boss), alongside The Drowned Moon, instead of a Drowned Moon win. Lore: her death leaves the moonwell unsealed. |
| 2026-10-18 | Moonshadow reworked (legendary.md): all armor and resistance become evasion rating (was: the hit after a dodge deals 50% less, landed hits 10% more). That old effect is now the Defense legendary **Afterimage** (49): 50% per copy, cap 75%, no downside. Moonshadow Jerkin rolls max HP instead of evasion rating. |
| 2026-10-17 | Scrap is renamed **Recycle** (distinct from Salvage), is instant and leaves Smithing (life-skills.md, "Recycle into materials"): recycling a bag item, or a drop or forged base the filters reject, gives its materials at once (no smelting queue, no Smithing XP). Yields cut to 1 / 2 / 3 / 8 / 20 materials by rarity (were 2 / 3 / 5 / 15 / 40 per 30 s smelt). Smelting is Ore only. No wipe: migrate.ts turns held scrap into materials at the old yields and empties the `scrap` table. Code keeps the old name (`scrapItems`, the filters' `scrap` flag, `SCRAP_YIELD`). |
| 2026-10-17 | Online respawn (combat.md, "Respawn"): a live fight lost in a matchup won on average costs a 30 s respawn, then the same target again, instead of going idle. Logged per settle (`respawns`) and shown in the combat loot log. Offline settles a viable matchup at the kill rate live fights average out to (400 sampled fights: losses and respawns included; combat.md, "Offline losses"), so close matchups no longer earn 100% offline. |
| 2026-10-16 | Trading designed, not built (trading.md): async market for gold only and gifts to mutual friends. Only registered accounts with a level 30+ character can list, buy or gift. Max 5 active listings per account. Listing fee 2% (min 10 gold, never refunded) and 10% sales tax, both burned. 5 gifts per day. A mailbox catches gifts and returns. Clients subscribe to listings only while browsing, with filtered queries. The trade log keeps full items for 90 days. |
| 2026-10-16 | Your armor and resistance scale with the attacker's level (enemy, raid boss or duel opponent), like evasion already did, not your own: levelling up no longer lowers your mitigation, and lower zones are easier to survive. Frozen Blood's attack speed cost eased to × 0.8 (was × 0.6). |
| 2026-10-16 | T4 Moonveil Vale (zone-content.md): fallen elven valley, boss Selvara (magic, armored), secret Moonlight Garden (1,000 Moonmoth kills) with the Moonlit Champion. T4 uniques (uniques.md): Moonlight Greatsword (bound to the Champion), Waxing Crescent, Moonshadow Jerkin, Tear of the Moon, and Lunatic's Wager (no effect, stats roll −1.4 to +1.4 × value). New unique effects 45–48: Moonlight, Waxing Moon, Moonshadow, Lunar Insight. |
| 2026-10-16 | Difficulty climb replaces the wall-tier sawtooth: enemy HP and DPS × 1.05^(T−1), compounding (T4 1.16, T9 1.48), so enemies outgrow weapon base damage and every tier leans harder on affixes and rerolls. T2 enemies +5%, T3 unchanged within 0.3%. Boss HP gets a bonus ramping × 1.1 (T2), × 1.2 (T3), × 1.3 from T4 (rewards unchanged), so from T4 the boss pays less per hour than the zone's strongest enemy. |
| 2026-10-15 | Masterwork removed: forged items roll affix tiers 1..N like drops, at any Smithing level (was a floor of 1 + floor((level − requirement) / 20)). Smithing level still raises the forge's Magic chance and speed. |
| 2026-10-15 | Material IDs renumbered from `tier × 10 + kind` (room for 9 kinds) to `kind × 100 + tier` with explicit permanent kind IDs (`MATERIAL_KIND_IDS`): ~650 kinds and 99 tiers in the same `u16` column. No schema change and no wipe: migrate.ts rewrites `material` rows and settle-log material lists once after the publish (recorded in a private `migration` table), run from the online settle timer and on connect. |
| 2026-10-15 | Mining gives only **Ore** (material kind 9, gathering-only), no more Metal; Smithing smelts 1 Ore → 1 Metal in 12 s, so Mining and Smithing level together and Smithing has a steady XP recipe. Combat still drops Metal. 300 Metal from Ore takes 2 h (Mining, then smelting), where Mining alone took 1 h. |
| 2026-10-15 | Smithing gets two recipes beyond forging (life-skills.md). **Tempering**: +2% base stats and implicits per level on an owned item, 10 levels (+20%), max +1 per 10 Smithing levels and +10 at 99; step k costs 10k main material, 0.05k h of gold, 3k min. **Smelting**: the loot filter can send rejected items to scrap instead of salvage (no Dust or gold); 1 scrap smelts into 2–40 materials of its kind by rarity in 30 s, with Smithing XP. |
| 2026-10-15 | Weapon damage (the offense curve: weapon hit, flat added damage, enemy HP) grows ×2.1 per tier to T3, then ×1.6 like gear HP: a T9 sword hits 740 (was 3,782), and last tier's weapon keeps ~62% of the new one's damage. Live zones (T1–T3) are unchanged. |
| 2026-10-14 | Enchanting (life-skills.md): the level gates the Essence tier (making or using tier T needs level 10(T−1)+1), not the stat. Using is gated because Essences will also drop rarely from enemies. Every craftable stat can be made from level 1; lifesteal, item find and gold find have no recipe and only drop. An Essence is a normal reroll that guarantees the stat; the level still raises the affix tier floor (1 + floor(level / 20), capped at the item tier). A tier-T Essence works on items of tier ≤ T, so enchanting higher-tier gear needs a higher level. Planned drop-only rare Essences add an extra effect, such as a higher tier floor (e.g. T8+); other effects TBD. Replaces the per-level stat unlock table. |
| 2026-10-14 | Life skills phase 1 done (life-skills.md): Smithing (forge any zone base of an unlocked tier, upgrade tools one tier at a time) and Alchemy (5 elixirs) run a production queue that falls back to the combat target when its count, inputs or bag run out. One elixir slot; charges are kills, auto-renew from stock, and they apply in `project()` and `simulate()` like a level-up cap. Production gives as much character XP as skill XP. |
| 2026-10-14 | Skilling gives character XP (life-skills.md): per gathering action, as much as its skill XP (about a fifth of farming's XP per hour), still no gold or drops. Rested XP is dropped: skilling's own XP already softens its cost. Each life skill has its own page in the client. |
| 2026-10-13 | Salvage also gives gold (Common 10, Magic 20, Rare 50, Epic 200, Legendary 600 × 2.9^(T−1), ~150 gold/h when keeping Rare+), and Dust is cut ~20% in exchange (Common 0.8, Magic 1.6, Rare 4, Epic 16, Legendary 50). |
| 2026-10-13 | Raids (raids.md): party of 4, online only, a Raids page under Adventure. First raid Wyrm Hollow (T3, opens after Hrimvald): one fight per start, played by the server and replayed by the clients; each boss attack picks a fighter weighted by threat (e^(5 × threat): more threat, more attacks, anyone can be hit), plus a party-wide breath; heals land on allies. Empty seats can be filled with hired NPCs (2,000 gold each, paid by the leader) at 0.5× a fixed reference player per raid (not scaled to the party), a last resort that encourages grouping; they don't heal. A win gives each player, for up to 3 clears a day (losses don't count; 00:00 UTC), 3 T3 Epic+ items (each Epic 75 / Legendary 22 / Unique 3% from a raid-only pool), 10 raid tokens, gold and XP. Token shop and a precious raid material are planned, not built. *Illustrative numbers.* |
| 2026-10-13 | Friendly duels (duels.md): fight a friend's character (current level and active loadout) for fun, no rewards. Client-only simulation, player against player with the combat formulas, 90 s limit then points; replayed hit by hit at real speed (2× toggle), with win odds over 500 duels. |
| 2026-10-13 | Secret areas (zones.md): found by kills of one regular enemy of the zone, rumoured halfway (a shimmering spot and a rumour line), enforced in `setTarget` from `enemy_kill`. First: the Sunken Chapel in Greenhollow (1,000 Bog Wisp kills, hint at 500) with the Drowned Bellringer (T2 strength: Lv 22, Magic, Armored; XP 90, gold 24, so ~4.5× drops, and Rare and better × 2.5 via `rareDropMult`), whose enemy-bound unique The Drowned Hymnal drops only there (~0.25% per kill) and is its only unique. |
| 2026-10-13 | Zone map (zones.md): each zone is a 2D map of 4 areas joined by branching paths. Nothing in an open zone is locked; an area shows as ??? until the player fights there (first kill, or while fighting there). Client-only, derived from `enemy_kill`; no server change. Replaces two earlier tries: a linear path with per-area kill gates (felt like a list, made idle players keep switching targets) and zone-wide kill thresholds with an Explored % bar (felt like a chore). |
| 2026-10-13 | Rare encounters (encounters.ts), rolled in the settle with their own seed: 1 per 150 kills (~13 per 8 h). Treasure Goblin (30 kills of gold, 35%), Forager's Stash (30 kills of the enemy's materials, 30%), Hidden Cache (one Rare 75% / Epic 22% / Legendary 3% item from any of the zone's bases, kept unless the bag is full, 20%), Elite (the target at 1.5× HP and DPS, fought with the current gear: a win gives 15 kills of XP and gold, a loss means fleeing with nothing; never while farming a boss, 15%). Logged per settle (`encounters`), shown in the loot log, away report and as toasts. Adds ~+8% gold, ~+6% materials, ~+10% Rare+ items. *Illustrative.* |
| 2026-10-13 | Discovery, for a sense of exploration: enemies show as ??? (level and a threat read visible, still fightable) until killed or targeted; bosses stay named. In an enemy's drop list, items (per base and tier) show as ??? until one drops for the character, salvaged drops included, and the Item Index shows them (and uniques) as ??? too, so players find out who drops what and slowly fill out the index. Recorded in a private `discovery` table inside the settle (one row per first sighting, no extra reducer calls); existing characters are backfilled from their bag. Each settle's new finds are listed in its settle log (`discovered`) and shown as "New discovery" in the loot log and away report. Zones show "Discovered: enemies x/y · items x/y". |
| 2026-10-13 | Flavour text: a line per walk between fights, per zone, picked client-side from a seed (character, fight start). No server cost. |
| 2026-10-13 | Life skills (life-skills.md): the character either fights or skills, never both. Gathering (Mining, Woodcutting, Foraging, Fishing) and production (Smithing, Alchemy, Cooking, Enchanting, Construction), levels 1–99, tier T needs skill level 10(T−1)+1 and zone T unlocked. Hide, Cloth and Core stay combat-only. Production queues fall back to the last combat target when done. |
| 2026-10-13 | Buffs (life-skills.md): one meal and one elixir active; power and profit elixirs share the slot. They last a number of kills (not time), so losing fights and walking use none, and settlement only needs one more cap on kills. Effects are separate "more" multipliers after gear (×1.1–×1.25). No boss-only consumables. Rested XP is also counted in kills. |
| 2026-10-13 | Gathering tools (Pickaxe, Hatchet, Sickle, Rod) are a tier per character, not items; tier T gathering needs a tier ≥ T tool, forged by Smithing. Rested XP: skilling banks 0.5 s per second (cap 4 h) of double combat XP. |
| 2026-10-13 | Essence renamed to Dust (the word "Essence" is reserved for a future item or material). Stored in new `dust` columns; the old `essence` columns stay until the next wipe, and each settle moves what is left in `character.essence` into `dust`. |
| 2026-10-13 | Drop chances × 1.5 across the board (Common 6.75% … Legendary 0.0225%), and Unique a further × 5 (7.5× overall, 0.0225%, ~1.3 a day), so uniques are as common as legendaries. Tuned via `DROP_RATE_MULT` and `UNIQUE_RATE_MULT`. |
| 2026-10-13 | Rerolls cost half (`REROLL_COST_MULT` 0.5): Magic 0.125 h, Rare 0.25 h, Epic 0.5 h, Legendary 1 h of farming. Upgrade costs unchanged. |
| 2026-10-13 | No per-settle keep cap (was 50): kept drops fill every free bag slot, highest rarity first, and only a full bag salvages them. A long offline session now fills the bag instead of stopping at +50. |
| 2026-10-12 | Friends, kept simple: add a character by name to a one-way friend list (no request or acceptance), see who is online, and inspect a friend's worn gear even while they're offline (as of their last settle). Max 100. |
| 2026-10-12 | Difficulty rhythm: odd tiers from 3 are wall tiers with enemy HP and DPS × 1.1 (not compounding), so T2→T3, T4→T5… are harder steps than T1→T2, T3→T4…. Rewards unchanged. |
| 2026-10-09 | One character per account (alts would just be extra idle farms). |
| 2026-10-09 | No player trading for now. |
| 2026-10-09 | Items are stored literally (final values saved on the item). |
| 2026-10-09 | Combat is a pure stat check with no active abilities. |
| 2026-10-09 | A build that dies before killing the enemy gains nothing, online and offline. |
| 2026-10-09 | Multiplayer raid bosses are online only; all other enemies can be farmed offline. |
| 2026-10-10 | Level-up gives +1 to every primary attribute plus a little HP. No point allocation. |
| 2026-10-10 | Most stats come from gear. |
| 2026-10-10 | Weapons define what an attack does (damage, heal, threat); this is how roles form. |
| 2026-10-10 | Loadouts: players save and switch gear sets. |
| 2026-10-10 | Both two-handed and one-handed + off-hand. |
| 2026-10-10 | No dual wield for now: the off-hand is a shield or focus, never a weapon. Formulas and storage must keep it possible to add later. |
| 2026-10-10 | No shield block. |
| 2026-10-10 | Item bases have characteristics (e.g. dagger fast/weak, plate tough/slow). |
| 2026-10-10 | Loot filter: auto-salvage below a rarity threshold, but keep items with whitelisted affixes. |
| 2026-10-10 | No upgrade score shown on items; players compare kept items themselves. |
| 2026-10-10 | Equipping is manual and online only, with one "equip upgrades" button. No auto-equip offline. |
| 2026-10-10 | Auto-equip button with per-loadout profiles (Damage, Survival, Loot), evaluated against a fixed reference dummy at the character's level, never the current target. Equips directly on click. |
| 2026-10-10 | One base per family per tier for now; room to add more later. Each tier renames the base (Rusted Sword → Bogiron Sword). |
| 2026-10-10 | Armor slot split: chest 40%, head/hands/feet 20% each. |
| 2026-10-10 | Heal weapons heal most but not all incoming damage solo (healing staff 130T/hit, scepter 170T/hit). |
| 2026-10-10 | Flat heal affix c = 26/tier (not 80), so it adds the same share to a heal weapon as flat damage does to a damage weapon. |
| 2026-10-11 | Small starting numbers (D2/PoE2 feel): level 1 = 100 HP and 1 of each primary; +10 HP and +1 primaries per level. |
| 2026-10-11 | Separate growth curves: damage ×2.1/tier, gear HP ×1.6, heal ×1.33, armor/resist/evasion linear, percent (N+3)/12. T1 sword hits 10, T9 3,782 base (~8.5k average build hit). |
| 2026-10-11 | Armor and evasion constants rescaled: mitigation d/(d + 5·level), evasion r/(r + 10·level). |
| 2026-10-11 | ~~Affix tiers are relative slices of the item's range: tier k on a tier-N item rolls in [ref(N)·(k−1)/N, ref(N)·k/N]; average ref(N)/2 for every stat.~~ Replaced later on 2026-10-11. |
| 2026-10-11 | Affix tiers are global (same range on every item tier). Linear and percent stats: 9 equal slices of the T9 range. Offense, life and heal stats: tier k rolls in [ref(k−1), ref(k)]. A tier-N item still rolls affix tiers 1..N uniformly. |
| 2026-10-11 | Flat values stored in fixed point (hundredths); UI rounds. |
| 2026-10-11 | Each zone has a boss; first kill (online challenge, deterministic) unlocks the next zone. Boss is farmable afterwards. |
| 2026-10-11 | New characters pick a Common starter weapon (sword, bow, wand or healing staff) and get a Rawhide Vest and Boots. |
| 2026-10-11 | T1 is a tutorial zone: enemies start at level 1, weaker enemies use 1.15^o so the first fights are almost free. |
| 2026-10-11 | Every affix adds exactly one stat (for now). |
| 2026-10-11 | Legendary affixes in 3 groups (offense, defense, utility), each tied to equip types. First 9: Overcrit, Spellblade, Zealot's Oath, Juggernaut, Phantom Step, Thornshell, Swift Hunter, Midas Touch, Fortune's Favor. |
| 2026-10-11 | Same legendary effect twice applies once; small stat bonuses stack. |
| 2026-10-11 | Legendary pools by equip type: weapons + tome roll Offense, armor + shield roll Defense, jewelry rolls Utility. Effects are generic so no roll is dead. Added Voidtouched, Glass Cannon, Spellward, Scholar's Focus (13 total). |
| 2026-10-11 | Legendary effects are positive-only and stack up to a cap (one copy is already worth it; copies past the cap are wasted). Effects with a trade-off are unique-only and don't stack: Spellblade, Juggernaut, Midas Touch, Voidtouched, Glass Cannon, Spellward, Scholar's Focus. (Replaces "same legendary effect twice applies once".) |
| 2026-10-11 | New legendary effects: Executioner, Rending, Spellbreaker (Offense); Second Wind, Ironclad, Runeguard (Defense); Seasoned, Prosperity (Utility). Zealot's Oath loses its lifesteal (no heal ↔ damage loop); Swift Hunter is −40% walk time per copy. |
| 2026-10-11 | Uniques: stats roll in [0.8, 1.4] × value (widened from [0.9, 1] for more exciting rolls) and are stored on the item like other stats; effects stored as a list of effect IDs. A legendary effect on a unique counts as one stacking copy. |
| 2026-10-11 | Uniques drop globally (replaces per-enemy uniques): in a tier-N zone, any unique of tier ≤ N, each tier lower at half weight. Uniques are always kept by the loot filter. First 7 for T1–T2. |
| 2026-10-11 | Unique color is magenta (was gold-brown, too close to Rare, Legendary and the gold accent). |
| 2026-10-11 | Tier names T1–T4 reworked for a fantasy feel with a clear tone ladder (cheap, cheap, solid, a little fancy): metal Rusted, Bogiron, Dwarven, Elven; wood Driftwood, Gnarled, Heartoak, Silverbark; cloth Sackcloth, Homespun, Spidersilk, Mageweave; leather Ratskin, Boarhide, Wolfhide, Owlbear; tome Tattered, Dog-eared, Scholar's, Gilded. |
| 2026-10-11 | UI: desktop first, mostly text and icons, simple fight view with floating damage numbers, placeholder art. |
| 2026-10-10 | 4 gems, one per primary; each gem is its own ring and amulet base. Gem names change every 3 tiers (Ruby → Bloodstone → Magmaheart). |
| 2026-10-10 | Rarities: Common, Magic, Rare, Epic, Legendary, Unique. Legendary is randomly generated; Unique is handcrafted. |
| 2026-10-10 | Affix counts: Common 0, Magic 1, Rare 2, Epic 3, Legendary 2 + 1 legendary affix. (Replaces "max 2 affixes" and Epic's guaranteed max tier.) |
| 2026-10-10 | Legendary items carry a **legendary affix**: a small stat bonus that scales with item tier, plus a build-changing effect that is the same at every tier. |
| 2026-10-10 | Uniques are handcrafted outliers with no fixed shape (any stats, any number of build-changing effects). Only rule: they must fit the combat formulas. |
| 2026-10-10 | Uniques don't scale: each unique exists at one tier only. |
| 2026-10-10 | Affix pools are free: any affix can roll on any item, duplicates allowed (replaces themed pools). |
| 2026-10-10 | Affix power budget: averaged over all drops, an affix is worth half the reference value of its stat at the item's tier; the best possible roll equals the reference value (low because items carry up to 3 affixes, duplicates allowed). |
| 2026-10-10 | ~~Affix value formula: tier k picked uniformly in 1..N, value rolled uniformly in [ref(k−1), ref(k)], ref(k) = c × k.~~ Replaced below. |
| 2026-10-10 | Rarity only sets the affix count. Every regular affix, on any rarity, rolls tier 1 to N (no tier reserved for Epic+). Legendary isn't strictly better than Epic: it trades a regular affix for a legendary one. |
| 2026-10-10 | Affix rolls: tier picked uniformly, value rolled within the tier's range, per-stat reference table. |
| 2026-10-10 | Crit is PoE2-style: weapons have a base crit chance; "increased crit chance" modifiers scale it and stack additively. |
| 2026-10-10 | Crit chance is uncapped; chance above 100% does nothing for now, reserved for future legendary affixes. |
| 2026-10-10 | Evasion is a rating with diminishing returns vs enemy level (like armor), hard cap 60%. |
| 2026-10-10 | ~~Percent stats and primaries have a fixed affix reference.~~ Replaced below. |
| 2026-10-10 | 9 item tiers (1 weakest, 9 strongest). Affix tiers are 1–9 too; a tier-N item rolls affix tiers 1..N. |
| 2026-10-10 | ~~Affix tier k rolls in [ref(k−1), ref(k)], global ranges.~~ Replaced on 2026-10-11 by relative slices. |
| 2026-10-10 | Heal stats only scale heal effects. |
| 2026-10-10 | Lifesteal is tiny and rare: low values, low affix weight, cap 3%. |
| 2026-10-10 | Affixes have drop weights; free pools still apply. |
| 2026-10-10 | Primaries kept as is; per-point values set so a best-roll primary affix ≈ 1.2 affixes. |
| 2026-10-10 | Penetration capped at 75%. |
| 2026-10-10 | One zone per tier for now (9 zones); more zones per tier may come later. |
| 2026-10-10 | Enemy level averages 10 × zone tier, each enemy type fixed within ±5 (T1: 5–15 … T9: 85–95). |
| 2026-10-10 | The player picks one target enemy in the zone; settlement uses only that enemy. |
| 2026-10-10 | Each enemy has its own XP, gold and loot table (rarity chances, base weights, optional uniques), so players can target-farm. |
| 2026-10-10 | Stronger enemies give more XP and gold, growing faster than their stats so they always pay more per second. |
| 2026-10-10 | Enemy strength within a zone scales with level offset (stats ×1.08^o, rewards ×1.12^o), not raw level. |
| 2026-10-10 | Each base drops from exactly one enemy per zone; bases are split equally across a zone's enemies, shuffled per zone. |
| 2026-10-10 | Steep reward curve for an endgame feel: XP and gold ×2.9 per tier (T9 average enemy: 100k XP, 25k gold). |
| 2026-10-10 | Drop chances are set from targets per session (kills are in the thousands): independent chance per rarity per kill, e.g. Epic 0.1%, Legendary 0.01%, Unique 0.002%. |
| 2026-10-10 | Per-settle item cap applies after the loot filter and salvages lowest rarities first. |
| 2026-10-10 | Max level 100. XP to next level = 166 × 1.19^L (~5 weeks to 90, ~3 months to 100 for a reference player). |
| 2026-10-10 | Sinks: reroll one affix and upgrade rarity (up to Legendary) for gold + Essence; costs = hours of farming at the item's tier, ×2.9 per tier. |
| 2026-10-10 | One salvage material, Essence, scaled ×2.9 per tier. |
| 2026-10-10 | ~~Base stats scale linearly with tier; sword hits for 400 × T.~~ Replaced on 2026-10-11. |
| 2026-10-10 | ~~Flat added damage/heal is normalized by weapon speed (same DPS on every weapon).~~ Replaced on 2026-10-11. |
| 2026-10-11 | Flat added damage and heal are a straight bonus per hit (fast weapons get more from them). |
| 2026-10-11 | Online time is settled as live fights (seeded per character and fight start, replayed identically by the client); offline time keeps the expected-value formulas. |
| 2026-10-10 | Two ring slots, 4 loadouts (items can be shared between loadouts), bag 200 expandable to 400 with gold. |
| 2026-10-13 | Auto-equip profiles are Damage (phys), Damage (magic), Healing, Survival (phys) and Survival (magic); Loot is removed. Slots can be locked against auto-equip. |
| 2026-10-15 | Lifesteal is rare but useful: best roll 1.5% (affix tier 1 rolls 0.25–0.67%), cap 5%. Affix tier 1 rolls from 1, not 0, for whole-number stats. |

## Open questions

- **Zones and enemies:** curves in zones.md are illustrative; check them against the gear
  curves once those are set.
- **Raids:** what raid tokens buy.
- **Stat ID freeze:** the list in attributes.md is a draft until the first item is saved.
