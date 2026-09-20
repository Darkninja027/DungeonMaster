/**
 * Where a template in a merged list came from: shipped and untouched, a
 * built-in the user has edited, or one they wrote themselves. Decides whether a
 * row offers "Reset to built-in", a delete, or neither.
 */
export type TemplateOrigin = 'built-in' | 'override' | 'user'

export interface ArticleTemplate {
  /**
   * Stable identity. For a built-in this is a hand-authored constant that code
   * depends on (`'spell'`); for a user template it is slugged from the name
   * once, at creation. See BUILT_IN_TEMPLATES on why these must never be
   * renamed.
   */
  id: string
  name: string
  description: string
  body: string
  /**
   * Article `type` for the frontmatter of new articles made from this template.
   * Omitted for Blank (stays empty) and for templates whose body already
   * carries its own frontmatter (spell, character).
   */
  type?: string
  /**
   * Stamped by `mergeTemplates` and never stored. Drives the settings list's
   * badges and which of reset/delete a row offers; nothing else should branch
   * on it.
   */
  origin?: TemplateOrigin
  /**
   * Hidden from every **picker**, and from nothing else. `findTemplate(id)`
   * still returns it, because the bestiary, the spell panel and the character
   * wizard create articles from specific templates by id — hiding one is a
   * choice about menus, not a deletion.
   */
  hidden?: boolean
}

/**
 * Placeholders a template body may use, substituted when a caller has values
 * for them. An unsubstituted placeholder is left **verbatim**, so a template
 * carrying one still reads sensibly in a hand-created article — it looks like
 * the blank it is.
 *
 * This exists because the character sheet's add-spell used to string-patch the
 * literal text `level: 1` out of the spell template's body. That worked only
 * while the template was a compiled-in constant nobody could touch. Now that it
 * is editable, a rewritten spell template would have silently stopped stamping
 * levels — no error, just every spell filed at level 1 forever.
 */
export function fillPlaceholders(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  )
}

/**
 * The starting content for a new article made from a template. When the
 * template has a `type` and its body has no frontmatter of its own, a metadata
 * header (`type:` + an empty `tags:` list, ready to fill in) is prepended so
 * every non-blank article is born queryable — no hand-written YAML, no typos.
 */
export function newArticleContent(template: ArticleTemplate): string {
  const hasFrontmatter = /^---\r?\n/.test(template.body)
  if (!template.type || hasFrontmatter) return template.body
  return `---\ntype: ${template.type}\ntags: []\n---\n\n${template.body}`
}

/**
 * The templates the app ships with, and the guaranteed floor under whatever the
 * user does to them.
 *
 * Renamed from `articleTemplates` deliberately: this is the *built-in tier*,
 * not the list any picker should render. A picker renders the merged list from
 * lib/templateStore.ts — reaching for this array directly is the bug the name
 * exists to make visible.
 *
 * **The ids here are a public contract.** Four call sites look up `spell`,
 * `character` and `monster` by id, and every stored override names the built-in
 * it overrides by id. Add freely; never rename, never remove — a rename orphans
 * every override of that template and breaks a call site silently.
 */
