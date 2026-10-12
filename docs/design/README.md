# Game Design

Living design docs. Numbers marked *illustrative* are placeholders for balancing,
not decisions.

| Doc | Covers |
|---|---|
| [combat.md](combat.md) | Auto-combat model, formulas, viability, settlement, raids |
| [attributes.md](attributes.md) | Primary attributes, combat stats, stat IDs |
| [equipment.md](equipment.md) | Slots, hands, weapon/armor bases, storage, loadouts |
| [bases.md](bases.md) | Base templates and names per tier |
| [crafting.md](crafting.md) | Essence, salvage, affix reroll, rarity upgrade, bag expansion |
| [zones.md](zones.md) | Zones, enemy levels, enemy stats, rewards, loot tables |
| [zone-content.md](zone-content.md) | T1 Greenhollow, T2 Thornwood, T3 Frostmaw Pass: enemies, bosses, drops, starter kit |
| [legendary.md](legendary.md) | Legendary affixes: effects, slot pools, formulas |
| [uniques.md](uniques.md) | Uniques: rules, global drops, the list |
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

## Open questions

- **Zones and enemies:** curves in zones.md are illustrative; check them against the gear
  curves once those are set.
- **Raids:** party size, boss mechanics, rewards.
- **Stat ID freeze:** the list in attributes.md is a draft until the first item is saved.
