import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ABILITIES,
  ABILITY_NAMES,
  ENCUMBRANCE_LABELS,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  SKILLS,
  abilityMod,
  attunedCount,
  attunementLimit,
  carriedWeight,
  carryCapacity,
  d20,
  effectiveSpeed,
  encumbranceTier,
  equippedIn,
  hasDefenses,
  initiativeBonus,
  inventoryItemName,
  alwaysPreparedCount,
  passivePerception,
  preparationState,
  preparedCount,
  preparedSpellLimit,
  proficiencyBonus,
  proficiencyLabel,
  resolveSpellDamage,
  saveBonus,
  signed,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
  tracksPreparation,
  wikiLinkTitle,
} from '#/lib/character'
import type {
  Ability,
  Character,
  InventoryItem,
  PreparationState,
  SpellSlots,
} from '#/lib/character'
import {
  featureRows,
  paginate,
  paginateFeatureRows,
  paginateSpellRows,
  spellRows,
} from '#/lib/sheetPages'
import type { FeatureRow, SpellRow } from '#/lib/sheetPages'
import { roll } from '#/lib/rollAction'
import type { RollSource } from '#/lib/rollLog'
import { openSpellInPanel } from '#/lib/spellPanel'
import { cn } from '#/lib/utils'
import { InlineMarkdown, Markdown } from '#/components/Markdown'
import { WikiText } from './WikiText'

/**
 * Read-only parchment character sheet — a classic 5e sheet laid out on the
 * book's fixed 816x1056 pages, so it prints and exports to PDF through the
 * same path as any article (see lib/exportPdf.ts, which finds .dnd-page).
 *
 * Because those pages are `overflow: hidden`, every variable-length list is
 * either paginated up front (lib/sheetPages.ts) or truncated with a visible
 * tell. Nothing here is editable: editing lives on the Sheet tab.
 */

type ArticleRef = { id: string; title: string }

export interface SheetPreviewProps {
  character: Character
  /** Backstory prose from parseCharacter, rendered as trailing book pages. */
  body?: string
  title: string
  source: RollSource
  worldId: string
  articles?: Array<ArticleRef>
}

/**
 * Per-page capacities. Rows are 24px and the lists run two columns, so these
 * are (available height / 24) * 2, measured against the rendered page rather
 * than guessed — too low wastes half a sheet, too high clips silently.
 *
 * The spell budgets are spent in half-rows: a spell costs 1, a level heading
 * costs 2 because it spans both grid columns. See paginateSpellRows.
 */
const ATTACK_ROWS = 8
const SPELL_ROWS_FIRST = 54
const SPELL_ROWS_REST = 74
// Treasure (~86px, always shown) and Equipped (~150px when anything was worn)
// both moved off this page to page one, so the first gear page carries a lot
// more than it used to. Measured against the rendered page, not derived.
const GEAR_ROWS_FIRST = 74
const GEAR_ROWS_REST = 74
/**
 * The optional box at the head of the gear page. It holds four labelled lines
 * plus a cap, which measures 103px, so 120 seats that with room for one line to
 * wrap. The cap stops a very long list from shoving the Equipment box past the
 * clip; the height is charged back against GEAR_ROWS_FIRST at the same
 * (h / 24) * 2 rate as everything else — see gearPages below.
 */
const PROF_BOX_HEIGHT = 120
const gearBoxCost = (height: number) => Math.ceil(height / 24) * 2

/**
 * The three boxes under the ability scores in page one's left rail.
 *
 * Measured in the running app, not derived: the body clips at 889px and the six
 * ability boxes plus their gaps eat 690, leaving 199px, which the tightened rail
 * gaps in styles.css bring to ~209px of usable box. .dnd-cs-body clips
 * silently, so going over loses the bottom of the sheet with no error at all —
 * re-measure (scrollHeight > clientHeight on .dnd-cs-body) after touching any of
 * this.
 *
 * Passive is fixed at 3 lines. Defenses and Languages both flow as one wrapped
 * paragraph, so they clip rather than push — RailDefenses collapses its four
 * lists into a single run when they're all populated.
 */
const RAIL_PASSIVE_HEIGHT = 58
const RAIL_DEFENSE_HEIGHT = 68
const RAIL_LANGUAGE_HEIGHT = 46

/**
 * The purse, in the right half of the lower row under Equipped: a cap plus one
 * row per denomination at 21px, matching the Equipped slot rows above it.
 */
const TREASURE_HEIGHT = 132

/**
 * The right column's two fixed heights. Combat holds the tile row plus the hit
 * dice / death saves footer. SKILLS_HEIGHT sizes the bottom row — Skills beside
 * Equipped — against its taller side: eighteen skills in one column at 21px a
 * row. AttacksTable takes whatever is left over as the column's only flexible
 * block, so these two decide how much room it gets. Both measured against the
 * rendered page; a short box clips its last row with no warning.
 */
