import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  FileDown,
  FileText,
  FolderOpen,
  Loader2,
  MoreVertical,
  Save,
  Trash2,
} from 'lucide-react'
import type { Character } from '#/lib/character'
import type { ClassInfo } from '#/lib/classes'
import { REVEAL_LABEL } from '#/lib/reveal'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { SidebarToggle } from '#/components/SidebarToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { IdentityPopover } from '#/components/character/IdentityPopover'

/**
 * The character sheet's header: identity, the tab strip and the actions, all on
 * one row.
 *
 * Deliberately dumb — it holds no Character logic and owns no save state. Two
 * shapes are load-bearing:
 *
 * - The title arrives as three callbacks rather than a ref. Committing it
 *   renames the file and rewrites [[links]] world-wide, so it must stay
 *   blur/Enter-only, and the ref that guards a half-typed title against a
 *   background refetch stays owned by the route, beside the effect that reads
 *   it. A ref threaded through props is exactly the thing a later reader
 *   "tidies" into state, not knowing what it guards.
 *
 * - `onExport` is a bare callback. The route keeps the wait-for-cards dance and
 *   the tab switch, so this file can't accidentally break either.
 *
 * `children` is the TabsList. It is created inside <Tabs> in the route — React
 * context flows by tree, not by file — so it reads Tabs' context while this
 * component decides where in the row it sits.
 */
export function CharacterHeader({
  title,
  onTitleChange,
  onTitleCommit,
  onTitleRevert,
  character,
  onChange,
  classes,
  onLevelUp,
  worldId,
  articleId,
  dirty,
  isPending,
  onSave,
  onReveal,
  onDelete,
  spellCards,
  onToggleSpellCards,
  showSpellCards,
  exporting,
  cardsSettled,
  onExport,
  children,
}: {
  title: string
  onTitleChange: (value: string) => void
  onTitleCommit: () => void
  onTitleRevert: () => void
  character: Character
  onChange: (next: Character) => void
  classes: Array<ClassInfo>
  onLevelUp: (to: number) => void
  worldId: string
  articleId: string
  dirty: boolean
  isPending: boolean
  onSave: () => void
  onReveal: () => void
  onDelete: () => void
  spellCards: boolean
  onToggleSpellCards: () => void
  showSpellCards: boolean
  exporting: boolean
  cardsSettled: boolean
  onExport: () => void
  children?: React.ReactNode
}) {
  return (
    /*
      One row: identity, the tab strip, the actions. The identity zone takes the
      slack and is the only part that gives, so the summary chip truncates before
      a tab or a button is lost.

      Widths measured in the running app, where the sidebar leaves the row about
      333px less than the window: the tabs cost 533px labelled and 270px as
      icons, and the actions 188px with the Save word and 142px without. Hence
      the two container breakpoints — @[53rem] drops the tab labels, @[36rem] the
      Save word — which are on the *row's* width, not the window's. Below all of
      that `overflow-x-auto` is the floor: the row scrolls rather than silently
      pushing Save off the edge.
    */
    <div className="@container/hdr flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b px-3 scrollbar-none">
      <div className="flex min-w-[19rem] shrink items-center gap-1">
        <SidebarToggle className="-ml-1.5" />
        {/* The title is the filename, so committing it renames the file and
            rewrites [[links]] world-wide. Far too expensive (and racy) to do on
            a keystroke — hence blur/Enter, not `dirty`.

            Sized, not flex-1: an <input> carries a UA-default `size` worth
            ~170px of intrinsic basis, so flex-1 here claimed an equal share of
            the free space and then refused to give it back, starving the summary
            chip. A fixed w-40 that may shrink to a 5.5rem floor keeps the name
            readable while letting the chip have the rest. */}
        <Input
          value={title}
          aria-label="Character name"
          className="h-8 w-auto min-w-[5rem] max-w-[14rem] border-none px-1.5 text-[15px] font-semibold shadow-none [field-sizing:content] focus-visible:ring-1"
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              onTitleRevert()
            }
          }}
        />

        {/* Renders both triggers — the level badge and the summary chip. */}
        <IdentityPopover
          character={character}
          onChange={onChange}
          classes={classes}
          onLevelUp={onLevelUp}
        />
      </div>

      {children}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Only for a caster — a fighter's toolbar shouldn't carry a control
            that changes nothing. Visible rather than in the menu because it is
            a toggle whose state you need to read at a glance. */}
        {showSpellCards && (
          <Button
            variant={spellCards ? 'default' : 'outline'}
            size="icon"
            className="size-8"
            aria-pressed={spellCards}
            title={
              spellCards
                ? 'Spell descriptions are printed with the sheet — click to leave them out'
                : 'Spell descriptions are left out — click to print them with the sheet'
            }
            onClick={onToggleSpellCards}
          >
            <BookOpen className="size-3.5" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Export the character sheet as PDF"
          title={
            spellCards && !cardsSettled
              ? 'Loading spell descriptions…'
              : 'Export the character sheet as PDF'
          }
          disabled={exporting || (spellCards && !cardsSettled)}
          onClick={onExport}
        >
          {exporting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
        </Button>
        <Button
          size="sm"
          className="h-8"
          aria-label={isPending ? 'Saving' : dirty ? 'Save' : 'Saved'}
          title={isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          disabled={!dirty || isPending}
          onClick={onSave}
        >
          <Save className="size-3.5" />
          <span className="hidden @[36rem]/hdr:inline">
            {isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </span>
        </Button>

        {/* Raw article, Reveal and Delete. The destructive one lived a few
            pixels from Save before this. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="More character actions"
              title="More actions"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to="/worlds/$worldId/articles/$articleId"
                params={{ worldId, articleId }}
              >
                <FileText /> Raw article
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onReveal}>
              <FolderOpen /> {REVEAL_LABEL}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete character
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
