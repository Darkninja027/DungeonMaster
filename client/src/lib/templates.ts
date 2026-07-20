export interface ArticleTemplate {
  id: string
  name: string
  description: string
  body: string
}

export const articleTemplates: Array<ArticleTemplate> = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from nothing',
    body: '',
  },
  {
    id: 'location',
    name: 'Location',
    description: 'City, dungeon, region, or landmark',
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
    id: 'npc',
    name: 'NPC',
    description: 'A character with goals and secrets',
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
    body: `# Creature Name

*Size type, alignment*

| Stat | Value |
| ---- | ----- |
| Armor Class | 12 |
| Hit Points | 22 (4d8 + 4) |
| Speed | 30 ft. |
| Challenge | 1 (200 XP) |

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 11 (+0) | 8 (-1) |

**Senses** darkvision 60 ft., passive Perception 10
**Languages** Common

## Traits

**Trait Name.** Description of the trait.

## Actions

**Attack Name.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) damage.

## Tactics & Lore

How it fights, where it lives, what it fears.
`,
  },
  {
    id: 'item',
    name: 'Magic Item',
    description: 'Artifact, weapon, or wondrous item',
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