const COMBAT_HEIGHT = 150
const SKILLS_HEIGHT = 412
/**
 * Features are costed in text lines, not rows — see lib/sheetPages.ts. The
 * box measures 868px across two columns at ~14.85px a line, so ~116 lines
 * fit; a small margin absorbs the estimate's error without stranding a
 * half-empty page.
 */
const FEATURE_LINES = 112

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const NO_SLOTS: SpellSlots = { total: 0, used: 0 }

/**
 * `Record<number, …>` types every level as present, but the parsed object only
 * holds the levels the character actually configured — so this lookup really
 * can come back undefined (see SheetTab's slotFor for the same trap).
 */
function slotFor(c: Character, level: number): SpellSlots {
  return c.spellSlots[level] ?? NO_SLOTS
}

/**
 * Markdown treats a single newline as a space, so a hand-typed list like
 *
 *   3rd Level: Bane, Hunter's Mark
 *   5th Level: Hold Person, Misty Step
 *
 * would run together into one paragraph. Append markdown's own hard-break
 * marker (two trailing spaces) to each line so the layout survives, without
 * touching blank lines (paragraph breaks) or lines that already end in one.
 */
function preserveLineBreaks(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? line : line.replace(/ *$/, '  ')))
    .join('\n')
}

function anySlots(c: Character): boolean {
  return SLOT_LEVELS.some((lvl) => slotFor(c, lvl).total > 0)
}

/**
 * Like character.ts's hasOtherProficiencies, minus languages: those print in
 * page one's left rail now, so a character whose only entry is a language must
 * not earn an otherwise-empty box on the gear page.
 */
function hasPrintedProficiencies(c: Character): boolean {
  return c.armor.length > 0 || c.weapons.length > 0 || c.tools.length > 0
}

/**
 * A spellcasting ability on its own doesn't earn a page — the Sheet tab's
 * ability dropdown is easy to set and easy to forget, and a page showing only
 * "INT / DC 12 / +4" with no spells and no slots is just noise. There has to
 * be something to actually print.
 */
function hasSpellcasting(c: Character): boolean {
  return c.spells.length > 0 || anySlots(c)
}

/**
 * Preparation markers for the printed sheet. Distinct *shapes*, not colours, so
 * they survive a black-ink print: a star for the free domain/oath/circle spells,
 * a filled dot for one spent against the limit, a hollow one for not prepared.
 */
const PREP_GLYPHS: Record<PreparationState, string> = {
  always: '★',
  prepared: '●',
  none: '○',
}

const PREP_TITLES: Record<PreparationState, string> = {
  always: 'Always prepared — free of the limit',
  prepared: 'Prepared',
  none: 'Not prepared',
}

const COINS: Array<{ key: keyof Character['currency']; name: string }> = [
  { key: 'pp', name: 'Platinum' },
  { key: 'gp', name: 'Gold' },
  { key: 'ep', name: 'Electrum' },
  { key: 'sp', name: 'Silver' },
  { key: 'cp', name: 'Copper' },
]

/**
 * A roll chip. Wrapped in .dnd-roll-bar because that is the only class
 * exportPdf filters on — the number it sits beside is always plain text, so
 * dropping the chip for print leaves the sheet readable and the row unmoved.
 */
function SheetChip({
  label,
  bonus,
  notation,
  source,
  glyph = 'd20',
}: {
  label: string
  bonus?: number
  notation?: string
  source: RollSource
  glyph?: string
}) {
  const n = notation ?? d20(bonus ?? 0)
  return (
    <span className="dnd-roll-bar">
      <button
        type="button"
        className="dnd-cs-chip"
        title={`Roll ${label} (${n})`}
        onClick={() => roll(label, n, source)}
      >
        {glyph}
      </button>
    </span>
  )
}

function AbilityBox({
  c,
  ability,
  source,
}: {
  c: Character
  ability: Ability
  source: RollSource
}) {
  const mod = abilityMod(c.abilities[ability])
  const save = saveBonus(c, ability)
  const proficient = c.saves.includes(ability)
  return (
    <div className="dnd-cs-ability">
      <div className="dnd-cs-ability-name">{ABILITY_NAMES[ability]}</div>
      <div className="dnd-cs-ability-score">{c.abilities[ability]}</div>
      {/* One badge carrying both d20 bonuses this ability grants: the check
          modifier and the saving throw, split by a hairline. The save lives here
          rather than in a box across the page, beside the score it keys off. */}
      {/* Each half is itself the roll target — a d20 chip beside both numbers
          made the badge unreadable at this size, and the halves are already
          labelled, so clicking the number you want is unambiguous. */}
      <div className="dnd-cs-ability-mod">
        <button
          type="button"
          className="dnd-cs-ability-modhalf"
          title={`Roll ${ABILITY_NAMES[ability]} check (${d20(mod)})`}
          onClick={() =>
            roll(`${ABILITY_NAMES[ability]} check`, d20(mod), source)
          }
        >
          {signed(mod)}
        </button>
        <button
          type="button"
          className={cn(
            'dnd-cs-ability-modhalf',
            'dnd-cs-ability-modsave',
            proficient && 'dnd-cs-ability-modsave-prof',
          )}
          title={`Roll ${ABILITY_NAMES[ability]} save (${d20(save)})${
            proficient ? ' — proficient' : ''
          }`}
          onClick={() =>
            roll(`${ABILITY_NAMES[ability]} save`, d20(save), source)
          }
        >
          {signed(save)}
        </button>
      </div>
      <div className="dnd-cs-ability-modkeys" aria-hidden="true">
        <span>Modifier</span>
        <span>Save</span>
      </div>
    </div>
  )
}

