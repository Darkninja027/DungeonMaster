import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SKILLS } from '#/lib/character'
import { api } from '#/lib/api'
import { collectSpells, filterSpells, mergeEntries } from '#/lib/bestiary'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import type { CharacterDraft, OwnedPickList } from '#/lib/characterDraft'
import {
  draftOwnedPickLists,
  eligibleExpertise,
  grantedSkills,
  picked,
} from '#/lib/characterDraft'
import type { PickList } from '#/lib/srd'
import { TOOL_SUGGESTIONS } from '#/lib/srd'
import { PickListGroup } from '../PickListGroup'

export function SkillsStep({
  worldId,
  draft,
  onChange,
}: {
  worldId: string
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const granted = grantedSkills(draft)
  // Weapon picks belong to the equipment step, where the option that created
  // them lives.
  //
  // The *owned* list, because a pick's own label can't say where it came from —
  // "Choose any three skills or tools" is the Skilled feat's wording, and next
  // to the race's and class's skill picks nothing marks it as the feat's.
  const picks = draftOwnedPickLists(draft).filter(
    (o) => o.pick.kind !== 'weapon',
  )

  // Spell and cantrip picks — High Elf's wizard cantrip, Magic Initiate's two —
  // ship no options, because no table here holds a spell list. Their
  // suggestions come from the world's articles and the shared library, the same
  // two sources the spells step uses.
  const wantsSpells = picks.some(
    (o) => o.pick.kind === 'cantrip' || o.pick.kind === 'spell',
  )
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
    enabled: wantsSpells,
  })
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'spell' }],
    queryFn: () => api.worlds.query(worldId, { type: 'spell' }),
    enabled: wantsSpells,
  })
  const library = useLibraryEntries('Spells')
  const spells = useMemo(
    () =>
      wantsSpells
        ? mergeEntries(
            collectSpells(worldId, tree.data, typed.data, { folder: 'Spells' }),
            library.entries,
          )
        : [],
    [wantsSpells, worldId, tree.data, typed.data, library.entries],
  )

  /**
   * Suggestions for one pick, or undefined to leave it with its own options.
   *
   * The class to narrow by is read out of the pick's own label — "Wizard
   * cantrip", "One druid cantrip" — because a `PickList` has nowhere to say it.
   * That is a small heuristic on hand-authored strings, and it fails safe: no
   * class matched means no class filter, which offers more rather than less.
   */
  const suggestionsFor = (pick: PickList): Array<string> | undefined => {
    // Half a `skillOrTool` pick's answers are tools, and tools are free text —
    // they ride the combobox rather than the chip cloud, because every tool as
    // a chip alongside every skill is a wall rather than a choice.
    if (pick.kind === 'skillOrTool') return [...TOOL_SUGGESTIONS]
    if (pick.kind !== 'cantrip' && pick.kind !== 'spell') return undefined
    const label = pick.label.toLowerCase()
    const className = SPELL_CLASSES.find((c) => label.includes(c.toLowerCase()))
    return filterSpells(spells, {
      level: pick.kind === 'cantrip' ? 0 : 1,
      className,
    }).map((e) => e.title)
  }

  return (
    <div className="space-y-4">
      {granted.size > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Already yours</h3>
          <div className="flex flex-wrap gap-1.5">
            {[...granted].map(([id, source]) => (
              <span
                key={id}
                className="bg-muted rounded-full px-2.5 py-1 text-xs"
                title={`Granted by ${source}`}
              >
                {SKILLS.find((s) => s.id === id)?.name ?? id}
                <span className="text-muted-foreground"> · {source}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {picks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing to choose here — your race, class, background and feat
          didn&rsquo;t offer any options. You can add proficiencies on the
          sheet.
        </p>
      ) : (
        picks.map(({ pick, owner, ownerKind }) => (
          <PickListGroup
            key={pick.id}
            pick={pick}
            chosen={picked(draft, pick.id)}
            source={sourceLabel(owner, ownerKind)}
            // Expertise doubles a proficiency, so its real answer set is the
            // character's own skills rather than the class's authored ceiling.
            options={
              pick.kind === 'expertise'
                ? eligibleExpertise(draft, pick)
                : undefined
            }
            alreadyGranted={
              pick.kind === 'skill' || pick.kind === 'skillOrTool'
                ? grantedSkills(draft, pick.id)
                : undefined
            }
            suggestions={suggestionsFor(pick)}
            // Only `skillOrTool` splits its answers across the two controls;
            // every other kind's combobox is a free-text tail on its own list.
            suggestionsLabel={pick.kind === 'skillOrTool' ? 'Tools' : undefined}
            suggestionsPlaceholder={
              pick.kind === 'skillOrTool'
                ? `Search ${TOOL_SUGGESTIONS.length} tools, or type your own…`
                : undefined
            }
            onChange={(values) =>
              onChange({
                ...draft,
                picks: { ...draft.picks, [pick.id]: values },
              })
            }
          />
        ))
      )}
    </div>
  )
}

/**
 * "the Skilled feat", "the Variant Human race" — what to print after "From".
 *
 * An equipment option's owner is its own label ("a martial weapon and a
 * shield"), which is a phrase rather than the name of a thing, so it prints
 * bare: "From a martial weapon and a shield" reads, where "the ... equipment"
 * would not.
 */
function sourceLabel(owner: string, kind: OwnedPickList['ownerKind']): string {
  return kind === 'equipment' ? owner : `the ${owner} ${kind}`
}

/**
 * Class names as the spell frontmatter spells them, for reading a class out of
 * a pick's label. A label naming two classes matches whichever comes first
 * here, which is arbitrary but harmless — every published pick names one.
 */
const SPELL_CLASSES = [
  'Artificer',
  'Bard',
  'Cleric',
  'Druid',
  'Paladin',
  'Ranger',
  'Sorcerer',
  'Warlock',
  'Wizard',
]
