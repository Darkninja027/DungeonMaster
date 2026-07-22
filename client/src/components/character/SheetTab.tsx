import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Dices, Plus, Sparkles, X } from 'lucide-react'
import { api } from '#/lib/api'
import { articleTemplates } from '#/lib/templates'
import {
  ABILITIES,
  ABILITY_NAMES,
  SKILLS,
  abilityMod,
  d20,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  resolveSpellDamage,
  saveBonus,
  scaleSpellDamage,
  signed,
  skillBonus,
  sortedSpells,
  spellAttackBonus,
  spellInfoFromContent,
  spellSaveDc,
  wikiLinkTitle,
} from '#/lib/character'
import type { Ability, Character, Spell, SpellSlots } from '#/lib/character'
import { rollDice } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
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

function roll(label: string, notation: string, source: RollSource) {
  const result = rollDice(notation)
  if (result) {
    logRoll({
      notation,
      label,
      total: result.total,
      detail: result.detail,
      source,
    })
  }
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
              return (
                <div
                  key={`${spell.name}-${idx}`}
                  className="group flex items-center gap-1.5 text-sm"
                >
                  <span className="bg-muted w-9 shrink-0 rounded text-center font-mono text-xs">
                    {spell.level === 0 ? 'C' : `L${spell.level}`}
                  </span>
                  {target ? (
                    <button
                      type="button"
                      className="text-primary min-w-0 flex-1 truncate text-left underline underline-offset-2"
                      title="Read in the spell panel"
                      onClick={() => openSpellInPanel(target.id)}
                    >
                      {title}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left underline decoration-dashed opacity-70 hover:opacity-100"
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
