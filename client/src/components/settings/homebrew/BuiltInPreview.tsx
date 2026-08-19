import { Copy } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES, SKILLS } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type {
  BackgroundInfo,
  ClassKit,
  FeatInfo,
  Grant,
  RaceInfo,
  SubraceInfo,
} from '#/lib/srd'
import { featuresUpToLevel } from '#/lib/srd'
import { Button } from '#/components/ui/button'

/**
 * A built-in shown read-only, with a button to fork it into homebrew.
 *
 * Deliberately *not* the editors with their inputs disabled. Those are built
 * from `GrantEditor` and friends — several hundred lines of interactive
 * controls, none of which take a readOnly prop — so making them inert would
 * mean threading a flag through every one and remembering it for every control
 * added later. A greyed-out form also reads worse than plain prose when all you
 * want is to know what the SRD Dwarf actually gives you.
 *
 * The tradeoff: this renders the same data a second way, so a genuinely new
 * field on `RaceInfo` needs adding here too. That is the cost of not disabling
 * the editors, and it is the cheaper of the two.
 */
export function BuiltInPreview({
  entry,
  kind,
  shadowedBy,
  onDuplicate,
}: {
  entry: RaceInfo | BackgroundInfo | ClassKit | FeatInfo
  kind: 'races' | 'backgrounds' | 'kits' | 'feats'
  /** Name of the homebrew entry overriding this one, when there is one. */
  shadowedBy?: string
  onDuplicate: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium">{entry.name}</h3>
            <span className="text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] uppercase">
              Built-in
            </span>
          </div>
          {'summary' in entry && entry.summary !== '' && (
            <p className="text-muted-foreground mt-1 text-xs">
              {entry.summary}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 text-xs"
          onClick={onDuplicate}
        >
          <Copy className="size-3.5" /> Duplicate to homebrew
        </Button>
      </div>

      {shadowedBy !== undefined && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-500">
          Your homebrew &ldquo;{shadowedBy}&rdquo; overrides this. Characters are
          built against yours, not this one.
        </p>
      )}

      {kind === 'races' && <RacePreview race={entry as RaceInfo} />}
      {kind === 'backgrounds' && (
        <BackgroundPreview background={entry as BackgroundInfo} />
      )}
      {kind === 'kits' && <KitPreview kit={entry as ClassKit} />}
      {kind === 'feats' && <FeatPreview feat={entry as FeatInfo} />}
    </div>
  )
}

/**
 * The published feats in `lib/feats/` render through here, as does a
 * world-supplied one viewed via this component. Written before either existed,
 * back when `SRD_FEATS` was the only feat tier and empty.
 */
function FeatPreview({ feat }: { feat: FeatInfo }) {
  return (
    <div className="space-y-3">
      {feat.prerequisite !== undefined && (
        <Row label="Prerequisite">
          <Plain>{feat.prerequisite}</Plain>
        </Row>
      )}
      {feat.asi && (
        <Row label="Ability increase">
          <AsiChips asi={feat.asi} />
        </Row>
      )}
      <GrantPreview grant={feat.grant} />
    </div>
  )
}

function RacePreview({ race }: { race: RaceInfo }) {
  return (
    <div className="space-y-3">
      <Row label="Ability increases">
        <AsiChips asi={race.asi} />
      </Row>
      <Row label="Speed">
        <Plain>{race.speed} ft</Plain>
      </Row>
      {race.flexibleAsi && (
        <Row label="Flexible increases">
          <Plain>
            +{race.flexibleAsi.amount} to {race.flexibleAsi.count} abilit
            {race.flexibleAsi.count === 1 ? 'y' : 'ies'} of your choice
          </Plain>
        </Row>
      )}
      {race.grantsFeat === true && (
        <Row label="Feat">
          <Plain>Grants a feat of your choice</Plain>
        </Row>
      )}
      <GrantPreview grant={race.grant} />
      {race.subraces && race.subraces.length > 0 && (
        <Section title="Subraces">
          <div className="space-y-2">
            {race.subraces.map((sub) => (
              <SubracePreview key={sub.id} subrace={sub} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function SubracePreview({ subrace }: { subrace: SubraceInfo }) {
  return (
    <div className="rounded border px-2 py-1.5">
      <div className="text-xs font-medium">{subrace.name}</div>
      {subrace.summary !== '' && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {subrace.summary}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <AsiChips asi={subrace.asi} />
        {subrace.speed !== undefined && <Chip>Speed {subrace.speed} ft</Chip>}
        {subrace.hpPerLevel !== undefined && (
          <Chip>+{subrace.hpPerLevel} HP per level</Chip>
        )}
      </div>
      <GrantPreview grant={subrace.grant} dense />
    </div>
  )
}

function BackgroundPreview({ background }: { background: BackgroundInfo }) {
  return (
    <div className="space-y-3">
      <Section title="Feature">
        <div className="text-xs font-medium">{background.feature.name}</div>
        {background.feature.text !== undefined &&
          background.feature.text !== '' && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {background.feature.text}
            </p>
          )}
      </Section>
      <GrantPreview grant={background.grant} />
    </div>
  )
}

function KitPreview({ kit }: { kit: ClassKit }) {
  // Level 1 only, matching what the creation wizard offers — the same helper
  // it uses, so this can't drift from the wizard's idea of a level 1 class.
  const features = featuresUpToLevel(kit.features, 1)
  return (
    <div className="space-y-3">
      <Row label="Hit die">
        <Plain>d{kit.hitDie}</Plain>
      </Row>
      {kit.saves.length > 0 && (
        <Row label="Saving throws">
          <div className="flex flex-wrap gap-1">
            {kit.saves.map((save) => (
              <Chip key={save}>{ABILITY_NAMES[save]}</Chip>
            ))}
          </div>
        </Row>
      )}
      {kit.spellcasting && (
        <Row label="Spellcasting">
          <Plain>
            {ABILITY_NAMES[kit.spellcasting.ability]} &middot;{' '}
            {kit.spellcasting.cantripsKnown} cantrips &middot;{' '}
            {kit.spellcasting.slotsAtLevel1} level 1 slots
          </Plain>
        </Row>
      )}
      <GrantPreview grant={kit.grant} />

      {kit.skillChoices.options.length > 0 && (
        <Section title={kit.skillChoices.label}>
          <div className="flex flex-wrap gap-1">
            {kit.skillChoices.options.map((id) => (
              <Chip key={id}>{skillName(id)}</Chip>
            ))}
          </div>
        </Section>
      )}

      {kit.equipment.length > 0 && (
        <Section title="Starting equipment">
          <div className="space-y-1.5">
            {kit.equipment.map((choice) => (
              <div key={choice.id}>
                <div className="text-muted-foreground text-xs">
                  {choice.label}
                </div>
                <div className="text-xs">
                  {choice.options.map((o) => o.label).join('  •  ')}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {features.length > 0 && (
        <Section title="Features at level 1">
          <div className="space-y-1.5">
            {features.map((feature) => (
              <div key={`${feature.level}-${feature.name}`}>
                <div className="text-xs font-medium">{feature.name}</div>
                {feature.text !== undefined && feature.text !== '' && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {feature.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {kit.subclasses.length > 0 && (
        <Section title={`${kit.subclassLabel}s`}>
          <div className="flex flex-wrap gap-1">
            {kit.subclasses.map((sub) => (
              <Chip key={sub.id}>{sub.name}</Chip>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

/**
 * Everything a `Grant` can carry, skipping what it doesn't.
 *
 * `picks` are deliberately rendered as their label and options rather than as
 * pickable controls: this is a preview, and an interactive choice here would
 * imply it was being recorded somewhere.
 */
function GrantPreview({ grant, dense }: { grant: Grant; dense?: boolean }) {
  const lists: Array<[string, Array<string> | undefined]> = [
    ['Skills', grant.skills?.map(skillName)],
    ['Armour', grant.armor],
    ['Weapons', grant.weapons],
    ['Tools', grant.tools],
    ['Languages', grant.languages],
    ['Resistances', grant.resistances],
    ['Condition immunities', grant.conditionImmunities],
  ]
  const currency = Object.entries(grant.currency ?? {}).filter(([, v]) => v > 0)

  return (
    <div className={dense ? 'mt-1 space-y-1' : 'space-y-2'}>
      {grant.speedBonus !== undefined && (
        <Row label="Speed">
          <Plain>+{grant.speedBonus} ft</Plain>
        </Row>
      )}
      {lists.map(([label, values]) =>
        values && values.length > 0 ? (
          <Row key={label} label={label}>
            <div className="flex flex-wrap gap-1">
              {values.map((v) => (
                <Chip key={v}>{title(v)}</Chip>
              ))}
            </div>
          </Row>
        ) : null,
      )}

      {grant.traits && grant.traits.length > 0 && (
        <Section title="Traits">
          <div className="space-y-1.5">
            {grant.traits.map((trait) => (
              <div key={trait.name}>
                <div className="text-xs font-medium">{trait.name}</div>
                {trait.text !== undefined && trait.text !== '' && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {trait.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {grant.items && grant.items.length > 0 && (
        <Row label="Items">
          <div className="flex flex-wrap gap-1">
            {grant.items.map((item) => (
              <Chip key={item.text}>
                {item.text}
                {item.qty !== undefined && item.qty > 1 && ` ×${item.qty}`}
              </Chip>
            ))}
          </div>
        </Row>
      )}

      {currency.length > 0 && (
        <Row label="Currency">
          <Plain>
            {currency.map(([unit, v]) => `${v} ${unit}`).join(', ')}
          </Plain>
        </Row>
      )}

      {grant.picks && grant.picks.length > 0 && (
        <>
          {grant.picks.map((pick) => (
            <Row key={pick.id} label={pick.label}>
              <div className="flex flex-wrap gap-1">
                {pick.options.length === 0 ? (
                  <Plain>Any, chosen during creation</Plain>
                ) : (
                  pick.options.map((o) => (
                    <Chip key={o}>
                      {pick.kind === 'skill' ? skillName(o) : title(o)}
                    </Chip>
                  ))
                )}
              </div>
            </Row>
          ))}
        </>
      )}
    </div>
  )
}

function AsiChips({ asi }: { asi: Partial<Record<Ability, number>> }) {
  const set = ABILITIES.filter((a) => (asi[a] ?? 0) > 0)
  if (set.length === 0) return <Plain>None</Plain>
  return (
    <div className="flex flex-wrap gap-1">
      {set.map((ability) => (
        <Chip key={ability}>
          {ability.toUpperCase()} +{asi[ability]}
        </Chip>
      ))}
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground w-32 shrink-0 text-xs">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Section({
  title: heading,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t pt-2">
      <div className="mb-1.5 text-xs font-medium">{heading}</div>
      {children}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-accent rounded px-1.5 py-0.5 text-xs">{children}</span>
  )
}

function Plain({ children }: { children: React.ReactNode }) {
  return <span className="text-xs">{children}</span>
}

/** A skill id as its display name; anything unrecognised passes through. */
function skillName(id: string): string {
  return SKILLS.find((s) => s.id === id)?.name ?? title(id)
}

/** Token ids are stored lowercase-hyphenated; show them as words. */
function title(value: string): string {
  return value.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
