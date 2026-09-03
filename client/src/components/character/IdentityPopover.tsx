import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Character } from '#/lib/character'
import { setLevel } from '#/lib/character'
import type { ClassInfo } from '#/lib/classes'
import { findClass, subclassLabelFor, subclassesFor } from '#/lib/classes'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { NumField } from '#/components/character/NumField'
import { DEFAULT_RULESET, RULESETS } from '#/lib/ruleset'
import type { Ruleset } from '#/lib/ruleset'
import { cn } from '#/lib/utils'

/**
 * The line the chip shows, and the one the printed sheet has always built:
 * see the header block in SheetPreview. Level is deliberately absent — it has
 * its own badge — as are background and alignment, which are the least
 * referenced and would push the truncation point left for no gain.
 *
 * The fallback matters: a fresh or hand-edited character with empty fields must
 * still present something clickable, not an empty chip.
 */
export function identitySummary(character: Character): string {
  const parts = [character.race, character.class, character.subclass]
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.join(' · ') || 'Set race and class'
}

/**
 * The identity fields — race, class, subclass, background, alignment, level and
 * XP — behind a summary chip. Two triggers open it: the chip itself and the
 * level badge in the header, so levelling stays one click.
 *
 * Every field keeps the behaviour it had in the old toolbar. They are plain
 * Inputs with a `<datalist>` rather than our Combobox on purpose: the lists here
 * are a dozen entries, which is the size datalist handles fine, and Combobox's
 * Escape handler deliberately doesn't stop propagation (the isComboboxListOpen
 * protocol DialogContent consults) — nested here, one Escape would close both
 * its list and this popover.
 */