/**
 * The defenses box for the 168px left rail. Labels sit inline before their
 * comma-joined values — ProfLine's fixed 62px label column is sized for the
 * 712px-wide gear page and would leave almost nothing for the values here.
 *
 * The box only gets RAIL_DEFENSE_HEIGHT, and a character with all four lists
 * full wants half again as much. Rather than clip lines away invisibly, the
 * lists run together into one flowing paragraph once there are two or more of
 * them: denser to read, but nothing goes missing off a printed sheet.
 */
function RailDefenses({ c }: { c: Character }) {
  const lists = [
    { label: 'Res', values: c.resistances },
    { label: 'Imm', values: c.immunities },
    { label: 'Vul', values: c.vulnerabilities },
    { label: 'Cond', values: c.conditionImmunities },
  ].filter((l) => l.values.length > 0)

  const join = (values: Array<string>) =>
    values.map(proficiencyLabel).join(', ')

  return (
    <div
      className="dnd-cs-box"
      style={{ flex: '0 0 auto', maxHeight: RAIL_DEFENSE_HEIGHT }}
    >
      <div className="dnd-cs-cap">Defenses</div>
      {lists.length >= 2 ? (
        <div className="dnd-cs-raildef dnd-cs-raildef-flow">
          {lists.map((l, i) => (
            <span key={l.label}>
              {i > 0 && ' '}
              <span className="dnd-cs-raildef-label">{l.label}</span>
              {join(l.values)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 1 }}>
          {lists.map((l) => (
            <div key={l.label} className="dnd-cs-raildef">
              <span className="dnd-cs-raildef-label">{l.label}</span>
              {join(l.values)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  note,
  chip,
}: {
  label: string
  value: React.ReactNode
  note?: string
  chip?: React.ReactNode
}) {
  return (
    <div className="dnd-cs-stat">
      <div className="dnd-cs-stat-value">{value}</div>
      <div className="dnd-cs-stat-label">{label}</div>
      {note && <div className="dnd-cs-stat-note">{note}</div>}
      {chip}
    </div>
  )
}

function Pips({
  total,
  filled,
  variant,
}: {
  total: number
  filled: number
  variant: 'used' | 'ok' | 'fail'
}) {
  return (
    <span className="dnd-cs-pips">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn('dnd-cs-pip', i < filled && `dnd-cs-pip-${variant}`)}
        />
      ))}
    </span>
  )
}

/** One skill or saving-throw line: dot, name, ability tag, bonus, chip. */
function ProfRow({
  name,
  ability,
  bonus,
  proficient,
  expertise,
  source,
}: {
  name: string
  ability: Ability
  bonus: number
  proficient: boolean
  expertise?: boolean
  source: RollSource
}) {
  return (
    <div className="dnd-cs-row">
      <span
        className={cn(
          'dnd-cs-dot',
          expertise
            ? 'dnd-cs-dot-exp'
            : proficient
              ? 'dnd-cs-dot-prof'
              : undefined,
        )}
        title={
          expertise ? 'Expertise' : proficient ? 'Proficient' : 'Not proficient'
        }
      />
      <span className="dnd-cs-row-name">{name}</span>
      <span className="dnd-cs-row-abil">{ability}</span>
      <span className="dnd-cs-row-bonus">{signed(bonus)}</span>
      <SheetChip label={name} bonus={bonus} source={source} />
    </div>
  )
}

function Banner({
  title,
  small,
  children,
}: {
  title: string
  small?: boolean
  children?: React.ReactNode
}) {
  return (
    <header className="dnd-cs-banner">
      <div className={cn('dnd-cs-name', small && 'dnd-cs-name-sm')}>
        {title || 'Unnamed character'}
      </div>
      {children && <div className="dnd-cs-sub">{children}</div>}
    </header>
  )
}

function Sep() {
  return <span className="dnd-cs-sub-sep">&bull;</span>
}

function AttacksTable({ c, source }: { c: Character; source: RollSource }) {
  const shown = c.attacks.slice(0, ATTACK_ROWS)
  const hidden = c.attacks.length - shown.length
  return (
    <div className="dnd-cs-box" style={{ flex: '1 1 auto', minHeight: 176 }}>
      <div className="dnd-cs-cap">Attacks</div>
      {shown.length === 0 ? (
        <p className="dnd-cs-truncated">No attacks recorded.</p>
      ) : (
        <table className="dnd-cs-attacks">
          {/* Widths and alignment are in styles.css so the heads and their data
              can't drift apart — see table.dnd-cs-attacks. */}
          <thead>
            <tr>
              <th>Name</th>
              <th>Atk</th>
              <th>Damage</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((atk, i) => (
              <tr key={`${atk.name}-${i}`}>
                <td>{atk.name || '—'}</td>
                <td>
                  {signed(atk.bonus)}
                  <SheetChip
                    label={`${atk.name || 'Attack'} to hit`}
                    bonus={atk.bonus}
                    source={source}
                  />
                </td>
                <td>
                  {atk.damage || '—'}
                  {atk.damage.trim() && (
                    <SheetChip
                      label={`${atk.name || 'Attack'} damage`}
                      notation={atk.damage}
                      source={source}
                      glyph="dmg"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <p className="dnd-cs-truncated">
          +{hidden} more {hidden === 1 ? 'attack' : 'attacks'} — see the Sheet
          tab.
        </p>
      )}
    </div>
  )
}

/**
 * What the character is actually wearing, beside the skills on page one — it's
 * the other half of "what can I do right now?", and it used to sit on the gear
 * page where you'd never look mid-fight.
 *
 * Every slot prints, filled or not: a printed sheet wants an empty line to write
 * on rather than a slot that silently vanished.
 */
function EquippedBox({ c }: { c: Character }) {
  return (
    <div className="dnd-cs-box">
      <div className="dnd-cs-cap">Equipped</div>
      <div className="dnd-cs-equiplist">
        {EQUIP_SLOTS.map((slot) => {
          const item = equippedIn(c.inventory, slot)
          return (
            <div key={slot} className="dnd-cs-equiprow">
              <span className="dnd-cs-row-abil">{EQUIP_SLOT_NAMES[slot]}</span>
              <span className="dnd-cs-row-name">
                {item ? inventoryItemName(item.text) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The purse, in its own box under Equipped — the eleven slots above don't fill
 * their half of the page, and coins are the other thing you reach for between
 * fights. All five denominations print even at zero: a sheet wants a 0 to write
 * over, not a missing line.
 */
function TreasureBox({ c }: { c: Character }) {
  return (
    <div className="dnd-cs-box" style={{ flex: `0 0 ${TREASURE_HEIGHT}px` }}>
      <div className="dnd-cs-cap">Treasure</div>
      <div className="dnd-cs-coingrid">
        {COINS.map(({ key, name }) => (
          <div key={key} className="dnd-cs-railrow">
            <span>
              {name} <span className="dnd-cs-coinabbr">{key}</span>
            </span>
            <strong>{c.currency[key]}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function CorePage({
  c,
  title,
  source,
}: {
  c: Character
  title: string
  source: RollSource
}) {
  const prof = proficiencyBonus(c.level)
  const init = initiativeBonus(c)
  const speed = effectiveSpeed(c)
  const hitDiceLeft = Math.max(0, c.hitDice.total - c.hitDice.used)

  return (
    <div className="dnd-page">
      <div className="dnd-cs">
        <Banner title={title}>
          {/* "Human Champion Fighter 7" — the subclass sits in front of the
              class the way 5e says it aloud. */}
          {[c.race, c.subclass, c.class && `${c.class} ${c.level}`]
            .filter(Boolean)
            .join(' ') || `Level ${c.level}`}
          {c.background && (
            <>
              <Sep />
              {c.background}
            </>
          )}
          {c.alignment && (
            <>
              <Sep />
              {c.alignment}
            </>
          )}
          <Sep />
          {c.xp} XP
        </Banner>

        <div className="dnd-cs-body dnd-cs-body-split">
          {/* Left rail: ability scores, then the things you reach for mid-combat
              — passive senses, defenses and the purse. The six ability boxes
              only fill ~690px of the 960px body, and .dnd-cs-body clips
              silently, so every box below them is capped rather than left to
              grow into its neighbours. */}
          <div className="dnd-cs-rail">
            {ABILITIES.map((ability) => (
              <AbilityBox
                key={ability}
                c={c}
                ability={ability}
                source={source}
              />
            ))}
            <div
              className="dnd-cs-box"
              style={{ flex: '0 0 auto', maxHeight: RAIL_PASSIVE_HEIGHT }}
            >
              <div className="dnd-cs-cap">Passive</div>
              {(
                [
                  ['Perception', passivePerception(c)],
                  ['Investigation', 10 + skillBonus(c, 'investigation')],
                  ['Insight', 10 + skillBonus(c, 'insight')],
                ] as const
              ).map(([name, value]) => (
                <div key={name} className="dnd-cs-railrow">
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            {hasDefenses(c) && <RailDefenses c={c} />}

            {/* Languages took this slot when Treasure moved beside Equipped —
                they're read aloud at the table constantly, and they were buried
                on the gear page's proficiency box before. */}
            {c.languages.length > 0 && (
              <div
                className="dnd-cs-box"
                style={{ flex: '0 0 auto', maxHeight: RAIL_LANGUAGE_HEIGHT }}
              >
                <div className="dnd-cs-cap">Languages</div>
                <div className="dnd-cs-raildef dnd-cs-raildef-flow">
                  {c.languages.join(', ')}
                </div>
              </div>
            )}
          </div>

          {/* Right column: one Combat box holding everything you touch in a
              fight, then attacks, then skills and saves together. Fewer boxes
              than the old five — every extra box cost a cap, two borders and a
              10px gap, which is where page one's white space was going. */}
          <div className="dnd-cs-col">
            <div
              className="dnd-cs-box"
              style={{ flex: `0 0 ${COMBAT_HEIGHT}px` }}
            >
              <div className="dnd-cs-cap">Combat</div>
              <div className="dnd-cs-combat">
                <div className="dnd-cs-shield">
                  <div className="dnd-cs-shield-inner">
                    <div className="dnd-cs-shield-value">{c.ac}</div>
                    <div className="dnd-cs-stat-label">Armor</div>
                  </div>
                </div>
                <StatBox
                  label="Initiative"
                  value={signed(init)}
                  chip={
                    <SheetChip
                      label="Initiative"
                      bonus={init}
                      source={source}
                    />
                  }
                />
                <StatBox
                  label="Speed"
                  value={`${speed} ft`}
                  // A bare 0 looks like a bug rather than "too heavy to move".
                  note={
                    speed === c.speed
                      ? undefined
                      : speed === 0
                        ? 'over capacity'
                        : `base ${c.speed}`
                  }
                />
                <StatBox label="Proficiency" value={signed(prof)} />
                {/* HP keeps the red cap and the big number — it's the one value
                    that changes every round. Temp sits inside it as its own
                    pool rather than paying for a whole extra box. */}
                <div className="dnd-cs-hp">
                  <div className="dnd-cs-cap">Hit Points</div>
                  <div className="dnd-cs-hp-line">
                    <span className="dnd-cs-hp-current">{c.hp.current}</span>
                    <span style={{ fontSize: 13 }}>/ {c.hp.max}</span>
                  </div>
                </div>
                {/* Temp HP is a separate pool in 5e, so it gets its own tile
                    with its own cap — same shape as the HP tile beside it, muted
                    top border so it reads as the secondary pool. */}
                <div className="dnd-cs-hp dnd-cs-hp-temp">
                  <div className="dnd-cs-cap">Temp</div>
                  <div className="dnd-cs-hp-line">
                    <span className="dnd-cs-hp-tempvalue">
                      {c.hp.temp > 0 ? c.hp.temp : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="dnd-cs-combat-foot">
                <span>
                  Hit dice{' '}
                  <strong>
                    {hitDiceLeft}/{c.hitDice.total}
                  </strong>{' '}
                  d{c.hitDice.size}
                  {hitDiceLeft > 0 && (
                    <SheetChip
                      label={`Hit die (d${c.hitDice.size})`}
                      notation={`d${c.hitDice.size}`}
                      source={source}
                      glyph="roll"
                    />
                  )}
                </span>
                <span className="dnd-cs-deathsaves">
                  Death saves
                  <span title="Successes">
                    <Pips
                      total={3}
                      filled={c.deathSaves.success}
                      variant="ok"
                    />
                  </span>
                  <span title="Failures">
                    <Pips total={3} filled={c.deathSaves.fail} variant="fail" />
                  </span>
                </span>
              </div>
            </div>

            {/* Spellcasting ability / DC / attack live on the Spellcasting
                page, not here — this page has no room to spare. */}
            <AttacksTable c={c} source={source} />

            {/* Skills beside what you're wearing. Saving throws live inside the
                ability boxes in the left rail now, beside the score each one
                keys off — see AbilityBox. Both boxes are sized exactly: a short
                one clips its last row with no warning at all. */}
            <div
              className="dnd-cs-lowerrow"
              style={{ flex: `0 0 ${SKILLS_HEIGHT}px` }}
            >
              <div className="dnd-cs-box">
                <div className="dnd-cs-cap">Skills</div>
                {/* One column, not two: the box is half as wide as it was, and
                    18 rows at 21px still seat inside SKILLS_HEIGHT. */}
                <div
                  className="dnd-cs-scroll dnd-cs-skilllist"
                  style={{ alignContent: 'space-between' }}
                >
                  {SKILLS.map((skill) => (
                    <ProfRow
                      key={skill.id}
                      name={skill.name}
                      ability={skill.ability}
                      bonus={skillBonus(c, skill.id)}
                      proficient={c.skills.includes(skill.id)}
                      expertise={c.expertise.includes(skill.id)}
                      source={source}
                    />
                  ))}
                </div>
              </div>
              {/* Equipped over Treasure: eleven slots leave slack in this half,
                  and the purse fills it as its own box. */}
              <div className="dnd-cs-lowerstack">
                <EquippedBox c={c} />
                <TreasureBox c={c} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpellName({
  name,
  articles,
}: {
  name: string
  articles?: Array<ArticleRef>
}) {
  const title = wikiLinkTitle(name)
  const target = (articles ?? []).find(
    (a) => a.title.toLowerCase() === title.toLowerCase(),
  )
  if (!target) {
    return (
      <span
        className="dnd-cs-row-name"
        style={{ textDecoration: 'underline dashed', opacity: 0.75 }}
      >
        {title}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="dnd-cs-link dnd-cs-row-name"
      style={{ textAlign: 'left' }}
      title="Read in the spell panel"
      onClick={() => openSpellInPanel(target.id)}
    >
      {title}
    </button>
  )
}

function FeaturesPage({
  c,
  title,
  source,
  rows,
  worldId,
  articles,
  pageLabel,
}: {
  c: Character
  title: string
  source: RollSource
  rows: Array<FeatureRow>
  worldId: string
  articles?: Array<ArticleRef>
  pageLabel: string
}) {
  return (
    <div className="dnd-page">
      <div className="dnd-cs">
        <Banner title={`${title} — ${pageLabel}`} small>
          {[c.race, c.class, `Level ${c.level}`].filter(Boolean).join(' ')}
        </Banner>
        <div className="dnd-cs-body">
          <div className="dnd-cs-box" style={{ flex: '1 1 auto' }}>
            <div className="dnd-cs-cap">Features &amp; Traits</div>
            <div className="dnd-cs-scroll dnd-cs-2col">
              {rows.map((row, i) => {
                if (row.kind === 'cap') {
                  return (
                    <div
                      key={`cap-${row.level ?? row.label}-${i}`}
                      className="dnd-cs-cap"
                      style={{ marginTop: i === 0 ? 0 : 6 }}
                    >
                      {/* A null level is a plain section heading */}
                      {row.level === null
                        ? row.label
                        : `Level ${row.level}${
                            row.level > c.level ? ' — not yet gained' : ''
                          }`}
                    </div>
                  )
                }
                const entry = row.kind === 'entry' ? row.entry : row.feature
                const future =
                  row.kind === 'feature' && row.feature.level > c.level
                return (
                  <div
                    key={`entry-${i}`}
                    className={cn(
                      'dnd-cs-feature',
                      future && 'dnd-cs-feature-future',
                    )}
                  >
                    <div className="dnd-cs-feature-name">{entry.name}</div>
                    {entry.text && (
                      <InlineMarkdown
                        className="dnd-cs-feature-text"
                        worldId={worldId}
                        articles={articles}
                        source={source}
                      >
                        {preserveLineBreaks(entry.text)}
                      </InlineMarkdown>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpellPage({
  c,
  title,
  source,
  rows,
  articles,
  showHeader,
  pageLabel,
}: {
  c: Character
  title: string
  source: RollSource
  rows: Array<SpellRow>
  articles?: Array<ArticleRef>
  showHeader: boolean
  pageLabel: string
}) {
  const dc = spellSaveDc(c)
  const atk = spellAttackBonus(c)
  const showSlots = anySlots(c)
  const showPrepare = tracksPreparation(c)

  return (
    <div className="dnd-page">
      <div className="dnd-cs">
        <Banner title={`${title} — ${pageLabel}`} small />
        <div className="dnd-cs-body">
          {showHeader && (
            <>
              <div
                style={{
                  flex: '0 0 84px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                }}
              >
                <StatBox
                  label="Spellcasting Ability"
                  value={c.spellAbility ? c.spellAbility.toUpperCase() : '—'}
                  note={
                    c.spellAbility ? ABILITY_NAMES[c.spellAbility] : undefined
                  }
                />
                <StatBox label="Spell Save DC" value={dc ?? '—'} />
                <StatBox
                  label="Spell Attack Bonus"
                  value={atk === null ? '—' : signed(atk)}
                  chip={
                    atk === null ? undefined : (
                      <SheetChip
                        label="Spell attack"
                        bonus={atk}
                        source={source}
                      />
                    )
                  }
                />
              </div>
              {showSlots && (
                <div className="dnd-cs-box" style={{ flex: '0 0 104px' }}>
                  <div className="dnd-cs-cap">Spell Slots</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      columnGap: 18,
                    }}
                  >
                    {SLOT_LEVELS.map((lvl) => {
                      const slots = slotFor(c, lvl)
                      return (
                        <div
                          key={lvl}
                          className="dnd-cs-row"
                          style={{ height: 24 }}
                        >
                          <span className="dnd-cs-row-name">Level {lvl}</span>
                          {/* Empty circles to pencil in as slots are spent —
                              a printed sheet doesn't need a live count. */}
                          {slots.total > 0 ? (
                            <Pips
                              total={slots.total}
                              filled={0}
                              variant="used"
                            />
                          ) : (
                            <span className="dnd-cs-row-bonus">—</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="dnd-cs-box" style={{ flex: '1 1 auto' }}>
            <div className="dnd-cs-cap">
              Spells
              {showPrepare && (
                <span style={{ fontWeight: 'normal' }}>
                  {' — '}
                  {preparedCount(c)} / {preparedSpellLimit(c)} prepared
                  {alwaysPreparedCount(c) > 0 &&
                    ` + ${alwaysPreparedCount(c)} always (★)`}
                </span>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="dnd-cs-truncated">No spells recorded.</p>
            ) : (
              <div className="dnd-cs-scroll dnd-cs-spellgrid">
                {rows.map((row, i) =>
                  row.kind === 'cap' ? (
                    <div
                      key={`cap-${row.level}-${i}`}
                      className="dnd-cs-cap"
                      style={{ marginTop: i === 0 ? 0 : 6 }}
                    >
                      {row.level === 0 ? 'Cantrips' : `Level ${row.level}`}
                    </div>
                  ) : (
                    <div
                      key={`spell-${i}`}
                      className="dnd-cs-row"
                      style={{ height: 24 }}
                    >
                      {showPrepare && (
                        /* Shape, not colour — this has to read in black ink. A
                           star marks the free domain/oath/circle spells, a
                           filled dot the ones spent against the limit, and
                           cantrips need no marker at all. */
                        <span
                          className="dnd-cs-prep"
                          title={
                            row.spell.level === 0
                              ? 'Cantrip — always available'
                              : PREP_TITLES[preparationState(row.spell)]
                          }
                        >
                          {row.spell.level === 0
                            ? ''
                            : PREP_GLYPHS[preparationState(row.spell)]}
                        </span>
                      )}
                      <span className="dnd-cs-lvl">
                        {row.spell.level === 0 ? 'C' : row.spell.level}
                      </span>
                      <SpellName name={row.spell.name} articles={articles} />
                      {row.spell.damage?.trim() && (
                        <SheetChip
                          label={wikiLinkTitle(row.spell.name)}
                          notation={resolveSpellDamage(row.spell.damage, c)}
                          source={source}
                          glyph="dmg"
                        />
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GearRow({
  item,
  c,
  worldId,
  articles,
}: {
  item: InventoryItem
  c: Character
  worldId: string
  articles?: Array<ArticleRef>
}) {
  return (
    <div className="dnd-cs-row" style={{ height: 24 }}>
      {item.attuned && (
        <span
          className="dnd-cs-dot dnd-cs-dot-prof"
          title="Attuned"
          style={{ borderColor: 'var(--dnd-gold)' }}
        />
      )}
      <span className="dnd-cs-row-name">
        {/* No onCreateMissing: unresolved links stay inert in a read-only view */}
        <WikiText text={item.text} worldId={worldId} articles={articles} />
      </span>
      {item.qty > 1 && <span className="dnd-cs-row-abil">x{item.qty}</span>}
      {c.encumbrance.enabled && item.weight > 0 && (
        <span className="dnd-cs-row-bonus">
          {Math.round(item.qty * item.weight * 100) / 100}
        </span>
      )}
    </div>
  )
}

/**
 * One labelled line of the proficiency or defense box. Comma-joined rather than
 * a row per entry, so a character with twenty tool proficiencies wraps within a
 * bounded box instead of silently shoving the boxes below it off the page.
 */
function ProfLine({ label, values }: { label: string; values: Array<string> }) {
  if (values.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: 1.45 }}>
      {/* 62px matches the Equipped box's label rail, so the two boxes align. */}
      <span
        className="dnd-cs-row-abil"
        style={{ flex: '0 0 62px', paddingTop: 1 }}
      >
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {values.map(proficiencyLabel).join(', ')}
      </span>
    </div>
  )
}

function GearPage({
  c,
  title,
  worldId,
  articles,
  items,
  showHeader,
  pageLabel,
  notes,
}: {
  c: Character
  title: string
  worldId: string
  articles?: Array<ArticleRef>
  items: Array<InventoryItem>
  showHeader: boolean
  pageLabel: string
  notes: boolean
}) {
  const tier = encumbranceTier(c)

  return (
    <div className="dnd-page">
      <div className="dnd-cs">
        <Banner title={`${title} — ${pageLabel}`} small />
        <div className="dnd-cs-body">
          {/* Equipped, Treasure and Defenses all print on page one now — they're
              wanted mid-combat, on the sheet you're actually holding. */}

          {/* Capped, and paid for out of GEAR_ROWS_FIRST below — the body clips
              silently, so an unbounded box here would eat Equipment rows. */}
          {showHeader && hasPrintedProficiencies(c) && (
            <div
              className="dnd-cs-box"
              style={{ flex: '0 0 auto', maxHeight: PROF_BOX_HEIGHT }}
            >
              {/* Languages print in page one's left rail now, not here. */}
              <div className="dnd-cs-cap">Other Proficiencies</div>
              <div style={{ display: 'grid', gap: 3 }}>
                <ProfLine label="Armor" values={c.armor} />
                <ProfLine label="Weapons" values={c.weapons} />
                <ProfLine label="Tools" values={c.tools} />
              </div>
            </div>
          )}

          {showHeader && (c.encumbrance.enabled || attunedCount(c) > 0) && (
            <div
              className="dnd-cs-box"
              style={{
                flex: '0 0 auto',
                flexDirection: 'row',
                gap: 14,
                fontSize: 11,
              }}
            >
              {c.encumbrance.enabled && (
                <span>
                  Carrying {carriedWeight(c)} / {carryCapacity(c)} lb
                  <Sep />
                  {ENCUMBRANCE_LABELS[tier]}
                </span>
              )}
              {attunedCount(c) > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  Attunement
                  <Pips
                    total={attunementLimit(c)}
                    filled={attunedCount(c)}
                    variant="used"
                  />
                </span>
              )}
            </div>
          )}

          <div className="dnd-cs-box" style={{ flex: '1 1 auto' }}>
            <div className="dnd-cs-cap">Equipment</div>
            {items.length === 0 ? (
              <p className="dnd-cs-truncated">Nothing carried.</p>
            ) : (
              <div className="dnd-cs-scroll dnd-cs-2col">
                {items.map((item, i) => (
                  <GearRow
                    key={`${item.text}-${i}`}
                    item={item}
                    c={c}
                    worldId={worldId}
                    articles={articles}
                  />
                ))}
              </div>
            )}
          </div>

          {notes && c.notes.length > 0 && (
            <div className="dnd-cs-box" style={{ flex: '0 0 200px' }}>
              <div className="dnd-cs-cap">Session Notes</div>
              <div className="dnd-cs-scroll" style={{ fontSize: 11 }}>
                {c.notes.map((note, i) => (
                  <div key={`${note.at}-${i}`} style={{ marginBottom: 4 }}>
                    <span className="dnd-cs-row-abil">
                      {note.at.slice(0, 10)}
                    </span>{' '}
                    <WikiText
                      text={note.text}
                      worldId={worldId}
                      articles={articles}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SheetPreview({
  character: c,
  body,
  title,
  source,
  worldId,
  articles,
}: SheetPreviewProps) {
  const spellPages = useMemo(
    () =>
      paginateSpellRows(spellRows(c.spells), SPELL_ROWS_FIRST, SPELL_ROWS_REST),
    [c.spells],
  )
  const gearPages = useMemo(
    () =>
      paginate(
        c.inventory,
        // The proficiency box sits above Equipment on page one, so page one
        // carries fewer rows when it's shown. Treasure and Defenses used to be
        // charged here too; both now print in page one's left rail instead.
        GEAR_ROWS_FIRST -
          (hasPrintedProficiencies(c) ? gearBoxCost(PROF_BOX_HEIGHT) : 0),
        GEAR_ROWS_REST,
      ),
    [c],
  )
  const featurePages = useMemo(
    () =>
      paginateFeatureRows(
        featureRows(c.features, c.traits, c.feats),
        FEATURE_LINES,
        FEATURE_LINES,
      ),
    [c.features, c.traits, c.feats],
  )

  const casts = hasSpellcasting(c)
  // Coins and defenses no longer count towards earning this page — both print on
  // page one now, so a character with 3gp and nothing else would otherwise get a
  // sheet holding one empty Equipment box.
  const showGear =
    gearPages.length > 0 || c.notes.length > 0 || hasPrintedProficiencies(c)
  const prose = body?.trim()
  // Most backstories already open with their own "# Name" heading — only add
  // one when the prose doesn't start with a heading of its own.
  const proseDoc = prose?.startsWith('#') ? prose : `# ${title}\n\n${prose}`

  return (
    <div className="dnd-book flex flex-col items-center gap-8">
      <CorePage c={c} title={title} source={source} />

      {featurePages.map((rows, i) => (
        <FeaturesPage
          key={`features-${i}`}
          c={c}
          title={title}
          source={source}
          rows={rows}
          worldId={worldId}
          articles={articles}
          pageLabel={
            i === 0 ? 'Features & Traits' : 'Features & Traits (cont.)'
          }
        />
      ))}

      {/* Non-casters get no spellcasting pages at all. A caster with slots but
          no spells written down still gets one, so the slots are printable. */}
      {casts &&
        (spellPages.length > 0 ? spellPages : [[]]).map((rows, i) => (
          <SpellPage
            key={`spells-${i}`}
            c={c}
            title={title}
            source={source}
            rows={rows}
            articles={articles}
            showHeader={i === 0}
            pageLabel={i === 0 ? 'Spellcasting' : 'Spellcasting (cont.)'}
          />
        ))}

      {showGear &&
        (gearPages.length > 0 ? gearPages : [[]]).map((items, i) => (
          <GearPage
            key={`gear-${i}`}
            c={c}
            title={title}
            worldId={worldId}
            articles={articles}
            items={items}
            showHeader={i === 0}
            pageLabel={i === 0 ? 'Equipment & Treasure' : 'Equipment (cont.)'}
            notes={i === (gearPages.length || 1) - 1}
          />
        ))}

      {prose && (
        <Markdown
          columns={2}
          articles={articles}
          worldId={worldId}
          source={source}
        >
          {proseDoc}
        </Markdown>
      )}
    </div>
  )
}

/**
 * Scales the fixed 816px sheets down to fit a narrower pane, matching the
 * article editor's live preview so the two feel the same.
 */
export function SheetFitPane({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(Math.min(1, (el.clientWidth - 24) / 840))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="h-full">
      <div className="p-3" style={{ zoom: scale }}>
        {children}
      </div>
    </div>
  )
}
