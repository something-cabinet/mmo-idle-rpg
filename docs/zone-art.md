# Zone map art

How the painted backdrops behind the Zones map are made, and how to add one for a new
zone (T5 and up). The pipeline is `scripts/zone-art.ts` on top of the shared
`scripts/art-lib.ts`, the same one enemy art and raid banners use.

## What the game expects

- One image per zone: `src/assets/zones/zone-<zoneId>.webp`, about 1024 × 1024, committed.
  Zone IDs are permanent, so the key never changes.
- `zoneArtUrl` (src/ui/enemyArt.tsx) picks it up automatically: no code change per zone.
  ZonesView sets it as the map's background (`.zmap.has-art` in src/style.css: `cover`,
  pixelated, a soft dark vignette, lighter paths).
- Missing image, or Settings › Zone art off: the map falls back to its plain colors
  (`.zmap-<id> { --land: … }` in src/style.css).

## What the prompt is built from

Nothing is written by hand per zone. `scripts/zone-art.ts` builds each prompt from data
that a new zone needs anyway:

| Source | Used for |
|---|---|
| `REGIONS[zoneId]` in scripts/enemy-art.ts (`setting`, `palette`) | The place and its colors, so map and enemies match |
| Areas in spacetimedb/src/data/zones.ts (`blurb`, `x`, `y`) | One landmark per area, placed where its spot sits (top left, right edge halfway down, …) |
| `links` in zones.ts | Faint trails between landmarks |
| The area holding the boss | The land grows darker toward it |

Secret areas are left out, so the art never gives them away.

Landmarks are given **by number, never by name**, and the zone name is stripped from the
setting: when the prompt held names, the model painted them onto the map as labels.

## Adding a new zone (T5+)

1. **Zone data.** Add the zone to `spacetimedb/src/data/zones.ts` with its areas
   (`blurb`, `x`, `y`) and `links`. Blurbs should describe something visible (a mill, a
   ring of thorns, a glass dome): that is what gets painted.
2. **Region.** Add `REGIONS[<zoneId>]` in `scripts/enemy-art.ts` (enemy art needs it too).
   Start `setting` with `"<Zone name>, "`; the script drops that part for the map. An
   optional `map` replaces `setting` for the map only, when the map should show the place
   differently from the enemies' setting (T5: a terraced pit seen from above).
3. **Fallback color.** Add `.zmap-<id> { --land: #…; }` next to the others in
   `src/style.css`, for when art is off.
4. **Check the list:**
   ```sh
   npm run art:zone:list            # rewrites art-src/zone-art.csv; fails if a REGIONS entry is missing
   npm run art:zone:gen -- zone-5 --dry-run --ref zone-1
   ```
   Read the dry-run prompt: landmarks in the right places, no names.
5. **Generate**, with a finished map as style reference so the new one matches the set:
   ```sh
   npm run art:zone:gen -- zone-5 --ref zone-1 --cut
   ```
   Needs `OPENROUTER_API_KEY` in `.env`. Default model Nano Banana 2 Lite
   (`google/gemini-3.1-flash-lite-image`), about $0.034 an image. Setting
   `ZONE_STYLE_REF=zone-1` in `.env` makes `--ref zone-1` the default.
   The raw image lands in `art-src/zones/raw/`, the square master in `art-src/zones/`
   (not in git). Open `art-src/zones/preview.html` to compare it with the others.
6. **Review** (see below). If it fails, run step 5 again: the previous image moves to
   `art-src/zones/old/`.
7. **Build and commit:**
   ```sh
   npm run art:zone:build -- zone-5   # writes src/assets/zones/zone-5.webp
   ```
   Commit the webp and `art-src/zone-art.csv`. Check the Zones page with `npm run dev`.

`--ref` takes any key with art, built ones included, so it works on a fresh clone where
only the committed webps exist.

## Review checklist

Problems seen while making T1–T4, and what to do:

| Problem | Fix |
|---|---|
| Names or labels painted on the map | A name leaked into the prompt (often via a blurb, e.g. "Grubnak holds court"). Usually fine; if text appears, reword the blurb or regenerate |
| A grid overlay or checkerboard pattern on the ground | Regenerate with `--ref zone-1` (the rules already forbid it; the reference fixes most cases) |
| A landmark far from its spot | Regenerate; check `x`, `y` in the dry run |
| Too bright or busy under a spot, markers hard to read | Regenerate; the map should stay mid-to-dark with open ground between landmarks |
| Characters or creatures drawn in | Tiny ones are acceptable; large ones, regenerate |

## Commands

| Command | Does |
|---|---|
| `npm run art:zone:list` | Rewrites `art-src/zone-art.csv` (every map the game expects) and prints progress |
| `npm run art:zone:gen -- [zones\|key …] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]` | Generates raw images. No names: every zone with no art yet. `zones` (the group): all of them again |
| `npm run art:zone:cut` | Crops each new raw image to a square master and writes the preview page |
| `npm run art:zone:build -- [zones\|key …]` | Writes the webp files the game loads (as drawn, never resized, limited palette, lossless) |
