import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCharacterRuleset } from '#/lib/useWorldSettings'
import type { Ruleset } from '#/lib/ruleset'

const settingsGet = vi.fn()
vi.mock('#/lib/api', () => ({
  api: {
    worldSettings: { get: (id: string) => settingsGet(id) },
    vault: { get: vi.fn().mockResolvedValue(null) },
  },
}))

/**
 * A campaign world answers for every character in it. The vault cannot — it
 * holds characters from several different games and carries no `ruleset` key,
 * so `useWorldRuleset` lands on 'all' there and offers both editions beside a
 * sheet that is definitely one of them. The character's own value is the fix.
 */
function Probe({ ruleset }: { ruleset: Ruleset | null }) {
  const resolved = useCharacterRuleset('w1', { ruleset })
  return <span data-testid="out">{resolved}</span>
}

function renderProbe(worldRuleset: unknown, characterRuleset: Ruleset | null) {
  settingsGet.mockResolvedValue(
    worldRuleset === undefined ? {} : { ruleset: worldRuleset },
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Probe ruleset={characterRuleset} />
    </QueryClientProvider>,
  )
}

describe('useCharacterRuleset', () => {
  it('uses the world when the character states nothing', async () => {
    renderProbe('2024', null)
    await waitFor(() =>
      expect(screen.getByTestId('out').textContent).toBe('2024'),
    )
  })

  it("the character's own edition wins over the world's", async () => {
    renderProbe('2024', '2014')
    await waitFor(() =>
      expect(screen.getByTestId('out').textContent).toBe('2014'),
    )
  })

  it('a vault character is not left on "all"', async () => {
    // The vault's settings file has no ruleset key at all — this is the bug.
    renderProbe(undefined, '2024')
    await waitFor(() =>
      expect(screen.getByTestId('out').textContent).toBe('2024'),
    )
  })

  it('a world with no key still falls back to all when nothing states one', async () => {
    renderProbe(undefined, null)
    await waitFor(() =>
      expect(screen.getByTestId('out').textContent).toBe('all'),
    )
  })
})
