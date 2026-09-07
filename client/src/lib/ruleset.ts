/**
 * Which edition of the rules a world is played under.
 *
 * The app ships both the 2014 and 2024 bestiary and spell list, seeded into one
 * shared library. A world picks which of them it wants to see, so a 2024
 * campaign isn't offered "Fireball" and "Fireball 5.5e" side by side.
 *
 * Filtering is a **view concern only**, the same rule worldMode.ts and
 * libraryFolders.ts follow. Nothing moves on disk, no article is deleted, and
 * every [[wiki link]] and deep link keeps working — switching to `all` shows
 * everything again.
 *
 * The scope is deliberately narrow: this filters *library content* (spells and
 * monsters). The character-build tables in lib/srd/ are SRD 5.1 — 2014 content —
 * and there is no 2024 counterpart, so a race, class or background is unaffected
 * by this setting. The Rules settings section says so, rather than implying a
 * completeness that doesn't exist.
 */

/**
 * Ids are the rules year rather than "5e"/"5.5e" because that is the vocabulary
 * the app already uses on screen — the Library settings section has said "the
 * 2014 and 2024 rules" since before this setting existed. The bundled content
 * folders keep their `5e`/`5.5e` names; those are filenames, not labels.
 */
export type Ruleset = '2014' | '2024' | 'all'

export const RULESET_IDS: Array<Ruleset> = ['2014', '2024', 'all']

export interface RulesetInfo {
  id: Ruleset
  label: string
  /** One line under the label, so an option explains itself. */
  blurb: string
}

/**
 * `all` is the default because it is exactly today's behaviour — both editions
 * visible, nothing hidden. A world written before this field existed has no
 * key, parses to `all`, and is therefore completely unchanged until someone
 * opts in. That is the whole migration.
 *
 * Note this differs from the *creation* default: a new world offers 2024,
 * because someone starting today is most likely playing the current rules. An
 * existing world is never silently narrowed.
 */
export const DEFAULT_RULESET: Ruleset = 'all'

/** What a newly created world is offered. See DEFAULT_RULESET on why they differ. */
export const NEW_WORLD_RULESET: Ruleset = '2024'

export const RULESETS: Array<RulesetInfo> = [
  {
    id: '2014',
    label: '2014 rules',
    blurb: 'The original fifth edition spells and bestiary.',
  },
  {
    id: '2024',
    label: '2024 rules',
    blurb: 'The revised fifth edition spells and bestiary.',
  },
  {
    id: 'all',
    label: 'Show everything',
    blurb: 'Both editions at once, labelled where they differ.',
  },
]

/** Falls back to the default for an unknown or absent ruleset. */
export function findRuleset(id: string | undefined): RulesetInfo {
  return (
    RULESETS.find((r) => r.id === id) ??
    RULESETS.find((r) => r.id === DEFAULT_RULESET)!
  )
}

/**
 * A hand-edited `ruleset` that isn't one of the three falls back to the default
 * rather than being dropped — the same contract parseMode and parseLiveEdit
 * hold: a typo in a file people are invited to edit must not hide content they
 * can't work out how to get back.
 */
export function parseRuleset(raw: unknown): Ruleset {
  return RULESET_IDS.includes(raw as Ruleset)
    ? (raw as Ruleset)
    : DEFAULT_RULESET
}
