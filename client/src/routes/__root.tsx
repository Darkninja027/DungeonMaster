import { useEffect, useState } from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  useMatchRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Castle, Moon, Settings2, Sun } from 'lucide-react'
import { UpdateIndicator } from '#/components/UpdateIndicator'
import { LoadingGate } from '#/components/LoadingGate'
import { isDark, setTheme } from '#/lib/theme'
import {
  toggleSidebar,
  useHeaderTogglePreferred,
  useSidebarPresent,
} from '#/lib/sidebarState'
import { SidebarToggle } from '#/components/SidebarToggle'
import { useShortcut } from '#/lib/useShortcut'
import { Button } from '#/components/ui/button'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const Route = createRootRoute({
  component: RootLayout,
})

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
      <div className="flex h-screen flex-col">
        {!bare && (
          <header className="flex items-center gap-2 border-b px-4 py-2">
            <HeaderSidebarToggle />
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <Castle className="size-5" />
              Dungeon Master
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <HeaderWorldSettings />
              <UpdateIndicator />
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
