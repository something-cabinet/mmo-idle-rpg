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
| Attack | 72 DPS (0.7 attacks/s), each attack at one fighter picked by threat |
| Frost Breath | every 12 s, 40 magic damage to every living fighter; can't be dodged |
| Enrage | at 4:00 the party wipes |

Tuned in `npm run test:raid` against random T3 characters at level 38 (60-item bags of
Rare 60% / Epic 30% / Legendary 10%, auto-equipped per role: a Survival (phys) tank, a Healing Staff healer on the Healing
profile, Damage (phys) and Damage (magic) builds), averaged over 48 parties. A fight
lasts about 1:25. This first raid (T3) is **intentionally easier than later ones**: a
full party nearly always wins, so the raid teaches the format. Win odds:

| Party | Odds |
|---|---|
| 4 players | ~98% (random gear; a real tank with Threat gear and a healer do better) |
| 3 players | ~95% |
| 3 players + 1 NPC | ~95% |
| 2 players + 2 NPCs | ~90% |
| 2 players | ~10–20% |

*Illustrative.* Outcomes are mostly decided by the stats, like solo fights: a given
party tends to win nearly always or nearly never.

## Raid 2: The Drowned Moon (T4)

Opens for a character once it has killed **Selvara, the Moonless Queen** (T4 boss).
*"Beneath the Moonless Throne the great moonwell runs deep. Something fell into it the
night the moon went out, and it is still breathing."* Selvara didn't lose the moon: she
pulled it down to keep it, and it drowned in her moonwell, half silver light and half
void, and still alive.

| | |
|---|---|
| Boss | Umbriel, the Eclipse: Lv 50, 0.8 attacks/s, each at one fighter picked by threat |
| HP | 37,000 |
| Attack | 150 DPS; its damage type follows the phase |
| **Lunar Phases** (passive) | every 20 s it turns to its other face, starting at Full Moon |
| · Full Moon | Armored: armor 320, resistance 60; **magic** attacks |
| · New Moon | Warded: armor 60, resistance 320; **physical** attacks |
| Moonfall | every 15 s, 400 magic damage **shared evenly by the living** (4 alive: 100 each; 2 alive: 200); can't be dodged |
| Enrage | at 4:00 the party wipes |

What it asks for, beyond more stats than Wyrm Hollow:

- **A weakness that keeps moving.** Every zone boss so far had one fixed weakness.
  Umbriel has all of them in turn: a physical build hits it about 1.8× harder in the New
  Moon than in the Full Moon, and a magic build the other way round. The phases are
  mirror images, so over a full cycle every damage mix deals about the same total: the
  phases change *when* each build does its damage, not how much. Split weapons (the
  Umbral variants) deal it steadily.
- **A tank with both defenses.** Its attacks switch between magic and physical with the
  phase, so armor alone or resistance alone leaves the tank exposed half the time.
- **Keeping everyone up.** Moonfall is split among the living, so each death makes the
  next one hit the rest harder. It rewards the healer, and it makes even a 0.5× NPC worth
  its seat as a soaker.

Tuned in `npm run test:raid` like Wyrm Hollow, against random T4 characters at level 48
(T4 bags, same roles), averaged over 48 parties. A win takes about 1:25. Harder than the
T3 raid: random gear wins most fights, and a party one short only about half:

| Party | Odds |
|---|---|
| 4 players | ~81% |
| 3 players | ~48% |
| 3 players + 1 NPC | ~52% |
| 2 players + 2 NPCs | ~18% |
| 2 players | ~7% |

Rewards as Wyrm Hollow's (below), at T4: 15 tokens, 80,000 gold, 110,000 XP; 5,000 gold
per hired NPC. Its own bases are the seven **Umbral** variants (bases.md) and its own
uniques the Eclipse Aegis, the Lantern of the Drowned Moon and Umbriel's Edge
(uniques.md), each built to answer both phases.

## Raid 3: The Brothers' Forge (T5)

Opens for a character once it has killed **Durgrim, the Last Thane** (T5 boss). Beneath
Brightvein Hold lies the great forge where brightsteel was first smelted from the shard's
light. Two dwarven smith brothers still guard it, bound to it by the Thane's oath. Named
after Brokkr and Sindri, the dwarf smith brothers of Norse myth.

**A duo boss** (after Ornstein and Smough): two bosses fought at once, very different, and
the one left standing takes something from his fallen brother (`RaidDef.duo`).

