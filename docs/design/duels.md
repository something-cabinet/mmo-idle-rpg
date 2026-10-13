# Friendly duels

Fight a friend's character to see who wins. Just for fun: **no rewards, nothing
stored**, so it runs entirely in the browser (`src/ui/duelSim.ts`, `src/ui/Duel.tsx`)
and costs the server nothing.

## Who and with what

- **Friends only:** the ⚔ button on a friend in the Friends tab, or the Duel tab when
  inspecting a friend.
- Both sides fight with their **current level and active loadout**. The friend's come
  from the inspect views, so they are as of the friend's last settle (live if online).

## The fight

Like `simulateFight` (combat.md), but both sides are players, each swinging on its own
timer:

- Per swing, the attacker's weapon hit after the defender's mitigation by type, with the
  attacker's penetration, Rending and Spellbreaker (Voidtouched ignores it), and the
  defender's Juggernaut / Spellward. The defender's evasion (vs the attacker's level) can
  dodge it. Crits, ±10% variance.
- Heals land on the attacker, plus lifesteal; regen ticks between swings.
- Effects: Executioner, Ambush (first swing ×5), Second Wind, Frostbite (the defender's
  chill shrinks the attacker's hits), Thornshell (reflects as physical), Zealot's Oath.
- Each side's first swing lands at a random point of its first period (half a period on
  average), so neither side always strikes first.
- **90 s limit:** then the higher share of HP left wins on points (equal is a draw).

## What the player sees

- The duel waits for **Start** (both at full HP, the odds already shown), so it never
  starts out of nowhere. Rematches start at once.
- The duel replayed at real speed, like the Combat screen, or 2× with the speed toggle
  (remembered for the session): both HP bars, the last five blows, then the result
  (knockout or on points). **Rematch** runs a new duel; **Skip** jumps to the end.
- **Your odds:** the share of 500 duels with the same stats you would win (draws count
  half), so one lucky result doesn't mislead.
