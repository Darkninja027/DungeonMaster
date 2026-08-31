/**
 * Test-environment shims for component tests.
 *
 * jsdom implements no layout, so anything that measures or scrolls is missing
 * rather than merely inert. Stub the pieces our components call so a scroll
 * never becomes a `TypeError` in a test that isn't about scrolling.
 */
Element.prototype.scrollIntoView = () => {}

// The book renderer re-measures its column flow once webfonts settle
// (Markdown.tsx's useLayoutEffect). jsdom ships no FontFaceSet at all, so the
// bare `document.fonts.ready` throws before any assertion runs — a component
// test of the book pages fails with "reading 'ready'" rather than anything to
// do with what it was testing.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve() },
    configurable: true,
  })
}
