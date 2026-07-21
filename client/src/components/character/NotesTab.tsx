import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Character } from '#/lib/character'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { WikiText } from './WikiText'

/** Timestamped session/world notes; [[wiki links]] jump to articles. */
export function NotesTab({
  character,
  onChange,
  worldId,
  articles,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    onChange({
      ...character,
      notes: [
        { at: new Date().toISOString().slice(0, 10), text },
        ...character.notes,
      ],
    })
    setDraft('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <div className="space-y-1.5">
        <Textarea
          value={draft}
          placeholder="What happened this session? [[Wiki links]] work here."
          className="min-h-20 text-sm"
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" disabled={!draft.trim()} onClick={add}>
          <Plus className="size-3.5" /> Add note
        </Button>
      </div>
      {character.notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No notes yet. Session recaps, world lore this character learned,
          grudges sworn — it all goes here.
        </p>
      ) : (
        <ul className="space-y-2">
          {character.notes.map((note, i) => (
            <li key={i} className="group rounded-md border p-3">
              <div className="text-muted-foreground mb-1 flex items-center text-xs">
                {note.at}
                <button
                  type="button"
                  className="hover:text-destructive ml-auto opacity-0 group-hover:opacity-100"
                  title="Delete note"
                  onClick={() =>
                    onChange({
                      ...character,
                      notes: character.notes.filter((_, j) => j !== i),
                    })
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm">
                <WikiText
                  text={note.text}
                  worldId={worldId}
                  articles={articles}
                />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