export function IdentityPopover({
  character,
  onChange,
  classes,
  onLevelUp,
  showRuleset,
}: {
  character: Character
  onChange: (next: Character) => void
  classes: Array<ClassInfo>
  onLevelUp: (to: number) => void
  /**
   * Offer the rules edition. True only where the folder cannot answer — the
   * vault — matching the creation wizard's own rule. A campaign world sets this
   * once in its settings for every character in it.
   */
  showRuleset?: boolean
}) {
  const uid = useId()
  const summary = identitySummary(character)
  const hasIdentity = Boolean(character.race.trim() || character.class.trim())

  const field = 'h-7 text-sm'
  const label = 'justify-end text-muted-foreground text-xs font-normal'

  return (
    <Popover>
      {/*
        Two triggers, one root: the level badge and the summary chip both open
        this. The badge is here rather than in the header because levelling is
        the most consequential action on the sheet and the level field lives in
        here — leaving the badge inert would bury it two clicks deep.
      */}
      <PopoverTrigger
        aria-label={`Level ${character.level}. Click to edit identity and level.`}
        title="Level — click to edit, raise it to level up"
        className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring mr-1 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider tabular-nums transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        LV&thinsp;{character.level}
      </PopoverTrigger>
      {/* The shrink target: everything else in the row is shrink-0, so this is
          what truncates first as the window narrows. */}
      <PopoverTrigger
        aria-label={`Identity: ${summary}. Click to edit.`}
        title={summary}
        className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex h-7 w-fit max-w-[16rem] min-w-0 shrink items-center gap-1 rounded-md px-1.5 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <span className={cn('truncate', !hasIdentity && 'italic')}>
          {summary}
        </span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      {/*
        Note: NumField commits on blur or Enter, and React fires no onBlur on an
        unmounted input. Clicking outside is fine — the browser moves focus
        before Radix's outside handler runs — but Escape closes without a focus
        move, so a half-typed level or XP is dropped. That reads as "cancel",
        which is defensible; it is called out here so the next reader doesn't
        file it as a mystery.
      */}
      <PopoverContent className="w-80">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <Label htmlFor={`${uid}-race`} className={label}>
            Race
          </Label>
          <Input
            id={`${uid}-race`}
            list={`${uid}-races`}
            value={character.race}
            className={field}
            onChange={(e) => onChange({ ...character, race: e.target.value })}
          />

          <Label htmlFor={`${uid}-class`} className={label}>
            Class
          </Label>
          <Input
            id={`${uid}-class`}
            list={`${uid}-classes`}
            value={character.class}
            className={field}
            onChange={(e) => {
              const value = e.target.value
              const known = findClass(classes, value)
              onChange({
                ...character,
                class: value,
                // Naming a known class sets its hit die; homebrew leaves
                // whatever size the sheet already had.
                hitDice: known
                  ? { ...character.hitDice, size: known.hitDie }
                  : character.hitDice,
              })
            }}
          />

          {/* "Patron" for a Warlock, "Domain" for a Cleric — strictly better
              than the old placeholder, which vanished on the first keystroke. */}
          <Label htmlFor={`${uid}-subclass`} className={label}>
            {subclassLabelFor(classes, character.class)}
          </Label>
          <Input
            id={`${uid}-subclass`}
            list={`${uid}-subclasses`}
            value={character.subclass}
            className={field}
            onChange={(e) =>
              onChange({ ...character, subclass: e.target.value })
            }
          />

          <Label htmlFor={`${uid}-background`} className={label}>
            Background
          </Label>
          <Input
            id={`${uid}-background`}
            value={character.background}
            className={field}
            onChange={(e) =>
              onChange({ ...character, background: e.target.value })
            }
          />

          <Label htmlFor={`${uid}-alignment`} className={label}>
            Alignment
          </Label>
          <Input
            id={`${uid}-alignment`}
            value={character.alignment}
            className={field}
            onChange={(e) =>
              onChange({ ...character, alignment: e.target.value })
            }
          />

          {showRuleset && (
            <>
              <Label htmlFor={`${uid}-ruleset`} className={label}>
                Rules
              </Label>
              <select
                id={`${uid}-ruleset`}
                className={cn(
                  'border-input bg-background rounded-md border px-2',
                  field,
                )}
                value={character.ruleset ?? DEFAULT_RULESET}
                onChange={(e) =>
                  onChange({
                    ...character,
                    ruleset: e.target.value as Ruleset,
                  })
                }
              >
                {RULESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <Label htmlFor={`${uid}-level`} className={label}>
            Level
          </Label>
          <div className="flex items-center gap-2">
            <NumField
              id={`${uid}-level`}
              value={character.level}
              min={1}
              max={20}
              className="w-14"
              /*
                A rise opens the level-up wizard; anything else is a correction
                and behaves as it always did. Safe because NumField commits on
                blur or Enter only — typing "12" when you meant 1 then 2 can't
                fire a nine-level wizard mid-keystroke.
              */
              onCommit={(v) => {
                if (v > character.level) onLevelUp(v)
                else onChange(setLevel(character, v))
              }}
            />
            <span className="text-muted-foreground text-xs">
              raise to level up
            </span>
          </div>

          <Label htmlFor={`${uid}-xp`} className={label}>
            XP
          </Label>
          <NumField
            id={`${uid}-xp`}
            value={character.xp}
            min={0}
            className="w-24"
            onCommit={(v) => onChange({ ...character, xp: v })}
          />
        </div>

        {/* Scoped to this popover so the ids can't collide with another
            instance, and so they mount and unmount with the form. */}
        <datalist id={`${uid}-races`}>
          {RACE_SUGGESTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id={`${uid}-classes`}>
          {classes.map((cl) => (
            <option key={cl.id} value={cl.name} />
          ))}
        </datalist>
        <datalist id={`${uid}-subclasses`}>
          {subclassesFor(classes, character.class).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Suggestions only — race is free text on disk and always will be, so this list
 * exists to save typing, never to constrain. Homebrew and anything a human wrote
 * in Obsidian round-trips untouched.
 */
const RACE_SUGGESTIONS = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Halfling',
  'Human',
  'Tiefling',
]
