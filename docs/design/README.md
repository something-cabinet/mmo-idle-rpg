# Game Design

Living design docs. Numbers marked *illustrative* are placeholders for balancing,
not decisions.

| Doc | Covers |
|---|---|
| [combat.md](combat.md) | Auto-combat model, formulas, viability, settlement, raids |
| [attributes.md](attributes.md) | Primary attributes, combat stats, stat IDs |
| [equipment.md](equipment.md) | Slots, hands, weapon/armor bases, storage, loadouts |

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
| 2026-10-10 | Rarities: Common, Magic, Rare, Epic, Legendary, Unique. Legendary is randomly generated; Unique is handcrafted. |
| 2026-10-10 | Affix counts: Common 0, Magic 1, Rare 2, Epic 3, Legendary 2 + 1 legendary affix. (Replaces "max 2 affixes" and Epic's guaranteed max tier.) |
| 2026-10-10 | Legendary items carry a **legendary affix**: a small stat bonus that scales with item tier, plus a build-changing effect that is the same at every tier. |
| 2026-10-10 | Uniques are handcrafted outliers with no fixed shape (any stats, any number of build-changing effects). Only rule: they must fit the combat formulas. |
| 2026-10-10 | Uniques don't scale: each unique exists at one tier only. |
| 2026-10-10 | Affix pools are free: any affix can roll on any item, duplicates allowed (replaces themed pools). |
| 2026-10-10 | Affix power budget: averaged over all drops, an affix is worth half the reference value of its stat at the item's tier; the best possible roll equals the reference value (low because items carry up to 3 affixes, duplicates allowed). |
| 2026-10-10 | Affix value formula: tier k picked uniformly in 1..N, value rolled uniformly in [ref(k−1), ref(k)], ref(k) = c × k. |
| 2026-10-10 | Rarity only sets the affix count. Every regular affix, on any rarity, rolls tier 1 to N (no tier reserved for Epic+). Legendary isn't strictly better than Epic: it trades a regular affix for a legendary one. |
| 2026-10-10 | Affix rolls: tier picked uniformly, value rolled within the tier's range, linear growth per tier, per-stat reference table. |

## Open questions

- **TODO (waiting on affix design):** rule for the "equip upgrades" button, i.e. what
  counts as an upgrade (see equipment.md).
- **Drop pipeline numbers:** bag size, per-settle item cap, salvage values.
- **Ring count:** one or two ring slots.
- **Loadout count** and whether an item can be in several loadouts at once.
- **Zones and enemies:** zone list, enemy stat blocks, respawn time.
- **Curves:** XP per level, HP per level, item-level scaling of base stats.
- **Raids:** party size, boss mechanics, rewards.
- **Stat ID freeze:** the list in attributes.md is a draft until the first item is saved.
