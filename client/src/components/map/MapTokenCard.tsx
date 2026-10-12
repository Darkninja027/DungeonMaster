import {
  BookOpen,
  Eye,
  EyeOff,
  Minus,
  PawPrint,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { TOKEN_SIZES } from '#/lib/mapStore'
import type { Token, TokenSize } from '#/lib/mapStore'
import type { Combatant } from '#/lib/api'

/**
 * The selected token's controls, floating on the map beside it.
 *
 * This replaced a bottom bar that shared one slot with the grid controls — so
 * the chrome changed height and content depending on what was selected, and
 * being `flex-wrap` it reflowed to two or three rows on a narrow window and
 * shoved the map around. A card that belongs to one token can sit next to that
 * token instead, and the map never moves.
 *
 * Positioned by the caller, which knows where the token is on screen; this only
 * has to stay readable over whatever is behind it, hence the solid background
 * and the shadow rather than a translucent panel.
 */
export function MapTokenCard({
  token,
  linked,
  orphaned,
  combatants,
  canOpenStatBlock,
  style,
  onPatch,
  onRemove,
  onUnlink,
  onLink,
  onHp,
  onStatBlock,
  onClose,
  players = [],
  claimedBy = null,
}: {
  token: Token
  /** The token's combatant, when it still has a live one. */
  linked: Combatant | null
  orphaned: boolean
  combatants: Array<Combatant>
  canOpenStatBlock: boolean
  /** Where the caller has put the card. */
  style?: React.CSSProperties
  onPatch: (patch: Partial<Token>) => void
  onRemove: () => void
  onUnlink: () => void
  onLink: () => void
  onHp: (hp: number) => void
  onStatBlock: () => void
  onClose: () => void
  /** Names of the LAN seats at the table right now, for "Controlled by". */
  players?: Array<string>
  /**
   * When the token is linked to a party character: that character's name. The
   * seat that claims it may move the token without any assignment, and the
   * card says so rather than leaving the DM to wonder why a player can.
   */
  claimedBy?: string | null
}) {
  const linkName = orphaned
    ? 'Gone from the fight'
    : (combatants.find((c) => c.id === token.combatantId)?.name ?? null)

  const pct =
    linked && linked.maxHp
      ? Math.max(0, Math.min(1, linked.hp / linked.maxHp))
      : null

  return (
    <div
      style={style}
      className="bg-popover text-popover-foreground w-64 rounded-lg border shadow-xl"
      // The map underneath listens for pointerdown to place and select; without
      // this, every click in the card would also land on the canvas behind it.
      onPointerDown={(e) => e.stopPropagation()}
      role="group"
      aria-label="Selected token"
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: token.colour }}
          aria-hidden
        />
        <Input
          value={token.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Unnamed"
          className="h-7 flex-1 border-0 px-1 text-sm shadow-none focus-visible:ring-0"
          aria-label="Token label"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onClose}
          title="Deselect"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {linked ? (
        <div className="space-y-1.5 border-b px-2.5 py-2">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Hit points</span>
            <span className="text-foreground font-mono">
              {linked.hp}
              {linked.maxHp != null ? ` / ${linked.maxHp}` : ''}
              {linked.hp <= 0 ? ' — down' : ''}
            </span>
          </div>
          {pct !== null ? (
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-red-700 transition-[width]"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
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
              className="h-7 w-14 px-1 text-center font-mono text-xs"
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
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
        <select
          value={token.size}
          onChange={(e) => onPatch({ size: e.target.value as TokenSize })}
          className="bg-background h-7 flex-1 rounded border px-1.5 text-xs"
          aria-label="Token size"
        >
          {TOKEN_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="color"
          value={token.colour}
          onChange={(e) => onPatch({ colour: e.target.value })}
          className="bg-background size-7 shrink-0 rounded border"
          aria-label="Token colour"
        />
        <Button
          size="icon"
          variant={token.hidden ? 'secondary' : 'ghost'}
          className="size-7 shrink-0"
          // Not a dimming: `forPlayers` removes a hidden token from the payload
          // before it ever reaches the players' window.
          title={
            token.hidden
              ? 'Hidden from the players — click to reveal'
              : 'Hide from the players'
          }
          aria-pressed={!!token.hidden}
          onClick={() => onPatch({ hidden: !token.hidden || undefined })}
        >
          {token.hidden ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          title="Remove this token from the map"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {linkName ?? 'Not linked'}
        </span>
        {token.combatantId && !orphaned ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            title="Open this creature's stat block in its own window (S)"
            onClick={onStatBlock}
            disabled={!canOpenStatBlock}
          >
            <BookOpen className="size-3.5" />
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          title={
            token.combatantId
              ? 'Link this token to a different creature'
              : 'Link this token to a creature'
          }
          onClick={onLink}
        >
          <PawPrint className="size-3.5" />
          {token.combatantId ? 'Change' : 'Link'}
        </Button>
        {token.combatantId ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            title="Leave the token on the map but unlink it"
            onClick={onUnlink}
          >
            Unlink
          </Button>
        ) : null}
      </div>

      {players.length > 0 || token.controlledBy || claimedBy ? (
        <div className="space-y-1 border-t px-2.5 py-2">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground shrink-0">
              Controlled by
            </span>
            <select
              value={token.controlledBy ?? ''}
              onChange={(e) =>
                onPatch({ controlledBy: e.target.value || undefined })
              }
              className="bg-background h-7 min-w-0 flex-1 rounded border px-1.5 text-xs"
              aria-label="Controlled by"
            >
              <option value="">{claimedBy ? 'Automatic' : 'Only you'}</option>
              {players.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {/* Kept when they have stepped away, or the pick would silently
                  read as "Only you" and the next change would clear it. */}
              {token.controlledBy &&
              !players.some(
                (p) => p.toLowerCase() === token.controlledBy!.toLowerCase(),
              ) ? (
                <option value={token.controlledBy}>
                  {token.controlledBy} (not at the table)
                </option>
              ) : null}
            </select>
          </label>
          {claimedBy ? (
            <p className="text-muted-foreground text-xs">
              Whoever plays {claimedBy} can move it too.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
