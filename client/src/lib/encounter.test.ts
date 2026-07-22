import { describe, expect, it } from 'vitest'
import { partyThresholds, rateEncounter } from './encounter'

describe('partyThresholds', () => {
  it('sums per-character thresholds', () => {
    // Four level-1 characters: easy 25 each → 100.
    const t = partyThresholds([1, 1, 1, 1])
    expect(t.easy).toBe(100)
    expect(t.medium).toBe(200)
    expect(t.hard).toBe(300)
    expect(t.deadly).toBe(400)
  })

  it('clamps levels to 1–20', () => {
    expect(partyThresholds([0]).easy).toBe(partyThresholds([1]).easy)
    expect(partyThresholds([99]).deadly).toBe(partyThresholds([20]).deadly)
  })
})

describe('rateEncounter', () => {
  const party = [1, 1, 1, 1] // easy 100 / medium 200 / hard 300 / deadly 400

  it('applies no multiplier for a single monster', () => {
    const r = rateEncounter(party, [200])
    expect(r.totalXp).toBe(200)
    expect(r.multiplier).toBe(1)
    expect(r.adjustedXp).toBe(200)
    expect(r.difficulty).toBe('medium') // >=200 medium, <300 hard
  })

  it('applies the ×1.5 multiplier for two monsters', () => {
    const r = rateEncounter(party, [100, 100])
    expect(r.totalXp).toBe(200)
    expect(r.multiplier).toBe(1.5)
    expect(r.adjustedXp).toBe(300)
    expect(r.difficulty).toBe('hard') // >=300 hard, <400 deadly
  })

  it('applies the ×2 multiplier for 3–6 monsters', () => {
    const r = rateEncounter(party, [50, 50, 50, 50])
    expect(r.multiplier).toBe(2)
    expect(r.adjustedXp).toBe(400)
    expect(r.difficulty).toBe('deadly')
  })

  it('rates a weak encounter as trivial', () => {
    const r = rateEncounter(party, [10])
    expect(r.difficulty).toBe('trivial')
  })

  it('still counts unparseable monsters (0 XP) toward the multiplier', () => {
    const r = rateEncounter(party, [200, 0, 0])
    expect(r.totalXp).toBe(200)
    expect(r.multiplier).toBe(2) // three monsters
    expect(r.adjustedXp).toBe(400)
  })
})
