import { Plus, X } from 'lucide-react'

import type { SubclassSpells } from '#/lib/srd'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { TokenField } from './GrantEditor'

/**
 * A subclass's always-prepared spells — domain spells, oath spells, circle
 * spells.
 *
 * Two levels per row, and they are **different levels**, which is the whole
 * reason this needs a shape rather than a list: `grantedAt` is the *character*
 * level the row arrives at, and `level` is the *spell* level. A Life Domain
 * cleric gets 1st-level spells at character level 1 and 2nd-level spells at 3.
 * Conflating them is the easy mistake, so both inputs say which they are.
 *
 * These land on the sheet as `alwaysPrepared`, exempt from `preparedLimit` —
 * see `alwaysPreparedCount`. Nothing here checks that the class can actually
 * cast them; `srd.test.ts` asserts that for the built-in tables, and homebrew
 * gets the same bargain as everything else in this app.
 */
export function SubclassSpellRows({
  spells,
  onChange,
  /** The lowest character level this subclass can grant anything at. */
  minLevel = 1,
}: {
  spells: Array<SubclassSpells>
  onChange: (next: Array<SubclassSpells>) => void
  minLevel?: number
}) {
  const patchAt = (i: number, patch: Partial<SubclassSpells>) =>
    onChange(spells.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  const clamp = (raw: string, min: number, max: number, fallback: number) => {
    const n = Number(raw)
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Always-prepared spells</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          aria-label="Add spell row"
          onClick={() =>
            onChange([...spells, { grantedAt: minLevel, level: 1, names: [] }])
          }
        >
          <Plus className="size-3" /> Add row
        </Button>
      </div>
      {spells.length === 0 && (
        <p className="text-muted-foreground text-xs">
          None. Domain, oath and circle spells go here — they&rsquo;re always
          prepared and don&rsquo;t count against the prepared limit.
        </p>
      )}
      {spells.map((row, i) => (
        <div
          key={i}
          className="flex items-start gap-1.5 rounded-md border p-1.5"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label
                className="text-muted-foreground flex items-center gap-1"
                title="The character level these arrive at"
              >
                At character level
                <Input
                  value={String(row.grantedAt)}
                  inputMode="numeric"
                  className="h-7 w-12 text-center text-sm"
                  onChange={(e) =>
                    patchAt(i, {
                      grantedAt: clamp(e.target.value, minLevel, 20, minLevel),
                    })
                  }
                />
              </label>
              <label
                className="text-muted-foreground flex items-center gap-1"
                title="The spell level — 1 to 9, not a character level"
              >
                Spell level
                <Input
                  value={String(row.level)}
                  inputMode="numeric"
                  className="h-7 w-12 text-center text-sm"
                  onChange={(e) =>
                    patchAt(i, { level: clamp(e.target.value, 1, 9, 1) })
                  }
                />
              </label>
            </div>
            <TokenField
              label="Spells"
              placeholder="Cure Wounds"
              values={row.names}
              onChange={(names) => patchAt(i, { names })}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove level ${row.level} spells`}
            onClick={() => onChange(spells.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive mt-1.5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
