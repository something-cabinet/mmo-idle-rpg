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

## On the next wipe (`npm run deploy -- --delete-data`)

Drop these deprecated columns, which stay only so the schema migrates without a wipe:

- `character.essence` and `settle_log.essence`: replaced by `dust` (the settle folds any
  leftover `character.essence` into `dust`).
- `presence.lastChatAt`: replaced by the private `chat_cooldown` table.
