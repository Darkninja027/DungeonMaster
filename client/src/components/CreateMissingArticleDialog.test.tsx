import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateMissingArticleDialog } from './CreateMissingArticleDialog'

/**
 * The vault branch is where a broken [[link]] stops becoming an article. Two
 * things are load-bearing and neither is visible by reading the JSX:
 *
 *  - the branch keys on `onCreateNote`, not on the vault alone, because the
 *    generic article route is reachable inside the vault and has no character
 *    in scope to attach a note to;
 *  - the button waits for the vault query. `useIsVault` flattens "loading" to
 *    false, and a first-render false here creates an article at the vault root
 *    that Player mode's sidebar can never show — the exact bug being fixed.
 */

const vaultGet = vi.fn()
const templatesGet = vi.fn()

vi.mock('#/lib/api', () => ({
  api: {
    vault: { get: () => vaultGet() },
    articles: { create: vi.fn() },
    templates: { get: () => templatesGet(), set: vi.fn() },
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: unknown }) => children,
}))

function renderDialog(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CreateMissingArticleDialog
        worldId="vault1"
        title="Waterdeep"
        onClose={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vaultGet.mockReset()
  vaultGet.mockResolvedValue({
    worldId: 'vault1',
    path: 'C:/Docs/My Characters',
    available: true,
  })
  // null is what a missing templates.json reads as, so the default here is
  // the built-ins alone — the same list every earlier test assumed.
  templatesGet.mockReset()
  templatesGet.mockResolvedValue(null)
})

describe('CreateMissingArticleDialog', () => {
  it('shows the templates when no character is in scope, vault or not', async () => {
    // The article route inside the vault: nowhere to hang a note.
    renderDialog()
    await waitFor(() => expect(screen.getByText('Blank')).toBeTruthy())
    expect(screen.queryByText('Add note')).toBeNull()
  })

  it('offers the user own templates alongside the built-ins', async () => {
    templatesGet.mockResolvedValue({
      version: 1,
      templates: [{ id: 'shop', name: 'Shop', description: 'A shop' }],
    })
    renderDialog()

    await waitFor(() => expect(screen.getByText('Shop')).toBeTruthy())
    expect(screen.getByText('Blank')).toBeTruthy()
  })

  it('drops a hidden template from the grid but still offers Create', async () => {
    // Hiding Blank is the awkward case: it is what the picker defaults to, so
    // a naive default would leave nothing selected and a dead Create button.
    templatesGet.mockResolvedValue({
      version: 1,
      templates: [{ id: 'blank', name: 'Blank', hidden: true }],
    })
    renderDialog()

    // Wait on Blank *going away* rather than on another template appearing:
    // the built-ins render immediately from placeholderData, so anything
    // still in the list is visible before the query has resolved.
    await waitFor(() => expect(screen.queryByText('Blank')).toBeNull())
    expect(screen.getByText('Spell')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /create/i }).hasAttribute('disabled'),
    ).toBe(false)
  })

  it('offers a note instead of templates in the vault', async () => {
    renderDialog({ onCreateNote: vi.fn() })
    await waitFor(() => expect(screen.getByText('Add note')).toBeTruthy())
    expect(screen.queryByText('Blank')).toBeNull()
  })

  it('hands back the trimmed title and the typed text', async () => {
    const onCreateNote = vi.fn()
    renderDialog({ title: '  Waterdeep  ', onCreateNote })
    await waitFor(() => expect(screen.getByText('Add note')).toBeTruthy())

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Docks are dangerous.' },
    })
    fireEvent.click(screen.getByText('Add note'))
    expect(onCreateNote).toHaveBeenCalledWith({
      title: 'Waterdeep',
      text: 'Docks are dangerous.',
    })
  })

  it('waits for the vault query rather than guessing', async () => {
    // Never resolves: the cold-start window, held open.
    vaultGet.mockReturnValue(new Promise(() => {}))
    renderDialog({ onCreateNote: vi.fn() })
    const button = await screen.findByRole('button', { name: /Create article/ })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens an existing note instead of creating a second one', async () => {
    const onCreateNote = vi.fn()
    const onOpenNote = vi.fn()
    renderDialog({
      onCreateNote,
      onOpenNote,
      existingNoteTitles: ['waterdeep'],
    })
    await waitFor(() => expect(screen.getByText('Open the note')).toBeTruthy())

    fireEvent.click(screen.getByText('Open the note'))
    expect(onOpenNote).toHaveBeenCalledWith('Waterdeep')
    expect(onCreateNote).not.toHaveBeenCalled()
  })
})
