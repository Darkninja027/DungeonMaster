import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  BookOpenCheck,
  ChevronDown,
  Dices,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import { articleTemplates } from '#/lib/templates'
import {
  ABILITIES,
  ABILITY_NAMES,
  ARMOR_PROFICIENCIES,
  CONDITIONS,
  DAMAGE_TYPES,
  ENCUMBRANCE_LABELS,
  SKILLS,
  WEAPON_CATEGORIES,
  abilityMod,
  alwaysPreparedCount,
  canPrepare,
  cycleDamage,
  cyclePreparation,
  d20,
  damageStance,
  effectiveSpeed,
  encumbranceTier,
  initiativeBonus,
  passivePerception,
  preparationState,
  preparedCount,
  preparedSpellLimit,
  proficiencyBonus,
  proficiencyLabel,
  resolveSpellDamage,
  saveBonus,
  scaleSpellDamage,
  signed,
  skillBonus,
  sortedSpells,
  spellAttackBonus,
  spellInfoFromContent,
  spellSaveDc,
  tracksPreparation,
  wikiLinkTitle,
} from '#/lib/character'
import type {
  Ability,
  Character,
  DamageStance,
  Spell,
  SpellSlots,
} from '#/lib/character'
import { roll } from '#/lib/rollAction'
import type { RollSource } from '#/lib/rollLog'
import { openSpellInPanel } from '#/lib/spellPanel'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { NumField } from './NumField'

const SPELLS_FOLDER = 'Spells'

interface SheetProps {
  character: Character
  onChange: (next: Character) => void
  source: RollSource
  articles?: Array<{ id: string; title: string; folderId?: string | null }>
  onCreateMissing?: (title: string) => void
}

/** A small "roll this" chip: shows the bonus, clicking rolls + logs it. */
function RollChip({
  label,
  bonus,
  source,
  notation,
}: {
  label: string
  bonus?: number
  source: RollSource
  /** Override for non-d20 rolls (damage, hit dice). */
  notation?: string
}) {
  const n = notation ?? d20(bonus ?? 0)
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-1.5 font-mono text-xs"
      title={`Roll ${label} (${n})`}
      onClick={() => roll(label, n, source)}
    >
      <Dices className="size-3" />
      {notation ?? signed(bonus ?? 0)}
    </Button>
  )
}

