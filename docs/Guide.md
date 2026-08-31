---
type: session
tags: [guide, reference]
---

\columns 1

# The DungeonMaster Guide

Everything this app can do, written in the app's own markdown so the guide
demonstrates each feature while it explains it. Read it in Preview to see the
dice roll, the tables highlight, and the stat blocks render. Read it in Write to
see exactly what was typed to make that happen.

> **A world is just a folder on your disk.** Articles are `.md` files, folders
> are real directories, images live in `_images/`. There is no server and no
> database. Copy the folder to a USB stick, sync it with Dropbox, put it in git,
> or open it in Obsidian — it is your data, in plain text, forever.

## How to read this guide

Each chapter is one book page. Anything shown in `code style` is literal text you
type into an article. Anything not in code style is something you click.

Deleting is always safe: every delete in this app sends the file to your
operating system's Recycle Bin rather than destroying it.

## The short version

| If you want to | Do this |
| -------------- | ------- |
| Find anything | `Ctrl+K` |
| Make an article | `Ctrl+N` |
| Save right now | `Ctrl+S` |
| See the pretty version | `Ctrl+P` |
| More room to read | `Ctrl+\` |
| Learn the markdown | Keep reading |

\page

\columns 1

# Getting Started

The first screen you see is **Your Worlds** — the home screen. A world is a
folder, so starting out means either pointing the app at a folder you already
have or asking it to make you a new one.

## Making a new world

Click **New World**. You are asked for a **Name** and a **Description**, then
for the location on disk where the folder should be created. The folder must be
empty or not exist yet — the app will not scribble into a folder that already
has your tax returns in it.

## Opening a world you already have

Click **Open Folder** and pick any directory. If it already contains a
`worldSettings.json` it opens as that world. If it does not, the app adopts the
folder as a new world by writing that file into it — which means **any folder of
markdown files can become a world**, including an existing Obsidian vault.

## The recent worlds list

Worlds you have opened appear as cards showing the name, description and article
count. Click a card to open it. Hovering a card reveals two buttons:

- **Reveal in File Explorer** — opens the folder in Windows Explorer or Finder.
- **Remove from list** — forgets the world. The folder on disk is untouched.

The list holds your twenty most recent worlds and lives in the app's own config,
not in any world folder.

\page

\columns 1

# The World Screen

Once a world is open the screen has three parts: the **sidebar** on the left,
the article you are reading in the middle, and the **session panel** tucked
against the right edge.

The sidebar hides away when you want the room. Click the **panel icon** to the
left of the article or character name, or press `Ctrl+\`, and the article
gets the full width; the same icon brings it back. With nothing open the icon
sits in the app header instead. The app remembers which way you left it.

## The world header

Top left shows the world's name and description. Hover it for two buttons:

- **Pencil** — edit the name and description. This renames the *world*, not the
  folder on disk.
- **Gear** — jump to World Settings, where classes and subclasses live.

## Live external changes

The app watches the world folder while it is open. Edit an article in Obsidian,
pull a change in git, or let Dropbox sync something down, and it appears here
without a reload. If a file changes on disk *while you have unsaved edits to it*,
a banner offers **Reload from disk** or **Keep my version** — you are never
silently overwritten.

## Light and dark

The sun/moon button in the app header flips the theme, as does the
`Toggle light / dark theme` command in the palette. The choice is remembered.

Note that the parchment book pages deliberately ignore dark mode. Paper is paper.

## Updates

When a new version is published the app downloads it in the background and shows
**Restart to update** in the header. Click it and the app relaunches on the new
version.

\page

\columns 1

# Articles and the Tree

The **CONTENT** section of the sidebar is your world's file tree. Folders are
real directories and articles are real `.md` files, so the tree you see here is
exactly what you see in Explorer.

## Making things

Three buttons sit in the CONTENT header: **New article**, **New folder**, and
**Open the world folder**. New articles offer a grid of templates — see the
Templates chapter.

## Managing things

Every article and folder row has a `...` menu:

| On an article | On a folder |
| ------------- | ----------- |
| Rename | New article |
| Duplicate | New subfolder |
| Reveal in File Explorer | Rename |
| Delete | Reveal in File Explorer |
| | Delete |

**Renaming an article renames the file** and rewrites every wiki link pointing at
it across the entire world, so your links never rot.

## Moving things

Drag an article or folder onto another folder to move it. Drop it on the empty
space at the bottom of the tree to move it to the world root. The drop target
highlights as you drag over it.

## Searching

The search box above the tree searches titles and content as you type, showing a
snippet of each match. For a faster, ranked search across the whole world, use
the command palette instead.

## The library folders

Three folder names are special: `Characters`, `Spells` and `Monsters`. Articles
in them are hidden from the tree and from sidebar search, because they have
dedicated homes — the CHARACTERS list, the spell reference, and the bestiary.
They are still ordinary folders full of ordinary markdown files.

\page

\columns 1

# The Editor

Open any article and you get a title box, a toolbar, and two tabs: **Write** and
**Preview**.

## Saving

The editor autosaves a couple of seconds after you stop typing. The Save button
reads *Save*, *Saving…*, then *Saved*. Press `Ctrl+S` to save immediately.

The **title** is the filename, so it is treated more carefully than the body: it
is never autosaved. Press `Enter` or click away to commit a rename, or `Escape`
to put back what it was.

## The toolbar

| Button | What it does |
| ------ | ------------ |
| **Insert** | Drops a ready-made snippet at the cursor |
| **Tidy** | Reformats your markdown — aligns table pipes, normalises list markers and spacing. Leaves page and column markers alone |
| **Images** | Opens the world image library |
| **Export as PDF** | Renders the book pages and saves a PDF |
| **?** | The built-in formatting cheatsheet |
| **Reveal** | Shows the file in Explorer |
| **Delete** | Sends the article to the Recycle Bin |

The **Insert** menu offers: Table, Read-aloud box, Divider, Named roll, Stat
block, Portrait image, Page break, Single-column page, and a **Template**
submenu containing every article template.

## Preview and live preview

`Ctrl+P` flips between Write and Preview. On the Write tab there is also a **live
preview** toggle that splits the pane, editor on the left and book pages on the
right, updating as you type.

## Backlinks

The footer of every article lists **Mentioned in** — every other article that
wiki-links to this one. You never have to maintain it; it is derived from your
links.

\page

\columns 1

# Markdown Basics

Everything below is standard markdown. If you have used Obsidian or GitHub, you
already know this chapter.

## Headings

| You type | You get |
| -------- | ------- |
| `# Chapter title` | Large red chapter heading |
| `## Section` | Section heading with a gold underline |
| `### Subsection` | Smaller red heading |
| `#### Detail` | Bold italic, body-sized |
| `##### Smaller` | Small caps |
| `###### Smallest` | Tracked small caps |

