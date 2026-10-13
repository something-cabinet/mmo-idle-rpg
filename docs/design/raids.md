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
| Attack | 60 DPS (0.7 attacks/s) at the fighter with the most threat |
| Frost Breath | every 12 s, 45 magic damage to every living fighter; can't be dodged |
| Enrage | at 4:00 the party wipes |

Tuned in `npm run test:raid` against random T3 characters at level 38 (60-item bags of
Rare 60% / Epic 30% / Legendary 10%, auto-equipped per role: a Survival tank, a Healing
Staff healer, two Damage builds). A fight lasts about 1:30. Win odds:

| Party | Odds |
|---|---|
| 4 players | ~57% (random gear; a real tank and healer do better) |
| 3 players | ~35% |
| 3 players + 1 NPC | ~67% |
| 2 players | ~1% |
| 2 players + 2 NPCs | ~73% |

*Illustrative.* Outcomes are mostly decided by the stats, like solo fights: a given
party tends to win nearly always or nearly never.

## The fight

One fight per start, played in full by the server when the leader starts it (seeded by
party and start time) and replayed by every member's client from the stored setup, like
live fights (combat.md). The server's outcome is final.

- Every fighter swings at the boss on its own timer with the solo per-swing numbers:
  mitigation and penetration, crits, ±10% variance.
- **Threat:** the boss attacks the living fighter with the most threat (`threat` =
  Threat % + 0.25% per Vitality). That fighter can dodge (evasion vs the boss's level).
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
- The leader can remove members, hire NPCs into empty seats, and start.
- **Online only:** leaving the world leaves the party (the lead passes to the next
  member; an empty party disbands). Starting needs every member online. Mid-fight,
  nobody can leave or join; a member who disconnects keeps the seat until the fight
  ends and is then removed.
- Members see each other's level, gear and stats (views over the party's active
  loadouts), so the page shows every seat's HP, DPS against the boss and threat, who the
  boss will attack, and the **win odds** over 200 simulated fights.
- Everyone fights with their current level and **active loadout**, taken at the start
  (each member is settled first). Farming continues during a raid.

### Hired NPCs

- The leader pays **2,000 gold per NPC** at the start, win or lose.
- An NPC has **0.8×** the party's average player (the players in the party at the start):
  its DPS against the boss (by damage type), heal per second, max HP, regen, armor,
  resistance, evasion and threat are 0.8× the averages; attack speed, crits and
  penetration are the averages. No effects; its heals are split across the party. An
  NPC hardly ever draws the boss (its threat is below the average).

## Rewards

On a win, each player gets, **once per raid per day** (resets 00:00 UTC):

- **One T3 item, Epic or better**: Epic 75%, Legendary 22%, Unique 3%. Epic and Legendary
  are any base; a Unique comes from the raid's **own pool**, which drops nowhere else
  (Wyrmscale Aegis, Hoardkeeper's Censer, Skaldrith's Fang, see uniques.md). The item
  ignores the bag limit, like a first-kill reward.
- **10 raid tokens** (`character.raidTokens`), 3,000 gold, 4,000 XP.

A player who already claimed today can still join and fight to help others; they get
nothing. A loss gives nothing, and the hire cost is spent. Every fight is logged per
player (`raid_log`): win, rewarded, item, tokens, gold, XP, hire cost.

## Planned

- **Raid token shop:** trade tokens for things (not decided what).
- **Precious material:** a rare raid-only material from raid kills, for high-end
  crafting. Not added yet.
- More raids, one per later tier pair; raid-specific boss mechanics beyond the breath.
- Invitations by name or from the friend list (today: open parties only).