function Pips({
  count,
  total,
  onChange,
  className,
}: {
  count: number
  total: number
  onChange: (next: number) => void
  className?: string
}) {
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            'size-3.5 rounded-full border',
            i < count ? (className ?? 'bg-primary') : 'bg-transparent',
          )}
          onClick={() => onChange(i + 1 === count ? i : i + 1)}
        />
      ))}
    </span>
  )
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-md border p-3', className)}>
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Free-text list: type and press Enter to add, click the x to remove. */
function ChipList({
  values,
  placeholder,
  empty,
  onChange,
}: {
  values: Array<string>
  placeholder: string
  /** Hint shown when the list is empty; omitted where the context is obvious. */
  empty?: string
  onChange: (next: Array<string>) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const value = draft.trim()
    if (!value) return
    // Case-insensitive: "Dwarvish" twice is always a mistake, not two languages.
    const dupe = values.some((v) => v.toLowerCase() === value.toLowerCase())
    if (!dupe) onChange([...values, value])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      {/* Skipped entirely when there is nothing to show and no hint, so the row
          doesn't leave an empty gap above the input. */}
      {(values.length > 0 || empty) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {values.length === 0 ? (
            <span className="text-muted-foreground text-xs">{empty}</span>
          ) : (
            values.map((value, i) => (
              <span
                key={`${value}-${i}`}
                className="bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              >
                {proficiencyLabel(value)}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title={`Remove ${proficiencyLabel(value)}`}
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          placeholder={placeholder}
          className="h-7 max-w-64 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2"
          disabled={!draft.trim()}
          onClick={add}
        >
          <Plus className="size-3" /> Add
        </Button>
      </div>
    </div>
  )
}

/** Checkbox row over a closed set, matching the saving-throw idiom above. */
function TokenChecks({
  options,
  values,
  onChange,
}: {
  options: Array<{ id: string; name: string }>
  values: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const has = (id: string) => values.some((v) => v.toLowerCase() === id)
  const toggle = (id: string) =>
    onChange(
      has(id) ? values.filter((v) => v.toLowerCase() !== id) : [...values, id],
    )

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {options.map((option) => (
        <label key={option.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={has(option.id)}
            onChange={() => toggle(option.id)}
          />
          {option.name}
        </label>
      ))}
    </div>
  )
}

/**
 * A closed-set proficiency: checkboxes for the known categories plus a chip list
 * for anything else. Both halves live in one array, so it is split on the way in
 * and always re-joined as [...tokens, ...extras] — a stable order keeps toggling
 * from churning the on-disk field and dirtying the user's git history.
 */
function TokenSection({
  options,
  values,
  placeholder,
  onChange,
}: {
  options: Array<{ id: string; name: string }>
  values: Array<string>
  placeholder: string
  onChange: (next: Array<string>) => void
}) {
  const isToken = (v: string) =>
    options.some((o) => o.id === v.trim().toLowerCase())
  const tokens = values.filter(isToken)
  const extras = values.filter((v) => !isToken(v))

  return (
    <div className="space-y-1.5">
      <TokenChecks
        options={options}
        values={tokens}
        onChange={(next) => onChange([...next, ...extras])}
      />
      {/* No empty-state line: the checkboxes above and the input's own
          placeholder already say what this row is for. */}
      <ChipList
        values={extras}
        placeholder={placeholder}
        onChange={(next) => onChange([...tokens, ...next])}
      />
    </div>
  )
}

const STANCE_STYLES: Record<DamageStance, string> = {
  none: 'bg-transparent',
  resistant: 'bg-primary',
  immune: 'bg-primary ring-primary/40 ring-2',
  vulnerable: 'bg-destructive',
}

const STANCE_LABELS: Record<DamageStance, string> = {
  none: '—',
  resistant: 'Resistant',
  immune: 'Immune',
  vulnerable: 'Vulnerable',
}

/** The 13 damage types, each cycling through the four stances on click. */
function DamageGrid({
  character: c,
  onChange,
}: {
  character: Character
  onChange: (next: Character) => void
}) {
  return (
    <div className="grid gap-y-1 sm:grid-cols-2">
      {DAMAGE_TYPES.map((type) => {
        const stance = damageStance(c, type.id)
        return (
          <div key={type.id} className="flex items-center gap-2 pr-4 text-sm">
            <button
              type="button"
              title={STANCE_LABELS[stance]}
              className={cn(
                'size-3.5 shrink-0 rounded-full border',
                STANCE_STYLES[stance],
              )}
              onClick={() => onChange({ ...c, ...cycleDamage(c, type.id) })}
            />
            <span className="min-w-0 flex-1 truncate">{type.name}</span>
            {stance !== 'none' && (
              <span className="text-muted-foreground text-xs uppercase">
                {stance === 'resistant'
                  ? 'res'
                  : stance === 'immune'
                    ? 'imm'
                    : 'vuln'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SheetTab({
  character: c,
  onChange,
  source,
  articles,
  onCreateMissing,
}: SheetProps) {
  const set = (patch: Partial<Character>) => onChange({ ...c, ...patch })
  const prof = proficiencyBonus(c.level)

  // Latest character for async callbacks (backfill patches after awaits).
  const cRef = useRef(c)
  cRef.current = c

  const [spellName, setSpellName] = useState('')
  const [spellLevel, setSpellLevel] = useState(0)
  const queryClient = useQueryClient()

  // When the typed/picked name matches a library spell, prefill the level
  // dropdown from its article — once per matched article, so the DM can
  // still override it (e.g. add Magic Missile at 3rd level to upcast).
  const matchedSpell = (() => {
    const title = wikiLinkTitle(spellName).trim().toLowerCase()
    if (!title) return undefined
    return (articles ?? []).find((a) => a.title.toLowerCase() === title)
  })()
  const matchedSpellId = matchedSpell?.id ?? null
  const prefilledIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (matchedSpellId === null) {
      prefilledIdRef.current = null
      return
    }
    if (prefilledIdRef.current === matchedSpellId) return
    prefilledIdRef.current = matchedSpellId
    api.articles
      .get(source.worldId, matchedSpellId)
      .then((art) => {
        const info = spellInfoFromContent(art.content)
        if (info.level !== null) setSpellLevel(info.level)
      })
      .catch(() => {})
  }, [matchedSpellId, source.worldId])

  // The world's spell library is the top-level Spells/ folder.
  const spellSuggestions = spellName.trim()
    ? (articles ?? [])
        .filter(
          (a) =>
            (a.folderId === SPELLS_FOLDER ||
              a.folderId?.startsWith(`${SPELLS_FOLDER}/`)) &&
            a.title.toLowerCase().includes(spellName.trim().toLowerCase()) &&
            a.title.toLowerCase() !== wikiLinkTitle(spellName).toLowerCase(),
        )
        .slice(0, 6)
    : []

  /**
   * Adding a spell links it to the library: an existing article of that name
   * (anywhere in the world) is wiki-linked; an unknown spell gets a stub
   * article created in Spells/ so the library always knows it.
   */
  const addSpell = useMutation({
    mutationFn: async (input: { name: string; level: number }) => {
      const title = wikiLinkTitle(input.name)
      const existing = (articles ?? []).find(
        (a) => a.title.toLowerCase() === title.toLowerCase(),
      )
      if (existing) {
        // The dropdown wins for level (it was prefilled from the article,
        // and changing it is how you upcast). Damage comes from the library,
        // scaled by damagePerLevel when added above the base level.
        let damage: string | undefined
        let damagePerLevel: string | undefined
        try {
          const art = await api.articles.get(source.worldId, existing.id)
          const info = spellInfoFromContent(art.content)
          damagePerLevel = info.damagePerLevel ?? undefined
          if (info.damage) {
            const levelsAbove =
              info.level !== null ? Math.max(0, input.level - info.level) : 0
            damage = scaleSpellDamage(
              info.damage,
              info.damagePerLevel,
              levelsAbove,
            )
          }
        } catch {
          // unreadable article: no damage prefill
        }
        return {
          display: `[[${existing.title}]]`,
          level: input.level,
          damage,
          damagePerLevel,
        }
      }
      try {
        await api.folders.create({
          worldId: source.worldId,
          parentFolderId: null,
          name: SPELLS_FOLDER,
        })
      } catch {
        // folder already exists
      }
      // Stamp the chosen level into the new article (frontmatter + subtitle)
      // so the library and the sheet agree from day one.
      const template = articleTemplates.find((t) => t.id === 'spell')
      const body = (template?.body ?? '')
        .replace('level: 1', `level: ${input.level}`)
        .replace(
          'Level 1',
          input.level === 0 ? 'Cantrip' : `Level ${input.level}`,
        )
      const created = await api.articles.create({
        worldId: source.worldId,
        folderId: SPELLS_FOLDER,
        title,
        content: body,
      })
      return {
        display: `[[${created.title}]]`,
        level: input.level,
        damage: undefined as string | undefined,
        damagePerLevel: undefined as string | undefined,
      }
    },
    onSuccess: ({ display, level, damage, damagePerLevel }) => {
      const spell: Spell = { name: display, level }
      if (damage) spell.damage = damage
      if (damagePerLevel) spell.damagePerLevel = damagePerLevel
      set({ spells: [...c.spells, spell] })
      setSpellName('')
      queryClient.invalidateQueries({ queryKey: ['worlds', source.worldId] })
    },
    onError: (error) => alert(error.message),
  })

  const submitSpell = () => {
    const name = spellName.trim()
    if (!name || addSpell.isPending) return
    addSpell.mutate({ name, level: spellLevel })
  }

  // Record<number, …> lookups are undefined for unconfigured levels.
  const slotFor = (level: number) =>
    c.spellSlots[level] as SpellSlots | undefined

  const slotsLeft = (level: number) => {
    const slot = slotFor(level)
    return slot ? slot.total - slot.used : 0
  }

  const prepared = preparedCount(c)
  const alwaysPrepared = alwaysPreparedCount(c)
  const prepareLimit = preparedSpellLimit(c)
  const showPrepare = tracksPreparation(c)

  // Sheets saved before damagePerLevel existed only carry base damage: pick
  // the increment up from each spell's library article once so cast-time
  // upcasting works without re-adding the spell.
  const backfilled = useRef(false)
  useEffect(() => {
    if (backfilled.current || !articles?.length) return
    backfilled.current = true
    const targets = c.spells.flatMap((s) => {
      if (s.damagePerLevel) return []
      const title = wikiLinkTitle(s.name).trim().toLowerCase()
      const art = articles.find((a) => a.title.toLowerCase() === title)
      return art ? [{ name: s.name, articleId: art.id }] : []
    })
    if (targets.length === 0) return
    Promise.all(
      targets.map(async (t) => {
        try {
          const art = await api.articles.get(source.worldId, t.articleId)
          return {
            name: t.name,
            perLevel: spellInfoFromContent(art.content).damagePerLevel,
          }
        } catch {
          return { name: t.name, perLevel: null }
        }
      }),
    ).then((results) => {
      const found = new Map(
        results
          .filter((r) => r.perLevel)
          .map((r) => [r.name, r.perLevel as string]),
      )
      if (found.size === 0) return
      const cur = cRef.current
      onChange({
        ...cur,
        spells: cur.spells.map((s) =>
          !s.damagePerLevel && found.has(s.name)
            ? { ...s, damagePerLevel: found.get(s.name) }
            : s,
        ),
      })
    })
  }, [articles, c.spells, source.worldId, onChange])

  /**
   * Cast = expend one slot of the chosen level (defaults to the spell's own;
   * cantrips are at will) and roll the spell's damage, scaled when upcast.
   */
  const castSpell = (spell: Spell, atLevel = spell.level) => {
    if (spell.level === 0) return
    const slot = slotFor(atLevel)
    if (!slot || slot.used >= slot.total) return
    set({
      spellSlots: {
        ...c.spellSlots,
        [atLevel]: { ...slot, used: slot.used + 1 },
      },
    })
    if (spell.damage?.trim()) {
      const scaled = scaleSpellDamage(
        spell.damage.trim(),
        spell.damagePerLevel,
        atLevel - spell.level,
      )
      const label = `${wikiLinkTitle(spell.name)} damage${
        atLevel > spell.level ? ` (L${atLevel})` : ''
      }`
      roll(label, resolveSpellDamage(scaled, c), source)
    }
  }

  const toggleSave = (ability: Ability) =>
    set({
      saves: c.saves.includes(ability)
        ? c.saves.filter((a) => a !== ability)
        : [...c.saves, ability],
    })

  // none -> proficient -> expertise -> none
  const cycleSkill = (id: string) => {
    if (c.expertise.includes(id)) {
      set({ expertise: c.expertise.filter((s) => s !== id) })
    } else if (c.skills.includes(id)) {
      set({
        skills: c.skills.filter((s) => s !== id),
        expertise: [...c.expertise, id],
      })
    } else {
      set({ skills: [...c.skills, id] })
    }
  }

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-3">
        <Section title="Abilities">
          <div className="grid grid-cols-3 gap-2">
            {ABILITIES.map((ability) => {
              const mod = abilityMod(c.abilities[ability])
              return (
                <div key={ability} className="rounded border p-2 text-center">
                  <div className="text-muted-foreground text-xs uppercase">
                    {ability}
                  </div>
                  <NumField
                    value={c.abilities[ability]}
                    min={1}
                    max={30}
                    className="mx-auto my-1 w-14"
                    title={ABILITY_NAMES[ability]}
                    onCommit={(v) =>
                      set({ abilities: { ...c.abilities, [ability]: v } })
                    }
                  />
                  <RollChip
                    label={`${ABILITY_NAMES[ability]} check`}
                    bonus={mod}
                    source={source}
                  />
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Saving throws">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ABILITIES.map((ability) => (
              <div key={ability} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.saves.includes(ability)}
                  title="Proficient"
                  onChange={() => toggleSave(ability)}
                />
                <span className="min-w-0 flex-1 truncate">
                  {ABILITY_NAMES[ability]}
                </span>
                <RollChip
                  label={`${ABILITY_NAMES[ability]} save`}
                  bonus={saveBonus(c, ability)}
                  source={source}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Skills">
          <p className="text-muted-foreground mb-1 text-xs">
            Click the dot to cycle: none → proficient → expertise
          </p>
          <div className="grid gap-y-1">
            {SKILLS.map((skill) => {
              const expert = c.expertise.includes(skill.id)
              const proficient = c.skills.includes(skill.id)
              return (
                <div key={skill.id} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    title={
                      expert ? 'Expertise' : proficient ? 'Proficient' : '—'
                    }
                    className={cn(
                      'size-3.5 shrink-0 rounded-full border',
                      expert && 'bg-primary ring-primary/40 ring-2',
                      proficient && !expert && 'bg-primary',
                    )}
                    onClick={() => cycleSkill(skill.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {skill.name}
                    <span className="text-muted-foreground ml-1 text-xs uppercase">
                      {skill.ability}
                    </span>
                  </span>
                  <RollChip
                    label={skill.name}
                    bonus={skillBonus(c, skill.id)}
                    source={source}
                  />
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      <div className="space-y-3">
        <Section title="Combat">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              AC
              <NumField
                value={c.ac}
                min={0}
                className="w-12"
                onCommit={(v) => set({ ac: v })}
              />
            </label>
            <span className="flex items-center gap-1.5">
              Initiative
              <RollChip
                label="Initiative"
                bonus={initiativeBonus(c)}
                source={source}
              />
              <NumField
                value={c.initiativeBonus}
                className="w-10"
                title="Misc initiative bonus (added to DEX)"
                onCommit={(v) => set({ initiativeBonus: v })}
              />
            </span>
            <label className="flex items-center gap-1.5">
              Speed
              <NumField
                value={c.speed}
                min={0}
                className="w-12"
                onCommit={(v) => set({ speed: v })}
              />
              {/* The field edits base speed; encumbrance shows alongside it. */}
              {encumbranceTier(c) !== 'none' && (
                <span
                  className="text-muted-foreground text-xs"
                  title={ENCUMBRANCE_LABELS[encumbranceTier(c)]}
                >
                  → <strong>{effectiveSpeed(c)}</strong> ft{' '}
                  {ENCUMBRANCE_LABELS[encumbranceTier(c)].toLowerCase()}
                </span>
              )}
            </label>
            <span>
              Proficiency <strong>{signed(prof)}</strong>
            </span>
            <span>
              Passive Perception <strong>{passivePerception(c)}</strong>
            </span>
          </div>

          <Separator className="my-3" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              HP
              <NumField
                value={c.hp.current}
                min={0}
                className="w-14"
                onCommit={(v) => set({ hp: { ...c.hp, current: v } })}
              />
              /
              <NumField
                value={c.hp.max}
                min={1}
                className="w-14"
                onCommit={(v) => set({ hp: { ...c.hp, max: v } })}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Temp
              <NumField
                value={c.hp.temp}
                min={0}
                className="w-12"
                onCommit={(v) => set({ hp: { ...c.hp, temp: v } })}
              />
            </label>
            <span className="flex items-center gap-1.5">
              Hit dice d{c.hitDice.size}
              <NumField
                value={c.hitDice.total - c.hitDice.used}
                min={0}
                max={c.hitDice.total}
                className="w-10"
                title="Hit dice remaining"
                onCommit={(v) =>
                  set({
                    hitDice: { ...c.hitDice, used: c.hitDice.total - v },
                  })
                }
              />
              / {c.hitDice.total}
              <RollChip
                label="Hit die"
                notation={`d${c.hitDice.size}${
                  abilityMod(c.abilities.con) !== 0
                    ? signed(abilityMod(c.abilities.con))
                    : ''
                }`}
                source={source}
              />
            </span>
          </div>

          <div className="mt-3 flex items-center gap-5 text-sm">
            <span className="flex items-center gap-2">
              Death saves
              <Pips
                count={c.deathSaves.success}
                total={3}
                className="bg-green-600"
                onChange={(v) =>
                  set({ deathSaves: { ...c.deathSaves, success: v } })
                }
              />
              /
              <Pips
                count={c.deathSaves.fail}
                total={3}
                className="bg-destructive"
                onChange={(v) =>
                  set({ deathSaves: { ...c.deathSaves, fail: v } })
                }
              />
            </span>
          </div>
        </Section>

        <Section title="Proficiencies">
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground mb-1 text-xs">Armor</p>
              <TokenSection
                options={ARMOR_PROFICIENCIES}
                values={c.armor}
                placeholder="Anything else, e.g. Mithral plate"
                onChange={(armor) => set({ armor })}
              />
            </div>

            <Separator className="my-2" />

            <div>
              <p className="text-muted-foreground mb-1 text-xs">Weapons</p>
              <TokenSection
                options={WEAPON_CATEGORIES}
                values={c.weapons}
                placeholder="Individual weapon, e.g. Longsword"
                onChange={(weapons) => set({ weapons })}
              />
            </div>

            <Separator className="my-2" />

            <div>
              <p className="text-muted-foreground mb-1 text-xs">Tools</p>
              <ChipList
                values={c.tools}
                placeholder="e.g. Smith's tools"
                empty="No tool proficiencies — a background usually grants one or two."
                onChange={(tools) => set({ tools })}
              />
            </div>

            <Separator className="my-2" />

            <div>
              <p className="text-muted-foreground mb-1 text-xs">Languages</p>
              <ChipList
                values={c.languages}
                placeholder="e.g. Dwarvish"
                empty="No languages — most characters at least speak Common."
                onChange={(languages) => set({ languages })}
              />
            </div>
          </div>
        </Section>

        <Section title="Defenses">
          <p className="text-muted-foreground mb-1.5 text-xs">
            Click the dot to cycle: none → resistant → immune → vulnerable
          </p>
          <DamageGrid character={c} onChange={onChange} />

          <Separator className="my-3" />

          <p className="text-muted-foreground mb-1 text-xs">
            Condition immunities
          </p>
          <TokenChecks
            options={CONDITIONS}
            values={c.conditionImmunities}
            onChange={(conditionImmunities) => set({ conditionImmunities })}
          />
        </Section>

        <Section title="Attacks">
          <div className="space-y-1.5">
            {c.attacks.map((attack, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <Input
                  value={attack.name}
                  placeholder="Attack"
                  className="h-7 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, name: e.target.value } : a,
                      ),
                    })
                  }
                />
                <NumField
                  value={attack.bonus}
                  className="w-12"
                  title="To-hit bonus"
                  onCommit={(v) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, bonus: v } : a,
                      ),
                    })
                  }
                />
                <RollChip
                  label={`${attack.name || 'Attack'} (to hit)`}
                  bonus={attack.bonus}
                  source={source}
                />
                <Input
                  value={attack.damage}
                  placeholder="1d8+3"
                  className="h-7 w-20 text-sm"
                  onChange={(e) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, damage: e.target.value } : a,
                      ),
                    })
                  }
                />
                {attack.damage && (
                  <RollChip
                    label={`${attack.name || 'Attack'} damage`}
                    notation={attack.damage}
                    source={source}
                  />
                )}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove attack"
                  onClick={() =>
                    set({ attacks: c.attacks.filter((_, j) => j !== i) })
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                set({
                  attacks: [...c.attacks, { name: '', bonus: 0, damage: '' }],
                })
              }
            >
              <Plus className="size-3.5" /> Add attack
            </Button>
          </div>
        </Section>

        <Section title="Spellcasting">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              Ability
              <select
                className="bg-background h-7 rounded border px-1 text-sm"
                value={c.spellAbility ?? ''}
                onChange={(e) =>
                  set({
                    spellAbility: (e.target.value || null) as Ability | null,
                  })
                }
              >
                <option value="">None</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            {c.spellAbility && (
              <>
                <span>
                  Save DC <strong>{spellSaveDc(c)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  Spell attack
                  <RollChip
                    label="Spell attack"
                    bonus={spellAttackBonus(c) ?? 0}
                    source={source}
                  />
                </span>
              </>
            )}
          </div>
          {c.spellAbility && (
            <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => {
                const slot = c.spellSlots[lvl] ?? { total: 0, used: 0 }
                return (
                  <div key={lvl} className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground w-6 text-xs">
                      L{lvl}
                    </span>
                    <NumField
                      value={slot.total}
                      min={0}
                      max={9}
                      className="w-9"
                      title={`Level ${lvl} slots`}
                      onCommit={(v) =>
                        set({
                          spellSlots: {
                            ...c.spellSlots,
                            [lvl]: { total: v, used: Math.min(slot.used, v) },
                          },
                        })
                      }
                    />
                    {slot.total > 0 && (
                      <Pips
                        count={slot.used}
                        total={slot.total}
                        onChange={(v) =>
                          set({
                            spellSlots: {
                              ...c.spellSlots,
                              [lvl]: { ...slot, used: v },
                            },
                          })
                        }
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Spells">
          <div className="space-y-1">
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              {tracksPreparation(c) ? (
                <div className="flex items-center gap-2 text-sm">
                  <BookOpenCheck
                    className={cn(
                      'size-4',
                      prepared > 0 ? 'text-amber-500' : 'text-muted-foreground',
                    )}
                  />
                  <span>
                    <strong
                      className={cn(
                        prepared > prepareLimit && 'text-destructive',
                      )}
                    >
                      {prepared}
                    </strong>
                    <span className="text-muted-foreground">
                      {' '}
                      / {prepareLimit}
                    </span>{' '}
                    prepared
                  </span>
                  {alwaysPrepared > 0 && (
                    <span
                      className="text-sky-600 dark:text-sky-400 flex items-center gap-1 text-xs"
                      title="Domain, oath or circle spells — always prepared and free of the limit"
                    >
                      <Sparkles className="size-3 fill-current" />+
                      {alwaysPrepared} always
                    </span>
                  )}
                  {prepared > prepareLimit ? (
                    <span className="text-destructive text-xs">
                      (over the limit — unprepare {prepared - prepareLimit})
                    </span>
                  ) : (
                    prepared === prepareLimit && (
                      <span className="text-muted-foreground text-xs">
                        (all prepared)
                      </span>
                    )
                  )}
                  {prepared > 0 && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                      title="Unprepare everything — for swapping the list after a long rest. Always-prepared spells are left alone."
                      onClick={() =>
                        set({
                          spells: c.spells.map((s) => ({
                            ...s,
                            prepared: undefined,
                          })),
                        })
                      }
                    >
                      Clear
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Set a limit to track which spells are prepared.
                </span>
              )}
              <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                Prepared limit
                <NumField
                  value={c.preparedLimit}
                  min={0}
                  max={25}
                  className="w-12"
                  title="How many non-cantrip spells may be prepared at once — 0 to not track preparation at all (sorcerers, warlocks)"
                  onCommit={(v) => set({ preparedLimit: v })}
                />
              </label>
            </div>
            {c.spells.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No spells known. Use [[wiki links]] as names so the spell links
                to its article.
              </p>
            )}
            {sortedSpells(c.spells).map((spell) => {
              const idx = c.spells.indexOf(spell)
              const left = slotsLeft(spell.level)
              const title = wikiLinkTitle(spell.name)
              // Higher slot levels this spell could be cast with (any level
              // with slots configured, even if currently all expended).
              const upcastLevels =
                spell.level > 0
                  ? Array.from(
                      { length: 9 - spell.level },
                      (_, i) => spell.level + 1 + i,
                    ).filter((lvl) => (slotFor(lvl)?.total ?? 0) > 0)
                  : []
              const target = (articles ?? []).find(
                (a) => a.title.toLowerCase() === title.toLowerCase(),
              )
              // Cantrips need no preparation, so they keep a spacer instead of
              // a toggle and all the names stay in one column.
              const prepareBlocked = !canPrepare(c, spell)
              const state = preparationState(spell)
              // Unprepared spells read as inactive, so the live list stands out
              // at a glance. Order never changes — the printed sheet shares it.
              const dimmed = showPrepare && state === 'none'
              return (
                <div
                  key={`${spell.name}-${idx}`}
                  className="group flex items-center gap-1.5 text-sm"
                >
                  {showPrepare &&
                    (spell.level === 0 ? (
                      <span className="w-5 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          'shrink-0 rounded p-0.5',
                          state === 'always'
                            ? 'text-sky-500 hover:text-sky-400'
                            : state === 'prepared'
                              ? 'text-amber-500 hover:text-amber-400'
                              : prepareBlocked
                                ? 'text-muted-foreground/25'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                        )}
                        title={
                          state === 'always'
                            ? 'Always prepared (domain, oath or circle spell) — free, outside the limit. Click to unprepare'
                            : state === 'prepared'
                              ? 'Prepared — click to make it always prepared'
                              : prepareBlocked
                                ? `All ${prepareLimit} prepared spells are in use — unprepare one first, or raise the limit above`
                                : 'Prepare this spell'
                        }
                        disabled={prepareBlocked}
                        onClick={() =>
                          set({
                            spells: c.spells.map((s, j) =>
                              j === idx ? { ...s, ...cyclePreparation(s) } : s,
                            ),
                          })
                        }
                      >
                        {state === 'always' ? (
                          <Sparkles className="size-3.5 fill-current" />
                        ) : state === 'prepared' ? (
                          <BookOpenCheck className="size-3.5" />
                        ) : (
                          <BookOpen className="size-3.5" />
                        )}
                      </button>
                    ))}
                  <span className="bg-muted w-9 shrink-0 rounded text-center font-mono text-xs">
                    {spell.level === 0 ? 'C' : `L${spell.level}`}
                  </span>
                  {target ? (
                    <button
                      type="button"
                      className={cn(
                        'text-primary min-w-0 flex-1 truncate text-left underline underline-offset-2',
                        dimmed && 'opacity-60',
                      )}
                      title="Read in the spell panel"
                      onClick={() => openSpellInPanel(target.id)}
                    >
                      {title}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 truncate text-left underline decoration-dashed opacity-70 hover:opacity-100',
                        dimmed && 'opacity-40',
                      )}
                      title={`No article called "${title}" yet — click to create it`}
                      onClick={() => onCreateMissing?.(title)}
                    >
                      {title}
                    </button>
                  )}
                  <Input
                    value={spell.damage ?? ''}
                    placeholder="dmg"
                    title={`Damage notation — "mod" adds your spell modifier, e.g. 2d8+mod${
                      spell.damagePerLevel
                        ? `; upcasts +${spell.damagePerLevel} per slot level`
                        : ''
                    }`}
                    className="h-6 w-20 shrink-0 px-1 text-xs"
                    onChange={(e) =>
                      set({
                        spells: c.spells.map((s, j) =>
                          j === idx
                            ? { ...s, damage: e.target.value || undefined }
                            : s,
                        ),
                      })
                    }
                  />
                  {spell.level === 0 ? (
                    <>
                      {spell.damage?.trim() && (
                        <RollChip
                          label={`${title} damage`}
                          notation={resolveSpellDamage(spell.damage, c)}
                          source={source}
                        />
                      )}
                      <span className="text-muted-foreground shrink-0 text-xs">
                        at will
                      </span>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-1.5 text-xs"
                        disabled={left <= 0}
                        title={
                          left > 0
                            ? `Expend a level ${spell.level} slot (${left} left)${
                                spell.damage?.trim() ? ' and roll damage' : ''
                              }`
                            : slotFor(spell.level)?.total
                              ? `No level ${spell.level} slots left`
                              : `Set level ${spell.level} slots above first`
                        }
                        onClick={() => castSpell(spell)}
                      >
                        <Sparkles className="size-3" /> Cast ({left})
                      </Button>
                      {upcastLevels.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-5 shrink-0 px-0"
                              title="Cast with a higher-level slot"
                            >
                              <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {upcastLevels.map((lvl) => (
                              <DropdownMenuItem
                                key={lvl}
                                disabled={slotsLeft(lvl) <= 0}
                                onClick={() => castSpell(spell, lvl)}
                              >
                                Level {lvl} ({slotsLeft(lvl)} left)
                                {spell.damage?.trim() &&
                                  spell.damagePerLevel &&
                                  ` — ${scaleSpellDamage(
                                    spell.damage.trim(),
                                    spell.damagePerLevel,
                                    lvl - spell.level,
                                  )}`}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
                    title="Remove spell"
                    onClick={() =>
                      set({ spells: c.spells.filter((_, j) => j !== idx) })
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
            {spellSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-muted-foreground text-xs">
                  From the spell library:
                </span>
                {spellSuggestions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="hover:bg-accent rounded border px-1.5 py-0.5 text-xs"
                    onClick={() => setSpellName(`[[${a.title}]]`)}
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 pt-1">
              <Input
                value={spellName}
                placeholder="Add spell — unknown names get a Spells/ article"
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) => setSpellName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSpell()}
              />
              <select
                className="bg-background h-7 rounded border px-1 text-sm"
                value={spellLevel}
                title="Spell level"
                onChange={(e) => setSpellLevel(Number(e.target.value))}
              >
                <option value={0}>Cantrip</option>
                {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    L{lvl}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-7 shrink-0"
                disabled={!spellName.trim() || addSpell.isPending}
                onClick={submitSpell}
              >
                <Plus className="size-3.5" />
                {addSpell.isPending ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Currency">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
              <label key={coin} className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs uppercase">
                  {coin}
                </span>
                <NumField
                  value={c.currency[coin]}
                  min={0}
                  className="w-14"
                  onCommit={(v) =>
                    set({ currency: { ...c.currency, [coin]: v } })
                  }
                />
              </label>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
