# Trading

Moving items between players: an async **market** (sell items for gold) and **gifts** to
friends. Numbers marked *illustrative* are placeholders for balancing.

**Status: designed, not built.** Every part is new: tables (`market_listing`,
`listing_timer`, `mailbox`, `gift_count`, `trade_log`), views, reducers and the Market
tab. No existing table changes, so it ships without a wipe or a migration.

## Goals

- **Player-driven economy** (PoE-style): players set prices and the server only matches
  a buyer to a listing.
- **Async, like everything else** (Pillar 1). Neither side needs the other online:
  list, log off, come back to gold.
- **No alt farms.** Accounts are free and the game plays itself, so trade access must
  cost real progress. That's what the gate below is for.
- **Gold leaves the game.** Every sale burns some gold (the tax), so a market where
  everyone farms passively doesn't inflate without limit.
- **Cheap to run** (Pillar 5): no tick and no matching engine. Cost scales with listings
  and purchases.

## Eligibility

A character may **list, buy or send a gift** only if:

| Rule | Why |
|-|-|
| Account is `Registered` (not `Guest`) | Guest identities are free and disposable. Registered ones cost an email. |
| Character level ≥ **30** (`TRADE_MIN_LEVEL`) | An alt has to reach mid-game before it can pass anything on. |
| Account not `banned` | — |

Gift **recipients** must be `Registered` (any level), so a gift never lands on an
identity that lives in one browser's storage. A new friend can receive starter gear
but can't pass it on until they reach level 30 themselves.

The server checks these rules in every trade reducer. The client also hides trade
buttons for ineligible characters, but that only spares players an error message.

## What can be traded

- **Items only** in v1. Gold moves only as the price of a sale. Materials, Dust,
  supplies and tools aren't tradable (could become a later currency exchange).
- Any item **not equipped in any of the 4 loadouts** (`loadout.slots`). Unequip first.
- The item keeps everything: rarity, affixes, legendary, uniqueId, effects, temper and
  the `locked` flag. A tempered item is worth more, which rewards Smithing.
- No bound items in v1. If raid drops or uniques flood the market, add a `bound` flag
  later (see Open questions).

## Market

### Listing

`listItem(itemId, price)`:

1. Check eligibility, ownership (`requireItem`) and that no loadout has the item equipped.
2. Check that `1 ≤ price ≤ MAX_PRICE` (*illustrative* 10¹²). Price is in gold (`u64`).
3. Check that the account has fewer than **5 active listings** (`MAX_LISTINGS`).
4. **Settle the seller**, then charge the **listing fee** (see "Fees"). Refuse if the
   seller can't afford it.
5. **Escrow:** delete the `item` row and copy its data into a new `market_listing` row.
   While listed, the item is in no bag and has no item ID, so it can't be equipped,
   salvaged, crafted, tempered, gifted or listed twice.

`market_listing` (public):

| Column | Notes |
|-|-|
| `id` | u64, autoInc |
| `sellerId` | character ID (btree index) |
| `sellerName` | Snapshot, like `raid_member.name` |
| `item` | `ItemData`: every `item` column except `id` and `characterId` |
| `slot`, `tier`, `rarity`, `baseId`, `uniqueId` | Copied out of `item` (btree indexes) so subscriptions can filter on them. SpacetimeDB can't filter on fields inside `item`. `uniqueId` = 0 for non-uniques. |
| `price` | u64 gold (btree index) |
| `listedAt` | timestamp |
| `expiresAt` | `listedAt + LISTING_DURATION` (*illustrative* 7 days) |

The table is public, but clients **never subscribe to all of it** (see "Cost"):

- **Subscribe only while the Market tab is open**, with a filtered query built from the
  browse filters, for example
  `SELECT * FROM market_listing WHERE slot = 3 AND tier = 2 AND rarity >= Rare`.
  Changing a filter swaps the subscription. Leaving the tab drops it.
- Affix and stat filters can't run on the server, because affixes are inside `item`.
  The client applies them to the rows its subscription returns.
- **Own listings** come from a private `my_listings` view, which works with the Market
  tab closed (for the 5-slot strip and sale notices).

### Buying

`buyListing(listingId, expectedPrice)`:

1. Check eligibility, and refuse if the buyer is the seller.
2. Refuse if the listing is gone, expired, or `price ≠ expectedPrice`. This stops
   races and bait-and-switch: a buyer never pays a price they didn't see.
3. **Settle the buyer** first, so idle gold earned since the last settle counts.
4. Refuse if the buyer has less gold than the price or a full bag (`bagSize`). Buying is
   an online action, so the buyer can make room and try again.
5. Buyer pays `price`. Seller gets `price − tax`. The tax is burned.
6. Insert the item into the buyer's bag as a new `item` row (new ID), delete the
   listing, write a `trade_log` row.

