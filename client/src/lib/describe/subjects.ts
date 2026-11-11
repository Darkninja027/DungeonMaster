/**
 * The Describe panel's content: per-subject writing prompts and rollable
 * detail tables for building, people, settlement and landscape descriptions.
 *
 * This is an **affordance**, the same way `lib/srd/` is — the panel offers a
 * detail and the DM takes it, rewrites it or ignores it. Nothing here is ever
 * written to disk except as the plain text the DM chose to insert, so a world
 * folder never depends on these tables existing.
 *
 * All text is original to this app. Entries are written as fragments that drop
 * into a sentence ("the smell of …"), not as finished prose, because a rolled
 * line of finished prose is exactly the boilerplate players learn to tune out.
 */

import { splitFrontmatter } from '../formatMarkdown'
import { BUILDING_SUBJECTS } from './buildings'

export interface DetailTable {
  /** Unique within its subject; React key and roll-state key. */
  id: string
  label: string
  entries: ReadonlyArray<string>
}

export type SubjectGroup =
  | 'Buildings'
  | 'Homes'
  | 'Shops & trades'
  | 'Inns & leisure'
  | 'Religious'
  | 'Civic & military'
  | 'Working buildings'
  | 'Underground'
  | 'People'
  | 'Settlements'
  | 'Landscapes'

/** Display order of the built-in subjects' optgroups. */
export const SUBJECT_GROUPS: ReadonlyArray<SubjectGroup> = [
  'Buildings',
  'Homes',
  'Shops & trades',
  'Inns & leisure',
  'Religious',
  'Civic & military',
  'Working buildings',
  'Underground',
  'People',
  'Settlements',
  'Landscapes',
]

export interface DescribeSubject {
  /** Globally unique; remembered in localStorage as the last-used subject. */
  id: string
  label: string
  /**
   * Picker optgroup. Plain string rather than `SubjectGroup` because a DM's
   * own lists (see `details.ts`) can invent groups; `SUBJECT_GROUPS` is only
   * the built-ins' display order.
   */
  group: string
  /** The questions a good description of this kind of thing answers. */
  prompts: ReadonlyArray<string>
  tables: ReadonlyArray<DetailTable>
  /**
   * Frontmatter `type:` values this subject is the natural default for, so an
   * NPC article opens the panel on the NPC subject. First match wins.
   */
  types?: ReadonlyArray<string>
}

/**
 * Advice that holds for every subject. Short on purpose: it sits above the
 * prompts and has to be readable at a glance mid-session.
 */
export const CRAFT_TIPS: ReadonlyArray<string> = [
  'Lead with the single strongest impression, not an inventory.',
  'Three vivid details beat ten adequate ones.',
  'Use a sense other than sight at least once.',
  'Give one thing that moves, and one that hints at a story.',
  'End on something the players can touch, take or ask about.',
  'Read it aloud: if it takes over 30 seconds, cut it.',
]

// ---------------------------------------------------------------------------
// Shared tables. Reused verbatim by several subjects; a subject that wants its
// own flavour authors its own instead of filtering these.
// ---------------------------------------------------------------------------

const LIGHT_OUTDOORS: DetailTable = {
  id: 'light',
  label: 'Light & time',
  entries: [
    'grey pre-dawn light that flattens every colour',
    'low morning sun throwing long, cold shadows',
    'flat noon glare with nowhere to hide from it',
    'golden late-afternoon light catching the dust',
    'a bruised sunset of orange and violet',
    'blue dusk, the first lamps and stars coming out',
    'full moonlight bright enough to cast shadows',
    'a starless dark where sound carries for miles',
    'light filtered green and gold through leaves',
    'a sky so overcast the hour is impossible to guess',
    'shafts of sun breaking through after rain',
    'the eerie orange glow of a distant fire',
  ],
}

const WEATHER: DetailTable = {
  id: 'weather',
  label: 'Weather',
  entries: [
    'a fine, soaking drizzle that never quite becomes rain',
    'a hard wind that snatches words away',
    'thick fog that swallows anything beyond thirty feet',
    'sullen heat, the air heavy and buzzing with insects',
    'crisp cold that makes breath smoke and noses run',
    'a sudden squall, then sun as if nothing happened',
    'thunder rolling somewhere behind the hills',
    'still, clear air where every sound is sharp',
    'snow falling in fat, silent flakes',
    'a warm wind that smells of rain still miles off',
    'sleet driven sideways into faces',
    'hazy sky and a sun like a copper coin',
  ],
}

const SOUNDS_OUTDOORS: DetailTable = {
  id: 'sound',
  label: 'Sound',
  entries: [
    'birdsong that stops all at once',
    'the creak of branches rubbing together',
    'water somewhere close, unseen',
    'a distant bell, too far to place',
    'insects droning in long waves',
    'a single crow calling, over and over',
    'wind hissing through long grass',
    'an animal crashing away through cover',
    'a silence so complete it feels deliberate',
    'stones clicking underfoot as something shifts',
    'far-off barking, answered by more barking',
    'a voice carried on the wind, words lost',
  ],
}

