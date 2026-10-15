# TODO

Things to do later that are easy to forget. Build milestones live in
[docs/ROADMAP.md](docs/ROADMAP.md).

## Before there are many players online

- **Make `presence` private.** Every client subscribes to the whole public `presence`
  table, so each login or logout is sent to every connected player: traffic grows with
  the square of the player count (about 1,100 messages/s at 1,000 online, 110,000/s at
  10,000). Clients only need:
  - the online **count** (top bar) → a 1-row public `world_stats` table, updated on
    enter/leave;
  - **their own** row (session start, the "another tab took over" check) → a
    `my_presence` view;
  - **friends'** online status (Friends tab) → a `my_friends_online` view;
  - the **full list** only while the Online tab is open → subscribe on open,
    unsubscribe on close.

  Changing a table from public to private probably can't be auto-migrated: check
  before starting. Either do it with the next wipe, or add a new private table (e.g.
  `online`) and stop using `presence`.

## Accounts

- **Follow the email when SpacetimeAuth changes a player's identity.** Signing in with
  a second method (magic link, then Google) on the same email can move the player to a
  new `sub`, so a new identity with no character, while the old character sits on an
  identity no login reaches. In `onConnect`: when a registered identity with no character
  arrives and another registered account with the same email has one, move that
  character over (as `transferCharacter` does) and delete the old account row.
  - Only when the token's `email_verified` is `true` (check SpacetimeAuth sends it).
  - Carry `banned` over, or switching login method gets around a ban.
  - Doesn't cover players who already have characters on both identities: those still
    need `transferCharacter` by hand.
  - Alternative: allow only one login method in the SpacetimeAuth dashboard.

## On the next wipe (`npm run deploy -- --delete-data`)

Drop these deprecated columns, which stay only so the schema migrates without a wipe:

- `character.essence` and `settle_log.essence`: replaced by `dust` (the settle folds any
  leftover `character.essence` into `dust`).
- `presence.lastChatAt`: replaced by the private `chat_cooldown` table.

## Life skills (life-skills.md)

Phase 1 (gathering, Smithing, Alchemy, elixirs) is built. Left:

- **Raids use the active elixir** (design: "Boss challenges and raids use the active
  buffs"). `reducers/raid.ts` builds raid stats without buffs today; decide whether a raid
  fight uses charges.
- **Zones preview with and without the elixir** ("viable with Elixir of Wrath"). The
  matchups already include the active elixir; there's no side-by-side yet.
- **Away report: when the elixir slot ran empty**, not only that it did.
- **Balance pass** on recipe costs, times and the elixir numbers once there's play data.
- **Smithing: tempering and smelting** (designed, not built): `item.temper`, the `scrap`
  table, a Scrap option in the loot filter and forge keep rule; Ore (kind 9) from Mining
  in place of Metal, and the Ore → Metal smelt recipe.
- **Tools: speed, not a gate** (planned, life-skills.md "Tools"): gathering tier T no longer
  needs a tier-T tool; tools only add speed. Numbers still to decide.
- **Phase 2:** Enchanting (Essences: forced-stat rerolls), Construction and the Hideout
  (stations, Bedroom offline hours), milestone combat bonuses at 25/50/75/99, total skill
  level on inspect and the friends list, the level-99 title.
- **Phase 3:** Fishing (Fish, material kind 8, Rod tool) and Cooking (meals: a second buff
  slot with its own charges and auto-renew).
