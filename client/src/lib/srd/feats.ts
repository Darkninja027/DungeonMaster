import type { FeatInfo } from './types'

/**
 * Built-in feats — deliberately **empty**.
 *
 * SRD 5.1 contains no feat list (Grappler aside, which is not worth a table of
 * one), so there is nothing here to ship. Feats are authored as homebrew, in
 * Settings → Homebrew → Feats, and merged in by `mergeTables` exactly like
 * races and backgrounds.
 *
 * The *built-in* feats live in `lib/feats/` instead — outside this folder
 * precisely because the published feats are Player's Handbook, Xanathar's and
 * Tasha's content rather than SRD 5.1, and the attribution block in ./index.ts
 * promises that only SRD content appears here. `mergeTables` layers them
 * between this (empty) tier and the user's homebrew.
 *
 * This constant exists rather than being omitted so the feat tier is a real
 * layer: `layer()` handles an empty first level fine, and a world that defines
 * its own feats — or a future SRD-safe entry here — needs no change anywhere
 * else. See the "Feats" note in the header of types.ts.
 */
export const SRD_FEATS: Array<FeatInfo> = []