The seller gets the gold added straight to `character.gold`, online or offline. Gold is
additive, so the seller doesn't need a settle. The seller's client sees the sale in
`trade_log` (via a `my_trades` view) and shows a notice on the next visit.

### Fees

Both fees are paid by the seller and burned (gold sinks).

**Listing fee**: **2% of the price, minimum 10 gold** (`LISTING_FEE`,
`LISTING_FEE_MIN`, *illustrative*), paid when the item is listed.
- **Never refunded**: not on a sale, a cancel or an expiry.
- It scales with the price, so parking an item at an absurd price costs something,
  and changing a price (cancel, then relist) costs a new fee. Sellers have a reason to
  price fairly the first time.
- The minimum makes cheap junk listings cost something, so the 5 slots go to items
  worth selling.

**Sales tax**: **10% of the price** (`MARKET_TAX`, *illustrative*), taken from the
seller's proceeds when the item sells.
- It's the market's main gold sink, and it puts a cost on moving gold between
  accounts through fake sales.

Both are rounded **up** (`ceil`). A sale at the first price costs the seller 12% in
total.

### Cancel and expiry

- `cancelListing(listingId)`: the seller takes the item back any time. The listing
  fee is not refunded.
- After `LISTING_DURATION` the listing expires, so an inactive player's 5 slots don't
  stay on the market forever. There's no server tick: a scheduled table
  (`listing_timer`, one row per listing, like `raid_timer`) fires `expireListing` at
  `expiresAt`. `buyListing` also refuses expired listings, in case the timer runs late.