| | **Brokk, the Hammer** | **Sindri, the Bellows** |
|---|---|---|
| Level, HP | 60, 44,000 (tanky) | 60, 20,000 (fragile) |
| Attack | 105 DPS, **physical**, 0.35 attacks/s (heavy, slow) | 175 DPS, **magic**, 2 attacks/s (quick) |
| Defense | **Armored** (armor 380, resistance 70) | **Warded** (armor 70, resistance 380) |
| Signature | **Anvil Slam:** every 15 s, 800 physical damage to one fighter, picked by threat | **Fire Bellows:** every 12 s, 168 magic damage to every living fighter |

- **Two attack streams:** each brother attacks on its own timer, so the tank can face both
  damage types at once. Signatures can't be dodged.
- **Brothers in arms:** while both stand, **each hits at 75% strength** (attacks and
  signatures, `duo.together` 0.75), so together they hit 1.5× as hard as one. Alone, the
  survivor hits at full strength, and at **175% once he empowers** (`duo.absorbed` 1.75):
  he has absorbed his brother's power. Without the absorbed damage, killing one brother
  fast always won (one brother alone is less damage than two), whatever the twist; with
  it, balancing the party is the better plan (below).
- **Threat, per brother:** each attack picks a living fighter by threat as today
  (`e^(5 × threat)`), but fighters attacking that brother count **+20 points of threat**
  with him (about 2.7× the weight). You hit him, he hits back: assignment decides who gets
  hit as well as damage. Example, a 60%-threat tank on Sindri, two 15% damage dealers on
  Brokk and one on Sindri: the tank takes ~85% of Sindri's attacks but only ~60% of
  Brokk's; the damage dealers on Brokk take the rest.
- **The leader assigns each seat** (players and hired NPCs) to Brokk or Sindri before the
  start (`setRaidTarget`; `raid_member.target`, `raid_party.hiredTargets`). A fighter whose
  brother falls switches to the other one. The split is the party's to work out: the
  Raids page shows each seat's DPS and aggro, but no fall-time estimate and no
  auto-assign (`duoFallTimes` and `balancedTargets` stay for the balance tests).
- **Absorption:** when one brother dies, the survivor spends **10 seconds** absorbing him,
  still attacking and taking damage as normal. **Kill him within those 10 s and he never
  empowers:** the reward for balancing the party's damage across both brothers.
- **Empowered**, if absorption finishes: he is **back to full health** (`empowered.heal`),
  plus one twist, different for each survivor. The fight swaps his sprite.

| Survivor | Empowered | What it tests |
|---|---|---|
| Brokk | **Molten Hammer:** his slam hits **every living fighter** for 560 instead of one for 800, every 20 s instead of 15 | The healer and everyone's HP |
| Sindri | **Anvil Hide:** armor and resistance both 900: no weak side, and far less damage gets through | Penetration and raw damage, against the enrage |

- **What it asks for:** a plan made before the fight. Ideally both brothers fall within 10 s
  of each other. If the party can't balance that, the leader picks which empowered brother
  it would rather face.
- **Enrage** at **4:00**: a long fight against Anvil Hide can still run out of time.

Tuned in `npm run test:raid` against prepared T5 characters at level 58, averaged over 48
parties: by T5 nobody brings random drops. Same 60-item bags and roles, but Epic (70%) or
Legendary (30%), and each equipped item's affixes rerolled once toward the role, a roll
kept when it ranks better (a tank also keeps threat). Not min-maxed: a tank has tank gear
and some tank affixes, a healer healing ones. A win takes about 0:53. Win odds:

| Party | Odds |
|---|---|
| 4 players, balanced split (`balancedTargets`) | ~68% |
| 4 players, all on Brokk (Sindri empowers) | ~32% |
| 4 players, all on Sindri (Brokk empowers) | ~22% |
| 3 players | ~18% |
| 3 players + 1 NPC | ~30% |
| 2 players (+ 2 NPCs) | ~11% (~6%) |

Letting a brother empower costs far more than before (2026-10-22: back to full health,
Molten Hammer every 20 s), so the split matters. The 4:00 enrage lets a strong pair grind
both down now and then (~11%).

Rewards as the others', at T5: 20 tokens, 6 Voidglass, 220,000 gold, 300,000 XP; 12,000 gold
per hired NPC. Its own bases are the six **Forgefire** variants (bases.md) and its own
uniques the three below.

**Raid uniques** (uniques.md, effects 56–58 in legendary.md):

