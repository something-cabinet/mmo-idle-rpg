// What changed, for players: the "What's new" popup (ui/WhatsNew.tsx) shows the entries
// newer than the account's `changelogSeen`. Newest first. Add an entry with every deploy
// that players would notice; `version` is for our own records, players see the date.

export type ChangeTag = 'new' | 'balance' | 'fix';

export interface ChangelogEntry {
  /** Semver, bumped per entry: minor for new content, patch for tuning and fixes. */
  version: string;
  /** YYYY-MM-DD, the deploy day. */
  date: string;
  title: string;
  changes: { tag: ChangeTag; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
      { tag: 'balance', text: 'Flat physical and magic damage affixes and flat max HP affixes grow a bit slower from T5 (×1.5 a tier, was ×1.6). T4 and below are unchanged.' },
      { tag: 'balance', text: 'Attack speed affixes roll higher: up to 15% (was 10%).' },
      { tag: 'balance', text: 'Lantern of the Drowned Moon: its Lunar Insight is now Drowned Hymn (each point of Mind also gives +0.08% attack speed and +0.2% armor, but Finesse gives nothing), and it rolls flat heal, heal % and Mind.' },
      { tag: 'balance', text: 'Legendary and unique effects that multiply your damage, gold or XP now say "more" or "less" (e.g. Berserker: 3% more damage per 10% of max HP missing), to set them apart from the additive % on regular affixes. Ambush keeps its 5×. Numbers are unchanged.' },
      { tag: 'balance', text: 'Discipline legendaries roll attack speed % as their stat bonus, instead of Vitality.' },
      { tag: 'balance', text: 'Moonwell Deep enemies hit a bit harder and have a bit less HP as you go down, and no longer scale faster past depth 100.' },
      { tag: 'balance', text: 'Thornshell reflects damage in the type you took it: magic hits come back as magic, physical as physical.' },
      { tag: 'balance', text: 'Raid Epic and Legendary drops roll every affix at the top tier.' },
      { tag: 'balance', text: 'Vitality gives +0.5% HP regen per point, down from +1%.' },
      { tag: 'balance', text: 'Thorned elites in the Deep reflect 10% of damage taken, down from 15%, in the damage types you hit them with: magic comes back as magic, physical as physical.' },
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