## Emphasis

Type `**bold**` for **bold**, which renders in red like a Player's Handbook
keyword. Type `*italic*` for *italic*, and `~~struck~~` for ~~struck through~~.

Inline code uses backticks and renders as a red-tinted chip.

## Lists

Start lines with `-` for bullets or `1.` for numbers. Indent with `Tab` to nest.

- A bulleted item
- Another one
  - Nested underneath

1. First
2. Second

## Links

Type `[text](https://example.com)` for a normal link. External links open in your
system browser rather than inside the app.

## The drop cap

The paragraph immediately after a page's *first* `# heading` gets a large
decorative first letter. It only fires when the heading is the first thing on the
page and a paragraph follows it directly — put an image or a quote between them
and you lose it.

\page

\columns 1

# Flavour: Making It Look Like a Sourcebook

This is where the app stops being a text editor and starts being a book.

## Read-aloud boxes

A blockquote becomes the green boxed text you read out to your players. Type
`> Your text here` and you get:

> The door grinds open on a hall of black glass. Your torchlight finds a hundred
> reflections of your own face, and not all of them are moving in time with you.

## Dividers

Three dashes on their own line — `---` — draw a tapered gold divider:

---

## Tables

Standard markdown tables render Player's Handbook style: red header, gold rule,
green striped rows.