const ODDITIES: DetailTable = {
  id: 'oddity',
  label: 'Something odd',
  entries: [
    'a fresh set of footprints that simply stop',
    'a ring of mushrooms around a bare circle',
    'a cairn with a new stone on top',
    'a scrap of bright cloth caught on a thorn',
    'a dead animal, untouched by scavengers',
    'a carved face, weathered almost smooth',
    'a cold spot that has nothing to do with shade',
    'smoke rising where nobody should be living',
    'an old boundary marker for a realm that no longer exists',
    'a lone tree that does not belong to this climate',
    'a well-tended grave with no name on it',
    'tracks of something with too many legs',
  ],
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const BUILDING_EXTERIOR: DescribeSubject = {
  id: 'building-exterior',
  label: 'Building exterior',
  group: 'Buildings',
  types: ['location'],
  prompts: [
    'What is it built from, and how well?',
    'How old is it, and how has it been kept?',
    'What is its silhouette from a distance?',
    'Where is the way in, and is it welcoming?',
    'What signs of the people inside can you see from out here?',
    'What has been added, patched or taken away over the years?',
  ],
  tables: [
    {
      id: 'material',
      label: 'Built from',
      entries: [
        'honey-coloured stone gone dark at the base with damp',
        'whitewashed wattle and daub, flaking in patches',
        'black-tarred timber, the grain still visible',
        'red brick laid in a tight herringbone',
        'rough fieldstone with moss in every joint',
        'river-smooth cobbles set in thick mortar',
        'grey slate, split and stacked without mortar',
        'pale marble, cracked and stained by rain',
        'salvaged ship timbers, still curved',
        'mud brick baked hard and sun-bleached',
        'carved and painted wood, every beam decorated',
        'a mix of three different eras of masonry',
      ],
    },
    {
      id: 'condition',
      label: 'Condition',
      entries: [
        'freshly painted, too clean for the street it is on',
        'sagging at one corner as if it is tired',
        'patched with mismatched boards and canvas',
        'scrubbed doorstep, polished brass knocker',
        'scorch marks above the windows from an old fire',
        'ivy that has been allowed to take a whole wall',
        'shutters nailed closed on the upper floor',
        'scaffolding that has clearly been up for years',
        'graffiti half scrubbed away',
        'a new wing that does not match the old one',
        'a roof missing tiles, buckets visible through a window',
        'built to last centuries and looking like it might',
      ],
    },
    {
      id: 'roof',
      label: 'Roof & outline',
      entries: [
        'steep thatch pulled low over small windows',
        'a crooked chimney leaning out over the street',
        'a single squat tower with an iron weathervane',
        'a flat roof crowded with washing and pot plants',
        'green copper domes streaked with verdigris',
        'overhanging upper storeys that almost touch the house opposite',
        'a slate roof with a rooster weathercock',
        'gables carved into dragon heads',
        'a bell cupola with no bell in it',
        'stepped gables like a staircase',
        'turf roof with grass and wildflowers growing on it',
        'a rooftop garden spilling vines down the walls',
      ],
    },
    {
      id: 'door',
      label: 'Entrance',
      entries: [
        'a heavy oak door studded with iron',
        'a curtain of clicking wooden beads',
        'a narrow door up three worn steps',
        'double doors propped open with a barrel',
        'a door painted a startling blue',
        'a gate in a wall rather than a door in a building',
        'a low door that forces everyone to stoop',
        'a door with three different locks, all new',
        'an arched doorway with a carved lintel',
        'a side entrance that is clearly the one locals use',
        'a doorway hung with charms against ill luck',
        'a door with a spy-slot at eye height',
      ],
    },
    {
      id: 'detail',
      label: 'Telling detail',
      entries: [
        'a sign hung upside down, deliberately',
        'a cat asleep on the windowsill, watching anyway',
        'fresh flowers in the window boxes, everything else neglected',
        'boot-scrapers worn to slivers by decades of use',
        'a bricked-up window with a face carved in the bricks',
        'a plaque naming a founder nobody remembers',
        'a hitching post with a horse that looks expensive',
        'a pile of crates being unloaded in a hurry',
        'a guard who is clearly bored, and armed',
        'muddy pawprints far too large for a dog',
        'a notice nailed to the door, recently torn down',
        'light in an upstairs window that goes out as you look',
      ],
    },
  ],
}

const BUILDING_INTERIOR: DescribeSubject = {
  id: 'building-interior',
  label: 'Building interior',
  group: 'Buildings',
  prompts: [
    'What hits you first as you step through the door?',
    'How bright is it, and where does the light come from?',
    'What does it smell like?',
    'What is the room for, and what is it actually used for?',
    'Who is here, and what are they doing when you arrive?',
    'What one object would a curious player pick up?',
  ],
  tables: [
    {
      id: 'light',
      label: 'Light',
      entries: [
        'a single smoky lantern hanging from a hook',
        'sun slanting through high, dirty windows',
        'a roaring hearth that lights only half the room',
        'dozens of candles, most of them guttering',
        'cold blue light from a glowing crystal',
        'almost dark, shutters closed against the day',
        'rushlights that make more smoke than light',
        'a skylight throwing a bright square on the floor',
        'lamplight through coloured glass shades',
        'the red glow of banked coals',
      ],
    },
    {
      id: 'smell',
      label: 'Smell',
      entries: [
        'woodsmoke and old tallow',
        'damp plaster and mouse droppings',
        'lavender, laid on thick to hide something else',
        'fresh sawdust and varnish',
        'boiled cabbage, always boiled cabbage',
        'ink, dust and old paper',
        'wet dog and wet wool',
        'incense so heavy it makes eyes water',
        'bread baking somewhere close',
        'mildew and closed-up rooms',
        'lamp oil and hot metal',
        'nothing at all, which is somehow worse',
      ],
    },
    {
      id: 'furnishing',
      label: 'Furnishing',
      entries: [
        'mismatched chairs collected over decades',
        'a long table scarred with knife marks and initials',
        'a fine rug worn through to the boards in a path',
        'shelves that bow under too many objects',
        'heavy furniture far too grand for the room',
        'almost nothing: a stool, a pallet, a chest',
        'a curtain dividing the room in two',
        'stuffed animal heads with glass eyes',
        'a writing desk covered in unfinished letters',
        'a cold hearth with a cooking pot still in it',
        'religious icons on every wall',
        'tapestries hung to keep out drafts rather than for beauty',
      ],
    },
    {
      id: 'sound',
      label: 'Sound',
      entries: [
        'floorboards that announce every step',
        'a clock ticking loudly in another room',
        'rain on the roof, a drip somewhere inside',
        'muffled voices through a thin wall',
        'the hiss and pop of the fire',
        'something scratching inside the walls',
        'a kettle starting to sing',
        'a door banging somewhere upstairs',
        'wind whistling through a broken pane',
        'perfect quiet, like held breath',
      ],
    },
    {
      id: 'object',
      label: 'Curious object',
      entries: [
        'a portrait with the face scratched out',
        'a locked box chained to the floor',
        'a map pinned to the wall with one place circled',
        'a half-eaten meal, still warm',
        "a child's toy where no child lives",
        'a sword hung above the mantel, recently cleaned',
        'a mirror covered with a cloth',
        'a ledger left open at a page of crossed-out names',
        'a birdcage with the door open and no bird',
        'muddy boots by the door, too small for anyone here',
        'a trophy from a war fought on the losing side',
        'a letter on the table addressed to one of the party',
      ],
    },
  ],
}

const TAVERN: DescribeSubject = {
  id: 'tavern',
  label: 'Tavern or inn',
  group: 'Inns & leisure',
  prompts: [
    'What is the mood tonight: rowdy, tense, sleepy, mournful?',
    'Who runs it, and where are they standing?',
    'What is the house drink, and is it any good?',
    'Who is the one patron everyone is avoiding?',
    'What is pinned to the wall or written on the board?',
    'Where would the party sit, and who notices them?',
  ],
  tables: [
    {
      id: 'mood',
      label: 'Mood tonight',
      entries: [
        'loud and happy, a birthday or a wedding',
        'quiet and tense, everyone watching the door',
        'half empty and mournful after a funeral',
        'packed with off-duty soldiers spoiling for a fight',
        'a card game that has drawn a silent crowd',
        'a travelling musician nobody wants to stop',
        'a drunk local holding forth about a monster',
        'sleepy, the fire low and the cat in charge',
        'a celebration that falters as the party enters',
        'an argument in a language nobody else speaks',
      ],
    },
    {
      id: 'keeper',
      label: 'The keeper',
      entries: [
        'a huge, gentle half-orc polishing the same mug forever',
        'a sharp-eyed widow who remembers every debt',
        'a nervous young man who inherited the place last month',
        'a retired adventurer with a wooden leg and many stories',
        'a dwarf who disapproves of every drink they serve',
        "twin halflings who finish each other's sentences",
        'an elderly priestess who runs it as penance',
        'a smooth talker who is clearly a fence on the side',
        'a gnome who brews in the cellar and it shows',
        'a tired mother serving with a baby on her hip',
      ],
    },
    {
      id: 'drink',
      label: 'House drink',
      entries: [
        'a dark, bitter ale that sticks to the mug',
        'cloudy cider that is much stronger than it tastes',
        'mulled wine with too much clove',
        'a pale beer that tastes faintly of smoke',
        'a local spirit served in thimble-sized cups, with a toast',
        'honey mead from a family recipe',
        'thin, watery beer served with a smile',
        'something green the keeper will not name',
        "goat's milk punch, a regional speciality",
        'imported wine at a ruinous price',
      ],
    },
    {
      id: 'food',
      label: 'On the menu',
      entries: [
        'a stew that has been going since before anyone remembers',
        'black bread, hard cheese and pickled onions',
        'roast fowl, burnt on one side',
        'eel pie, which is better than it sounds',
        'river fish fried whole, eyes and all',
        'mutton and barley, again',
        'spiced sausage that makes your eyes water',
        'porridge, at any hour, on principle',
        'a pie whose filling is best not asked about',
        'honey cakes the cook is unreasonably proud of',
      ],
    },
    {
      id: 'patron',
      label: 'Notable patron',
      entries: [
        'a hooded figure who has nursed one drink for hours',
        'a merchant counting coins too openly',
        'a bard writing furiously, glancing at the party',
        'an old soldier who salutes anyone with a weapon',
        'a child selling posies from table to table',
        'a priest drinking alone in the corner',
        'a pair of guards pretending to be off duty',
        'a dwarf asleep face-down in a plate',
        'a well-dressed noble very much slumming it',
        'a tiefling playing a game of chess against themselves',
        'a hunter with a sack that moves now and then',
        'someone who is very obviously a spy',
      ],
    },
    {
      id: 'board',
      label: 'On the notice board',
      entries: [
        'a reward for a missing dog, inexplicably large',
        'a warning about wolves on the north road',
        'an apprenticeship offered, no questions asked',
        'a bounty poster that looks like one of the party',
        'a lost ring, sentimental value',
        'caravan guards wanted, leaving at dawn',
        'a curfew notice from the town watch',
        'a love poem, unsigned',
        'a hand-drawn map with a cryptic note',
        'a notice that the well is not to be used',
      ],
    },
  ],
}

const SHOP: DescribeSubject = {
  id: 'shop',
  label: 'Shop or workshop',
  group: 'Shops & trades',
  prompts: [
    'What does the shop smell and sound like from the doorway?',
    'How is the stock displayed: proud, chaotic, hidden?',
    'Who serves, and how do they size up the party?',
    'What is the one item that is not for sale?',
    'What does the owner want that money will not buy?',
  ],
  tables: [
    {
      id: 'display',
      label: 'Stock displayed',
      entries: [
        'everything hung from the ceiling on hooks',
        'neat labelled drawers floor to ceiling',
        'piles on every surface, owner knows where all of it is',
        'a few choice pieces under glass, the rest out back',
        'samples on the counter, the stock behind a locked grille',
        'baskets spilling out onto the street',
        'items arranged by colour rather than use',
        'everything chained down',
        'mostly empty shelves and an apologetic sign',
        'a workbench in full view, work half finished',
      ],
    },
    {
      id: 'shopkeeper',
      label: 'Shopkeeper',
      entries: [
        'a fussy perfectionist who flinches when things are touched',
        'a cheerful haggler who considers the first price an insult',
        'a bored apprentice minding the shop alone',
        'a suspicious old man who demands to see coin first',
        'a scholar who wants to talk about every item',
        'a former soldier who tests every blade personally',
        'a gnome inventor demonstrating something dangerous',
        'a friendly woman with very cold eyes',
        'a family, three generations, all talking at once',
        'someone who very clearly is not the real owner',
      ],
    },
    {
      id: 'quirk',
      label: 'Shop quirk',
      entries: [
        'a bell over the door that rings a moment too late',
        'a talking bird that repeats prices',
        'a back room the owner keeps glancing towards',
        'a strict no-elves policy, recently relaxed',
        'credit offered, but only to those who sign a book',
        'a counter set at dwarf height',
        'a guard dog of improbable size',
        'a wall of thank-you letters from famous customers',
        'items that are subtly not quite what they say',
        'a tea kettle always on for customers',
      ],
    },
    {
      id: 'notforsale',
      label: 'Not for sale',
      entries: [
        'a cracked shield hanging behind the counter',
        'a sealed bottle of something that glows faintly',
        'the first thing the owner ever made',
        'a map the owner claims is worthless',
        "a dragon's tooth used as a paperweight",
        "a ring on a chain around the owner's neck",
        'a strange key that opens nothing in the shop',
        'a painting of a city that does not exist',
      ],
    },
  ],
}

const TEMPLE: DescribeSubject = {
  id: 'temple',
  label: 'Temple or shrine',
  group: 'Religious',
  prompts: [
    'What does the god care about, and how does the building show it?',
    'Is it rich or poor, busy or forgotten?',
    'What is the central image or altar?',
    'What ritual is happening when the party arrives?',
    'What is forbidden here, and is it written down?',
  ],
  tables: [
    {
      id: 'space',
      label: 'The space',
      entries: [
        'a vaulted nave where whispers carry to the far end',
        'a low, smoky hall packed with offerings',
        'an open-air ring of standing stones',
        'a tiny roadside shrine barely big enough for one',
        'a cave with an altar carved from the living rock',
        'a grand marble hall, mostly empty',
        'a wooden chapel with a leaking roof',
        'a garden temple where every plant is sacred',
        'a converted warehouse with benches from a ship',
        'a hilltop shrine exposed to every wind',
      ],
    },
    {
      id: 'focus',
      label: 'Focal image',
      entries: [
        "a statue with its face worn smooth by worshippers' hands",
        'an eternal flame that has never been allowed to go out',
        'a pool of perfectly still black water',
        'a tree growing up through the floor',
        'a mosaic of the god, missing one crucial tile',
        'an empty throne',
        'a huge bell that is only rung for deaths',
        'a reliquary holding a single finger bone',
        'a painted ceiling of stars and constellations',
        'a simple wooden symbol on a bare wall',
      ],
    },
    {
      id: 'activity',
      label: 'Happening now',
      entries: [
        'a chanted service in an old language',
        'a quiet queue of supplicants waiting to be blessed',
        'acolytes scrubbing the floor on their knees',
        'a funeral, the family looking at the party',
        'a heated argument between two priests',
        'a wedding that is going badly',
        'a lone mourner lighting candle after candle',
        'healing for the poor, the line out the door',
        'a donation box being emptied a little too eagerly',
        'nobody at all, the doors unlocked',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'frankincense and beeswax',
        'cold stone and wet flowers',
        'a low hum that seems to come from the walls',
        'sunlight through stained glass painting the floor',
        'bitter herbs burning in a brazier',
        'the shuffle of many bare feet',
        'a draught that always blows towards the altar',
        'rose petals crushed underfoot',
      ],
    },
  ],
}

const CASTLE: DescribeSubject = {
  id: 'castle',
  label: 'Castle or keep',
  group: 'Civic & military',
  prompts: [
    'What was it built to defend against, and does that threat still exist?',
    'How do you approach it, and how exposed do you feel?',
    'What does the flag or banner say about who holds it now?',
    'What is crumbling, and what has been recently repaired?',
    'Where are the guards looking?',
  ],
  tables: [
    {
      id: 'approach',
      label: 'Approach',
      entries: [
        'a single causeway over a stinking moat',
        'a switchback road in full view of the walls',
        'a drawbridge that has not been raised in years',
        'a gatehouse bristling with murder holes',
        'a long avenue of dead trees',
        'a narrow path along a cliff edge',
        'a village huddled against the outer wall',
        'a ruined outer wall, the inner one still strong',
      ],
    },
    {
      id: 'walls',
      label: 'Walls & towers',
      entries: [
        'curtain walls blackened by an old siege',
        'a round keep, newer square towers added later',
        'battlements with gaps like missing teeth',
        'ivy so thick the stone is barely visible',
        'walls that seem to lean outward slightly',
        'one tower taller than the rest, with a lit window',
        'banners hanging limp and faded',
        'fresh mortar along one stretch of wall',
        'arrow slits bricked up and turned into windows',
        'a tower partly collapsed into the moat',
      ],
    },
    {
      id: 'inside',
      label: 'Inside the walls',
      entries: [
        'a muddy bailey full of pigs and soldiers',
        'a great hall with a fire you could roast an ox in',
        "cold corridors hung with ancestors' portraits",
        'a chapel used as a storehouse',
        'a training yard echoing with practice blows',
        'kitchens, hot and roaring and loud',
        'a library nobody has opened in years',
        'a dungeon stair that breathes cold air',
      ],
    },
    {
      id: 'detail',
      label: 'Telling detail',
      entries: [
        'a heraldic device that has been painted over',
        'guards wearing two different liveries',
        'an empty gibbet by the gate',
        "servants who will not meet anyone's eye",
        'a lavish feast being prepared for nobody in particular',
        'a ransom letter half-written on a desk',
        'a well that the guards will not draw from',
        "a lord's chair with a second, smaller chair beside it",
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Underground
// ---------------------------------------------------------------------------

const DUNGEON_ROOM: DescribeSubject = {
  id: 'dungeon-room',
  label: 'Dungeon room',
  group: 'Underground',
  prompts: [
    'What was this room originally built for?',
    'What happened here since, and what evidence is left?',
    'What is the immediate danger or the immediate temptation?',
    'How big is it, and how far does the light reach?',
    'Where are the exits, and which looks the most used?',
  ],
  tables: [
    {
      id: 'purpose',
      label: 'Original purpose',
      entries: [
        'a guardroom with racks of rusted spears',
        'a burial chamber, niches in every wall',
        'a storeroom of rotten barrels',
        'a shrine to a god nobody worships now',
        'a cell block, doors hanging open',
        'a kitchen with a vast cold hearth',
        'a library, books swollen with damp',
        'a throne room for something not human',
        'a workshop with tools still on the benches',
        'a cistern, now mostly dry',
        'a barracks with dozens of narrow bunks',
        'a ritual chamber with a circle carved in the floor',
      ],
    },
    {
      id: 'atmosphere',
      label: 'Atmosphere',
      entries: [
        'dripping water and the echo of every drop',
        'air so dry the dust rises with each step',
        'a faint, rhythmic thudding from below',
        'cold that seeps through boots',
        'warmth, unnaturally so, rising from cracks',
        'a sweet, rotten smell that clings to clothes',
        'old smoke stains on the ceiling',
        'a breeze from somewhere it should not be',
        'a silence that swallows footsteps',
        'a faint glow from fungus on the walls',
      ],
    },
    {
      id: 'evidence',
      label: 'Evidence',
      entries: [
        'a recent campfire, ashes still warm',
        'claw marks gouged deep into the door',
        'a skeleton in old armour, still clutching a note',
        'drag marks leading to the far wall',
        'a chalk arrow and a tally of days',
        'broken manacles bolted to the wall',
        'a goblin graffito of an enormous eye',
        'a pool of something dark and not quite dry',
        'a trail of coins leading deeper in',
        'the shredded remains of a bedroll',
      ],
    },
    {
      id: 'feature',
      label: 'Feature',
      entries: [
        'a pit in the centre with no bottom in sight',
        'a statue whose head turns to follow light',
        'a mural that tells a story in reverse',
        'a fountain still running with clear water',
        'a collapsed ceiling, rubble half filling the room',
        'a stone door with no handle, only a keyhole shaped like a hand',
        'columns carved as figures holding up the roof',
        'a lever, clearly labelled DO NOT',
        'an altar with fresh offerings',
        'a staircase going up that ends at the ceiling',
      ],
    },
  ],
}

const CAVERN: DescribeSubject = {
  id: 'cavern',
  label: 'Cave or cavern',
  group: 'Underground',
  prompts: [
    'How did this space form: water, lava, digging, magic?',
    'What lives here, and what signs of it are there?',
    'How hard is it to move through?',
    'Where does the air come from, and what does it carry?',
  ],
  tables: [
    {
      id: 'shape',
      label: 'Shape',
      entries: [
        'a vast chamber whose roof is lost in darkness',
        'a crawlspace that scrapes both shoulders',
        'a forest of stalactites like hanging teeth',
        'a ledge above an underground river',
        'a crystal-lined geode that throws light everywhere',
        'a lava tube, smooth and round as a pipe',
        'a chimney climbing up into blackness',
        'a flooded passage, the ceiling just above the water',
        'terraced pools of mineral-white water',
        'a fungus garden taller than a person',
      ],
    },
    {
      id: 'life',
      label: 'Signs of life',
      entries: [
        'bats stirring overhead',
        'pale blind fish in a still pool',
        'a nest of bones and shed scales',
        'tool marks where someone has been mining',
        'a rope ladder, recently used',
        'fungus nibbled in a neat line',
        'a webbed corner thick as cloth',
        'droppings the size of a fist',
        'a tiny shrine of stacked pebbles',
        'nothing living at all, not even moss',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'the sharp smell of guano',
        'mineral cold that numbs fingertips',
        'a roar of water felt through the floor',
        'echoes that answer half a second late',
        'a faint taste of sulphur',
        'warm, wet air like breath',
        'a whistling draught through a crack',
        'drips that sound like footsteps',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const NPC: DescribeSubject = {
  id: 'npc',
  label: 'NPC',
  group: 'People',
  types: ['npc', 'character'],
  prompts: [
    'What is the first thing anyone notices about them?',
    'How do they move, and what do they do with their hands?',
    'How do they talk: voice, pace, a phrase they repeat?',
    'What do they want from this conversation?',
    'What are they hiding, or afraid of?',
    'What will make the players remember them by name?',
  ],
  tables: [
    {
      id: 'appearance',
      label: 'First impression',
      entries: [
        'an old burn scar down one side of the neck',
        'immaculately dressed, but the boots are falling apart',
        'enormous, and trying very hard to seem smaller',
        'tiny and sharp, like a bird of prey',
        'a face that is always about to laugh',
        'eyes of two different colours',
        'tattoos of a military unit, partly covered',
        'jewellery far too expensive for their station',
        'covered in flour, or chalk, or paint',
        'a missing finger they keep tapping with',
        'hair braided with tiny bones',
        'perfectly ordinary, and somehow that is unsettling',
      ],
    },
    {
      id: 'mannerism',
      label: 'Mannerism',
      entries: [
        'cracks their knuckles before answering',
        'never quite makes eye contact',
        'stands far too close',
        'laughs at their own jokes before the punchline',
        'whispers, so everyone has to lean in',
        'hums constantly',
        'chews something: a pipe, a straw, a fingernail',
        'calls everyone by the wrong name',
        'ends every sentence as a question?',
        'counts things under their breath',
        'quotes scripture, slightly wrong',
        'touches a charm at their throat when nervous',
      ],
    },
    {
      id: 'voice',
      label: 'Voice',
      entries: [
        'a gravelly rumble',
        'high and fast, tripping over words',
        'slow and deliberate, every word weighed',
        'a thick regional accent from far away',
        'a lisp they are self-conscious about',
        'a booming voice used to shouting over crowds',
        'precise, clipped, overly formal',
        'warm and singsong, like a storyteller',
        'flat and toneless',
        'hoarse, as if from too much shouting',
      ],
    },
    {
      id: 'want',
      label: 'Wants',
      entries: [
        'to be left alone',
        'money, quickly, for a debt',
        'news of a missing relative',
        'to impress someone who is watching',
        'to get out of this town',
        'revenge on a former partner',
        'to sell the party something',
        'protection, but they will not say from what',
        'to be taken seriously',
        'a drinking companion',
        'to recruit the party for a cause',
        'to confess something',
      ],
    },
    {
      id: 'secret',
      label: 'Secret',
      entries: [
        'is not who they say they are',
        'owes money to very dangerous people',
        'saw the crime everyone is talking about',
        'is secretly noble-born',
        'is working for the villain, reluctantly',
        'has a sibling in the town gaol',
        'cannot read, and hides it carefully',
        'is the anonymous author of a scandalous pamphlet',
        'stole the thing the party is looking for',
        'is dying, and has told no one',
        'is in love with someone wildly unsuitable',
        'was once an adventurer, and the only survivor',
      ],
    },
  ],
}

const CROWD: DescribeSubject = {
  id: 'crowd',
  label: 'Crowd or townsfolk',
  group: 'People',
  prompts: [
    'What brought these people together right now?',
    'What is the overall mood, and is it changing?',
    'Who stands out from the crowd?',
    'How do they react to the party?',
  ],
  tables: [
    {
      id: 'gathering',
      label: 'Why gathered',
      entries: [
        'a public hanging nobody wants to look away from',
        'a market-day bustle',
        'a fire, buckets passing hand to hand',
        'a herald reading a proclamation',
        'a street preacher drawing a hostile crowd',
        'a festival procession',
        'a queue at a gate that is not moving',
        'a fight, and the betting that goes with it',
        'a funeral cortege',
        'a ship coming in, everyone hoping for news',
      ],
    },
    {
      id: 'mood',
      label: 'Mood',
      entries: [
        'cheerful, half of them drunk',
        'restless and close to turning ugly',
        'hushed and fearful',
        'bored and impatient',
        'grief-stricken',
        'giddy with rumour',
        'suspicious of outsiders',
        'grimly determined',
      ],
    },
    {
      id: 'standout',
      label: 'Stands out',
      entries: [
        'a pickpocket working the edges',
        'a lost child calling for a parent',
        'a noble on a horse, above it all',
        'a soldier trying to keep order and failing',
        'someone handing out pamphlets',
        'an old woman who stares straight at one of the party',
        'a vendor shouting over everyone',
        'a cloaked figure moving against the flow',
        'a dog that has decided the party is its owner',
        'a pair of twins who seem to be everywhere at once',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

const TOWNSCAPE: DescribeSubject = {
  id: 'townscape',
  label: 'Town street',
  group: 'Settlements',
  prompts: [
    'What is the first thing you see coming through the gate?',
    'What does the town smell like, and why?',
    'What is the town known for, and where is the evidence?',
    'Who has power here, and how can you tell?',
    'What is the town worried about right now?',
  ],
  tables: [
    {
      id: 'street',
      label: 'The street',
      entries: [
        'narrow and crooked, upper storeys almost touching',
        'a broad avenue lined with dying trees',
        'steep cobbled steps rather than a road',
        'mud to the ankle, planks laid across the worst',
        'a canal instead of a street, boats for carts',
        'a market square with a dry fountain',
        'a covered arcade, dim and echoing',
        'a bridge lined with shops on both sides',
        'a road through the middle of a ruin people still live in',
        'a cramped alley strung with washing',
      ],
    },
    {
      id: 'smell',
      label: 'Town smell',
      entries: [
        'the tannery downwind, all the time',
        'fish and salt and tar',
        'bread from a dozen bakeries',
        'horse dung and wet straw',
        'coal smoke that blackens everything',
        'spices from the docks',
        'the river, which is not a good smell',
        'flowers from window boxes on every sill',
      ],
    },
    {
      id: 'activity',
      label: 'Street life',
      entries: [
        'children chasing a pig',
        'a cart stuck with its wheel broken, traffic piling up',
        'a lamplighter making rounds',
        'guards checking papers at a corner',
        'a street performer juggling knives',
        'washerwomen arguing at a pump',
        'a crier announcing the hour',
        'beggars with suspiciously good boots',
        'a dog fight, quickly broken up',
        'a funeral procession forcing everyone aside',
        "a merchant's wagon guarded by mercenaries",
        'shutters slamming as the party walks past',
      ],
    },
    {
      id: 'landmark',
      label: 'Landmark',
      entries: [
        'a clock tower stopped at the same hour for years',
        'a statue of a hero, defaced',
        'a gallows in the square, recently used',
        'a temple dome visible from anywhere in town',
        'a ruined wall from an older town',
        'an enormous old tree in the middle of the road',
        "a guildhall more grand than the lord's house",
        'a well everyone gathers around to gossip',
        'a tower belonging to a wizard nobody has seen',
        "a bridge said to be built on a troll's back",
      ],
    },
    {
      id: 'worry',
      label: 'Town worry',
      entries: [
        'disappearances at night',
        'a failed harvest and rising prices',
        'a new lord with new taxes',
        'a sickness spreading in the lower quarter',
        'monster sightings on the trade road',
        'a feud between two guilds',
        'the river is rising',
        'a cult recruiting the young',
        'a war that may be coming this way',
        'strange lights in the hills',
      ],
    },
  ],
}

const VILLAGE: DescribeSubject = {
  id: 'village',
  label: 'Village or hamlet',
  group: 'Settlements',
  prompts: [
    'What does the village live on: farming, fishing, mining, a road?',
    'Where do people gather?',
    'How do villagers greet strangers?',
    'What is the one thing everybody here knows and nobody says?',
  ],
  tables: [
    {
      id: 'living',
      label: 'Livelihood',
      entries: [
        'sheep on every hillside, wool on every fence',
        'fishing boats drawn up on a pebble beach',
        'orchards and cider presses',
        'a quarry, dust over everything',
        'a mill on a fast stream',
        'a coaching inn that is the whole economy',
        'charcoal burners in the woods',
        "a mine, and the miners' cough",
        'peat cutting on the moor',
        'a holy well that brings pilgrims',
      ],
    },
    {
      id: 'heart',
      label: 'Heart of the village',
      entries: [
        'a green with a maypole',
        'a stone bridge where old men sit',
        'a single shop that is also the post, the inn and the court',
        'a huge oak with names carved in it',
        'a tiny chapel with a crooked spire',
        'a pond with ducks and a ducking stool',
        'a market cross worn smooth',
        "the blacksmith's forge, door always open",
      ],
    },
    {
      id: 'welcome',
      label: 'Welcome',
      entries: [
        'curtains twitching in every window',
        'children run ahead to announce the strangers',
        'a too-friendly welcome and a free drink',
        'the headman meets them before they reach the green',
        'nobody speaks to them at all',
        'a dog barks and everyone goes indoors',
        'they are mistaken for someone expected',
        'an old woman offers bread and salt',
      ],
    },
  ],
}

const CITY: DescribeSubject = {
  id: 'city',
  label: 'City district',
  group: 'Settlements',
  prompts: [
    'What does the skyline look like from a distance?',
    'How does this district differ from the one next door?',
    'Who polices it, if anyone?',
    'What can you buy here that you cannot buy anywhere else?',
  ],
  tables: [
    {
      id: 'skyline',
      label: 'Skyline',
      entries: [
        'a forest of spires and smoking chimneys',
        'a single colossal tower dwarfing everything',
        'domes of gold and green copper',
        'walls within walls, rings climbing a hill',
        'a fog-bound harbour of masts',
        'bridges stacked on bridges over a gorge',
        'ruins of a greater city poking through the new',
        'a castle on a crag looking down on everything',
      ],
    },
    {
      id: 'district',
      label: 'District',
      entries: [
        'the docks: rope, tar, cursing and gulls',
        'the temple quarter: bells, beggars and incense',
        'the noble hill: gates, gardens and guards',
        'the tanneries: stink, dye and the river runs blue',
        'the university: arguments in every tavern',
        'the foreign quarter: unfamiliar music and food',
        'the slums: stacked shacks and kindness and danger',
        'the market district: every sound at once',
        'the old town: narrow lanes that have not changed in centuries',
        'the guild district: grand halls and petty rivalries',
      ],
    },
    {
      id: 'law',
      label: 'Who keeps order',
      entries: [
        'a city watch with a reputation for bribes',
        "a guild's private guards",
        'a temple militia',
        'a crime family, openly',
        'nobody, and everyone knows it',
        'a mage-constabulary nobody trusts',
        'a neighbourhood committee with clubs',
        'soldiers under martial law',
      ],
    },
  ],
}

const MARKET: DescribeSubject = {
  id: 'market',
  label: 'Market',
  group: 'Settlements',
  prompts: [
    'What is the loudest stall, and what are they shouting?',
    'What is in season, and what is scarce?',
    'Who is the market really run by?',
    'What strange thing is for sale today?',
  ],
  tables: [
    {
      id: 'stall',
      label: 'Stall',
      entries: [
        'a fishwife hawking eels from a barrel',
        'a spice merchant with sacks of red and gold powder',
        'a cage of songbirds, some not native',
        'second-hand armour, holes and all',
        'a fortune teller who is uncomfortably accurate',
        'a pie man with a suspicious lack of dogs nearby',
        'a cobbler mending boots while you wait',
        'a herbalist with something for everything',
        'a stall of maps, all slightly different',
        'a hot chestnut brazier',
        'a scribe writing letters for the illiterate',
        'a bookseller with a single locked case',
      ],
    },
    {
      id: 'sound',
      label: 'Noise',
      entries: [
        'bargaining in four languages',
        'a goat bleating its protest',
        'coins clinking and being bitten',
        'a hurdy-gurdy playing the same tune',
        'a fight over the last of something',
        'a crier announcing lost children',
        'chickens, so many chickens',
        'a bell ringing the close of trading',
      ],
    },
    {
      id: 'oddity',
      label: 'Odd item for sale',
      entries: [
        'a jar with a live eyeball in it',
        'a sword with no blade, only a hilt',
        'a map to a treasure everyone has already looted',
        'an egg that is warm to the touch',
        'a hat that whispers',
        'a painting whose subject has moved slightly since yesterday',
        "a bottle labelled 'storm'",
        'a cursed doll, offered at a discount',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Landscapes
// ---------------------------------------------------------------------------

const FOREST: DescribeSubject = {
  id: 'forest',
  label: 'Forest',
  group: 'Landscapes',
  prompts: [
    'How thick is it, and what is the light like under the canopy?',
    'What trees, and how old?',
    'What path is there, and who made it?',
    "What is the forest's mood: welcoming, watchful, hostile?",
  ],
  tables: [
    {
      id: 'trees',
      label: 'Trees',
      entries: [
        'ancient oaks with trunks wider than a cart',
        'tall straight pines, the floor carpeted with needles',
        'silver birches like ranks of ghosts',
        'dense tangled thorn, nearly impassable',
        'moss-hung yews in eternal twilight',
        'beeches with smooth grey bark and golden leaves',
        'dead trees, white and leafless, still standing',
        'huge fungi among the trunks, some taller than people',
        'willows trailing into dark water',
        'trees growing in unnaturally straight lines',
      ],
    },
    {
      id: 'floor',
      label: 'Forest floor',
      entries: [
        'deep leaf litter that hides roots and holes',
        'bluebells as far as you can see',
        'thick bracken up to the waist',
        'bare earth and tangled roots',
        'moss so thick footsteps make no sound',
        'standing water and rotting logs',
        'a deer trail, narrow and winding',
        'an old paved road, roots lifting the stones',
      ],
    },
    LIGHT_OUTDOORS,
    SOUNDS_OUTDOORS,
    ODDITIES,
  ],
}

const MOUNTAINS: DescribeSubject = {
  id: 'mountains',
  label: 'Mountains & hills',
  group: 'Landscapes',
  prompts: [
    'How do the peaks look from afar, and how do they feel underfoot?',
    'What is the route, and how dangerous is it?',
    'How does altitude change the air, the cold, the breath?',
    'Who or what lives up here?',
  ],
  tables: [
    {
      id: 'view',
      label: 'The view',
      entries: [
        'jagged peaks like broken teeth against the sky',
        'rolling green hills stitched with stone walls',
        'a snow-capped giant that makes its own weather',
        'a range lost in cloud from the shoulders up',
        'bare red rock carved into towers by wind',
        'terraced slopes farmed up to impossible heights',
        'a glacier creeping down a valley',
        'a volcano trailing a thin plume of smoke',
      ],
    },
    {
      id: 'path',
      label: 'The path',
      entries: [
        'a goat track along a sheer drop',
        'loose scree that slides with every step',
        'a carved stair, ancient and crumbling',
        'a rope bridge over a gorge',
        'a pass where the wind never stops',
        'a ledge behind a waterfall',
        'snowfield hiding crevasses',
        'a road built by an empire long gone',
      ],
    },
    LIGHT_OUTDOORS,
    WEATHER,
    ODDITIES,
  ],
}

const COAST: DescribeSubject = {
  id: 'coast',
  label: 'Coast & sea',
  group: 'Landscapes',
  prompts: [
    'What is the shore made of: sand, shingle, cliff, mud?',
    'What is the sea doing today?',
    'What has the tide left behind?',
    'What can be seen out on the water?',
  ],
  tables: [
    {
      id: 'shore',
      label: 'Shore',
      entries: [
        'white cliffs with seabirds wheeling below',
        'a long beach of black volcanic sand',
        'shingle that roars as each wave pulls back',
        'mudflats stretching out to a distant sea',
        'rock pools full of crabs and anemones',
        'dunes held together by sharp marram grass',
        'a sea cave booming with each wave',
        'a sheltered cove with turquoise water',
      ],
    },
    {
      id: 'sea',
      label: 'The sea',
      entries: [
        'glassy calm, the horizon blurred into sky',
        'grey and choppy, whitecaps everywhere',
        'huge slow swells rolling in from a storm far out',
        'phosphorescent at night, every wave glowing',
        'thick with seaweed and floating debris',
        'a riptide pulling hard along the beach',
      ],
    },
    {
      id: 'flotsam',
      label: 'Washed up',
      entries: [
        "a ship's figurehead, painted face staring up",
        'a sealed bottle with a message inside',
        'the bones of something very large',
        'a drowned sailor wearing a strange uniform',
        'a crate of oranges, half of them fine',
        'a lantern still lit, somehow',
        'tangled nets and a single boot',
        'a scattering of coins from no known mint',
      ],
    },
    WEATHER,
    LIGHT_OUTDOORS,
  ],
}

const SWAMP: DescribeSubject = {
  id: 'swamp',
  label: 'Swamp or marsh',
  group: 'Landscapes',
  prompts: [
    'Where is the solid ground, and how can you tell?',
    'What does it smell like?',
    'What is lurking under the surface?',
    'How does sound behave here?',
  ],
  tables: [
    {
      id: 'terrain',
      label: 'Terrain',
      entries: [
        'black water broken by grassy hummocks',
        'reed beds taller than a mounted rider',
        'cypress knees jutting out of the muck',
        'a boardwalk of rotting planks',
        'quaking bog that ripples when you step',
        'pools covered with bright green duckweed',
        'a drowned village, rooftops above the water',
        'salt marsh cut by tidal creeks',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'the rotten-egg smell of marsh gas',
        'clouds of biting midges',
        'frogs that all stop croaking at once',
        'bubbles rising from below for no visible reason',
        "a will-o'-wisp glimmering just ahead",
        'heat that makes clothes cling',
        'mud that sucks boots off',
        'a heron lifting off slow and silent',
      ],
    },
    WEATHER,
    ODDITIES,
  ],
}

const DESERT: DescribeSubject = {
  id: 'desert',
  label: 'Desert or badlands',
  group: 'Landscapes',
  prompts: [
    'What kind of desert: dunes, rock, salt, scrub?',
    'How brutal is the heat, and how cold is the night?',
    'Where is water, and who controls it?',
    'What does the desert hide?',
  ],
  tables: [
    {
      id: 'terrain',
      label: 'Terrain',
      entries: [
        'dunes like frozen waves, ridged by wind',
        'a cracked salt pan shining white to the horizon',
        'red mesas and slot canyons',
        'stony plain with scattered thornbushes',
        'black lava fields, sharp underfoot',
        'an oasis of date palms around a green pool',
        'dry riverbed that floods without warning',
        'half-buried columns of a lost city',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'heat shimmer that makes the horizon swim',
        'sand in every fold of clothing',
        'a sudden, total silence when the wind drops',
        'stars so dense they cast shadows',
        'the taste of grit and dust',
        'singing dunes that boom as they shift',
        'cold that bites hard after sundown',
        'vultures circling something ahead',
      ],
    },
    LIGHT_OUTDOORS,
    ODDITIES,
  ],
}

const PLAINS: DescribeSubject = {
  id: 'plains',
  label: 'Plains, moors & roads',
  group: 'Landscapes',
  types: ['quest'],
  prompts: [
    'What is the horizon like, and what breaks it?',
    'What is the road like, and who else uses it?',
    'Where would you camp, and what makes it a good spot?',
    'What is visible from miles away?',
  ],
  tables: [
    {
      id: 'land',
      label: 'The land',
      entries: [
        'endless grass rippling like water in the wind',
        'heather moorland purple and brown',
        'a patchwork of fields and hedgerows',
        'burnt stubble after harvest',
        'a battlefield, grassed over, still littered with bones',
        'standing stones on a bare ridge',
        'a lonely gibbet at a crossroads',
        'a river valley lush and green',
      ],
    },
    {
      id: 'road',
      label: 'On the road',
      entries: [
        'a merchant caravan with a broken axle',
        'pilgrims singing as they walk',
        'a toll gate run by men who look like bandits',
        'a coach going much too fast',
        'a waystone with directions to towns that no longer exist',
        'a shepherd and a flock blocking the road',
        'a dead horse, saddle still on',
        'a ruined inn that someone has recently moved into',
        'a patrol of soldiers asking questions',
        'a lone traveller who wants company',
      ],
    },
    WEATHER,
    SOUNDS_OUTDOORS,
    ODDITIES,
  ],
}

const SKY: DescribeSubject = {
  id: 'sky',
  label: 'Weather & sky',
  group: 'Landscapes',
  prompts: [
    'What is the sky doing, and what does it promise?',
    'How does the weather change what the party can do?',
    'What does it do to their mood?',
  ],
  tables: [LIGHT_OUTDOORS, WEATHER, SOUNDS_OUTDOORS],
}

export const DESCRIBE_SUBJECTS: ReadonlyArray<DescribeSubject> = [
  BUILDING_EXTERIOR,
  BUILDING_INTERIOR,
  TAVERN,
  SHOP,
  TEMPLE,
  CASTLE,
  ...BUILDING_SUBJECTS,
  DUNGEON_ROOM,
  CAVERN,
  NPC,
  CROWD,
  TOWNSCAPE,
  VILLAGE,
  CITY,
  MARKET,
  FOREST,
  MOUNTAINS,
  COAST,
  SWAMP,
  DESERT,
  PLAINS,
  SKY,
]

/** The frontmatter `type:` of an article's raw content, if it has one. */
export function articleType(content: string): string | undefined {
  const { frontmatter } = splitFrontmatter(content)
  if (!frontmatter) return undefined
  const m = /^type:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(frontmatter)
  return m?.[1]
}

export function findSubject(
  id: string,
  subjects: ReadonlyArray<DescribeSubject> = DESCRIBE_SUBJECTS,
): DescribeSubject | undefined {
  return subjects.find((s) => s.id === id)
}

/**
 * The subject an article of this frontmatter `type:` should open on, or
 * undefined when nothing fits — the caller then falls back to whatever the
 * DM last picked, which beats guessing.
 */
export function subjectForType(
  type: string | undefined,
  subjects: ReadonlyArray<DescribeSubject> = DESCRIBE_SUBJECTS,
): DescribeSubject | undefined {
  if (!type) return undefined
  const t = type.trim().toLowerCase()
  return subjects.find((s) => s.types?.includes(t))
}

/** A uniform pick from a table. `rand` is injectable so tests are exact. */
export function rollEntry<T>(
  entries: ReadonlyArray<T>,
  rand: () => number = Math.random,
): T | undefined {
  if (entries.length === 0) return undefined
  return entries[
    Math.min(entries.length - 1, Math.floor(rand() * entries.length))
  ]
}

/**
 * Rolled details as a DM-only notes block: raw material for the DM to turn
 * into read-aloud prose, never read out as-is — which is why it lands inside
 * `:::dm` rather than a blockquote.
 */
export function detailsBlock(
  subject: DescribeSubject,
  rolled: ReadonlyArray<{ label: string; value: string }>,
): string {
  return [
    ':::dm',
    `**${subject.label}**`,
    '',
    ...rolled.map((r) => `- **${r.label}:** ${r.value}`),
    ':::',
  ].join('\n')
}
