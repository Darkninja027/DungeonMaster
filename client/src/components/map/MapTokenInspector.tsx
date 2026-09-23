import { BookOpen, Minus, PawPrint, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { TOKEN_SIZES } from '#/lib/mapStore'
import type { Token, TokenSize } from '#/lib/mapStore'
import type { Combatant } from '#/lib/api'

/**
 * The bottom bar when a token is selected: everything about that token.
 *
 * Split out of MapEditor. It takes the token and its combatant rather than the
 * map, because everything here is about one miniature — the parent owns the
 * map and applies the edits.
 *
 * Two behaviours worth keeping as they are. A token whose combatant has been
 * removed from the fight says so and keeps its place, because the body may
 * well still be lying there and silently pruning somebody's token on an
 * unrelated edit is what this codebase does not do. And "Hidden" removes the
 * token from the players' copy entirely rather than dimming it — see
 * `forPlayers`.
 */
export function MapTokenInspector({
  token,
  linked,
  orphaned,
  combatants,
  canOpenStatBlock,
  onPatch,
  onRemove,
  onUnlink,
  onLink,
  onHp,
  onStatBlock,
}: {
  token: Token
  /** The token's combatant, when it still has a live one. */
  linked: Combatant | null
  orphaned: boolean
  combatants: Array<Combatant>
  canOpenStatBlock: boolean
  onPatch: (patch: Partial<Token>) => void
  onRemove: () => void
  onUnlink: () => void
  onLink: () => void
  onHp: (hp: number) => void
  onStatBlock: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <Label className="text-xs" htmlFor="map-token-label">
          Label
        </Label>
        <Input
          id="map-token-label"
          value={token.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          className="h-8"
        />
      </div>

      <div>
        <Label className="text-xs" htmlFor="map-token-size">
          Size
        </Label>
        <select
          id="map-token-size"
          value={token.size}
          onChange={(e) => onPatch({ size: e.target.value as TokenSize })}
          className="bg-background h-8 rounded border px-2 text-sm"
        >
          {TOKEN_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label className="text-xs" htmlFor="map-token-colour">
          Colour
        </Label>
        <input
          id="map-token-colour"
          type="color"
          value={token.colour}
          onChange={(e) => onPatch({ colour: e.target.value })}
          className="bg-background h-8 w-12 rounded border"
        />
      </div>

      <label
        className="flex items-center gap-1.5 text-xs"
        title="Hidden tokens are removed before the map reaches a player"
      >
        <input
          type="checkbox"
          checked={token.hidden ?? false}
          onChange={(e) => onPatch({ hidden: e.target.checked || undefined })}
        />
        Hidden
      </label>

      <Button size="sm" variant="ghost" onClick={onRemove}>
        <Trash2 className="size-4" /> Remove
      </Button>

      <div className="flex items-end gap-1.5">
        <div>
          <Label className="text-xs">Linked to</Label>
          <p className="flex h-8 items-center text-sm">
            {orphaned
              ? 'Gone from the fight'
              : (combatants.find((c) => c.id === token.combatantId)?.name ??
                'Nothing')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          title="Pick a creature to link this token to"
          onClick={onLink}
        >
          <PawPrint className="size-4" />{' '}
          {token.combatantId ? 'Change' : 'Link'}
        </Button>
        {token.combatantId ? (
          <Button
            size="sm"
            variant="ghost"
            title="Leave the token on the map but unlink it"
            onClick={onUnlink}
          >
            Unlink
          </Button>
        ) : null}
      </div>

      {linked ? (
        <div>
          <Label className="text-xs">Hit points</Label>
          <div className="flex h-8 items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              title="Damage 1"
              onClick={() => onHp(linked.hp - 1)}
            >
              <Minus className="size-3" />
            </Button>
            <Input
              value={String(linked.hp)}
              inputMode="numeric"
              aria-label="Hit points"
              className="h-7 w-14 px-1 text-center text-xs"
              onChange={(e) => {
                const v = Number(e.target.value)
                // The pure layer clamps at zero, so no guard here.
                if (!isNaN(v)) onHp(v)
              }}
            />
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              title="Heal 1"
              onClick={() => onHp(linked.hp + 1)}
            >
              <Plus className="size-3" />
            </Button>
            <span className="text-muted-foreground text-xs">
              {linked.maxHp != null ? `/ ${linked.maxHp}` : ''}
              {linked.hp <= 0 ? ' — down' : ''}
            </span>
          </div>
        </div>
      ) : null}

      {token.combatantId && !orphaned ? (
        <Button
          size="sm"
          variant="ghost"
          title="Open this creature's stat block in its own window (S)"
          onClick={onStatBlock}
          disabled={!canOpenStatBlock}
        >
          <BookOpen className="size-4" /> Stat block
        </Button>
      ) : null}

      {orphaned ? (
        // The combatant was removed while the miniature stayed on the table.
        // Say so rather than silently pruning the token — and rather than
        // leaving the DM wondering why it has no HP bar.
        <span className="text-muted-foreground text-xs">
          Not in the fight any more.
        </span>
      ) : null}

      <p className="text-muted-foreground ml-auto text-xs">
        Drag to move &middot; <kbd>S</kbd> stat block &middot; <kbd>Del</kbd>{' '}
        remove
      </p>
    </div>
  )
}