| Tavern | Ale | Reputation |
| ------ | --- | ---------- |
| The Rusted Crown | Cheap | Cheerfully criminal |
| The Gilded Lily | Overpriced | Respectable, allegedly |
| The Drowned Rat | Free | Earned |

If you paste a table from elsewhere and it arrives with blank lines between the
rows, the app stitches it back together for you.

## What it will not do

The renderer supports GitHub-flavoured markdown and nothing more exotic:

- **Raw HTML is stripped.** No `<div>`, no `<br>`, no `<span style="...">`.
- **No CSS classes.** There is no `{.class}` syntax and no Homebrewery-style
  curly-brace blocks.
- Task lists and footnotes parse, but have no styling on the parchment page.
- No math, no syntax highlighting.

\page

\columns 1

# Images

Images live in the `_images/` folder inside your world, which keeps them portable
— the whole world folder still works when you move it.

## Getting images in

Three ways, all equivalent:

- Click **Images** in the toolbar to open the library, then **Upload images**.
- **Paste** a screenshot straight into the editor.
- **Drag** an image file from Explorer into the editor.

Pasting and dragging upload the file and insert the markdown at your cursor in
one motion. Accepted types are png, jpeg, gif, webp and svg, up to 20 MB each.

## The image library

The **Images** button opens a two-pane browser with a folder tree on the left and
thumbnails on the right. You can create subfolders, drag images between them,
rename, delete, and reveal in Explorer.

**Renaming or moving an image updates every reference to it across the whole
world.** Your articles do not break.

## Referencing an image

Standard markdown: `![alt text](_images/Maps/city.png)`

The path must start with `_images/` — not `./_images/` and not `/_images/`. Typing
an `_images/` path in the editor pops up matching-path suggestions; `Tab` or
`Enter` accepts one.

## Size and placement

Options go after a `#` at the end of the path, joined by `&`:

| Option | Effect |
| ------ | ------ |
| `#left` `#right` `#center` | Float the image, text wraps around it |
| `#w=45%` `#w=300` | Width — bare numbers are pixels |
| `#h=200` `#h=50%` | Height |
| `#nowrap` or `#block` | Own line, no text wrapping |
| `#noframe` | Drop the plate frame — for transparent PNGs |

A full example: `![Map](_images/city.png#right&w=45%)`

Two things to know. Setting a **height** crops the image to fill rather than
squashing it. And `#width=` / `#height=` work as long forms if you prefer them.

\page

\columns 1

# Wiki Links

Linking articles together is the whole point of a worldbuilding notebook.

## The syntax

Type two square brackets around an article's title. In this guide the examples
are shown as code so they stay inert, but you type them without the backticks:

| You type | Result |
| -------- | ------ |
| `[​[Waterdeep]]` | Links to the article titled Waterdeep |
| `[​[Waterdeep \| the City of Splendors]]` | Same link, different words shown |

Titles match **case-insensitively**, so lowercasing the title still finds it.

## Autocomplete

Typing the opening brackets pops up a list of article titles. Arrow keys to move,
`Tab` or `Enter` to accept, `Escape` to dismiss.

There is also a gesture worth learning: **select a word and press the left
bracket key twice**. The selection becomes a wiki link. Select `Strahd`, tap the
bracket twice, done.

## Broken links

A link to an article that does not exist yet renders with a dashed underline.
**Click it in Preview** and you get a dialog offering the full template grid —
name it, pick a template, and the article is created and linked.

This is the fastest way to build a world. Write your session notes, bracket every
proper noun as you go, then click the dashed ones later to fill them in.

## What does not work

- **No folder links.** A wiki link resolves against article titles only.
- **No heading anchors.** There is no jump-to-section syntax.
- The title inside the brackets cannot contain `[`, `]` or `|`.

## Backlinks

Every article's footer lists **Mentioned in** — everything that links to it. Rename
an article and all inbound links are rewritten automatically.

\page

\columns 1

# Dice

