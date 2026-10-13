# Raids

Raid bosses are fought by a **party of 4**, **online only**: they can't be farmed
offline and never count as a farming target. Code: `spacetimedb/src/data/raids.ts`
(data), `spacetimedb/src/raid.ts` (fight, NPCs, loot, lockout; pure and shared),
`spacetimedb/src/reducers/raid.ts` (parties), `src/ui/views/RaidsView.tsx` (the Raids page,
under Adventure below Zones).

## Raid 1: Wyrm Hollow (T3)

Opens for a character once it has killed **Hrimvald, Frost Giant Jarl** (T3 boss).

| | |
|---|---|
| Boss | Skaldrith, the Rime Wyrm: Lv 40, physical, Armored (armor 250, resistance 100) |
| HP | 20,000 |
| Attack | 80 DPS (0.7 attacks/s), each attack at one fighter picked by threat |
| Frost Breath | every 12 s, 45 magic damage to every living fighter; can't be dodged |
| Enrage | at 4:00 the party wipes |

Tuned in `npm run test:raid` against random T3 characters at level 38 (60-item bags of
Rare 60% / Epic 30% / Legendary 10%, auto-equipped per role: a Survival tank, a Healing
Staff healer, two Damage builds). A fight lasts about 1:25. Win odds:

| Party | Odds |
|---|---|
| 4 players | ~74% (random gear; a real tank with Threat gear and a healer do better) |
| 3 players | ~36% |
| 3 players + 1 NPC | ~37% |
| 2 players + 2 NPCs | ~7% |
| 2 players, or 1 player + 3 NPCs | ~0% |

*Illustrative.* Outcomes are mostly decided by the stats, like solo fights: a given
party tends to win nearly always or nearly never.

## The fight

One fight per start, played in full by the server when the leader starts it (seeded by
party and start time) and replayed by every member's client from the stored setup, like
live fights (combat.md). The server's outcome is final.

- Every fighter swings at the boss on its own timer with the solo per-swing numbers:
  mitigation and penetration, crits, ±10% variance.
- **Threat:** each boss attack picks one living fighter at random, weighted by
  `e^(5 × threat)` (`THREAT_FOCUS`; `threat` = Threat % + 0.25% per Vitality). More threat
  means more of the attacks, but anyone can be hit: equal threat spreads them evenly, a
  60%-threat tank among 15% fighters takes ~66%. The target can dodge (evasion vs the
  boss's level). The Raids page shows each seat's share ("Aggro").
- **Heals land on allies:** a "single" heal (Scepter) goes to the most hurt living ally,
  an "all" heal (Healing Staff) is split evenly across the living party. Lifesteal and
  regen heal only yourself.
- **Frostbite:** the highest chill in the party shrinks all the boss's damage.
- Executioner, Ambush, Second Wind, Thornshell (on any damage taken) and Zealot's Oath
  work as in a duel. The dead stop swinging and can't be healed.
- The party wins when the boss dies; it loses when everyone is dead or at the enrage.
- No closed form is needed: raids are never settled offline.

## Parties

- Any character with the raid unlocked can **form a party** (it leads) or **join** an open
  one with a free seat. One party at a time. Parties are public, listed on the Raids page.
- The leader can remove members, hire NPCs into empty seats, and start, after a confirm
  that sums up the party, the hire cost and their clears left today.
- **Online only:** leaving the world leaves the party (the lead passes to the next
  member; an empty party disbands). Starting needs every member online. Mid-fight,
  nobody can leave or join; a member who disconnects keeps the seat until the fight
  ends and is then removed.
- Members see each other's level, gear and stats (views over the party's active
  loadouts), so the page shows every seat's HP, DPS against the boss, threat and share of
  the boss's attacks.
- **No win odds are shown.** A number to blame (or kick) a teammate over kills the fun and
  invites toxicity; `raidOdds` stays for balancing in `test:raid` only.
- Everyone fights with their current level and **active loadout**, taken at the start
  (each member is settled first). Farming continues during a raid.

### Hired NPCs

- The leader pays **2,000 gold per NPC** at the start, win or lose.
- An NPC has **0.5×** the raid's **reference player** (`RaidDef.reference`), a fixed sheet
  of an average player ready for the raid, so NPCs never scale with the party. Wyrm Hollow's:
  Lv 38, 620 HP, 55 armor, 65 resistance, 22 evasion, 0.8 regen, 18% threat, 1.25 attacks/s
  for 50 physical + 39 magic per second (before mitigation), 9% crit. Its DPS, HP, regen,
  defenses and threat are 0.5× that; speed, crits and penetration as listed. No effects.
- `test:raid` checks the sheet stays within 10% of the measured average of level-38
  characters with random T3 gear; update it when gear or stats change.
- **NPCs are a last resort**, to encourage playing together online: at 0.5× they fill a
  seat (soak some attacks, add some damage) but rarely turn a loss into a win.
- **NPCs fight but don't heal.** An "average" player heals a little (a quarter of a
  healer), and a party-wide heal on every NPC made 2 players + 2 NPCs beat 4 players.

## Rewards

On a win, each player gets, for up to **3 clears per raid per day** (`clearsPerDay`; a clear is a rewarded win, losses don't count; resets 00:00 UTC):

- **Three T3 items, each Epic or better** (`itemsPerClear`), each rolled on its own: Epic 75%, Legendary 22%, Unique 3%. Epic and Legendary
  are any zone base or one of the raid's **own bases** (variants, bases.md; Wyrm Hollow has none yet); a Unique comes from the raid's **own pool**, which drops nowhere else
  (Wyrmscale Aegis, Hoardkeeper's Censer, Skaldrith's Fang, see uniques.md). The items
  ignore the bag limit, like a first-kill reward.
- **10 raid tokens** (`character.raidTokens`), 3,000 gold, 4,000 XP.

A player with no clears left today can still join and fight to help others; they get
nothing. A loss gives nothing, and the hire cost is spent. Every fight is logged per
player (`raid_log`): win, rewarded, item, tokens, gold, XP, hire cost.

## Planned

- **Raid token shop:** trade tokens for things (not decided what).
- **Precious material:** a rare raid-only material from raid kills, for high-end
  crafting. Not added yet.
- More raids, one per later tier pair; raid-specific boss mechanics beyond the breath.
- Invitations by name or from the friend list (today: open parties only).
