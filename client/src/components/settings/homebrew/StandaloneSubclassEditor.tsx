import type { HomebrewSubclass } from '#/lib/homebrew'
import { homebrewId } from '#/lib/homebrew'
import { subclassLevelOf } from '#/lib/tables'
import type { ClassKit } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Field } from './GrantEditor'
import { SubclassPanel } from './SubclassEditor'

export function blankSubclass(): HomebrewSubclass {
  return { id: '', name: '', className: '', features: [] }
}

/**
 * One subclass that attaches to a class by name, rather than living inside a
 * copy of it.
 *
 * The whole reason this exists: a homebrew `ClassKit` *replaces* the built-in
 * of the same name, so adding one College to the Bard meant duplicating the
 * Bard and inheriting a frozen snapshot of its features, equipment and spell
 * tables. Naming the class instead leaves it exactly where it was.
 *
 * The class field is free text with the known classes as suggestions, not a
 * closed select. A world can define a class this global file has never seen,
 * and `attachSubclasses` keeps an unmatched entry rather than dropping it —
 * so the field must be able to say a name the list does not offer.
 */
export function StandaloneSubclassEditor({
  subclass,
  kits,
  onChange,
}: {
  subclass: HomebrewSubclass
  /** The merged class list, for suggestions and the archetype level. */
  kits: Array<ClassKit>
  onChange: (next: HomebrewSubclass) => void
}) {
  const patch = (changes: Partial<HomebrewSubclass>) =>
    onChange({ ...subclass, ...changes })

  const kit = kits.find(
    (k) =>
      k.name.trim().toLowerCase() === subclass.className.trim().toLowerCase(),
  )
  const attached = subclass.className.trim() !== ''

  return (
    <div className="space-y-3">
      <Field
        label="Class"
        hint="Which class offers this — the subclass is added to it"
      >
        <Input
          value={subclass.className}
          list="homebrew-subclass-classes"
          placeholder="Bard"
          className="h-8"
          onChange={(e) => patch({ className: e.target.value })}
        />
        <datalist id="homebrew-subclass-classes">
          {kits.map((k) => (
            <option key={k.id} value={k.name} />
          ))}
        </datalist>
        {attached && !kit && (
          // Kept rather than dropped — the class may live in a world this
          // global file cannot see — but worth saying, because the usual cause
          // is a typo and the subclass would then never appear anywhere.
          <p className="text-muted-foreground text-xs">
            No class called {subclass.className.trim()} yet. This is kept, but
            it won&rsquo;t show up until one exists.
          </p>
        )}
        {kit && (
          // The label is said once, not twice: a Bard's is "Bard College", so
          // "Bard's bard colleges" is what the obvious phrasing produces.
          <p className="text-muted-foreground text-xs">
            Added alongside the {kit.subclasses.length}{' '}
            {kit.subclassLabel.toLowerCase()}
            {kit.subclasses.length === 1 ? '' : 's'} {kit.name} already has.
          </p>
        )}
      </Field>

      <Field label={kit ? kit.subclassLabel : 'Subclass name'}>
        <Input
          value={subclass.name}
          placeholder="College of Swords"
          className="h-8"
          onChange={(e) =>
            patch({ name: e.target.value, id: homebrewId(e.target.value) })
          }
        />
        {kit?.subclasses.some(
          (s) =>
            s.name.trim().toLowerCase() === subclass.name.trim().toLowerCase(),
        ) && (
          <p className="text-muted-foreground text-xs">
            Overrides the existing {subclass.name.trim()}.
          </p>
        )}
      </Field>

      {/*
        The same panel the kit editor uses for a subclass defined inline, so
        both places offer exactly the same fields. The archetype level comes
        from the class when it is known, and falls back to 3 — `subclassLevelOf`
        already answers that for an unknown kit.
      */}
      <SubclassPanel
        subclass={subclass}
        subclassLevel={subclassLevelOf(kit)}
        onChange={(next) =>
          onChange({ ...next, className: subclass.className })
        }
      />
    </div>
  )
}
