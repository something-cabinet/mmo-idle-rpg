# Exploration TODO

Later ideas for making the world feel explorable. Done so far: discovery (??? enemies
and items, the Item Index filling up), flavour text on walks, rare encounters and the
zone map (see the 2026-10-13 rows in [docs/design/README.md](docs/design/README.md)).

The cost notes say what each idea adds to server work and traffic. The rule that keeps
them cheap: compute inside the settle that already runs, and derive on the client
whatever can be derived there.

## Hidden areas

Secret areas on the zone map (zones.md, "Zone map") that only appear when a condition is met, for example:

- kill 500 Bog Wisps;
- enter with a certain unique equipped;
- beat the zone boss below some level;
- find a map fragment (could be a new rare encounter kind).

Hint at them so players go looking: a greyed `???` node, a rumour in a flavour line or
lore note. Pairs well with server-wide firsts ("Lam was first to discover the Sunken
Chapel").

**Cost: ~0.** Condition checks run inside the settle; one row when an area is found.

## Expeditions

An alternative to farming: send the character on a timed run (e.g. 8 h) into an
unexplored area. On return they get a story log with branching events, plus loot
weighted toward things they haven't discovered yet.

- The idle loop as an adventure: coming back to a story, not just numbers.
- The character can't farm while away (like life skills: one activity at a time).
- Expedition areas could be the hidden areas above, or the only way into some of them.

**Cost: very low.** Two reducer calls per expedition (start, claim), so a few per
player per day. Store **only the seed** and the outcome; the client regenerates the
story text from the seed.

## Players-in-zone display

Make the world feel inhabited: "14 adventurers in Greenhollow" on each zone or node,
and other players' names passing through the flavour line ("Kira passes you heading
toward the Bog").

**Cost: low, only if built on the client.**

- Count players per zone and generate the passing names in the browser, from the
  `presence` rows the client already has (add the zone or target to `presence`).
- Never push "walking by" events from a server timer.
- A zone change rewrites a public `presence` row, which goes to every client. That's
  fine: target changes are rare.
- Check [TODO.md](TODO.md) first: if `presence` has been made private by then, add a
  small public per-zone count table instead, updated on enter, leave and zone change.
