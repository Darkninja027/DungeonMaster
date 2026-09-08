import { useEffect, useState } from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  useMatchRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Castle, Moon, Palette, Settings2, Sun } from 'lucide-react'
import { UpdateIndicator } from '#/components/UpdateIndicator'
import { LoadingGate } from '#/components/LoadingGate'
import { isDark, setTheme } from '#/lib/theme'
import { SKINS, getSkin, setSkin } from '#/lib/skin'
import type { Skin } from '#/lib/skin'
import {
  toggleSidebar,
  useHeaderTogglePreferred,
  useSidebarPresent,
} from '#/lib/sidebarState'
import { SidebarToggle } from '#/components/SidebarToggle'
import { useShortcut } from '#/lib/useShortcut'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const Route = createRootRoute({
  component: RootLayout,
})

/**
 * The skin picker: which visual identity the app wears.
 *
 * Sits beside the light/dark toggle because the two are the same kind of
 * choice — app-wide, instant, stored in localStorage, and orthogonal to each
 * other. A radio group rather than a cycling button: with only two skins a
 * toggle would work, but the names are the point and a third skin is a CSS-only
 * change that shouldn't need this component rewritten.
 */
function SkinPicker() {
  const [skin, setSkinState] = useState(getSkin())
  const choose = (next: Skin) => {
    setSkin(next)
    setSkinState(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Appearance — pick a style set"
          aria-label="Appearance"
        >
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Style set</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={skin}
          onValueChange={(v) => choose(v as Skin)}
        >
          {SKINS.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id}>
              <span>
                <span className="font-medium">{entry.label}</span>
                <span className="text-muted-foreground block text-xs">
                  {entry.hint}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(isDark())
  const toggle = () => {
    setTheme(dark ? 'light' : 'dark')
    setDark(!dark)
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

/**
 * World settings, for a world with no sidebar to hold the gear.
 *
 * That gear is the ONLY route into homebrew, the spell library and the editor
 * settings anywhere in the app, and it lives in the sidebar header — so a
 * layout that draws no sidebar (the vault) would strand all three. This
 * appears only when there is no sidebar, so the ordinary case still reaches
 * settings where it always did and never shows two gears.
 */
function HeaderWorldSettings() {
  const matchRoute = useMatchRoute()
  const present = useSidebarPresent()
  const match = matchRoute({ to: '/worlds/$worldId', fuzzy: true })

  if (present || !match || typeof match === 'boolean') return null
  const { worldId } = match
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      title="World settings — homebrew, library and editor"
      aria-label="World settings"
      asChild
    >
      <Link to="/worlds/$worldId/settings" params={{ worldId }}>
        <Settings2 className="size-4" />
      </Link>
    </Button>
  )
}

/**
 * The app header's copy of the sidebar toggle, and the home for the keyboard
 * shortcut. It yields to a title row's own toggle when there is one, so the
 * control sits beside the file name while a file is open and falls back here
 * (the world's empty state) when there is nothing to sit beside.
 */
function HeaderSidebarToggle() {
  const present = useSidebarPresent()
  const preferred = useHeaderTogglePreferred()
  // Registered here rather than in the world route so the binding exists
  // exactly as long as a sidebar does, wherever the button is drawn.
  useShortcut('\\', toggleSidebar, { enabled: present })

  if (!present || !preferred) return null
  return <SidebarToggle claim={false} />
}

function RootLayout() {
  // Both secondary windows load this same bundle at #/player/... or
  // #/popout/..., so the root layout is on their render path — but a viewer
  // window shows the article and nothing else. A route check rather than a
  // second root: the QueryClientProvider and the pointer-events unstick below
  // are wanted in those windows too, and splitting the root would duplicate
  // them.
  const matchRoute = useMatchRoute()
  const bare =
    !!matchRoute({ to: '/player/$worldId/$articleId', fuzzy: true }) ||
    !!matchRoute({ to: '/popout/$worldId/$articleId', fuzzy: true })

  // Safety net for a known Radix race: opening a Dialog out of a DropdownMenu
  // can leave pointer-events:none stuck on <body>, deadening clicks/typing
  // app-wide until the next layer resets it. Clear an orphaned inline lock on
  // any click so a stray one can never permanently wedge the app. Only fires
  // when the style is exactly 'none'; a legitimately-open layer takes the click
  // on its overlay, so real modals are unaffected.
  useEffect(() => {
    const unstick = () => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = ''
      }
    }
    document.addEventListener('pointerdown', unstick, true)
    return () => document.removeEventListener('pointerdown', unstick, true)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {/* The shell paints the ground so no route can render transparent over
          the browser default — every route below is free to paint its own. */}
      <div className="bg-background flex h-screen flex-col">
        {!bare && (
          /* `bg-background` explicitly: the header declares no background of
             its own, so it let the body's leftover teal gradient show through
             and clashed with whatever the page below it painted. */
          <header className="bg-background flex items-center gap-2 border-b px-4 py-2">
            <HeaderSidebarToggle />
            {/* `font-display` so the wordmark tracks the active skin and never
                reads as a different app sitting on the home screen's masthead. */}
            <Link
              to="/"
              className="font-display flex items-center gap-2 text-[0.95rem] font-semibold tracking-wide"
            >
              <Castle className="size-5" />
              Dungeon Master
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <HeaderWorldSettings />
              <UpdateIndicator />
              <SkinPicker />
              <ThemeToggle />
            </div>
          </header>
        )}
        <main className="min-h-0 flex-1">
          {/* Secondary windows skip the warm-up: they load this same bundle to
              show a single article to the table, and must not sit behind a
              spinner waiting on a bestiary they will never open. */}
          {bare ? (
            <Outlet />
          ) : (
            <LoadingGate>
              <Outlet />
            </LoadingGate>
          )}
        </main>
      </div>
    </QueryClientProvider>
  )
}
