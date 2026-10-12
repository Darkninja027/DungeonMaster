import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MapCanvas } from './MapCanvas'
import { addToken, forPlayers, newMap } from '#/lib/mapStore'
import type { BattleMap, Token } from '#/lib/mapStore'
import { setCells } from '#/lib/fog'
import type { Combatant } from '#/lib/api'

/**
 * These render in jsdom, which has no layout: `clientWidth` is 0, so the
 * component's ResizeObserver reports an empty viewport and the SVG layers
 * bail out. Every test here therefore stubs a real box first — without it they
 * would all pass by rendering nothing, which is the failure mode that makes a
 * render test worthless.
 *
 * The one that actually matters is the last: a token the DM has hidden must not
 * reach the players' DOM at all. That is a secrecy rule, and CSS is not how it
 * is kept.
 */

const VIEW = { width: 800, height: 600 }

beforeAll(() => {
  // jsdom reports every element as 0x0. Give the host a box so the camera has a
  // viewport and the layers actually draw.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => VIEW.width,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEW.height,
  })
  // jsdom ships no ResizeObserver, and the canvas measures its host with one.
  // TypeScript believes the global exists, so this cannot be written as a
  // conditional fallback without the lint rule calling it dead.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function token(over: Partial<Token> = {}): Token {
  return {
    id: 't1',
    label: 'Goblin',
    x: 1,
    y: 1,
    size: 'medium',
    colour: '#8b1a1a',
    ...over,
  }
}

function map(over: Partial<BattleMap> = {}): BattleMap {
  return newMap({
    id: 'm1',
    name: 'Cave',
    image: 'Maps/cave.png',
    // The grid IS the map: 10x10 cells, whatever the art happens to be.
    grid: { cols: 10, rows: 10, size: 70 },
    ...over,
  })
}

