import { useState } from 'react'
import { Dices, X } from 'lucide-react'
import type { GridCells, GridLineId, GridState } from '#/lib/abilityMethods'
import { findGridLine, gridIntersection, rollGrid } from '#/lib/abilityMethods'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/**
 * The grid method.
 *
 * Roll 4d6-drop-lowest nine times into a 3x3, then draw two lines through it.
 * Each cell you cross *is* an ability score — there is no summing. Cross a row
 * with a column and the shared cell is read by both lines, so its value counts
 * twice; two parallel lines give six distinct rolls instead.
 *
 * The doubling is the point of the method, not a bug, but it looks exactly like
 * one — hence the `x2` badge on the shared cell and the sentence under the grid.
 * See the doc comment on `gridScores`.
 */
export function GridPanel({
  state,
  onChange,
}: {
  state: GridState
  onChange: (next: GridState) => void
}) {
  const [hovered, setHovered] = useState<GridLineId | null>(null)
  const { cells, lineA, lineB } = state

  const roll = () => {
    onChange({ cells: rollGrid(), lineA: null, lineB: null })
  }

  /**
   * First click sets A, second sets B, third starts over. Clicking a selected
   * line clears it. Predictable, and it avoids a "which one am I replacing?"
   * mode the player has to keep in their head.
   */
  const pickLine = (id: GridLineId) => {
    if (id === lineA) return onChange({ ...state, lineA: lineB, lineB: null })
    if (id === lineB) return onChange({ ...state, lineB: null })
    if (lineA === null) return onChange({ ...state, lineA: id })
    if (lineB === null) return onChange({ ...state, lineB: id })
    onChange({ ...state, lineA: id, lineB: null })
  }

  const shared = lineA && lineB ? gridIntersection(lineA, lineB) : null

  /** Which selected line(s) a cell sits on, for its ring colour. */
  const cellRole = (index: number): 'a' | 'b' | 'both' | null => {
    const onA = lineA ? findGridLine(lineA).cells.includes(index) : false
    const onB = lineB ? findGridLine(lineB).cells.includes(index) : false
    if (onA && onB) return 'both'
    if (onA) return 'a'
    if (onB) return 'b'
    return null
  }

  const hoveredCells: ReadonlyArray<number> = hovered
    ? findGridLine(hovered).cells
    : []

  if (!cells) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Roll 4d6 and drop the lowest, nine times, into a 3&times;3 grid. Then
          draw two lines — any rows, columns or diagonals — and the six cells
          they cross become your ability scores.
        </p>
        <Button onClick={roll}>
          <Dices /> Roll the grid
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          {/* Column pickers across the top */}
          <div className="mb-1 grid grid-cols-3 gap-1 pl-[4.5rem]">
            {(['col-0', 'col-1', 'col-2'] as const).map((id, i) => (
              <LineButton
                key={id}
                label={`C${i + 1}`}
                id={id}
                lineA={lineA}
                lineB={lineB}
                onPick={pickLine}
                onHover={setHovered}
              />
            ))}
          </div>
          <div className="flex items-start gap-1">
            {/* Row pickers down the left */}
            <div className="grid w-[4.25rem] gap-1">
              {(['row-0', 'row-1', 'row-2'] as const).map((id, i) => (
                <LineButton
                  key={id}
                  label={`Row ${i + 1}`}
                  id={id}
                  lineA={lineA}
                  lineB={lineB}
                  onPick={pickLine}
                  onHover={setHovered}
                  className="h-14"
                />
              ))}
            </div>
            <div className="relative">
              <div className="grid grid-cols-3 gap-1">
                {[...cells].map((cell, i) => (
                  <Cell
                    key={i}
                    cell={cell}
                    role={cellRole(i)}
                    hovered={hoveredCells.includes(i)}
                    doubled={shared === i}
                  />
                ))}
              </div>
              {/*
                Diagonals as corner buttons rather than rotated hit-boxes: a
                rotated rectangle overlapping the cells is fiddly to hit and
                worse on touch.
              */}
              <DiagonalButton
                id="diag-main"
                label="↘"
                lineA={lineA}
                lineB={lineB}
                onPick={pickLine}
                onHover={setHovered}
                className="-top-3 -left-3"
              />
              <DiagonalButton
                id="diag-anti"
                label="↗"
                lineA={lineA}
                lineB={lineB}
                onPick={pickLine}
                onHover={setHovered}
                className="-bottom-3 -left-3"
              />
            </div>
          </div>
        </div>

        <div className="min-w-48 space-y-2">
          <SelectedLine
            slot="Line A"
            id={lineA}
            onClear={() => onChange({ ...state, lineA: lineB, lineB: null })}
          />
          <SelectedLine
            slot="Line B"
            id={lineB}
            onClear={() => onChange({ ...state, lineB: null })}
          />
          <Button variant="outline" size="sm" onClick={roll}>
            <Dices /> Reroll the grid
          </Button>
        </div>
      </div>

      {shared !== null && lineA && lineB && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{findGridLine(lineA).label}</strong> and{' '}
          <strong>{findGridLine(lineB).label}</strong> cross at{' '}
          <strong>{cells[shared].total}</strong> — that value counts twice. Pick
          two parallel lines if you would rather have six different rolls.
        </p>
      )}
      {lineA && lineB && shared === null && (
        <p className="text-muted-foreground text-sm">
          Two parallel lines — six separate rolls, no repeats.
        </p>
      )}
      {(!lineA || !lineB) && (
        <p className="text-muted-foreground text-sm">
          {lineA ? 'Now draw a second line.' : 'Draw your first line.'}
        </p>
      )}
    </div>
  )
}

