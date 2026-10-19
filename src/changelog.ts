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
      { tag: 'new', text: 'Raid 2, The Drowned Moon, and the T4 zone Moonveil Vale.' },
      { tag: 'new', text: 'Life skills: Mining, Woodcutting, Foraging, Smithing and Alchemy.' },
      { tag: 'balance', text: 'Moonwell Deep first clears pay 5× the gold and Dust and 2× the XP.' },
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
