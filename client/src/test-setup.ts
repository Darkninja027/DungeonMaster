/**
 * Test-environment shims for component tests.
 *
 * jsdom implements no layout, so anything that measures or scrolls is missing
 * rather than merely inert. Stub the pieces our components call so a scroll
 * never becomes a `TypeError` in a test that isn't about scrolling.
 */
Element.prototype.scrollIntoView = () => {}