Any dice notation you type becomes a clickable chip. Click it to roll; hover the
result to see the individual dice. Every roll is logged in the roll history panel
with a link back to the article it came from.

## Just type it

Write damage the way you would write it anywhere: 2d6+3 slashing, or a straight
d20 for the attack, or 1d8-1 if something is going badly for you.

Those three are live. Click them.

## Named rolls

Wrap a name around the notation to label it:

[Short Sword](1d20+5)

That is typed as `[Short Sword](1d20+5)`. The chip shows the name and the
notation, and the roll history logs the name — much easier to read back than a
column of anonymous d20s.

## Secret rolls

Add `#hidename` to hide the label on the chip while still logging it:

[Ambush Perception #hidename](1d20+7)

The chip shows only the dice, so a player reading over your shoulder learns
nothing, but your history says what it was for.

## The rules of the notation

| Works | Does not work |
| ----- | ------------- |
| `2d6+3` `d20` `1d8-1` | `2d6 + 3` — no spaces |
| Up to 99 dice | `100d6` — count is two digits max |
| 2 to 1000 sides | `2d6+1d4` — one modifier only |
| One `+` or `-` modifier | `2d20kh1` — no advantage syntax |

There is no advantage, disadvantage, keep-highest or exploding-dice notation. For
advantage, click the same chip twice and take the result you like.

Dice inside `code spans` and fenced blocks stay inert, which is how this guide
shows you the syntax without every example rolling itself.

\page

\columns 1

# Rollable Tables

Give a table a dice-notation header and it grows a **Roll** button that picks a
row for you.

## The format

The **first header cell** must be exactly dice notation — `d100`, `d20`, `d6` —
and nothing else. The **second header cell** names the roll in your history.

| d20 | Rumour in the Rusted Crown |
| --- | -------------------------- |
| 1-4 | The miller's daughter has been seen walking the millpond at night. Both of them drowned last spring. |
| 5-9 | A tax collector went up the north road a month ago and something else came back wearing his coat. |
| 10-14 | There is a door in the cellar of the temple that the clergy have bricked over twice. |
| 15-18 | The baron pays in old coin. Very old coin. Nobody will say whose face is on it. |
| 19 | A wizard's tower appeared in the eastern fields. It was not there on Tuesday. |
| 20 | Everything is fine. This is the most alarming answer on this table. |

Click the **Roll** button above the table. The winning row highlights in gold.

## Row syntax

First-column cells must be a bare number or a range:

- `7` — a single number
- `1-4` — a range with a hyphen
- `01-20` — leading zeros are fine
- `21–50` — en dashes and em dashes work too

Anything else in that cell simply never matches. No error, no warning.

## The zero trap

A d100 rolls **1 to 100**, not 0 to 99. If you write a row as `00` it can never
be selected. Write `100` instead. This catches people who have copied tables out
of older books where `00` meant one hundred.

\page

\columns 1

# Stat Blocks

A fenced code block tagged `statblock` renders as a full monster card, with dice
that stay clickable.

```statblock
name: Bandit Captain
size: Medium humanoid, any non-lawful alignment
ac: 15
hp: 65 (10d8 + 20)
speed: 30 ft.
str: 15
dex: 16
con: 14
int: 14
wis: 11
cha: 14
cr: 2 (450 XP)
Skills: Athletics +5, Deception +4
Senses: passive Perception 10
Languages: Any two languages
---
**Parry.** The captain adds 2 to its AC against one melee attack that would hit
it. To do so, the captain must see the attacker and be wielding a melee weapon.

## Actions

**Scimitar.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target.
*Hit:* 6 (1d6 + 3) slashing damage.

**Dagger.** *Ranged Weapon Attack:* +5 to hit, range 20/60 ft., one target.
*Hit:* 5 (1d4 + 3) piercing damage.
```

Click the damage on those attacks — it rolls, mid-combat, right where you are
reading.

## Writing one

Open a fence with three backticks followed by `statblock`, write `key: value`
lines, then a `---` line, then the traits and actions as normal markdown.

Recognised keys: `name`, `size`, `type`, `subtitle`, `image`, `ac`, `hp`,
`speed`, `cr`, `xp`, and the six abilities `str` `dex` `con` `int` `wis` `cha`.

**Any other `key: value` line becomes an extra row**, keeping your capitalisation
— that is how `Skills:`, `Senses:` and `Languages:` above got there. Use whatever
rows you need.

## Details worth knowing

- Write `cr: 2` and the XP is looked up for you. Write `cr: 2 (450 XP)` to
  override it.
- `image: _images/goblin.png` puts a portrait on the card. Add `#noframe` if it
  has a transparent background.
- **Always include the `---` line.** Without it, the first line of prose
  containing a colon gets mistaken for a field.
- A key with an empty value is dropped silently.

\page

\columns 1

# Pages and Columns

Preview does not scroll like a web page. It lays your article out on fixed
US-Letter sheets, two columns each, exactly as it will print.

## Automatic breaks

When your content outgrows a sheet it flows onto another one by itself. You never
have to manage this. It works the same in Preview, in print, and in PDF export.

## Forcing a break

Put `\page` alone on a line to start a new sheet there. Every chapter of this
guide is separated by one.

## Changing the column count

Put `\columns 1` on a line to make that page single-column, or `\columns 2` for
the default two. Single column suits title pages, big maps, and wide tables.

The marker applies to the whole page it appears on, so put it at the top.

## The rules

- Both markers must be **alone on their own line**.
- Only `1` and `2` are valid column counts.
- These are the only two markers. Other Homebrewery commands do not exist here.

## Getting it out of the app

**Export as PDF** in the toolbar renders every sheet and saves a multi-page PDF,
with the roll buttons stripped out so it looks like a printed book.

**Ctrl+P** from the Preview tab opens your system print dialog and prints one
book page per sheet, colours intact.

\page

\columns 1

# Characters

An article with `type: character` in its frontmatter is a character sheet. The
sidebar lists them under **CHARACTERS**, and clicking one opens the sheet manager
rather than the raw markdown.

Make one with **New character** in the sidebar, or the palette command, or by
picking the Player Character template.

## The header

Name, Race, Class, Subclass, Level, Background, Alignment and XP sit across the
top of every tab. Class and subclass are free text with suggestions drawn from
your world settings — homebrew is always allowed. Picking a known class sets its
hit die for you.

## The tabs

**Sheet** — the main event. Ability scores with roll chips, saving throws,
skills, combat stats, hit dice, death saves, proficiencies, damage defenses,
attacks, spellcasting and currency.

Two controls are worth calling out because they are not obvious: **skill dots
cycle** through none, proficient, and expertise as you click them, and **defense
dots cycle** through none, resistant, immune, and vulnerable.

**Inventory** — items with quantity and weight, split into Equipped and Pack. It
tracks attunement against your three slots, and optionally carry weight using the
5e variant encumbrance rules, complete with a meter and the resulting speed
penalty. Use wiki links for magic item names so they link to their articles.

**Equipment** — a paper doll with eleven slots. Click a slot to see what fits.

**Features** — racial traits, feats and class features in one filterable list.
Features above your current level are dimmed and marked as not yet gained.

**Notes** — session notes with dates and tags, searchable and filterable.

**Backstory** — plain markdown with all the usual formatting.

**Preview** — the printed parchment sheet, paginated across as many pages as your
character needs. Nothing is ever silently cut off.

## Spells

The spell section tracks prepared spells against your limit, shows always-prepared
domain spells separately, and gives each spell a **Cast** button that spends a
slot and rolls the damage. Upcasting is a dropdown on the cast button.

Adding a spell whose article does not exist creates one in `Spells/` for you.

\page

\columns 1

# DM Tools: The Session Panel

The narrow rail on the right edge of the window opens five tools. Each shows a
dot when it has something in it, and the panel remembers what you had open.

## Initiative

Add combatants by name, initiative, HP and AC. Names autocomplete against your
article titles and link through to them, so the goblin in your tracker is one
click from the goblin in your bestiary.

Rows sort themselves, the active combatant highlights, and **Next turn** advances
and counts rounds. Damage and healing are the `-` and `+` buttons or by typing
directly in the HP box. At zero HP a combatant is struck through and marked down.

The tracker saves into the world folder, so a session in progress survives
closing the app.

## Encounter Builder

Pick monsters from your bestiary and party members from your characters, and it
rates the encounter live as trivial, easy, medium, hard or deadly using the 5e
XP thresholds and multipliers.

**Run encounter** pushes the whole thing into the initiative tracker, rolling
initiative for each monster from its DEX, pulling HP and AC from the stat blocks
and character sheets, and logging every roll.

## Roll History

Every roll from anywhere in the app, newest first, with the name, notation,
total, individual dice, how long ago, and a link back to its source article. If
rolls came from several articles you get a source filter.

## Spells and Bestiary

The **spell reference** is every article in your `Spells/` folder, searchable and
expandable inline with live dice. The **bestiary** is every article in `Monsters/`
or carrying `type: monster`, showing full stat blocks you can roll from mid-combat.

Both have a box at the bottom to create a new one by name. The bestiary flags any
monster missing its `type: monster` frontmatter with an amber warning, because the
encounter builder cannot see those.

\page

\columns 1

# Smart Views and Tags

Smart views are saved searches that live in the sidebar and update themselves.

## Making one

Click **+** next to SMART VIEWS, give it a name, and write a query.

## The query syntax

Space-separated `key:value` tokens:

| Token | Matches |
| ----- | ------- |
| `type:monster` | Articles whose frontmatter type is monster |
| `tag:undead` | Articles tagged undead |
| `undead` | A bare word is treated as a tag |
| `region:Barovia` | Any frontmatter field |
| `tag:a,b` | Several tags at once |

Combine them freely: `type:npc tag:noble region:Barovia` finds noble NPCs in
Barovia. Tokens are ANDed together.

The parser is forgiving — it strips quotes and square brackets, so pasting
`tag:["undead"]` straight out of your YAML works fine.

## Where tags come from

Tags are a frontmatter field. Every non-blank template starts an article with an
empty `tags: []` line ready for you to fill in:

```
---
type: npc
tags: [noble, barovia, alive]
---
```

## Finding out what tags exist

Open the palette with `Ctrl+K` and type `#`. You get every tag in the world with
a count of how many articles use it. This is the only place that list exists, so
it is worth knowing about.

Smart views are stored inside the world folder, so they travel with it.

\page

\columns 1

# Templates and Frontmatter

Templates give a new article a useful skeleton, and frontmatter is the small
block of data at the top that makes it findable. Together they are what turn a
pile of notes into something you can query.

## Frontmatter

The block of YAML between `---` lines at the very top of a file is frontmatter.
It is **data, not prose** — it never renders on the page. It drives smart views,
the encounter builder, the character sheet and the bestiary.

It must be the *very first thing* in the file. One consequence worth knowing: do
not start an article with a `---` divider, because it will be mistaken for the
opening of a frontmatter block.

## The templates

Every template except Blank starts your article with a `type:` and an empty
`tags: []`, so new articles are queryable from birth.

| Template | For | Type |
| -------- | --- | ---- |
| Blank | Starting from nothing | — |
| Spell | The world spell library | `spell` |
| Player Character | A full 5e sheet | `character` |
| Location | Cities, dungeons, regions | `location` |
| Character Portrait | Portrait with text wrapping around it | `npc` |
| NPC | Someone with goals and secrets | `npc` |
| Monster / Creature | A full stat block | `monster` |
| Magic Item | Artifacts and wondrous items | `item` |
| Faction | Guilds, cults, kingdoms | `faction` |
| Quest / Adventure | Hooks, scenes, rewards | `quest` |
| Session Notes | Recaps and running threads | `session` |

Templates appear in three places: the New article dialog, the editor's
**Insert > Template** submenu, and the dialog you get when you click a broken
wiki link.

## World Settings

The gear icon by the world name opens **Classes**. Here you define the classes
offered as suggestions on character sheets, each with a hit die, a label for its
subclasses — *Sacred Oath*, *Circle*, *Patron* — and the list of subclasses.

**Reset to PHB** restores the twelve standard classes. Class and subclass on a
character remain free text regardless, so renaming or deleting a class here never
touches an existing character; it just stops suggesting it.

The file behind this is `worldSettings.json` in your world folder, and it is safe
to hand-edit.

\page

\columns 1

# Keyboard Shortcuts

**Windows and Mac use the same keys.** Everywhere this guide says `Ctrl`, the
`Cmd` key works identically — and on a Mac, `Ctrl` works too.

## Everywhere in a world

| Key | Action |
| --- | ------ |
| `Ctrl+K` | Open the command palette |
| `Ctrl+N` | New article |
| `Ctrl+S` | Save now — in the article editor and on character sheets |
| `Ctrl+P` | Switch between Write and Preview — article editor only |
| `Ctrl+\` | Show or hide the left sidebar |

## In any markdown box

| Key | Action |
| --- | ------ |
| `Ctrl+B` | Bold — press again to unbold |
| `Ctrl+I` | Italic |
| `Ctrl+E` | Inline code |
| `Ctrl+Shift+K` | Insert a markdown link |
| `Ctrl+Shift+L` | Wrap the selection in `[[ ]]` as a wiki link |
| `Ctrl+D` | Insert a `1d20+5` roll |
| `Ctrl+T` | Insert a table |
| `Ctrl+R` | Add a row to the table you are in |
| `Tab` / `Shift+Tab` | Indent / outdent a list item |

Undo and redo work normally throughout — the formatting shortcuts do not break
your undo history.

## Typing gestures

With text selected, typing any of `[` `(` `{` `"` `'` `*` `_` or a backtick wraps
the selection instead of replacing it. **Press `[` twice to turn a selected word
into a wiki link.**

## In the command palette

| Key | Action |
| --- | ------ |
| Arrow keys | Move through results |
| `Enter` | Open or run |
| `Escape` | Close, returning focus where it was |

Type nothing to search articles. Type `>` for commands, `#` to browse tags, `?`
for help. The commands are: New article, New folder, New character, World
settings, Reveal world folder in Explorer, Toggle light / dark theme, Clear roll
history, Go to worlds home.

## In autocomplete popups

Arrow keys move, `Tab` or `Enter` accepts, `Escape` dismisses. This applies to
both the wiki-link and the image-path suggestions.

## In forms

`Enter` commits a title, `Escape` reverts it. `Ctrl+Enter` submits the Features
and Notes composers on a character sheet.

## Two surprises

`Ctrl+R` in a markdown box **adds a table row** rather than reloading the app.

`Ctrl+N` works even while you are typing in a text box, so it will open the new
article dialog mid-sentence.

\page

\columns 1

# Working With the Files Directly

Nothing here is locked away. This chapter is about the folder on your disk.

## What is in a world folder

```
My World/
  worldSettings.json    name, description, homebrew classes
  Fens Crossing.md      an article at the root
  NPCs/                 a folder is a directory
    Strahd.md
  Characters/           character sheets
  Spells/               the spell library
  Monsters/             the bestiary
  _images/              the image library
    Maps/
      city.png
  .dm/                  session state and smart views
```

`worldSettings.json` is what marks a folder as a world. Everything else is
optional and created as you need it.

## Obsidian and other editors

Because articles are plain markdown with standard wiki links, a world folder opens
in Obsidian as a vault and works. Edit there and the changes appear here live.

Two things to keep portable: reference images as `_images/...` relative paths, and
remember that the page and column markers are specific to this app — Obsidian will
show them as literal text rather than breaking pages.

## Version control

A world folder is text, so git works beautifully on it. You get a real history of
your campaign and a diff of what changed between sessions.

## Deleting

Every delete goes to your operating system's Recycle Bin. Deleting an image leaves
the references to it in your articles alone, so you can put it back.

## Backups

Copy the folder. That is the whole backup procedure.

---

> That is everything. Now go and write something with a dragon in it.