export const BUILT_IN_TEMPLATES: Array<ArticleTemplate> = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from nothing',
    body: '',
  },
  {
    id: 'spell',
    name: 'Spell',
    description: 'A spell for the world spell library (Spells folder)',
    body: `---
type: spell
level: "{{level}}"
damage: ""
damagePerLevel: ""
---

# Spell Name

*{{levelLabel}} evocation*

| | |
| --- | --- |
| **Casting Time** | 1 action |
| **Range** | 60 feet |
| **Components** | V, S |
| **Duration** | Instantaneous |

What the spell does. Damage like 3d6 becomes a clickable roll.

**At Higher Levels.** What changes when cast with a higher-level slot.
`,
  },
  {
    id: 'character',
    name: 'Player Character',
    description: 'Blank 5e sheet — use the Characters + button to be guided',
    /*
     * Deliberately blank rather than a pre-statted example. This is what
     * "Skip setup" in the creation wizard produces, and skipping should
     * mean an empty sheet — not somebody else's level 1 fighter to
     * delete first. Generated from `emptyCharacter()` so it stays in step
     * with the parser.
     */
    body: `---
type: character
class: ""
subclass: ""
level: 1
race: ""
background: ""
alignment: ""
xp: 0
abilities:
  str: 10
  dex: 10
  con: 10
  int: 10
  wis: 10
  cha: 10
saves: []
skills: []
expertise: []
armor: []
weapons: []
tools: []
languages: []
resistances: []
immunities: []
vulnerabilities: []
conditionImmunities: []
ac: 10
initiativeBonus: 0
speed: 30
hp:
  current: 10
  max: 10
  temp: 0
hitDice:
  size: 8
  used: 0
deathSaves:
  success: 0
  fail: 0
attacks: []
traits: []
feats: []
features: []
spellAbility: null
spellSlots: {}
spells: []
preparedLimit: 0
currency:
  cp: 0
  sp: 0
  ep: 0
  gp: 0
  pp: 0
inventory: []
encumbrance:
  enabled: false
  countCoins: true
attunementSlots: 3
notes: []
---

# Character Name

Backstory, bonds, ideals, and flaws go here — plain markdown, wiki-links
like [[Home Town]] welcome.
`,
  },
  {
    id: 'location',
    name: 'Location',
    description: 'City, dungeon, region, or landmark',
    type: 'location',
    body: `# Location Name

> Read-aloud: what the party sees, hears, and smells when they first arrive.

*Region · Settlement type · Population*

## Overview

What this place is, who holds power here, and why it matters to the world.

## Notable Places

| Place | Description |
| ----- | ----------- |
| The Rusted Crown | Tavern — cheap ale, expensive secrets |
| Temple of the Veil | Clergy hostile to outsiders |
| The Undermarket | Black market below the docks |

## Key NPCs

| Name | Role | Wants |
| ---- | ---- | ----- |
| ... | ... | ... |

## Adventure Hooks

- Something is wrong here that the locals won't talk about.
- A faction wants the party to do something quietly.

## Secrets & GM Notes

Things the players don't know yet. What's really going on beneath the surface.
`,
  },
  {
    id: 'portrait',
    name: 'Character Portrait',
    description: 'Portrait image with the story wrapping around it',
    type: 'npc',
    body: `\\columns 1

# Character Name

![Portrait — replace with your own image](https://placehold.co/440x560/8a7a5c/2b2117?text=Portrait#right&w=45%)

*Race · Class or occupation · Alignment*

Introduce them here. This text fills the space beside the portrait — keep
writing and it wraps naturally around the image. Describe how they carry
themselves, what people notice first, and the rumor that follows them into
every room.

## Story

Where they came from, what shaped them, and the wound or triumph that still
drives them today.

## At the Table

- **Voice & mannerisms:**
- **What they want from the party:**
- **What they'll never admit:**
`,
  },
  {
    id: 'npc',
    name: 'NPC',
    description: 'A character with goals and secrets',
    type: 'npc',
    body: `# NPC Name

*Race · Class or occupation · Alignment*

> First impression: how they look, sound, and carry themselves when the party meets them.

## Appearance & Mannerisms

Distinctive features, dress, a verbal tic or habit to roleplay.

## Personality

- **Ideal:**
- **Bond:**
- **Flaw:**

## Goals

What they want, what they'll do to get it, and what they won't.

## Relationships

| Name | Relationship |
| ---- | ------------ |
| ... | Ally / rival / debt owed |

## Secrets

What they're hiding. What happens if it comes out.

## Stats

Use a standard stat block, or note: *use the stats of a [creature] (MM p.XXX)*.
`,
  },
  {
    id: 'monster',
    name: 'Monster / Creature',
    description: 'Full stat block layout',
    type: 'monster',
    body: `# Creature Name

\`\`\`statblock
name: Creature Name
size: Medium humanoid, neutral evil
image: _images/your-image.png
ac: 12
hp: 22 (4d8 + 4)
speed: 30 ft.
str: 10
dex: 14
con: 12
int: 10
wis: 11
cha: 8
cr: 1 (200 XP)
Senses: darkvision 60 ft., passive Perception 10
Languages: Common
---
**Trait Name.** Description of the trait.

## Actions

**Attack Name.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) damage.
\`\`\`

## Tactics & Lore

How it fights, where it lives, what it fears.
`,
  },
  {
    id: 'item',
    name: 'Magic Item',
    description: 'Artifact, weapon, or wondrous item',
    type: 'item',
    body: `# Item Name

*Wondrous item, rarity (requires attunement)*

> What the item looks like in the hand — materials, weight, the way it hums or glows.

## Properties

| Property | Effect |
| -------- | ------ |
| ... | ... |

## History

Who made it, why, and how it was lost.

## Complications

A curse, a cost, or a faction that wants it back.
`,
  },
  {
    id: 'faction',
    name: 'Faction',
    description: 'Guild, cult, kingdom, or company',
    type: 'faction',
    body: `# Faction Name

*Symbol · Motto · Sphere of influence*

## Purpose

What the faction exists to do — publicly, and actually.

## Leadership & Structure

| Rank | Held by | Notes |
| ---- | ------- | ----- |
| ... | ... | ... |

## Assets

Strongholds, resources, leverage, and reach.

## Relationships

| Faction | Standing |
| ------- | -------- |
| ... | Allied / cold war / open hostility |

## Current Schemes

What they are doing *right now* that the party might collide with.
`,
  },
  {
    id: 'quest',
    name: 'Quest / Adventure',
    description: 'Hook, scenes, and rewards',
    type: 'quest',
    body: `# Quest Name

*Level range · Expected sessions · Location*

## Hook

> How the party learns about this — the notice, the plea, the rumor in the tavern.

## Background

What actually happened, and who is responsible.

## Scenes

1. **Opening** — where it starts and what pushes the party in.
2. **Complication** — the twist that changes what they thought they knew.
3. **Climax** — the confrontation, and how it can go wrong.

## Key NPCs & Enemies

| Name | Role |
| ---- | ---- |
| ... | ... |

## Rewards

- Gold, items, favors, and information.

## Consequences

What changes in the world if they succeed. What happens if they fail or walk away.
`,
  },
  {
    id: 'session',
    name: 'Session Notes',
    description: 'Recap and running threads',
    type: 'session',
    body: `# Session N — Title

*Date played:*

## Recap

What happened, in the order it happened.

## Loot & Rewards

- ...

## NPCs Met

| Name | Where | Impression |
| ---- | ----- | ---------- |
| ... | ... | ... |

## Open Threads

- Unresolved hooks, promises made, enemies left alive.

## Next Session Prep

What to prepare before the next game.
`,
  },
]
