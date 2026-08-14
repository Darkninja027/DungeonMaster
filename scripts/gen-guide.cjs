// Generate client/electron/main/guideArticle.ts from docs/Guide.md.
// The guide is bundled as a string constant so it survives packaging with no
// electron-builder asset wiring.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = process.argv[2] ?? path.join(root, "docs", "Guide.md");
const out =
  process.argv[3] ??
  path.join(root, "client", "electron", "main", "guideArticle.ts");
const body = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");

const BT = String.fromCharCode(96); // backtick
const BS = String.fromCharCode(92); // backslash

// Escape for a JS template literal: backslashes, backticks, and ${.
const escaped = body
  .split(BS)
  .join(BS + BS)
  .split(BT)
  .join(BS + BT)
  .split("${")
  .join(BS + "${")
  // The guide uses zero-width spaces to keep its [[wiki link]] examples inert
  // (code spans do not protect them — resolveWikiLinks does not skip code).
  // Emitted as an escape so the generated source stays ASCII-clean and eslint's
  // no-irregular-whitespace stays happy; the runtime string is unchanged.
  .split(String.fromCharCode(0x200b))
  .join(BS + "u200B");

const header = `/**
 * The user guide, written into the root of every newly created world.
 *
 * Bundled as a string rather than read from disk: esbuild inlines it into
 * dist-electron, so there is no asset path that differs between dev and the
 * packaged app. Regenerate from the source of truth with:
 *   node scripts/gen-guide.cjs
 * after editing docs/Guide.md — do not hand-edit this file.
 */
export const GUIDE_FILENAME = 'Guide.md'

export const GUIDE_CONTENT = ${BT}${escaped}${BT}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header);
console.log("wrote", out, "(" + body.length + " chars)");
