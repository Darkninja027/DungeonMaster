import type { Combatant, TokenControl } from './api'
import type { BattleMap } from './mapStore'
import type { CombatState } from './sessionStore'
import type { RollEntry } from './rollLog'

/**
 * What the players' map window is told about the session: initiative and the
 * roll log, redacted for a screen everyone at the table can read.
 *
 * Built in the EDITOR's process and pushed beside the map, for the same reason
 * `forPlayers` runs there: the table window is a display, and a secret that
 * never enters its heap cannot leak out of it — not on screen, not in a devtools
 * IPC trace on a projector. So the table window never hydrates the session store
 * and never reads the roll log; main also refuses it both (see rollRelay.ts).
 *
 * Pure, so every redaction below is unit-tested rather than trusted.
 */
export interface TableSession {
  round: number
  /** Null when nobody is up, or when whoever is up is someone players can't see. */
  activeId: string | null
  /**
   * Redacted rows. Real `Combatant`s so `tokenVitals` and the canvas need no
   * second shape, but only what players may know survives: name, initiative,
   * and whether they are down. HP is folded to 0 or 1 with no maximum, which
   * gives the canvas a "down" marker and an active ring but never an HP bar —
   * how hurt the dragon is stays behind the screen.
   */
  combatants: Array<Combatant>
  /** Newest first, labels only — no article or world ids. */
  rolls: Array<RollEntry>
}

/** How many rolls the players' screen keeps. It is a glance, not an archive. */
export const TABLE_ROLL_LIMIT = 50

export function emptyTableSession(): TableSession {
  return { round: 1, activeId: null, combatants: [], rolls: [] }
}

/**
 * A party member, by the convention the map editor already uses to colour one.
 * Never secret, so they appear in the players' order even before they have a
 * token on this map.
 */
function isPartyMember(c: Combatant): boolean {
  return !!c.articleId?.startsWith('Characters/')
}

/**
 * Redact the session for the players' screen.
 *
 * `playerMap` must already be `forPlayers()`-ed, and that is the whole rule:
 * a combatant appears only if players can see its token, or it is a party
 * member. The monster whose token the DM has hidden behind the door is then
 * absent from initiative too — listing it by name would give away exactly
 * what hiding the token was for. A monster rolled in but not yet placed is
 * left out for the same reason; it can be placed when it shows up.
 *
 * The DM's own rolls (no seat) are shown only when `showDmRolls` is on, because
 * a DM rolls behind the screen by default. A LAN player's roll is always shown:
 * it was made in the open by someone at the table.
 */
export function forPlayersSession(
  playerMap: BattleMap,
  combat: CombatState,
  rolls: Array<RollEntry>,
  { showDmRolls }: { showDmRolls: boolean },
): TableSession {
  const onBoard = new Set(
    playerMap.tokens
      .map((t) => t.combatantId)
      .filter((id): id is string => !!id),
  )
  const combatants = combat.combatants
    .filter((c) => onBoard.has(c.id) || isPartyMember(c))
    .map((c): Combatant => ({
      id: c.id,
      name: c.name,
      initiative: c.initiative,
      hp: c.hp <= 0 ? 0 : 1,
      maxHp: null,
      ac: null,
      note: '',
    }))
  const visible = new Set(combatants.map((c) => c.id))
  return {
    round: combat.round,
    activeId:
      combat.activeId && visible.has(combat.activeId) ? combat.activeId : null,
    combatants,
    rolls: rolls
      .filter((r) => showDmRolls || !!r.seat)
      .slice(0, TABLE_ROLL_LIMIT)
      .map((r) => ({
        ...r,
        // Title only, as a LAN guest gets it: a world id is hex of the DM's
        // absolute path, and the table window has nowhere to link it anyway.
        source: r.source
          ? ({ title: r.source.title } as RollEntry['source'])
          : undefined,
      })),
  }
}

/**
 * Read a pushed session in the table window. Tolerant: a malformed row is
 * dropped rather than blanking the sidebar, and anything unexpected on a row
 * is not carried through — the viewer trusts the shape it builds, not the one
 * it was sent.
 */