- A cancelled or expired item goes back to the seller's bag, or to the **mailbox** if
  the bag is full (cancel and expiry can't fail).

## Gifts

`giftItem(itemId, friendId)`:

1. Check the sender's eligibility, and that the recipient is `Registered`.
2. **Mutual friends only:** the sender has the recipient on their friend list **and**
   the recipient has the sender on theirs (`friend` rows are one-way). This stops
   strangers spamming gifts, and unwanted items.
3. Check ownership, and that no loadout has the item equipped.
4. **5 gifts per sender per day** (`MAX_GIFTS_PER_DAY`), resetting at 00:00 UTC (like
   raid clears). Counted in `gift_count` (`characterId`, `day`, `count`).
5. Move the item into the recipient's mailbox and write a `trade_log` row.

Gifts are items only (no gold) and free (no tax). The daily cap does the job the tax
does on the market: it keeps gifting from becoming a pipe that lets one player feed
another without limit.

## Mailbox

Holds items waiting for their owner: gifts, and market items returned to a full bag.

> **Built since (2026-10-20) for system mail:** the `mail` table (reducers/mail.ts, README
> "Sending mail"). It already has a `sender` (`System` / `Player(characterId)`) and holds
> attached items in escrow as `item` rows with `characterId` = 0, so a gift can move the
> existing row instead of copying it. Build gifts on it rather than the table below: add
> `Gift` / `Returned` as needed, and the cap and claim-all rules here.

`mailbox` (private, read via a `my_mailbox` view):

| Column | Notes |
|-|-|
| `id` | u64, autoInc |
| `characterId` | recipient (btree index) |
| `item` | `ItemData` |
| `kind` | `Gift` / `Returned` |
| `fromName` | sender's name for gifts |
| `at` | timestamp |

- `claimMail(mailId)` / `claimAllMail()` move items into the bag while it has room.
- Cap **50 items** per mailbox (`MAILBOX_SIZE`, *illustrative*). A gift to a full
  mailbox is refused with a message. Returns from cancel or expiry are always accepted
  (over the cap if needed), so an item is never lost.
- Mail doesn't expire.

## Trade log and audit

`trade_log` (private; each party reads their own rows through `my_trades`, and admins
read all of them):

| Column | Notes |
|-|-|
| `id`, `at` | `at` has a btree index, for pruning |
| `kind` | `Sale` / `Gift` (cancels and expiries aren't logged) |
| `fromId`, `toId` | character IDs (btree indexes) |
| `item` | Full `ItemData` snapshot (affixes, legendary, temper…), so an audit sees exactly what changed hands |
| `price`, `fee`, `tax` | 0 for gifts. `fee` is the listing fee of the listing that sold. |

Rows are kept **90 days** (`TRADE_LOG_DAYS`). A daily scheduled reducer
(`prune_trade_log`, one call a day) deletes older rows by the `at` index.

The log is for spotting gold laundering and alt funnels (junk items sold for huge
prices, one buyer always buying from the same seller), for rollback, and for price
history in the UI later.

## Exploit checklist

| Risk | Defence |
|-|-|
| Duplication | Escrow moves the data and deletes the row in one transaction. Nothing exists in two places. |
| Equipped item listed or gifted | Loadout check on list and gift. While listed or in the mailbox the item has no `item` row, so it can't be equipped. |
| Stale references | Delivery creates a new item ID. Old IDs in `settle_log`, `raid_log` and encounters only feed display history, and they show "item gone", the same as for a salvaged item. |
| Price race / bait-and-switch | `expectedPrice` on buy. A listing's price and item can't change: cancel and relist instead. |
| Gold overflow | Price capped at `MAX_PRICE`. Gold math uses checked bigint addition. |
| Alt farms | Registered + level 30 to send anything. Gifts capped at 5/day and need mutual friends. Market sales lose 12% to fees. |
| Junk listings, parking items at absurd prices, constant repricing | Listing fee (2%, min 10 gold) charged on every listing, never refunded |
| Selling to yourself | Refused (seller = buyer). Selling to your own alt still pays the tax. |
| Bypassing the gift cap with a 1-gold listing | Allowed: anyone can buy that listing first, so it's a risky gift, and the 5-listing cap limits it. |
| Banned seller | `buyListing` refuses listings from banned accounts. A ban also cancels the account's listings into its mailbox. |
| Lost gift | Recipients must be registered. The mailbox never drops returns. |

## Constants

| Constant | Value | Where |
|-|-|-|
| `TRADE_MIN_LEVEL` | 30 | config.ts |
| `MAX_LISTINGS` | 5 per account | config.ts |
| `MAX_GIFTS_PER_DAY` | 5 per sender | config.ts |
| `LISTING_FEE` | 2% of price, rounded up, never refunded | config.ts |
| `LISTING_FEE_MIN` | 10 gold | config.ts |
| `MARKET_TAX` | 10%, rounded up | config.ts |
| `LISTING_DURATION` | 7 days | config.ts |
| `MAX_PRICE` | 10¹² gold | config.ts |
| `MAILBOX_SIZE` | 50 | config.ts |
| `TRADE_LOG_DAYS` | 90 | config.ts |

## Cost

Estimates for 10,000 players, 30% of them trading with about 4 listings each (12k
listings), and 5k sales, 8k new listings, 3k cancels or expiries and 5k gifts a day.
Rows are about 150 bytes (listing, mail, log).

**Storage**

| Table | Size |
|-|-|
| `market_listing` | ~1.8 MB. The item rows leave bags, so the net change is about 0. |
| `mailbox` | Small: items pass through, capped at 50 per player. |
| `listing_timer`, `gift_count` | < 1 MB. `gift_count` keeps one row per character, overwritten each day. |
| `trade_log` | ~10k rows/day × 150 B × 90 days ≈ **135 MB**, flat |

**Bandwidth**

| | Data |
|-|-|
| Browsing | ~50 KB per search, only while the Market tab is open |
| Live listing updates | Only to clients whose filter matches: ~20 MB/day |
| `my_listings`, `my_mailbox`, `my_trades` | A few KB per player |

**Reducer calls**: ~25–30k a day (list, buy, cancel, gift, claim, expiry timers, one
prune). Each is one short transaction, small next to settles and combat.

**What we avoided:**
- Subscribing every client to the whole listing table would cost about **36 GB/day**
  (1.8 MB × ~20k connects) plus **~3.75 GB/day** of updates to ~1,000 online clients.
- A trade log that kept every row forever would grow by **~550 MB a year** (more with
  cancels and expiries logged), filling the free tier's 1 GB within two years. The
  90-day limit keeps it flat.

## UI (outline; wireframes go in ui.md)

- **Market tab**: browse with the existing item filter (`itemFilter.tsx`; slot, tier,
  rarity, base and unique go into the subscription query, stat filters run on the client), sort by
  price or age, and a Buy button that shows the price and asks to confirm. A "My
  listings" strip shows the 5 slots with Cancel.
- **Item card**: "Sell…" (price input showing the listing fee due now and what you receive after tax) and "Gift…"
  (choose a mutual friend; shows "3/5 gifts left today").
- **Mailbox**: a badge with the count, and Claim / Claim all.
- Ineligible characters see the market read-only, with the reason ("Trading unlocks
  at level 30 on a registered account").

## Open questions

- **Bound items:** should raid drops or tempered items become untradable, if they
  crash prices or make raids pointless?
- **Receive cap:** also limit gifts **received** per day (for example 10), so one main
  can't collect from many level-30 alts?
- **Buy orders and a material exchange:** later, once there's sale data in
  `trade_log`.
- **Balance:** drop rates assume self-found play. Watch how fast traders reach
  best-in-slot gear, and consider an opt-in solo self-found mode.
