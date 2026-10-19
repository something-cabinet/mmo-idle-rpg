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
    version: '0.1.1',
    date: '2026-10-20',
    commit: '4929eb8',
    title: 'Instant tool upgrades and raid tuning',
    changes: [
      { tag: 'balance', text: 'Smithing: tool upgrades are instant, like tempering. Same cost and XP, and whatever you are doing carries on.' },
      { tag: 'balance', text: 'The Drowned Moon: the enrage is at 4:00 (was 3:40), and Umbriel has more HP (37,000, was 35,000) and hits harder (150 DPS, was 140).' },
      { tag: 'balance', text: 'Wyrm Hollow: Skaldrith has more HP (20,000, was 18,000). Hired NPCs in both raids deal more damage, to keep up with current gear.' },
      { tag: 'balance', text: 'Lantern of the Drowned Moon: Drowned Hymn is renamed Moonlit Vigil, so it is not confused with The Drowned Hymnal. Same effect.' },
      { tag: 'new', text: 'Crafting: Reroll, Upgrade and Temper are tabs. Alchemy: the Brew tab is now Elixirs.' },
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
