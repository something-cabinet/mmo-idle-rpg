// What changed, for players: the "What's new" popup (ui/WhatsNew.tsx) shows the entries
// newer than the account's `changelogSeen`. Newest first. Add an entry with every deploy
// that players would notice; `version` is for our own records, players see the date.
// The process (pending entries, `commit`, deploy day) is in README.md, "Changelog".

export type ChangeTag = 'new' | 'balance' | 'fix';

export interface ChangelogEntry {
  /** Semver, bumped per entry: minor for new content, patch for tuning and fixes. */
  version: string;
  /** YYYY-MM-DD, the deploy day. While pending (not deployed yet): the day it was last written. */
  date: string;
  /**
   * Pending entries only: the short hash of the last commit the notes cover. The next update
   * starts from `git log <commit>..HEAD`. Dropped on deploy (the `deployed` tag takes over).
   */
  commit?: string;
  title: string;
  changes: { tag: ChangeTag; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.0',
    date: '2026-10-20',
    commit: 'b39b0c8',
    title: 'Brightvein Hold, five new Uniques and the Broken Moon',
    changes: [
      { tag: 'new', text: 'Tier 5 zone, Brightvein Hold: a silent dwarven mine where the largest shard of the moon fell, opened by your first Selvara kill. Levels 46 to 55, and a real step up: from T5 on, enemies have 10% more HP and damage on top of the usual climb. One road leads down the pit, from the glowing tunnels at the rim to the rift at the bottom.' },
      { tag: 'new', text: 'Durgrim, the Last Thane, guards the rift: physical damage behind heavy resistance, so magic builds struggle and physical builds want armor to survive him. Watch out for the Glowvein Crawler, which dodges a third of your attacks, and the Brightsteel Golem, which regenerates 60 HP a second.' },
      { tag: 'new', text: 'Tier 5 materials, from Brightsteel Ingot and Drake Scale to Radiant Gem, and for gatherers Brightsteel Ore and the rare herb Lanternroot.' },
      { tag: 'new', text: 'The Broken Moon: the zones now tell a story. Selvara cracked the moon, and every boss holds one of its shards. Zone descriptions say why you have come, new walk lines hint at the shard, and each boss leaves a line when you first beat it, kept under the zone on the Zones page.' },
      { tag: 'new', text: '5 new Uniques for tier 5. Find them in Brightvein Hold and beyond.' },
      { tag: 'new', text: 'Corrupted items are easier to spot: charred from below, with glowing cracks that slowly pulse, in the Bag, item grids and item cards. The rarity border stays, so you can still tell what it was.' },
      { tag: 'balance', text: 'The Moonwell Deep pays tier 5 rewards from its deeper floors, now that a tier 5 zone exists (was capped at tier 4).' },
      { tag: 'balance', text: 'The Starless nameplate is renamed Night Sky: it has stars. Same look and unlock.' },
    ],
  },
  {
    version: '0.1.2',
    date: '2026-10-20',
    title: 'Mail, Chisels, Chronoshards and a rare loot pool',
    changes: [
      { tag: 'new', text: 'Mail: messages and gifts from the game now arrive in your mailbox (System › Mail), with a badge when something is unread. Open a mail and press Claim to take what is attached. Some gifts expire, so claim them in time.' },
      { tag: 'new', text: 'Chronoshards: rare finds that fast-forward what you are doing, as if you had been away: 30 minutes (Chronoshard), 1 hour (Greater) or 2 hours (Divine). They do not count against the offline cap. Use them from the Bag, where Chisels are listed too.' },
      { tag: 'new', text: 'Chisels: rare crafting tools, used from the new Chisel tab in Crafting. Recalibration Chisel rerolls every value within its tier (it also works on Uniques). Chaos Chisel rerolls every affix, the legendary one included. Binding Chisel binds one affix for good, so nothing changes it any more. Improvement Chisel raises one affix a tier and rerolls its value.' },
      { tag: 'new', text: "Corruption Chisel: one random outcome, good or bad: gain or lose an affix (even past the usual count), raise or lower an affix tier (even past the item's tier, up to T10), reroll every value, or nothing. It works on Uniques too: their stats have no tier, so they go past their usual roll range instead, up or down. A corrupted item can never be crafted or tempered again." },
      { tag: 'new', text: 'Rare loot pool: every enemy can now drop Chisels (Chaos and Corruption about 1 in 2,500 kills, the others 1 in 5,000) and, very rarely, Chronoshards. Elites drop pool loot 2× as often as regular enemies, bosses 4×, and higher-level enemies a little more.' },
      { tag: 'new', text: 'Gathering finds Chisels too: about 1 in 1,400 actions with Mining, Woodcutting or Foraging, at any tier, and more often at higher skill levels (twice as often at 99).' },
      { tag: 'new', text: 'Nameplates fade in behind the name from the left, and names keep the same height with or without one. Friend and online lists, raid seats, duels and the Moonwell leaderboard show names on one line, with the title on hover.' },
      { tag: 'new', text: 'New players start with the dark theme. Pick Light or System in Settings › Appearance.' },
      { tag: 'new', text: 'Corrupted items have a red tint in the Bag and the other item grids, under their rarity color.' },
      { tag: 'balance', text: 'Voidglass now drops from every enemy in tier 4 zones and up, not only zone bosses: about 1 in 2,100 kills from regular enemies and 1 in 1,000 from elites. Selvara stays about the same (1 in 510, was 1 in 500).' },
    ],
  },
  {
    version: '0.1.1',
    date: '2026-10-20',
    title: 'Zone maps, instant tool upgrades and raid tuning',
    changes: [
      { tag: 'new', text: 'Zone art: every zone map is now a painted landscape, with its landmarks where the areas are. Turn it off in Settings › Zone art for the plain map.' },
      { tag: 'new', text: 'Crafting: Reroll, Upgrade and Temper are tabs. Alchemy: the Brew tab is now Elixirs.' },
      { tag: 'fix', text: 'Stoneskin says more clearly what it does: each enemy hit is reduced by a flat 1% of your max HP per copy. Unchanged in effect.' },
      { tag: 'balance', text: 'Smithing: tool upgrades are instant, like tempering. Same cost and XP, and whatever you are doing carries on.' },
      { tag: 'balance', text: 'The Drowned Moon: the enrage is at 4:00 (was 3:40), and Umbriel has more HP (37,000, was 35,000) and hits harder (150 DPS, was 140).' },
      { tag: 'balance', text: 'Wyrm Hollow: Skaldrith has more HP (20,000, was 18,000). Hired NPCs in both raids deal more damage, to keep up with current gear.' },
      { tag: 'balance', text: 'Lantern of the Drowned Moon: Drowned Hymn is renamed Moonlit Vigil, so it is not confused with The Drowned Hymnal. Same effect.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-19',
    title: 'The Moonwell Deep, Phials and cosmetics',
    changes: [
      { tag: 'new', text: 'The Moonwell Deep: an endless solo delve, opened by your first Selvara kill. Clear floors for Voidglass and climb the leaderboard.' },
      { tag: 'new', text: 'Phials: one-fight Alchemy consumables for the Deep and raids, made with Voidglass.' },
      { tag: 'new', text: 'Cosmetics: titles, name effects and nameplates, worn from the Character page. Turn on "Show locked" in Customize to see how to unlock the rest.' },
      { tag: 'new', text: 'Elixir grades: Elixir, Greater and Divine, by material tier, with an Infuse toggle.' },
      { tag: 'new', text: "New affix: Base damage %. Raises your weapon's own hit, physical or magic, but not flat added damage: the pick for slow, heavy weapons." },
      { tag: 'new', text: 'Raid 2, The Drowned Moon, and the T4 zone Moonveil Vale.' },
      { tag: 'new', text: 'Life skills: Mining, Woodcutting, Foraging, Smithing and Alchemy.' },
      { tag: 'balance', text: 'Moonwell Deep first clears pay 5× the gold and Dust and 2× the XP.' },
      { tag: 'balance', text: 'Moonwell Deep enemies grow a bit slower as you go down, their HP and damage at the same rate so balanced builds go deepest, and no longer scale faster past depth 100.' },
      { tag: 'balance', text: 'Thorned elites in the Deep reflect 10% of damage taken, down from 15%, in the damage types you hit them with: magic comes back as magic, physical as physical. They also have 30% less max HP.' },
      { tag: 'balance', text: "Moonwell Deep: Tidebound Husk has less HP (1.2× the depth's base, was 1.4×), deals less damage (0.8×, was 0.9×) and regenerates 1% of max HP a second (was 1.5%). Unyielding elites regenerate 1.5% (was 2%)." },
      { tag: 'balance', text: 'Flat physical and magic damage affixes and flat max HP affixes grow a bit slower from T5 (×1.5 a tier, was ×1.6). T4 and below are unchanged.' },
      { tag: 'balance', text: 'Attack speed affixes roll higher: up to 15% (was 10%).' },
      { tag: 'balance', text: 'Lantern of the Drowned Moon: its Lunar Insight is now Drowned Hymn (each point of Mind also gives +0.08% attack speed and +0.2% armor, but Finesse gives nothing), and it rolls flat heal, heal % and Mind.' },
      { tag: 'balance', text: 'Legendary and unique effects that multiply your damage, gold or XP now say "more" or "less" (e.g. Berserker: 3% more damage per 10% of max HP missing), to set them apart from the additive % on regular affixes. Ambush keeps its 5×. Numbers are unchanged.' },
      { tag: 'balance', text: 'Discipline legendaries roll attack speed % as their stat bonus, instead of Vitality.' },
      { tag: 'balance', text: 'Thornshell reflects damage in the type you took it: magic hits come back as magic, physical as physical.' },
      { tag: 'balance', text: 'Raid Epic and Legendary drops roll every affix at the top tier.' },
      { tag: 'balance', text: 'Vitality gives +0.5% HP regen per point, down from +1%.' },
      { tag: 'balance', text: 'The Drowned Moon has less HP and Moonfall, and a shorter enrage.' },
      { tag: 'balance', text: 'Elixirs are for farming only: the Deep ignores them.' },
      { tag: 'balance', text: 'Zone boss titles take 5,000 kills of the boss.' },
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0].version;

/** The entries newer than `seen`. An empty `seen` (an account from before the changelog) gets them all. */
export function unseenEntries(seen: string): ChangelogEntry[] {
  if (!seen) return CHANGELOG;
  const i = CHANGELOG.findIndex(e => e.version === seen);
  // An unknown version (a later client's, or a removed entry): nothing to show.
  return i < 0 ? [] : CHANGELOG.slice(0, i);
}
