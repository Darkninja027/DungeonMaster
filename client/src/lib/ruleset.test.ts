import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULESET,
  NEW_WORLD_RULESET,
  RULESETS,
  RULESET_IDS,
  findRuleset,
  parseRuleset,
} from './ruleset'

describe('parseRuleset', () => {
  it('accepts every known ruleset', () => {
    for (const id of RULESET_IDS) expect(parseRuleset(id)).toBe(id)
  })

  it('falls back to the default for an absent key', () => {
    // A world written before this field existed. The whole migration.
    expect(parseRuleset(undefined)).toBe(DEFAULT_RULESET)
  })

  it('falls back rather than dropping a hand-edited typo', () => {
    for (const bad of ['5e', '2014 ', '2025', '', null, 7, {}, []]) {
      expect(parseRuleset(bad)).toBe(DEFAULT_RULESET)
    }
  })

  it('defaults to showing everything, so no existing world is narrowed', () => {
    expect(DEFAULT_RULESET).toBe('all')
  })
})

describe('the registry', () => {
  it('describes every id exactly once', () => {
    expect(RULESETS.map((r) => r.id).sort()).toEqual([...RULESET_IDS].sort())
  })

  it('gives every option a label and a blurb', () => {
    for (const r of RULESETS) {
      expect(r.label.trim()).not.toBe('')
      expect(r.blurb.trim()).not.toBe('')
    }
  })

  it('offers a real ruleset to a new world', () => {
    expect(RULESET_IDS).toContain(NEW_WORLD_RULESET)
  })

  it('finds by id and falls back for an unknown one', () => {
    expect(findRuleset('2024').label).toBe('2024 rules')
    expect(findRuleset('nonsense').id).toBe(DEFAULT_RULESET)
    expect(findRuleset(undefined).id).toBe(DEFAULT_RULESET)
  })
})