export function parseTableSession(raw: unknown): TableSession {
  if (typeof raw !== 'object' || raw === null) return emptyTableSession()
  const s = raw as Record<string, unknown>
  const combatants: Array<Combatant> = []
  for (const entry of Array.isArray(s.combatants) ? s.combatants : []) {
    if (typeof entry !== 'object' || entry === null) continue
    const c = entry as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.name !== 'string') continue
    if (typeof c.initiative !== 'number') continue
    combatants.push({
      id: c.id,
      name: c.name,
      initiative: c.initiative,
      hp: c.hp === 0 ? 0 : 1,
      maxHp: null,
      ac: null,
      note: '',
    })
  }
  const rolls: Array<RollEntry> = []
  for (const entry of Array.isArray(s.rolls) ? s.rolls : []) {
    if (typeof entry !== 'object' || entry === null) continue
    const r = entry as Record<string, unknown>
    if (
      typeof r.id !== 'string' ||
      typeof r.notation !== 'string' ||
      typeof r.total !== 'number' ||
      typeof r.at !== 'number'
    )
      continue
    const source = r.source as Record<string, unknown> | undefined
    const seat = r.seat as Record<string, unknown> | undefined
    rolls.push({
      id: r.id,
      notation: r.notation,
      total: r.total,
      at: r.at,
      detail: typeof r.detail === 'string' ? r.detail : '',
      label: typeof r.label === 'string' ? r.label : undefined,
      source:
        source && typeof source.title === 'string'
          ? ({ title: source.title } as RollEntry['source'])
          : undefined,
      seat:
        seat && typeof seat.id === 'string' && typeof seat.name === 'string'
          ? {
              id: seat.id,
              name: seat.name,
              character:
                typeof seat.character === 'string' ? seat.character : undefined,
            }
          : undefined,
    })
    if (rolls.length >= TABLE_ROLL_LIMIT) break
  }
  const ids = new Set(combatants.map((c) => c.id))
  return {
    round:
      typeof s.round === 'number' && s.round >= 1 ? Math.floor(s.round) : 1,
    activeId:
      typeof s.activeId === 'string' && ids.has(s.activeId) ? s.activeId : null,
    combatants,
    rolls,
  }
}

/**
 * Who may move each token from a LAN seat, for the tokens players can see.
 *
 * Automatic: a token linked to a party member's combatant is controlled by
 * whoever has claimed that character. Manual: `Token.controlledBy` names a
 * player. Either or both; a token with neither is the DM's alone and is left
 * out, so the table only ever lists tokens someone other than the DM may touch.
 *
 * Built against the `forPlayers()`-ed map, so a hidden token is never movable —
 * a player cannot drag what they cannot see, and must not learn it exists by
 * finding it in this table.
 */
export function tokenControl(
  playerMap: BattleMap,
  combat: CombatState,
): Record<string, TokenControl> {
  const byId = new Map(combat.combatants.map((c) => [c.id, c]))
  const out: Record<string, TokenControl> = {}
  for (const token of playerMap.tokens) {
    const linked = token.combatantId ? byId.get(token.combatantId) : undefined
    const characterId =
      linked && isPartyMember(linked) ? linked.articleId : undefined
    const player = token.controlledBy
    if (!characterId && !player) continue
    out[token.id] = {
      ...(characterId ? { characterId } : {}),
      ...(player ? { player } : {}),
    }
  }
  return out
}

/**
 * Whether a seat may move a token under `control`.
 *
 * The same rule as `seatMayMove` in electron/main/table.ts, which is the one
 * that actually gates a move. Main and the renderer share no code, so it is
 * written twice and both are tested. This copy runs twice: on a guest, to decide
 * which tokens are draggable at all, and in the DM's editor, to re-check a move
 * against the CURRENT map before applying it — the host checked against the
 * frame it last sent, which can be a moment stale (the DM may just have hidden
 * the token, or handed it to someone else).
 */
export function mayControl(
  control: TokenControl | undefined,
  seat: { name: string; characterId?: string | null },
): boolean {
  if (!control) return false
  if (control.characterId && seat.characterId === control.characterId)
    return true
  return (
    !!control.player &&
    !!seat.name &&
    seat.name.toLowerCase() === control.player.toLowerCase()
  )
}

/** Read a pushed control table on a guest. Anything odd is dropped. */
export function parseTokenControl(raw: unknown): Record<string, TokenControl> {
  const out: Record<string, TokenControl> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const v = value as Record<string, unknown>
    const characterId =
      typeof v.characterId === 'string' && v.characterId
        ? v.characterId
        : undefined
    const player =
      typeof v.player === 'string' && v.player ? v.player : undefined
    if (!characterId && !player) continue
    out[id] = {
      ...(characterId ? { characterId } : {}),
      ...(player ? { player } : {}),
    }
  }
  return out
}
