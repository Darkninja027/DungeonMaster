import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotesTab } from './NotesTab'
import { emptyCharacter } from '#/lib/character'
import type { Character, CharacterNote } from '#/lib/character'

/**
 * The Notes tab addresses a note by its index in `character.notes`, because a
 * note carries no id of its own — one would leak into the YAML and out of
 * Obsidian. That makes the selection fragile in exactly the ways tested here:
 * adding prepends (shifting every index by one) and deleting closes the gap.
 *
 * These are the cases where a wrong index is silently destructive: you think
 * you are editing one note and you are overwriting another.
 */

function noteOf(title: string, text: string): CharacterNote {
  return { at: '2024-01-01', title, text }
}

/** Renders the tab with real state, the way the character route wires it. */
function renderNotes(notes: Array<CharacterNote>) {
  const seen: { current: Character } = {
    current: { ...emptyCharacter(), notes },
  }
  function Harness() {
    const [character, setCharacter] = useState<Character>(seen.current)
    return (
      <NotesTab
        character={character}
        onChange={(next) => {
          seen.current = next
          setCharacter(next)
        }}
        worldId="abc"
      />
    )
  }
  // NotesTab reads the world's liveEdit setting through useWorldSettings, so it
  // needs a client. Retries off: a failing fetch should surface, not hang.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  return { ...view, seen }
}

const bodyBox = () =>
  screen.getByPlaceholderText<HTMLTextAreaElement>(/What happened\?/)

describe('NotesTab selection', () => {
  it('selects the first note on mount and edits that note', async () => {
    const { seen } = renderNotes([
      noteOf('First', 'one'),
      noteOf('Second', 'two'),
    ])
    await waitFor(() => expect(bodyBox()).toBeTruthy())
    expect(bodyBox().value).toBe('one')

    fireEvent.change(bodyBox(), { target: { value: 'one edited' } })
    expect(seen.current.notes[0].text).toBe('one edited')
    // The note that was NOT selected must be untouched.
    expect(seen.current.notes[1].text).toBe('two')
  })

  it('edits the note you clicked, not the one that was selected', async () => {
    const { seen } = renderNotes([
      noteOf('First', 'one'),
      noteOf('Second', 'two'),
    ])
    await waitFor(() => expect(bodyBox()).toBeTruthy())

    fireEvent.click(screen.getByText('Second'))
    await waitFor(() => expect(bodyBox().value).toBe('two'))

    fireEvent.change(bodyBox(), { target: { value: 'two edited' } })
    expect(seen.current.notes[1].text).toBe('two edited')
    expect(seen.current.notes[0].text).toBe('one')
  })

  it('follows the selection when New note prepends and shifts every index', async () => {
    const { seen } = renderNotes([noteOf('Existing', 'old')])
    await waitFor(() => expect(bodyBox()).toBeTruthy())

    fireEvent.click(screen.getByText('New note'))
    // The fresh note is prepended, so the old one is now at index 1.
    await waitFor(() => expect(seen.current.notes).toHaveLength(2))
    await waitFor(() => expect(bodyBox().value).toBe(''))

    fireEvent.change(bodyBox(), { target: { value: 'brand new' } })
    expect(seen.current.notes[0].text).toBe('brand new')
    // The pre-existing note must not have been overwritten by the shift.
    expect(seen.current.notes[1].text).toBe('old')
  })

  it('keeps editing the SAME note when a prepend shifts it to a new index', async () => {
    // The sharp case: with the second note selected (index 1), New note
    // prepends and slides it to index 2. A selection that does not move now
    // points at a different note entirely, so typing overwrites the wrong one —
    // and it is silent, because both indexes are in range.
    const { seen } = renderNotes([
      noteOf('First', 'one'),
      noteOf('Second', 'two'),
    ])
    await waitFor(() => expect(bodyBox()).toBeTruthy())
    fireEvent.click(screen.getByText('Second'))
    await waitFor(() => expect(bodyBox().value).toBe('two'))

    fireEvent.click(screen.getByText('New note'))
    await waitFor(() => expect(seen.current.notes).toHaveLength(3))
    // The new empty note is what you are dropped into, at index 0.
    await waitFor(() => expect(bodyBox().value).toBe(''))

    fireEvent.change(bodyBox(), { target: { value: 'fresh' } })
    expect(seen.current.notes[0].text).toBe('fresh')
    // Neither pre-existing note may have been touched.
    expect(seen.current.notes[1].text).toBe('one')
    expect(seen.current.notes[2].text).toBe('two')
  })

  it('lands on a surviving note after deleting the selected one', async () => {
    const confirmed = window.confirm
    window.confirm = () => true
    try {
      const { seen } = renderNotes([
        noteOf('First', 'one'),
        noteOf('Second', 'two'),
      ])
      await waitFor(() => expect(bodyBox()).toBeTruthy())

      // Delete the last note. `removeSelected` clears the selection and the
      // effect re-lands it, so what this pins is the OUTCOME — an editor open
      // on a real note — rather than the mechanism, which could reasonably be
      // either clearing or shifting.
      fireEvent.click(screen.getByText('Second'))
      await waitFor(() => expect(bodyBox().value).toBe('two'))
      fireEvent.click(screen.getByTitle('Delete this note'))

      await waitFor(() => expect(seen.current.notes).toHaveLength(1))
      // Whatever is shown must be the surviving note, never undefined.
      await waitFor(() => expect(bodyBox().value).toBe('one'))
      fireEvent.change(bodyBox(), { target: { value: 'still here' } })
      expect(seen.current.notes[0].text).toBe('still here')
    } finally {
      window.confirm = confirmed
    }
  })

  it('shows an empty state rather than an editor when there are no notes', () => {
    renderNotes([])
    expect(screen.getByText(/No notes yet — start one/)).toBeTruthy()
    expect(screen.queryByPlaceholderText(/What happened\?/)).toBeNull()
  })

  it('filtering the list does not change which note is being edited', async () => {
    const { seen } = renderNotes([
      noteOf('Ambush', 'the ambush'),
      noteOf('Tavern', 'the tavern'),
    ])
    await waitFor(() => expect(bodyBox()).toBeTruthy())
    fireEvent.click(screen.getByText('Tavern'))
    await waitFor(() => expect(bodyBox().value).toBe('the tavern'))

    // Narrow the list to the OTHER note. The open editor must keep editing the
    // note it was on rather than silently retargeting.
    fireEvent.change(screen.getByPlaceholderText('Search notes…'), {
      target: { value: 'Ambush' },
    })
    fireEvent.change(bodyBox(), { target: { value: 'tavern edited' } })
    expect(seen.current.notes[1].text).toBe('tavern edited')
    expect(seen.current.notes[0].text).toBe('the ambush')
  })
})
