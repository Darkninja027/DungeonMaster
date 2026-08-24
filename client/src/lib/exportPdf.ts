import { jsPDF } from 'jspdf'
import { domToJpeg } from 'modern-screenshot'

/**
 * JPEG, not PNG. A book page is a full-bleed parchment gradient — photographic
 * noise that PNG cannot compress, so a lossless 2x capture costs ~17 MB per
 * page (1632x2112 px) and a 19-page guide exported at 333 MB. JPEG at q=0.85
 * renders identically to the eye on that texture and cuts it by ~50x.
 *
 * The pages are opaque (the parchment background is painted on .dnd-page), so
 * there is no transparency to lose; backgroundColor is set anyway to keep any
 * gap between elements from flattening to black.
 */
const JPEG_QUALITY = 0.85

/** 2x is retina-sharp on screen and in print; 1x visibly softens the serif text. */
const CAPTURE_SCALE = 2

/**
 * The book pages are set in Alegreya (body) and Cinzel (headings); the rest of
 * the @import is app chrome that never appears on a sheet. Latin only — the
 * pages are English and each extra unicode-range slice is another font file.
 */
const BOOK_FONT_CSS_URL =
  'https://fonts.googleapis.com/css2' +
  '?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400;1,700' +
  '&family=Cinzel:wght@500;600;700'

/** Cached across exports — the bytes never change within a session. */
let fontCssPromise: Promise<string | null> | null = null

/**
 * Build a `font.cssText` blob once, with the font files inlined as data URLs.
 *
 * Two problems this solves. First, modern-screenshot otherwise re-resolves and
 * re-fetches every @font-face on *each* capture: measured at 668ms per page
 * versus 198ms with the work skipped, ~70% of a 20s export. Passing
 * `font.cssText` takes its fast path — the CSS is appended verbatim and nothing
 * is downloaded. Second, the fonts come from fonts.googleapis.com (the @import
 * in styles.css), so those per-page fetches are network round-trips; inlining
 * them as data URLs is also what lets an export work offline.
 *
 * The @font-face rules cannot be read back out of the document: they live in a
 * cross-origin stylesheet, so `cssRules` throws, and Chromium does not expose
 * `FontFace.src`. So the CSS is fetched fresh from Google (a cache hit in
 * practice, the app already loaded it) and its urls swapped for data URLs.
 *
 * Returns null if anything fails — offline with a cold cache, say — in which
 * case the caller lets the library do it per page. Slower, but no worse than
 * before, and the text still renders.
 */
async function collectFontCss(): Promise<string | null> {
  try {
    // Ask for woff2 explicitly: Google varies the response on User-Agent, and
    // the default from a fetch() can be the much larger ttf.
    const res = await fetch(BOOK_FONT_CSS_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) return null
    const css = await res.text()

    // Google returns one @font-face per unicode-range slice — 41 of them, and
    // inlining the lot is 1.26 MB of base64 that the serializer re-parses on
    // every page. The book pages are English, so keep only the latin slices:
    // measured 266ms/page down to 159ms, i.e. 8.8s -> 5.2s over 33 pages.
    //
    // Selected by the `/* latin */` comment Google emits above each block
    // rather than by parsing unicode-range, which is a long list of
    // codepoints whose exact shape is not contractual.
    const latinOnly = css
      .split(/(?=\/\* [a-z0-9-]+ \*\/)/i)
      .filter((block) => /^\/\* latin \*\//i.test(block.trim()))
      .join('\n')
    // Fall back to the whole sheet if the comments ever go away — slower, but
    // the alternative is a PDF with no embedded fonts at all.
    const subset = /@font-face/.test(latinOnly) ? latinOnly : css

    const urls = new Set<string>()
    for (const m of subset.matchAll(/url\((https:\/\/[^)]+)\)/g)) urls.add(m[1])
    if (urls.size === 0) return null

    const inlined = new Map<string, string>()
    await Promise.all(
      Array.from(urls).map(async (url) => {
        try {
          const fontRes = await fetch(url)
          if (!fontRes.ok) return
          const bytes = new Uint8Array(await fontRes.arrayBuffer())
          // Chunked: String.fromCharCode(...bytes) overflows the call stack on
          // a font-sized array.
          let binary = ''
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          }
          inlined.set(url, `data:font/woff2;base64,${btoa(binary)}`)
        } catch {
          // leave it remote; the capture still succeeds when online
        }
      }),
    )
    if (inlined.size === 0) return null

    let out = subset
    for (const [url, dataUrl] of inlined) out = out.split(url).join(dataUrl)
    return out
  } catch {
    return null
  }
}

