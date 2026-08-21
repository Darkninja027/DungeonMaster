/**
 * Races from the published 5e books, as built-ins for the wizard.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE
 *
 * This file is **not** SRD 5.1 and is deliberately outside `lib/srd/`. The
 * header of `lib/srd/index.ts` promises that only SRD content appears there and
 * that Player's Handbook races the SRD omits are "not ours to ship" — a promise
 * that stays true only if races from the wider books live here instead, under
 * their own provenance rather than that folder's CC BY 4.0 attribution. This is
 * the same split, and for the same reason, as `lib/feats/publishedFeats.ts`.
 *
 * What belongs here is a **name, its mechanical grants and a one-line summary**,
 * the same editor affordance the SRD tables are. Rules text is not reproduced:
 * trait text is a short reminder in our own words, not the book's wording.
 *
 * Sources: none yet — the list is deliberately **empty**. The tier exists so a
 * race from a published book has somewhere to go that is not `lib/srd/`, not
 * because anything ships in it today. Adding one is a data change and nothing
 * else: `mergeTables` and `SRD_TABLES` already layer this list.
 * ---------------------------------------------------------------------------
 *
 * Authoring rules are the SRD tables' rules, which `srd.test.ts` enforces over
 * this list too: `id` is the slugified name and never reaches disk, skills are
 * kebab ids, and pick ids share one global keyspace with every other table.
 */

import type { RaceInfo } from '../srd/types'

export const PUBLISHED_RACES: Array<RaceInfo> = []