| Unique | Base | Effects | Stats |
|---|---|---|---|
| **Twinstep Sabatons** (tank) | Brightsteel Greaves | **Drawing Fire**: 50% more threat against every enemy you aren't attacking; **Bulwark** | Threat % (×1.5), armor %, resistance % |
| **Sindri's Bellows** (healer) | Brightsteel Scepter | **Twin Flame**: your single-target heals also heal the next most hurt ally for 50%; **Zealot's Oath** | Heal, heal % (×1.25), Mind |
| **Brokk's Last Ember** (damage) | Brightsteel Greatsword | **Stoke the Fire**: 25% more damage for each ally or enemy fallen in this fight | Physical damage %, crit damage, attack speed % |

- **Drawing Fire** lets the tank hold the brother it isn't attacking: in the example
  above, its share of Brokk's attacks goes from ~60% to ~87% (60% → 90% threat against
  him), so the leader can put the damage dealers on either brother. Solo it does nothing
  (you always attack the one enemy): a raid piece, no risk in zones.
- **Twin Flame** gives the Scepter (single heal) a place next to the Healing Staff when two
  attackers hurt two people at once. Solo it only heals you: a raid piece, like the Censer.
- **Stoke the Fire** is never active solo (the fight ends when the enemy falls). In this
  raid it's +25% the moment the first brother dies, the burst for the absorption window,
  and +25% per fallen ally: a comeback weapon. In the Moonwell Deep, +25% on each depth's
  second enemy and +50% on its boss.

**Art: four sprites**, one per brother (`e-9003`, `e-9203`) and one per Empowered form
(`empoweredArtId`: `e-90031`, `e-92031`). Like the Moonwell Deep Warden's variants, each
Empowered form is its brother's look plus a variant line (scripts/enemy-art.ts
`DUO_VARIANTS`), generated with the base sprite as `--ref`, so it reads as the same dwarf,
changed. The banner shows both brothers.

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
- **A duo** (`RaidDef.duo`, The Brothers' Forge): two bosses, each with its own HP, attack
  timer and signature; each fighter attacks its assigned brother; absorption and
  empowerment as in "Raid 3". The party wins when both have fallen.
- **Lunar Phases** (`RaidDef.phases`, Drowned Moon only): at each phase change the boss
  takes the phase's armor, resistance and damage type; every fighter's mitigation and
  penetration against it, and their defense against its attacks, are recomputed for the
  new phase. The Raids page shows each seat's DPS averaged over the phases.
- **Split AoE** (`aoe.split`, Moonfall): the damage is divided by the fighters alive
  when it lands, then each takes their share after their own mitigation.
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
  Lv 38, 640 HP, 55 armor, 65 resistance, 22 evasion, 0.8 regen, 23% threat, 1.25 attacks/s
  for 65 physical + 50 magic per second (before mitigation), 9% crit. Its DPS, HP, regen,
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
  are any zone base or one of the raid's **own bases** (variants, bases.md; Wyrm Hollow: the Rime dagger, greatsword, healing staff, bow, shield, ring and amulet), one of the raid's own **1 time in 2** (`ownBaseShare`); a Unique comes from the raid's **own pool**, which drops nowhere else
  (Wyrmscale Aegis, Hoardkeeper's Censer, Skaldrith's Fang, see uniques.md). An Epic or
  Legendary rolls **every affix at the top affix tier** (the raid's tier), only the stat and
  value within that tier are random. The items ignore the bag limit, like a first-kill reward.
- **10 raid tokens** (`character.raidTokens`), 2 Voidglass, 30,000 gold, 40,000 XP (Wyrm Hollow; The Drowned Moon: 15 tokens, 4 Voidglass, 80,000 gold, 110,000 XP).
- Each player may bring a **Phial** (phials.md), picked in the party and used up when the fight starts.

A player with no clears left today can still join and fight to help others; they get
nothing. A loss gives nothing, and the hire cost is spent. Every fight is logged per
player (`raid_log`): win, rewarded, item, tokens, Voidglass, gold, XP, hire cost, Phial.

## Planned

- **Raid token shop:** trade tokens for things (not decided what).
- **Precious material:** Voidglass, paid per rewarded clear (Wyrm Hollow 2, The Drowned
  Moon 4, The Brothers' Forge 6), for Phials (phials.md). Built.
- More raids, one per later tier pair, each with a mechanic of its own (Wyrm Hollow: none
  beyond the breath; The Drowned Moon: Lunar Phases and a split Moonfall; The Brothers'
  Forge: a duo with absorption). Ideas kept for
  later: an Eclipse (a few seconds where heals fail and the boss ignores threat), a Tidal
  Pull (every fighter's HP % pulled to the party average).
- Invitations by name or from the friend list (today: open parties only).
