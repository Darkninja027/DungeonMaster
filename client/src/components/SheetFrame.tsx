/**
 * The ornate gold border drawn around a printed character sheet.
 *
 * Purely decorative — it is an absolutely positioned overlay, so it adds no
 * height and changes no layout. That matters more here than it sounds: every
 * list on a sheet is paginated against a row budget measured from the 712x960
 * content box (see the capacity constants in character/SheetPreview.tsx), and
 * `.dnd-cs-body` clips silently. A border drawn with `border` or `padding` on
 * `.dnd-page` would shrink that box under Tailwind's `box-sizing: border-box`
 * and quietly cost a row off the foot of every page. This one cannot.
 *
 * The ornament therefore lives entirely in the sheet's existing 48/52px margin
 * band. Concretely, inside the corner square the interior starts at (52, 48),
 * so the flourishes may be deep near a corner and must hug the rule once they
 * run past it — every path below is checked against that in
 * SheetFrame.test.tsx rather than by eye.
 *
 * Three things are deliberate about how it is drawn:
 *
 * - **Real SVG elements, inline positioning, literal colours.** `exportPdf`
 *   captures through modern-screenshot, which serialises a node by copying its
 *   *computed* styles onto an inline `style` — and it does not copy all of
 *   them. Measured against the installed copy: the capture root's own
 *   `position` is dropped even when set inline `!important`, while a child's
 *   inline styles and SVG presentation attributes come through verbatim. So
 *   the frame carries its positioning inline and its colour in attributes, and
 *   leans on no stylesheet rule of its own. (It still lands correctly despite
 *   the root losing `position`, because the capture root *is* the sheet, at the
 *   clone's origin and at exactly its own size.)
 * - **No `<defs>`/`<use>`.** The four corners are the same JSX rendered four
 *   times under mirroring transforms. Repeating the markup costs a few hundred
 *   bytes and avoids both a duplicate-id collision between the ~8 frames on one
 *   sheet and any question about how the capture serialises `<use>`.
 * - **Each corner is mirrored across its own diagonal** (`matrix(0 1 1 0 0 0)`
 *   swaps x and y), so the ornament is symmetric by construction instead of by
 *   two hand-tuned paths staying in step.
 */

/** `--dnd-gold` from `.dnd-page` in styles.css, as a literal — see above. */
const GOLD = '#c9ad6a'

/** The fixed sheet, from `.dnd-page` in styles.css. */
const PAGE_W = 816
const PAGE_H = 1056

/** Insets of the two rules from the page edge. */
const OUTER = 16
const INNER = 23

/**
 * Half a corner flourish: a swash running out along one edge, two leaves and a
 * terminal curl, drawn from the inner rule's corner with the interior at +x/+y.
 * Rendered twice per corner — once as-is, once reflected across y = x.
 */
function CornerHalf() {
  return (
    <>
      <path d="M14 14 C 32 5, 58 1, 126 0.5" strokeWidth={1.5} />
      <path d="M24 10 C 48 3, 80 0, 126 0.5" strokeWidth={0.7} opacity={0.7} />
      <path
        d="M42 3 C 48 11, 45 20, 35 21 C 33 12, 36 5, 42 3z"
        fill={GOLD}
        stroke="none"
      />
      <path
        d="M74 2 C 79 8, 77 14, 70 15 C 69 8, 71 4, 74 2z"
        fill={GOLD}
        stroke="none"
        opacity={0.85}
      />
      <path
        d="M126 0.5 C 133 0.5, 136 5, 132 9 C 129 12, 125 10, 126 7"
        strokeWidth={1.2}
      />
    </>
  )
}

/** A corner: both halves plus the small rosette that knots them together. */
function Corner({ transform }: { transform: string }) {
  return (
    <g transform={transform} stroke={GOLD} fill="none" strokeLinecap="round">
      <CornerHalf />
      <g transform="matrix(0 1 1 0 0 0)">
        <CornerHalf />
      </g>
      <g transform="translate(11,11)" stroke="none">
        <path d="M0 -7 C 3 -3, 3 3, 0 7 C -3 3, -3 -3, 0 -7z" fill={GOLD} />
        <path d="M-7 0 C -3 -3, 3 -3, 7 0 C 3 3, -3 3, -7 0z" fill={GOLD} />
        {/* Punched out in parchment rather than left as a hole: the sheet is
            captured as opaque JPEG, so a transparent centre would flatten to
            the export's background colour, not to the page's gradient. */}
        <circle cx="0" cy="0" r="1.6" fill="#f2e8d5" />
      </g>
    </g>
  )
}

/**
 * The small fleuron that sits at the midpoint of an edge, centred on the inner
 * rule with its flicks reaching up into the channel between the two rules.
 */
function EdgeFleuron({ transform }: { transform: string }) {
  return (
    <g transform={transform} stroke={GOLD} fill="none" strokeLinecap="round">
      <path
        d="M0 -3.5 l4.5 3.5 -4.5 3.5 -4.5 -3.5z"
        fill={GOLD}
        stroke="none"
      />
      <path d="M7 0 C 14 0, 20 -1.5, 23 -3.5" strokeWidth={0.9} />
      <path d="M-7 0 C -14 0, -20 -1.5, -23 -3.5" strokeWidth={0.9} />
    </g>
  )
}

export function SheetFrame() {
  return (
    <svg
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      width={PAGE_W}
      height={PAGE_H}
      fill="none"
      aria-hidden="true"
      // Inline rather than a class, so the PDF capture carries it — see above.
      // `.dnd-page` is `position: relative` (styles.css) so this anchors to the
      // sheet; `pointer-events: none` keeps it off the dice chips underneath.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <rect
        x={OUTER}
        y={OUTER}
        width={PAGE_W - OUTER * 2}
        height={PAGE_H - OUTER * 2}
        stroke={GOLD}
        strokeWidth={1.8}
      />
      <rect
        x={INNER}
        y={INNER}
        width={PAGE_W - INNER * 2}
        height={PAGE_H - INNER * 2}
        stroke={GOLD}
        strokeWidth={0.7}
        opacity={0.5}
      />
      <Corner transform={`translate(${INNER},${INNER})`} />
      <Corner transform={`translate(${PAGE_W - INNER},${INNER}) scale(-1,1)`} />
      <Corner
        transform={`translate(${PAGE_W - INNER},${PAGE_H - INNER}) scale(-1,-1)`}
      />
      <Corner transform={`translate(${INNER},${PAGE_H - INNER}) scale(1,-1)`} />
      <EdgeFleuron transform={`translate(${PAGE_W / 2},${INNER})`} />
      <EdgeFleuron
        transform={`translate(${PAGE_W / 2},${PAGE_H - INNER}) scale(1,-1)`}
      />
      <EdgeFleuron transform={`translate(${INNER},${PAGE_H / 2}) rotate(90)`} />
      <EdgeFleuron
        transform={`translate(${PAGE_W - INNER},${PAGE_H / 2}) rotate(-90)`}
      />
    </svg>
  )
}