/**
 * The multicol properties the capture loses, and the elements that need them.
 *
 * modern-screenshot serialises a page by copying each node's *computed* styles
 * onto an inline `style` attribute and dropping the `class` attribute entirely.
 * Neither half of that survives multi-column layout: with no classes, the
 * stylesheet's `.dnd-page .dnd-cs-2col { column-count: 2 }` matches nothing,
 * and the column longhands are not among the properties it inlines — the clone
 * comes out with `columns: auto`. Chromium then picks its own column count from
 * the element's width, so a list that fills one column on screen breaks into
 * two (or breaks in a different place) in the PDF.
 *
 * Verified rather than inferred: the serialised SVG contains no `class=`
 * attribute and no `column-count`, `columns` or `column-gap` declaration at
 * all, while the live element computes `column-count: 2; column-gap: 24px;
 * column-fill: auto`.
 *
 * So the values are pinned inline before the capture and removed afterwards.
 * Inline styles are what the serialiser reads, so this is the one channel that
 * reaches the clone. The list is deliberately explicit — reading them back off
 * `getComputedStyle` per element would be tidier but would also faithfully copy
 * a wrong value if one of these rules is ever changed to something the capture
 * cannot express.
 */
const CAPTURE_PINNED_STYLES: Array<
  [selector: string, styles: Record<string, string>]
> = [
  [
    '.dnd-cs-2col',
    { 'column-count': '2', 'column-width': 'auto', 'column-gap': '24px' },
  ],
  ['.dnd-cs-2col-fill', { 'column-fill': 'auto' }],
  // The article/book pages use the same mechanism (see .dnd-flow in styles.css).
  ['.dnd-flow', { 'column-fill': 'auto', 'column-gap': '40px' }],
  ['.dnd-flow-2', { 'column-count': '2', 'column-width': 'auto' }],
  ['.dnd-flow-1', { 'column-count': '1', 'column-width': 'auto' }],
]

/**
 * Pin the styles above onto a page's elements, returning a restore function.
 *
 * `setProperty(..., 'important')` because the serialiser writes its own inline
 * declarations for many properties; on the live element this only has to beat
 * the stylesheet, but it costs nothing and makes the intent unambiguous.
 */
function pinCaptureStyles(page: HTMLElement): () => void {
  const undo: Array<() => void> = []
  for (const [selector, styles] of CAPTURE_PINNED_STYLES) {
    const targets = [
      ...(page.matches(selector) ? [page] : []),
      ...page.querySelectorAll<HTMLElement>(selector),
    ]
    for (const el of targets) {
      for (const [prop, value] of Object.entries(styles)) {
        const prevValue = el.style.getPropertyValue(prop)
        const prevPriority = el.style.getPropertyPriority(prop)
        undo.push(() => {
          if (prevValue) el.style.setProperty(prop, prevValue, prevPriority)
          else el.style.removeProperty(prop)
        })
        el.style.setProperty(prop, value, 'important')
      }
    }
  }
  return () => {
    for (const fn of undo) fn()
  }
}

/**
 * Snapshot every rendered .dnd-page inside `root` and stitch them into a PDF,
 * one PDF page per book page. Captures the live preview DOM, so the output
 * matches the preview exactly (parchment, columns, drop caps, images).
 */
export async function exportPdf(root: HTMLElement, filename: string) {
  const pages = Array.from(
    root.querySelectorAll<HTMLElement>('.dnd-page:not(.dnd-measure)'),
  )
  if (pages.length === 0) return

  await document.fonts.ready
  fontCssPromise ??= collectFontCss()
  const fontCssText = await fontCssPromise

  let pdf: jsPDF | null = null
  for (const page of pages) {
    const w = page.offsetWidth
    const h = page.offsetHeight
    // A sheet still being laid out measures 0 and makes jsPDF throw
    // "Invalid argument passed to jsPDF.scale", losing the whole export over
    // one unsettled page. Skipping it costs a page; throwing costs the book.
    if (w === 0 || h === 0) continue
    // The capture drops class attributes and does not inline the column
    // longhands, so the multicol pages have to carry theirs inline — see
    // CAPTURE_PINNED_STYLES. Restored in `finally` so an aborted export can
    // never leave !important declarations on the live preview.
    const unpin = pinCaptureStyles(page)
    let jpeg: string
    try {
      jpeg = await domToJpeg(page, {
        scale: CAPTURE_SCALE,
        quality: JPEG_QUALITY,
        // the parchment base under .dnd-page's gradients (styles.css)
        backgroundColor: '#f2e8d5',
        ...(fontCssText ? { font: { cssText: fontCssText } } : {}),
        // roll buttons are dead weight on paper
        filter: (node) =>
          !(
            node instanceof HTMLElement &&
            node.classList.contains('dnd-roll-bar')
          ),
      })
    } finally {
      unpin()
    }
    const orientation = w > h ? 'landscape' : 'portrait'
    if (!pdf) {
      pdf = new jsPDF({
        unit: 'px',
        format: [w, h],
        orientation,
        hotfixes: ['px_scaling'],
      })
    } else {
      pdf.addPage([w, h], orientation)
    }
    // 'FAST' skips jsPDF's own re-encode; the JPEG is already compressed.
    pdf.addImage(jpeg, 'JPEG', 0, 0, w, h, undefined, 'FAST')
  }
  // Only possible if every page measured 0 — nothing to save.
  if (!pdf) return
  pdf.save(filename)
}