function Cell({
  cell,
  role,
  hovered,
  doubled,
}: {
  cell: GridCells[number]
  role: 'a' | 'b' | 'both' | null
  hovered: boolean
  doubled: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex h-14 w-14 flex-col items-center justify-center rounded-md border transition-colors',
        role === 'a' && 'border-primary ring-primary ring-2',
        role === 'b' && 'ring-2 ring-sky-500',
        role === 'both' && 'ring-2 ring-amber-500 ring-offset-1',
        !role && hovered && 'ring-primary/40 ring-2',
        !role && !hovered && 'bg-muted/30',
      )}
    >
      <span className="text-lg leading-none font-semibold tabular-nums">
        {cell.total}
      </span>
      <span className="text-muted-foreground mt-0.5 text-[10px] leading-none">
        {cell.dice.map((die, i) => (
          <span
            key={i}
            className={i === cell.droppedIndex ? 'line-through opacity-50' : ''}
          >
            {die}
            {i < 3 ? ' ' : ''}
          </span>
        ))}
      </span>
      {doubled && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
          &times;2
        </span>
      )}
    </div>
  )
}

function LineButton({
  id,
  label,
  lineA,
  lineB,
  onPick,
  onHover,
  className,
}: {
  id: GridLineId
  label: string
  lineA: GridLineId | null
  lineB: GridLineId | null
  onPick: (id: GridLineId) => void
  onHover: (id: GridLineId | null) => void
  className?: string
}) {
  const selected = id === lineA ? 'a' : id === lineB ? 'b' : null
  return (
    <button
      type="button"
      aria-pressed={selected !== null}
      onClick={() => onPick(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'rounded border px-1 py-1 text-xs transition-colors',
        selected === 'a' && 'border-primary bg-primary text-primary-foreground',
        selected === 'b' && 'border-sky-500 bg-sky-500 text-white',
        !selected && 'hover:bg-accent',
        className,
      )}
    >
      {label}
    </button>
  )
}

function DiagonalButton({
  id,
  label,
  lineA,
  lineB,
  onPick,
  onHover,
  className,
}: {
  id: GridLineId
  label: string
  lineA: GridLineId | null
  lineB: GridLineId | null
  onPick: (id: GridLineId) => void
  onHover: (id: GridLineId | null) => void
  className?: string
}) {
  const selected = id === lineA ? 'a' : id === lineB ? 'b' : null
  return (
    <button
      type="button"
      title={findGridLine(id).label}
      aria-label={findGridLine(id).label}
      aria-pressed={selected !== null}
      onClick={() => onPick(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'absolute flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs shadow-sm transition-colors',
        selected === 'a' && 'border-primary bg-primary text-primary-foreground',
        selected === 'b' && 'border-sky-500 bg-sky-500 text-white',
        !selected && 'hover:bg-accent',
        className,
      )}
    >
      {label}
    </button>
  )
}

function SelectedLine({
  slot,
  id,
  onClear,
}: {
  slot: string
  id: GridLineId | null
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground w-12 shrink-0">{slot}</span>
      {id ? (
        <>
          <span className="font-medium">{findGridLine(id).label}</span>
          <button
            type="button"
            aria-label={`Clear ${slot}`}
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  )
}