describe('MapCanvas', () => {
  it('draws the background through the world:// protocol', () => {
    const { container } = render(<MapCanvas worldId="abc123" map={map()} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(
      'world://abc123/_images/Maps/cave.png',
    )
  })

  it('encodes each path segment separately', () => {
    // A whole-path encodeURIComponent turns the separators into %2F, which this
    // app tolerates and Obsidian does not.
    const { container } = render(
      <MapCanvas
        worldId="abc"
        map={map({ image: 'Maps/City Sewers/a b.png' })}
      />,
    )
    const src = container.querySelector('img')?.getAttribute('src')
    expect(src).toBe('world://abc/_images/Maps/City%20Sewers/a%20b.png')
    expect(src).not.toContain('%2F')
  })

  it('renders no image element for a map with no background', () => {
    const { container } = render(
      <MapCanvas worldId="abc" map={map({ image: '' })} />,
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('draws grid lines across the map', () => {
    const { container } = render(<MapCanvas worldId="abc" map={map()} />)
    // A 700x700 map on a 70px grid is 10x10, so 11 lines each way.
    expect(container.querySelectorAll('line')).toHaveLength(22)
  })

  it('draws a token as a disc', () => {
    const m = addToken(map(), token())
    const { container } = render(<MapCanvas worldId="abc" map={m} />)
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Goblin')
  })

  it('draws fog only when it is switched on', () => {
    const base = map({ fogEnabled: false })
    const { container, rerender } = render(
      <MapCanvas worldId="abc" map={base} />,
    )
    expect(container.querySelectorAll('rect')).toHaveLength(0)

    rerender(<MapCanvas worldId="abc" map={{ ...base, fogEnabled: true }} />)
    // Nothing revealed yet, so every one of the 100 cells is fogged.
    expect(container.querySelectorAll('rect')).toHaveLength(100)
  })

  it('stops drawing fog over a revealed cell', () => {
    const m = map({ fogEnabled: true })
    const revealed = { ...m, fog: setCells(m.fog, [{ x: 0, y: 0 }], true) }
    const { container } = render(<MapCanvas worldId="abc" map={revealed} />)
    expect(container.querySelectorAll('rect')).toHaveLength(99)
  })

  describe('the overlay and the background stay in register', () => {
    it('lifts the global image caps off the background', () => {
      // Tailwind Preflight sets `img { max-width: 100% }` for every image in
      // the app, which BEATS an inline width and clamped this one to the
      // window while its height stayed at the grid's — so the map was
      // squashed horizontally by a different amount at every window size.
      //
      // Asserted on the style rather than on measurements because jsdom
      // applies no stylesheets: every geometry test here passed throughout,
      // reporting a square box while Chromium drew 281x625.
      const { container } = render(
        <MapCanvas worldId="abc" map={{ ...map(), image: 'Maps/cave.png' }} />,
      )
      const img = container.querySelector('img')
      expect(img?.style.maxWidth).toBe('none')
      expect(img?.style.maxHeight).toBe('none')
    })

    it('never lets the SVG rescale its own contents', () => {
      // An SVG with a viewBox and no preserveAspectRatio defaults to
      // "xMidYMid meet": it scales and recentres everything inside to fit the
      // element. `view` comes from a ResizeObserver, so it lags a resize by a
      // frame — which meant the grid, tokens and fog briefly drew at a
      // different scale from the background <img>, which CSS positions and
      // which does not lag. That reads as the map distorting when you resize
      // the window.
      const { container } = render(<MapCanvas worldId="abc" map={map()} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBeTruthy()
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('none')
    })

    it('keeps the grid square when the element is not', () => {
      // Every point in the overlay is already screen pixels from mapToScreen,
      // so a square grid must stay square in a wide window. Under "meet" a
      // stale viewBox would squash it.
      const { container } = render(<MapCanvas worldId="abc" map={map()} />)
      const vs = [...container.querySelectorAll('line')].filter(
        (l) => l.getAttribute('x1') === l.getAttribute('x2'),
      )
      const hs = [...container.querySelectorAll('line')].filter(
        (l) => l.getAttribute('y1') === l.getAttribute('y2'),
      )
      const w =
        Number(vs.at(-1)!.getAttribute('x1')) - Number(vs[0].getAttribute('x1'))
      const h =
        Number(hs.at(-1)!.getAttribute('y1')) - Number(hs[0].getAttribute('y1'))
      // A 20x20 grid of square cells: the drawn box is square too.
      expect(Math.abs(w - h)).toBeLessThan(1)
    })
  })

  describe('the background fit', () => {
    it('shows the whole image by default, and crops only when told to', () => {
      const withArt = () => ({ ...map(), image: 'Maps/cave.png' })

      // The default. A 35x35 grid is square and almost no battlemap export is,
      // so cropping by default lost a quarter of the art with no sign of it.
      const whole = render(<MapCanvas worldId="abc" map={withArt()} />)
      const img = whole.container.querySelector('img')
      expect(img?.className).toContain('object-contain')
      expect(img?.className).not.toContain('object-cover')
      whole.unmount()

      // Still available, because it is right for art drawn to a grid.
      const fill = render(
        <MapCanvas worldId="abc" map={{ ...withArt(), imageFit: 'cover' }} />,
      )
      expect(fill.container.querySelector('img')?.className).toContain(
        'object-cover',
      )
    })
  })

  describe('live combat state', () => {
    const goblin: Combatant = {
      id: 'c1',
      name: 'Goblin',
      initiative: 12,
      hp: 3,
      maxHp: 12,
      ac: 15,
      note: '',
    }

    it('draws an hp bar for a linked token', () => {
      const m = addToken(map(), token({ combatantId: 'c1' }))
      const bare = render(<MapCanvas worldId="abc" map={m} />)
      const withVitals = render(
        <MapCanvas worldId="abc" map={m} combatants={[goblin]} />,
      )
      // The bar is two rects; the unlinked render has none at all.
      expect(
        withVitals.container.querySelectorAll('rect').length,
      ).toBeGreaterThan(bare.container.querySelectorAll('rect').length)
    })

    it('rings the token whose turn it is', () => {
      const m = addToken(map(), token({ combatantId: 'c1' }))
      const off = render(
        <MapCanvas worldId="abc" map={m} combatants={[goblin]} />,
      )
      const on = render(
        <MapCanvas
          worldId="abc"
          map={m}
          combatants={[goblin]}
          activeCombatantId="c1"
        />,
      )
      expect(on.container.querySelectorAll('circle').length).toBeGreaterThan(
        off.container.querySelectorAll('circle').length,
      )
    })

    it('crosses out a combatant at zero hit points', () => {
      const m = addToken(map(), token({ combatantId: 'c1' }))
      const up = render(
        <MapCanvas worldId="abc" map={m} combatants={[goblin]} />,
      )
      const down = render(
        <MapCanvas worldId="abc" map={m} combatants={[{ ...goblin, hp: 0 }]} />,
      )
      // Two crossing lines on top of the grid's own.
      expect(down.container.querySelectorAll('line').length).toBe(
        up.container.querySelectorAll('line').length + 2,
      )
    })

    it('redraws the hp bar when the combatant is damaged', () => {
      // The bar is driven by live combat state, so editing HP anywhere — the
      // tracker, or the map's own +/- buttons — moves it.
      const m = addToken(map(), token({ combatantId: 'c1' }))
      const full = render(
        <MapCanvas
          worldId="abc"
          map={m}
          combatants={[{ ...goblin, hp: 12, maxHp: 12 }]}
        />,
      )
      const hurt = render(
        <MapCanvas
          worldId="abc"
          map={m}
          combatants={[{ ...goblin, hp: 3, maxHp: 12 }]}
        />,
      )
      const widthOf = (c: HTMLElement) =>
        Number(c.querySelectorAll('rect')[1].getAttribute('width') ?? '0')
      expect(widthOf(hurt.container)).toBeLessThan(widthOf(full.container))
    })

    it('ignores a link that points at nobody', () => {
      // The combatant was removed; the miniature stays, without live stats.
      const m = addToken(map(), token({ combatantId: 'gone' }))
      const orphan = render(
        <MapCanvas worldId="abc" map={m} combatants={[goblin]} />,
      )
      const plain = render(
        <MapCanvas worldId="abc" map={addToken(map(), token())} />,
      )
      expect(orphan.container.querySelectorAll('rect').length).toBe(
        plain.container.querySelectorAll('rect').length,
      )
    })
  })

  describe('the place tool', () => {
    function click(container: HTMLElement, at: [number, number]) {
      const host = container.firstElementChild as HTMLElement
      host.setPointerCapture = () => {}
      host.releasePointerCapture = () => {}
      fireEvent.pointerDown(host, {
        clientX: at[0],
        clientY: at[1],
        button: 0,
      })
    }

    it('reports the cell that was clicked', () => {
      const onPlaceAt = vi.fn()
      const { container } = render(
        <MapCanvas
          worldId="abc"
          map={map()}
          tool="place"
          onPlaceAt={onPlaceAt}
        />,
      )
      click(container, [400, 300])
      expect(onPlaceAt).toHaveBeenCalledTimes(1)
      const cell = onPlaceAt.mock.calls[0][0]
      expect(Number.isInteger(cell.x)).toBe(true)
      expect(Number.isInteger(cell.y)).toBe(true)
    })

    it('places on an occupied cell rather than selecting what is there', () => {
      // The tool you chose says "place", so placing beats picking.
      const onPlaceAt = vi.fn()
      const onSelectToken = vi.fn()
      const m = addToken(map(), token({ x: 0, y: 0 }))
      const { container } = render(
        <MapCanvas
          worldId="abc"
          map={m}
          tool="place"
          onPlaceAt={onPlaceAt}
          onSelectToken={onSelectToken}
        />,
      )
      click(container, [100, 100])
      expect(onPlaceAt).toHaveBeenCalled()
      expect(onSelectToken).not.toHaveBeenCalled()
    })

    it('does nothing for a player', () => {
      const onPlaceAt = vi.fn()
      const { container } = render(
        <MapCanvas
          worldId="abc"
          map={map()}
          tool="place"
          audience="player"
          onPlaceAt={onPlaceAt}
        />,
      )
      click(container, [400, 300])
      expect(onPlaceAt).not.toHaveBeenCalled()
    })
  })

  describe('measuring', () => {
    /** A press-drag on the canvas host, which is the measure gesture. */
    function drag(
      container: HTMLElement,
      from: [number, number],
      to: [number, number],
    ) {
      const host = container.firstElementChild as HTMLElement
      host.setPointerCapture = () => {}
      host.releasePointerCapture = () => {}
      fireEvent.pointerDown(host, {
        clientX: from[0],
        clientY: from[1],
        button: 0,
      })
      fireEvent.pointerMove(host, { clientX: to[0], clientY: to[1] })
      return host
    }

    it('draws nothing until you drag', () => {
      const { container } = render(
        <MapCanvas worldId="abc" map={map()} tool="measure" />,
      )
      expect(container.textContent).not.toContain('ft.')
    })

    it('reads out a distance in feet while dragging', () => {
      const { container } = render(
        <MapCanvas worldId="abc" map={map()} tool="measure" />,
      )
      drag(container, [100, 100], [400, 100])
      expect(container.textContent).toMatch(/\d+ ft\./)
      expect(container.textContent).toMatch(/sq\)/)
    })

    it('clears the measurement on release', () => {
      const { container } = render(
        <MapCanvas worldId="abc" map={map()} tool="measure" />,
      )
      const host = drag(container, [100, 100], [400, 100])
      fireEvent.pointerUp(host)
      expect(container.textContent).not.toContain('ft.')
    })

    it('paints a template area and reports its size, not the drag length', () => {
      const { container } = render(
        <MapCanvas
          worldId="abc"
          map={map()}
          tool="measure"
          template="circle"
          templateFeet={20}
        />,
      )
      drag(container, [100, 100], [140, 100])
      // A 20 ft burst reads 20 ft however far you dragged to aim it.
      expect(container.textContent).toContain('20 ft.')
      expect(container.querySelectorAll('rect').length).toBeGreaterThan(0)
    })

    it('does not measure for players', () => {
      const { container } = render(
        <MapCanvas
          worldId="abc"
          map={map()}
          tool="measure"
          audience="player"
        />,
      )
      drag(container, [100, 100], [400, 100])
      expect(container.textContent).not.toContain('ft.')
    })
  })

  /**
   * The secrecy rule, end to end. `forPlayers` strips hidden tokens and this
   * asserts the consequence in the rendered DOM: a player window must not
   * contain the ambush at all, not even invisibly.
   */
  it('never puts a hidden token in the players DOM', () => {
    const m = addToken(
      addToken(map(), token({ id: 'seen', label: 'Guard' })),
      token({ id: 'ambush', label: 'Assassin', hidden: true, x: 5, y: 5 }),
    )

    const dm = render(<MapCanvas worldId="abc" map={m} audience="dm" />)
    expect(dm.container.textContent).toContain('Assassin')

    const players = render(
      <MapCanvas worldId="abc" map={forPlayers(m)} audience="player" />,
    )
    expect(players.container.textContent).toContain('Guard')
    expect(players.container.textContent).not.toContain('Assassin')
    expect(players.container.innerHTML).not.toContain('Assassin')
  })
})

describe('a player dragging their own token', () => {
  /** One cell, so wherever the pointer lands on the grid, it lands on the token. */
  const oneCell = () =>
    addToken(
      map({ grid: { cols: 1, rows: 1, size: 70 } }),
      token({ id: 'mine', x: 0, y: 0 }),
    )

  function dragAcross(container: HTMLElement) {
    const host = container.firstElementChild as HTMLElement
    host.setPointerCapture = () => {}
    host.releasePointerCapture = () => {}
    fireEvent.pointerDown(host, { clientX: 400, clientY: 300, button: 0 })
    fireEvent.pointerMove(host, { clientX: 402, clientY: 301 })
    fireEvent.pointerUp(host)
  }

  it('moves a token it is allowed to, and reports the drop', () => {
    const onMoveToken = vi.fn()
    const onDropToken = vi.fn()
    const { container } = render(
      <MapCanvas
        worldId="abc"
        map={oneCell()}
        audience="player"
        canDragToken={(t) => t.id === 'mine'}
        onMoveToken={onMoveToken}
        onDropToken={onDropToken}
      />,
    )
    dragAcross(container)
    expect(onMoveToken).toHaveBeenCalledWith('mine', 0, 0)
    expect(onDropToken).toHaveBeenCalledWith('mine', 0, 0)
  })

  it('leaves every other token alone — the drag is a pan', () => {
    const onMoveToken = vi.fn()
    const onDropToken = vi.fn()
    const { container } = render(
      <MapCanvas
        worldId="abc"
        map={oneCell()}
        audience="player"
        canDragToken={() => false}
        onMoveToken={onMoveToken}
        onDropToken={onDropToken}
      />,
    )
    dragAcross(container)
    expect(onMoveToken).not.toHaveBeenCalled()
    expect(onDropToken).not.toHaveBeenCalled()
  })

  it('sends no move for a click that went nowhere', () => {
    const onDropToken = vi.fn()
    const { container } = render(
      <MapCanvas
        worldId="abc"
        map={oneCell()}
        audience="player"
        canDragToken={() => true}
        onDropToken={onDropToken}
      />,
    )
    const host = container.firstElementChild as HTMLElement
    host.setPointerCapture = () => {}
    host.releasePointerCapture = () => {}
    fireEvent.pointerDown(host, { clientX: 400, clientY: 300, button: 0 })
    fireEvent.pointerUp(host)
    expect(onDropToken).not.toHaveBeenCalled()
  })

  it('loads images from the URL it is given, not world://', () => {
    const { container } = render(
      <MapCanvas
        worldId=""
        map={oneCell()}
        audience="player"
        imageUrl={(id) => `http://host:7777/img/_images/${id}?token=t`}
      />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'http://host:7777/img/_images/Maps/cave.png?token=t',
    )
  })
})
