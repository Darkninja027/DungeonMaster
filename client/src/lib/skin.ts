/**
 * Skin handling — the app's visual identity, independent of light/dark.
 *
 * A skin is a pure token swap: every surface reads the `--tome-*` variables,
 * and each skin redefines them (see the SKINS block in styles.css). Nothing in
 * any component knows which skin is active, which is what keeps adding a third
 * one a CSS-only job.
 *
 * Orthogonal to `theme.ts` on purpose — `.dark` and `[data-skin]` are separate
 * stamps on <html>, so all four combinations are real and each is defined.
 */

export type Skin = 'sourcebook' | 'lagoon'

export interface SkinInfo {
  id: Skin
  label: string
  /** One line for the picker; says what the skin looks like, not what it is. */
  hint: string
}

export const SKINS: Array<SkinInfo> = [
  {
    id: 'sourcebook',
    label: 'Sourcebook',
    hint: 'Oxblood and gold, set in Cinzel — the look of a rulebook.',
  },
  {
    id: 'lagoon',
    label: 'Lagoon',
    hint: 'Teal and palm, set in Fraunces — the app’s original island look.',
  },
]

const STORAGE_KEY = 'dm-skin'

/** The skin to fall back to — also what the bare `:root` block in CSS defines. */
export const DEFAULT_SKIN: Skin = 'sourcebook'

function isSkin(value: unknown): value is Skin {
  return value === 'sourcebook' || value === 'lagoon'
}

export function getSkin(): Skin {
  // localStorage throws in some embedded contexts, and a skin is decoration —
  // never let it be the reason the app fails to start.
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isSkin(stored) ? stored : DEFAULT_SKIN
  } catch {
    return DEFAULT_SKIN
  }
}

export function applySkin(skin: Skin = getSkin()): void {
  document.documentElement.dataset.skin = skin
}

export function setSkin(skin: Skin): void {
  try {
    localStorage.setItem(STORAGE_KEY, skin)
  } catch {
    // Not persisting is survivable; not applying is not.
  }
  applySkin(skin)
}

/** Stamp the stored skin on <html>. Call once before render, beside initTheme. */
export function initSkin(): void {
  applySkin()
}
