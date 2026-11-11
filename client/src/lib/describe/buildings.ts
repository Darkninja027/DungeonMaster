import type { DescribeSubject } from './subjects'

/**
 * Specific building types for the Describe panel — homes, trades, churches,
 * civic and working buildings. Split out of `subjects.ts` only for size; the
 * same rules apply (original text, fragments rather than finished prose, no
 * duplicate entries) and `describe.test.ts` checks these through
 * `DESCRIBE_SUBJECTS` like every other subject.
 *
 * Type-only import from `subjects.ts`: a value import would make the two
 * modules circular at runtime.
 */

// ---------------------------------------------------------------------------
// Buildings (general)
// ---------------------------------------------------------------------------

const RUIN: DescribeSubject = {
  id: 'ruin',
  label: 'Ruined building',
  group: 'Buildings',
  prompts: [
    'What was it, and how can you still tell?',
    'What destroyed it: time, fire, war, something worse?',
    'What has moved in since?',
    'What survived intact, against the odds?',
    'Is anyone still looking after it?',
  ],
  tables: [
    {
      id: 'state',
      label: 'State of ruin',
      entries: [
        'roofless, open to the sky, walls still standing',
        'one wall left upright like a stage set',
        'collapsed into a mound grown over with brambles',
        'burnt out, charred beams still jutting',
        'half sunk into a bog',
        'swallowed by a tree that grew through the floor',
        'stripped of every useful stone by the village below',
        'intact but sealed, doors bricked up from outside',
        'split down the middle as if by a giant blade',
        'flooded to the first floor',
      ],
    },
    {
      id: 'survivor',
      label: 'What survived',
      entries: [
        'a fireplace with the family crest still crisp',
        'a single stained-glass window, unbroken',
        'a staircase leading up to nothing',
        'a mosaic floor under a carpet of leaves',
        'an iron safe, door rusted shut',
        'a painted ceiling, faces peeling away',
        'a doorway carved with a warning in an old script',
        'a cellar, dry and suspiciously clean',
      ],
    },
    {
      id: 'tenants',
      label: 'New tenants',
      entries: [
        'a family of foxes in the old hearth',
        'squatters who claim to own it',
        'bandits using it as a lookout',
        'a hermit who sweeps the floor every morning',
        'rooks, hundreds of them, very loud',
        'a goblin gang with a surprisingly neat camp',
        'nobody, and the birds will not land on it',
        'pilgrims who believe a miracle happened here',
      ],
    },
    {
      id: 'clue',
      label: 'Clue to its fate',
      entries: [
        'arrowheads embedded in the doorframe',
        'a melted bell in the rubble',
        'claw marks on the stone, at head height',
        'every door barred from the inside',
        "a looter's tools abandoned mid-job",
        'a family portrait, every face burnt out',
        'salt poured across every threshold',
        'a diary whose last entry is one word',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Homes
// ---------------------------------------------------------------------------

const COTTAGE: DescribeSubject = {
  id: 'cottage',
  label: 'Cottage or hovel',
  group: 'Homes',
  prompts: [
    'How many people live in how little space?',
    'Where do the animals sleep?',
    'What is the one precious thing in the house?',
    'How is the family doing this year: well, scraping by, desperate?',
  ],
  tables: [
    {
      id: 'home',
      label: 'The house',
      entries: [
        'one room, a curtain for the bed, a hearth in the middle',
        'a longhouse with the cattle at one end',
        'a turf hut half dug into a hillside',
        'whitewashed walls, thatch alive with sparrows',
        'a lean-to built against the town wall',
        'a stone croft with walls a yard thick',
        'a cottage that has grown room by room over generations',
        'a hovel of driftwood and sailcloth',
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      entries: [
        'a smoke hole that does not draw, everything smells of it',
        'herbs and onions hanging from every beam',
        'a loom taking up half the room',
        'children asleep in a heap by the fire',
        'a spinning wheel and baskets of wool',
        'a shelf of carved wooden figures',
        'a chicken nesting in the corner, nobody minds',
        'a grandmother who has not left her chair in years',
      ],
    },
    {
      id: 'treasure',
      label: 'Precious thing',
      entries: [
        'a painted plate kept high out of reach',
        "a soldier's medal in a tin",
        'a family bible nobody can read',
        'a good iron pot, the envy of the village',
        'a lock of hair in a locket',
        'a single glass window, the only one in the hamlet',
        'a sword that hangs above the door and is never touched',
        'a letter from a son who went to the city',
      ],
    },
  ],
}

const FARMSTEAD: DescribeSubject = {
  id: 'farmstead',
  label: 'Farmstead',
  group: 'Homes',
  prompts: [
    'What does the farm grow or raise?',
    'How is the land laid out around the house?',
    'Who works it, and how many hands are short?',
    'What threatens it this season?',
  ],
  tables: [
    {
      id: 'yard',
      label: 'The yard',
      entries: [
        'a muddy yard ringed by barn, byre and house',
        'a dung heap steaming in the cold',
        'a well with a long sweep pole',
        'geese that attack anyone they do not know',
        'a cart with a broken wheel propped on stones',
        'a dog on a long chain that never stops barking',
        'a haystack the children have hollowed into a den',
        'a scarecrow wearing surprisingly good clothes',
      ],
    },
    {
      id: 'work',
      label: 'Work underway',
      entries: [
        'harvest, every hand in the fields until dark',
        'lambing, the farmer up all night',
        'slaughter day, the yard red and busy',
        'threshing in the barn, chaff in the air',
        'mending fences after something broke through',
        'cider pressing, wasps everywhere',
        'shearing, the sheep complaining loudly',
        'nothing at all, the fields gone to seed',
      ],
    },
    {
      id: 'trouble',
      label: 'Trouble',
      entries: [
        'livestock found dead, drained of blood',
        'a boundary dispute with the neighbours',
        'blight in the crop, black and spreading',
        "a landlord's agent due any day",
        'the eldest son has run off to be an adventurer',
        'crop circles that were not there yesterday',
        'a well that has turned salty',
        'wolves bold enough to come into the yard',
      ],
    },
  ],
}

const TOWNHOUSE: DescribeSubject = {
  id: 'townhouse',
  label: 'Townhouse',
  group: 'Homes',
  prompts: [
    'How does the household show off to the street?',
    'Who answers the door?',
    'Which room is for guests, and which is lived in?',
    "What does the house say about the family's money: old, new, running out?",
  ],
  tables: [
    {
      id: 'front',
      label: 'Street front',
      entries: [
        'tall and narrow, five storeys of leaning timber',
        'a polished brass plate with a family name',
        'window boxes of red geraniums',
        'a narrow front with a surprisingly deep garden behind',
        'fresh paint over a crack that keeps coming back',
        'a carved door far grander than the house',
        'a shuttered shop on the ground floor, family above',
        'a lantern over the door kept lit all night',
      ],
    },
    {
      id: 'household',
      label: 'Household',
      entries: [
        'a single overworked maid',
        'a butler who outranks the family in manner',
        'a widow living alone with too many cats',
        'three generations under one roof, all arguing',
        'lodgers on every floor to pay the rent',
        'a merchant who is never home and a wife who runs everything',
        'a scholar buried in books, the house falling around them',
        'newly rich, everything matching and expensive',
      ],
    },
    {
      id: 'room',
      label: 'Parlour detail',
      entries: [
        'a harpsichord nobody plays',
        'portraits of ancestors who all look disappointed',
        'a stuffed bear in the hallway',
        'a cabinet of curiosities from abroad',
        'dust sheets over half the furniture',
        'a clock that chimes the wrong hour',
        'a fire laid but never lit, to save wood',
        'a map of trade routes with pins in it',
      ],
    },
  ],
}

const MANOR: DescribeSubject = {
  id: 'manor',
  label: 'Manor or noble house',
  group: 'Homes',
  prompts: [
    'What is the approach, and how long does it take?',
    'How do the grounds show power?',
    'What does the house hide behind its best rooms?',
    'Who among the servants knows everything?',
    'Which room is never used, and why?',
  ],
  tables: [
    {
      id: 'approach',
      label: 'Approach',
      entries: [
        'a long avenue of limes leading to a gravel sweep',
        'iron gates with the family arms, chained shut',
        'a lake with a folly on an island',
        'formal gardens clipped into geometric shapes',
        'a deer park where the deer watch you pass',
        'a ruined older house beside the new one',
        'a gatehouse with a keeper who asks too many questions',
        'grounds overgrown, the fountains dry',
      ],
    },
    {
      id: 'hall',
      label: 'Great hall',
      entries: [
        'a sweeping double staircase',
        'hunting trophies on every inch of wall',
        "a minstrels' gallery above the hearth",
        'a chandelier with half its candles lit',
        'marble floor that makes every footstep echo',
        'suits of armour that are not quite empty-looking',
        'a huge portrait of the current lord, recently commissioned',
        'tapestries showing a battle the family claims to have won',
      ],
    },
    {
      id: 'servants',
      label: 'Below stairs',
      entries: [
        'a housekeeper with every key on her belt',
        'a cook who rules the kitchen like a general',
        'a stable boy who sees everything',
        "a lady's maid with expensive taste in jewellery",
        'a gamekeeper who hates poachers and outsiders equally',
        'a footman who is clearly a spy for a rival house',
        'an old nurse who raised the lord and still scolds him',
        'servants who all go quiet when the steward walks past',
      ],
    },
    {
      id: 'secret',
      label: 'Hidden away',
      entries: [
        'a locked wing where a relative is kept',
        'a priest hole behind the panelling',
        'a portrait gallery with one gap',
        'a cellar door with fresh scratches',
        'a second set of accounts',
        "a servant's passage that runs behind every bedroom",
        'a nursery kept exactly as it was',
        'an ice house used for something other than ice',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Shops & trades
// ---------------------------------------------------------------------------

const MARKET_STALL: DescribeSubject = {
  id: 'market-stall',
  label: 'Market stall',
  group: 'Shops & trades',
  prompts: [
    'What is the stall made of, and how quickly could it pack up?',
    'What is the pitch: how does the seller call customers over?',
    'What is the best thing on the table, and the worst?',
    "Who is the stallholder's rival across the way?",
  ],
  tables: [
    {
      id: 'stall',
      label: 'The stall',
      entries: [
        'a trestle table under a patched striped awning',
        'a handcart with goods hung from every side',
        'a blanket on the ground, goods laid out in rows',
        'a painted wagon whose side folds down into a counter',
        'a booth of lashed poles and canvas, flapping in the wind',
        "a tray hung from the seller's neck",
        'a permanent stone stall with a name carved over it',
        'a tent with a curtain and a sign: by appointment',
        'baskets on a mule that refuses to move',
        'barrels upended as a counter',
      ],
    },
    {
      id: 'goods',
      label: 'Selling',
      entries: [
        'hot pies, steam rising, a queue already',
        'bolts of dyed cloth in impossible colours',
        'secondhand boots, sizes approximate',
        'charms and amulets, guaranteed or your money back',
        'live chickens, ducks and one very angry goose',
        'pots and pans clanging on hooks',
        'pickled everything in murky jars',
        'cheap jewellery and one suspiciously good ring',
        'carved toys and puppets',
        'candles, soap and tallow',
        'old weapons, swords sold as heirlooms',
        'maps, ballads and pamphlets',
      ],
    },
    {
      id: 'seller',
      label: 'Stallholder',
      entries: [
        'a booming crier who never stops listing prices',
        'a silent old man who just points at a slate',
        'a child left minding the stall, terrified of getting it wrong',
        'a charming rogue with a story for every item',
        'a farm wife with forearms like hams',
        'a foreign trader using gestures and three words of the language',
        "twins who contradict each other's prices",
        'a seller who keeps glancing at the watch patrol',
      ],
    },
    {
      id: 'pitch',
      label: 'The pitch',
      entries: [
        '"Fresh today, and yesterday, and tomorrow!"',
        'a free taste, then a hard sell',
        'a sob story about seven hungry children',
        'a staged argument with a planted customer',
        'singing the prices to a tune',
        'shaming passers-by for not buying',
        '"Last one, just for you, special price"',
        'no pitch at all, the goods sell themselves',
      ],
    },
  ],
}

const BLACKSMITH: DescribeSubject = {
  id: 'blacksmith',
  label: 'Blacksmith or forge',
  group: 'Shops & trades',
  prompts: [
    'How hot is it, and how loud?',
    'What is the smith making right now?',
    'What is their speciality, and what will they refuse to make?',
    'Who is the apprentice, and how are they doing?',
  ],
  tables: [
    {
      id: 'forge',
      label: 'The forge',
      entries: [
        'an open-sided shed, the fire visible from the road',
        'a soot-black stone building with a roaring chimney',
        'a forge built into a hillside, the heat trapped inside',
        'a dwarven smithy with runes over every tool',
        "a tiny farrier's shop smelling of burnt hoof",
        'a guild workshop with six anvils going at once',
        'a forge by a stream, a waterwheel working the bellows',
        'a cold forge, the smith gone and the coals grey',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'the ring of hammer on anvil, steady as a heartbeat',
        'the hiss and stink of quenching',
        'sparks drifting out of the door like fireflies',
        'heat that dries the eyes from across the room',
        'the smell of coal smoke and hot iron',
        'bellows wheezing like an old man',
        'a scorched leather apron hung on a hook',
        'scraps of metal crunching underfoot',
      ],
    },
    {
      id: 'work',
      label: 'On the anvil',
      entries: [
        'horseshoes, dozens of them, for the cavalry',
        'a plough blade, the most important job in the village',
        'a sword commissioned by someone who will not give a name',
        'nails, endless nails',
        'a gate of twisted iron vines',
        'repairing armour with a very large hole in it',
        'manacles, a big order, for the gaol',
        'a strange key from a drawing the smith does not understand',
      ],
    },
    {
      id: 'smith',
      label: 'The smith',
      entries: [
        'arms like oak, gentle as a lamb',
        'a scarred veteran who forges only what they have used',
        'a young woman who took over from her father and is better',
        'a perfectionist who scraps half of what they make',
        'a dwarf who calls human steel "soft"',
        'deaf from years of hammering, reads lips perfectly',
        'a drunk who is still the best in the county',
        'a smith who sings while working, terribly',
      ],
    },
  ],
}

const APOTHECARY: DescribeSubject = {
  id: 'apothecary',
  label: 'Alchemist or apothecary',
  group: 'Shops & trades',
  prompts: [
    'What does it smell like, and how strong is it?',
    'What is in the jars, and which are labelled?',
    "Is it a healer's shop, a laboratory, or something less legal?",
    'What has recently gone wrong in the back room?',
  ],
  tables: [
    {
      id: 'shop',
      label: 'The shop',
      entries: [
        'jars floor to ceiling, a ladder on a rail to reach them',
        'bundles of drying herbs hung so thick you duck to pass',
        'a counter of glass vials glinting in candlelight',
        'a bubbling apparatus of tubes and flasks',
        'scorch marks on the ceiling, recently whitewashed',
        'a stuffed crocodile hung from the rafters',
        'a mortar and pestle the size of a barrel',
        'a tiny cluttered nook barely wide enough to turn in',
      ],
    },
    {
      id: 'smell',
      label: 'Smell',
      entries: [
        'mint and camphor that clear the head at once',
        'sulphur and something burnt',
        'vinegar, sharp enough to sting',
        'sweet rot from a jar that should be thrown out',
        'lavender and beeswax',
        'a metallic tang like blood',
        'smoke from a fuming dish of coloured powder',
        'wet earth and mushrooms',
      ],
    },
    {
      id: 'jars',
      label: 'In a jar',
      entries: [
        'leeches, fat and lazy',
        'a pickled two-headed snake',
        'glowing blue moss',
        'teeth, sorted by size',
        'something that taps on the glass',
        "powdered bone labelled 'not human, probably'",
        'a single eye in clear liquid',
        'fireflies in honey',
        'dried mandrake, its face twisted mid-scream',
        'quicksilver that rolls by itself',
      ],
    },
    {
      id: 'keeper',
      label: 'Keeper',
      entries: [
        'an old herb-wife who diagnoses customers on sight',
        'a twitchy alchemist with no eyebrows',
        'a sleek dealer in remedies and poisons alike',
        'a temple-trained healer who disapproves of half the stock',
        'an apprentice covering for a missing master',
        'a gnome taste-testing everything',
      ],
    },
  ],
}

const MAGIC_SHOP: DescribeSubject = {
  id: 'magic-shop',
  label: 'Magic shop',
  group: 'Shops & trades',
  prompts: [
    'How does the shop hide or announce what it sells?',
    'What protections keep thieves out?',
    'What is in the window, and is it real?',
    'What does the owner want in trade instead of gold?',
  ],
  tables: [
    {
      id: 'shop',
      label: 'The shop',
      entries: [
        'a door that is only there when you need it',
        'a dusty bookshop with a back room for the real stock',
        'a gleaming boutique where every item floats on a cushion of air',
        'a cramped curiosity shop where things move when unobserved',
        'a tower with the shop on the ground floor',
        'a market tent bigger inside than out',
        'a pawnshop that does not ask where things came from',
        'an elegant salon where nothing has a price tag',
      ],
    },
    {
      id: 'security',
      label: 'Protection',
      entries: [
        'a mimic posing as the umbrella stand',
        'every item tied to a bell that rings if it leaves',
        'a familiar cat that follows customers around',
        'a sign: shoplifters will be turned into newts. Several newts in a tank',
        'an animated suit of armour by the door',
        'a counter that does not let you reach past it',
        'mirrors that reflect only what you are hiding',
        'nothing visible, which is the scariest option',
      ],
    },
    {
      id: 'item',
      label: 'In the window',
      entries: [
        'a sword that hums when someone lies nearby',
        'boots that leave no footprints',
        'a crystal ball showing a different scene each hour',
        'a cloak the colour of whatever is behind it',
        'a bottle containing a very small, very angry storm',
        'a hat with a voice and opinions',
        'a quill that writes on its own',
        'a mirror with someone else in it',
      ],
    },
  ],
}

const GENERAL_STORE: DescribeSubject = {
  id: 'general-store',
  label: 'General store or trading post',
  group: 'Shops & trades',
  prompts: [
    'What does it stock that nobody else nearby does?',
    'Is it the social hub, and who is always loitering?',
    'What has run out, and why?',
    'How is credit handled?',
  ],
  tables: [
    {
      id: 'store',
      label: 'The store',
      entries: [
        'a log trading post with a stockade around it',
        'a long dim shop with goods hung from every beam',
        'a counter with a cracker barrel and a stove',
        'a post office, store and bank in one room',
        'a wagon-yard store for caravans heading out',
        'a store built from an old chapel, pews as shelves',
        'a waterside store selling to boats from the jetty',
        'a fortified store on a frontier, arrow slits in the walls',
      ],
    },
    {
      id: 'stock',
      label: 'Stock',
      entries: [
        'rope in every thickness',
        'barrels of salt fish, flour and nails',
        'secondhand adventuring gear from those who did not return',
        'lamp oil, tinder and candles',
        'furs traded in from trappers',
        'tea from very far away, at a very high price',
        'shovels, picks and a bucket of mismatched handles',
        'trail rations of dubious age',
      ],
    },
    {
      id: 'shortage',
      label: 'Out of stock',
      entries: [
        'salt, since the road was cut',
        'arrows, the militia bought them all',
        'medicine, sickness in the village',
        'iron, the mine has stopped producing',
        'beer, a disaster nobody will forgive',
        'silver, everyone is buying it and nobody says why',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Inns & leisure
// ---------------------------------------------------------------------------

const BATHHOUSE: DescribeSubject = {
  id: 'bathhouse',
  label: 'Bathhouse',
  group: 'Inns & leisure',
  prompts: [
    'How is the water heated, and how hot is it?',
    'Who comes here, and who is not welcome?',
    'What deals are struck in the steam?',
  ],
  tables: [
    {
      id: 'space',
      label: 'The baths',
      entries: [
        'tiled pools beneath a cracked mosaic dome',
        'wooden tubs in curtained stalls',
        'a natural hot spring under a timber roof',
        'a steam room so thick you cannot see your hand',
        'cold plunge pools that make grown warriors yelp',
        'an ancient bath built over a sacred spring',
      ],
    },
    {
      id: 'detail',
      label: 'Detail',
      entries: [
        'attendants with brushes and stern faces',
        'a masseur with hands like vices',
        'the smell of cedar and scented oil',
        'politicians whispering in the hottest pool',
        'a lost and found full of fine jewellery',
        'a barber offering shaves and tooth-pulling',
        'graffiti scratched into the marble by soldiers',
        'a pool nobody uses, the water oddly dark',
      ],
    },
    {
      id: 'patrons',
      label: 'Patrons',
      entries: [
        'off-duty guards gambling with knucklebones',
        'a noble pretending to be a commoner',
        'merchants doing business without clothes or witnesses',
        'a famous duellist showing off scars',
        'old men who have been here since dawn',
        'a priestess of a water god conducting a rite',
      ],
    },
  ],
}

const THEATRE: DescribeSubject = {
  id: 'theatre',
  label: 'Theatre or playhouse',
  group: 'Inns & leisure',
  prompts: [
    'What is playing tonight, and is it any good?',
    'How does the crowd behave?',
    'What drama is going on backstage?',
    'Who in the audience is more interesting than the play?',
  ],
  tables: [
    {
      id: 'house',
      label: 'The house',
      entries: [
        'an open-air ring, the cheap seats standing in the mud',
        'a gilded hall with private boxes for the rich',
        'a cart that unfolds into a stage in the square',
        'a tavern back room with a curtain on a rope',
        'an old temple converted, the altar now the stage',
        'a rough wooden playhouse that burns down every few years',
      ],
    },
    {
      id: 'show',
      label: "Tonight's show",
      entries: [
        'a tragedy with far too much stage blood',
        'a comedy mocking the local lord, very risky',
        'a melodrama the audience boos and cheers aloud',
        'a historical epic with twelve actors playing two hundred parts',
        'a puppet show that is darker than it seems',
        'an opera in a language nobody understands',
        'a magic show with real magic',
        'a new play nobody has read, opening night nerves everywhere',
      ],
    },
    {
      id: 'backstage',
      label: 'Backstage',
      entries: [
        'the lead actor has vanished an hour before curtain',
        'two actors in a feud carried on in their lines',
        'a prop sword that turns out to be very real',
        'the writer pacing, rewriting the ending',
        'debt collectors waiting by the stage door',
        'a ghost everybody insists is part of the show',
      ],
    },
  ],
}

const GAMBLING_DEN: DescribeSubject = {
  id: 'gambling-den',
  label: 'Gambling den',
  group: 'Inns & leisure',
  prompts: [
    'How do you get in, and who decides?',
    'What is the game everyone is crowding around?',
    'Who runs the house, and how do they keep it winning?',
    'What happens to people who cannot pay?',
  ],
  tables: [
    {
      id: 'den',
      label: 'The den',
      entries: [
        'a cellar under a laundry, reached by a trapdoor',
        "a riverboat moored just outside the city's jurisdiction",
        'a grand saloon with velvet and chandeliers',
        'a smoky back room with one table and many knives',
        'a cockpit where animals fight and men bet',
        'a respectable club where fortunes change hands quietly',
      ],
    },
    {
      id: 'game',
      label: 'The game',
      entries: [
        'dice against the house, the house always smiling',
        'a card game with rules that change as you play',
        'dragonchess between two masters, the room silent',
        'a race of trained rats on a painted track',
        'a wheel of fortune with a suspicious creak',
        'arm wrestling, the champion undefeated for a year',
        'betting on which of the drunks will fall over first',
        'a game where the stakes are memories, not coin',
      ],
    },
    {
      id: 'house',
      label: 'The house',
      entries: [
        'a smiling halfling who never forgets a face',
        'bouncers who are mostly shoulders',
        'a croupier with a very quick hand',
        'a crime boss watching from a balcony',
        'a debt book kept in blood-red ink',
        'a mage on retainer who detects cheating, or does it',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Religious
// ---------------------------------------------------------------------------

const CHURCH: DescribeSubject = {
  id: 'church',
  label: 'Church or cathedral',
  group: 'Religious',
  prompts: [
    'How does it dominate, or hide in, the place around it?',
    'How old is it, and which parts were added by whom?',
    'Where does the light fall, and on what?',
    'Who is the priest, and what does the congregation think of them?',
    'What is buried beneath it?',
  ],
  tables: [
    {
      id: 'building',
      label: 'The building',
      entries: [
        'a squat stone parish church with a square tower',
        'a soaring cathedral, scaffolding still on the spire after a century',
        'a timber chapel with a shingled steeple',
        'a round church built by crusading knights',
        'a church half sunk into the ground as the town rose around it',
        'a fortified church with arrow slits in the belfry',
        'a cathedral of white stone, blinding in the sun',
        'a church built in a converted barn, still smelling of hay',
      ],
    },
    {
      id: 'interior',
      label: 'Inside',
      entries: [
        'rows of worn pews polished by generations',
        'a rood screen carved with saints and devils',
        'a stained-glass window of a saint slaying a beast',
        'walls covered in faded paintings of the last judgement',
        'a font carved from a single block of black stone',
        'banners of local regiments hanging from the beams',
        'a pulpit high enough to look down on everyone',
        'memorial plaques covering every inch of wall',
      ],
    },
    {
      id: 'bells',
      label: 'Bells & sounds',
      entries: [
        'bells rung for every hour, always slightly late',
        'a choir practising the same line over and over',
        'an organ wheezing like a sick ox',
        'a cracked bell that clanks rather than rings',
        'echoing silence broken by a cough',
        'pigeons in the belfry',
        'a single tolling bell for a funeral',
        'bells that ring at night with nobody in the tower',
      ],
    },
    {
      id: 'clergy',
      label: 'The clergy',
      entries: [
        "a kindly old priest who knows every family's secrets",
        'a fiery preacher with a growing, angry following',
        'a young curate terrified of the bishop',
        'a bishop more interested in politics than prayer',
        'a priest who quietly drinks the communion wine',
        'a nun running the church while the priest is away',
        'a verger who has outlasted five priests',
        'a priest who has lost their faith and not told anyone',
      ],
    },
    {
      id: 'beneath',
      label: 'Beneath',
      entries: [
        'a crypt of founders in stone effigy',
        'an ossuary of skulls stacked in patterns',
        'the ruins of an older pagan temple',
        "a smugglers' tunnel to the river",
        'a sealed tomb with a warning on the lid',
        'nothing, which the priest insists on too firmly',
      ],
    },
  ],
}

const MONASTERY: DescribeSubject = {
  id: 'monastery',
  label: 'Monastery or abbey',
  group: 'Religious',
  prompts: [
    'What is the rule of life here, and how strictly is it kept?',
    'How does the community support itself?',
    'Do they welcome travellers, and on what terms?',
    'What knowledge or relic do they guard?',
  ],
  tables: [
    {
      id: 'place',
      label: 'The place',
      entries: [
        'a walled cloister around a garden of herbs',
        'a cliff-top hermitage reached by basket and rope',
        'an island abbey cut off at high tide',
        'a mountain monastery above the clouds',
        'a ruined abbey with a handful of monks still living in one wing',
        'a wealthy abbey with its own vineyards and mill',
      ],
    },
    {
      id: 'life',
      label: 'Daily life',
      entries: [
        'bells calling prayers seven times a day',
        'monks copying books in a cold scriptorium',
        'a vow of silence, everything signed with hands',
        'brewing beer that pays for everything',
        'martial training at dawn in the courtyard',
        'bees, hundreds of hives, honey and wax for trade',
        'tending the sick in an infirmary',
        'a strict fast that makes the novices faint',
      ],
    },
    {
      id: 'guarded',
      label: 'Guarded within',
      entries: [
        'a library with a locked section',
        'the bones of a saint said to heal',
        "a prophecy written in the founder's hand",
        'a prisoner kept for their own safety',
        'a gate to somewhere else, kept closed by prayer',
        "the deed to half the valley's land",
      ],
    },
  ],
}

const GRAVEYARD: DescribeSubject = {
  id: 'graveyard',
  label: 'Graveyard or crypt',
  group: 'Religious',
  prompts: [
    'Who is buried here, and who is buried apart?',
    'How well is it kept, and by whom?',
    'Which grave gets fresh flowers, and from whom?',
    'What do the locals say about it after dark?',
  ],
  tables: [
    {
      id: 'ground',
      label: 'The ground',
      entries: [
        'leaning headstones in long grass',
        'a city of marble tombs and mausoleums',
        'a churchyard so full the ground has risen',
        "a paupers' field with wooden markers rotted away",
        'a hillside barrow ringed with stones',
        'a crypt of stacked niches, names worn smooth',
        'a battlefield burial ground with rows of identical stones',
        'a family plot fenced in iron behind a farmhouse',
      ],
    },
    {
      id: 'detail',
      label: 'Detail',
      entries: [
        'a yew tree older than the church',
        'a mort-safe iron cage over a fresh grave',
        "a watchman's hut for guarding against body-snatchers",
        'an open grave, dug for someone not yet dead',
        'carved skulls and hourglasses on every stone',
        'a weeping angel statue missing its face',
        'a grave decorated with toys',
        'a tomb door slightly ajar',
      ],
    },
    {
      id: 'epitaph',
      label: 'Epitaph',
      entries: [
        '"Here lies one who trusted the ferryman"',
        '"She told you she was ill"',
        '"Do not dig"',
        '"Gone ahead. Keep the lamp lit"',
        'a name and two dates, the second one in the future',
        'a long list of names, all dated the same day',
        'only a symbol, the same one on six other graves',
        '"Returned to us twice. Not again"',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Civic & military
// ---------------------------------------------------------------------------

const GUILDHALL: DescribeSubject = {
  id: 'guildhall',
  label: 'Guildhall or town hall',
  group: 'Civic & military',
  prompts: [
    'Who meets here, and who is kept out?',
    "How does the building show off the guild's money?",
    'What is being argued about this week?',
    'Who really holds power in the room?',
  ],
  tables: [
    {
      id: 'hall',
      label: 'The hall',
      entries: [
        'a timber-framed hall on stilts above the market',
        'a grand stone building with a clock tower',
        'a hall of ancient beams hung with guild banners',
        'a counting house with an armed guard on every door',
        'an imposing chamber with a gallery for the public',
        'a modest room above a tavern, very grand in its own mind',
      ],
    },
    {
      id: 'detail',
      label: 'Detail',
      entries: [
        'a long table with a carved chair at each end',
        'charters framed on the walls, seals dangling',
        'a strongbox chained to the floor',
        'portraits of every guildmaster, getting fatter',
        'a set of official weights and measures under glass',
        "the guild's ceremonial mace, very heavy",
        "a petitioners' bench, always full",
        "a mural of the town's founding, highly inaccurate",
      ],
    },
    {
      id: 'business',
      label: "This week's business",
      entries: [
        'a vote on raising tolls',
        'expelling a member for cheating',
        'a petition from the poor quarter, ignored',
        'arguing over who pays for the bridge repairs',
        'a grand feast to impress a visiting dignitary',
        'a secret meeting nobody admits happened',
      ],
    },
  ],
}

const LIBRARY: DescribeSubject = {
  id: 'library',
  label: 'Library or archive',
  group: 'Civic & military',
  prompts: [
    'How are the books kept, and how are they protected?',
    'Who is allowed in, and what does it cost?',
    'Who is the librarian, and what are their rules?',
    'What book is everyone looking for?',
  ],
  tables: [
    {
      id: 'room',
      label: 'The room',
      entries: [
        'towering shelves reached by rolling ladders',
        'chained books on slanted desks',
        'a dim reading room with green-shaded lamps',
        'scroll racks like honeycomb in a cool cellar',
        'a round tower with a spiral of shelves',
        'a collapsed wing, books spilling out into the rain',
        "a private collection in a noble's study",
        'an archive of town records in crates labelled by year',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'the vanilla smell of old paper',
        'dust motes turning in a shaft of light',
        'a scratching quill somewhere in the stacks',
        'the creak of a ladder rolling on its rail',
        'a cough echoing from the far end',
        'silence so strict a dropped pin draws a glare',
      ],
    },
    {
      id: 'librarian',
      label: 'Librarian',
      entries: [
        'an ancient scholar who has read everything and remembers half',
        'a strict archivist who demands clean hands',
        'a young clerk who is secretly selling books',
        'a construct that catalogues in a monotone',
        'a monk copying a book that is copying itself',
        'nobody, just a sign: return what you take',
      ],
    },
  ],
}

const GAOL: DescribeSubject = {
  id: 'gaol',
  label: 'Gaol or prison',
  group: 'Civic & military',
  prompts: [
    'Who is locked up here, and for what?',
    'How bad are the conditions?',
    'Who guards it, and can they be bought?',
    'What is the one way out nobody has noticed?',
  ],
  tables: [
    {
      id: 'building',
      label: 'The building',
      entries: [
        'a squat tower with barred slits for windows',
        'a pit under the town square with a grate on top',
        "cells carved into the castle's foundations",
        'a hulk, an old ship moored in the harbour',
        'a single lock-up shed behind the watchhouse',
        'a grim fortress on an island',
      ],
    },
    {
      id: 'conditions',
      label: 'Conditions',
      entries: [
        'damp straw and a single bucket',
        'prisoners chained to the wall, barely able to sit',
        'surprisingly decent, the warden takes pride in it',
        'rats bold enough to steal food from hands',
        'pay-for-comfort: the rich have rugs and wine',
        'water ankle-deep at high tide',
      ],
    },
    {
      id: 'inmate',
      label: 'Notable inmate',
      entries: [
        'a poet jailed for an insulting verse',
        'a debtor who has been here ten years',
        'a captured bandit chief who is far too calm',
        'a child arrested for stealing bread',
        'someone who swears they are the true heir',
        'a prisoner nobody remembers arresting',
        'a priest of a banned faith, still preaching',
        'a cellmate who knows more than they should about the party',
      ],
    },
  ],
}

const BARRACKS: DescribeSubject = {
  id: 'barracks',
  label: 'Watchhouse or barracks',
  group: 'Civic & military',
  prompts: [
    'How disciplined are the soldiers, really?',
    'What are they training for, or bored of waiting for?',
    'Who is in command, and do the troops respect them?',
  ],
  tables: [
    {
      id: 'building',
      label: 'The building',
      entries: [
        'a watchhouse with a lantern and a bell by the door',
        'long barracks of bunks, kit hung at the foot of each',
        'a fortified gatehouse doubling as quarters',
        'a muddy camp of tents and a palisade',
        'an armoury with racks of polished halberds',
        'a parade ground ringed by stables and stores',
      ],
    },
    {
      id: 'mood',
      label: 'The troops',
      entries: [
        'drilling in perfect lines, sergeant bellowing',
        'dice and cards on an upturned shield',
        'nursing wounds from a recent skirmish',
        'polishing armour for an inspection',
        'grumbling about pay that is three months late',
        'singing a filthy marching song',
        'recruits barely old enough to shave',
        'veterans who have seen too much and say little',
      ],
    },
    {
      id: 'board',
      label: 'On the duty board',
      entries: [
        'wanted posters, one recently updated',
        'a roster with a name crossed out in red',
        'curfew orders for the docks',
        'a reward for information about missing patrols',
        'a list of banned weapons',
        'a map of the district with pins in it',
      ],
    },
  ],
}

const WIZARD_TOWER: DescribeSubject = {
  id: 'wizard-tower',
  label: "Wizard's tower",
  group: 'Civic & military',
  prompts: [
    'How does the tower defy the ordinary rules of buildings?',
    'How does it keep visitors out, or let them in?',
    'What has the wizard been working on?',
    'What has escaped, or is trying to?',
  ],
  tables: [
    {
      id: 'tower',
      label: 'The tower',
      entries: [
        'a spire with no visible door',
        'a tower that leans at an impossible angle',
        'a tower larger inside than the hill it sits on',
        'a crooked tower of mismatched stone grown over centuries',
        'a tower of glass and brass, gears turning at the top',
        'a tower whose top floor floats a few feet above the rest',
        'a squat tower ringed by petrified trees',
        'a tower that is in a different place each morning',
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      entries: [
        'a staircase that is longer going down than up',
        'books flapping between shelves like birds',
        'a laboratory with something half finished under a sheet',
        'an orrery of the planets, turning slowly',
        "a familiar running the place in the wizard's absence",
        'every surface covered in chalk equations',
        'a room full of jars, each holding a different weather',
        'a summoning circle with one line scuffed out',
      ],
    },
    {
      id: 'ward',
      label: 'Wards',
      entries: [
        'a door knocker that asks riddles, rudely',
        'stairs that rearrange for anyone uninvited',
        'gargoyles that follow movement',
        'a hedge maze that resets every hour',
        'an illusion of a much larger, angrier tower',
        'a polite sign and a very large trapdoor',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Working buildings
// ---------------------------------------------------------------------------

const MILL: DescribeSubject = {
  id: 'mill',
  label: 'Mill',
  group: 'Working buildings',
  prompts: [
    'What drives it: water, wind, animal, magic?',
    'Who owns it, and how much do they charge the village?',
    'What sound does it make, and when does it stop?',
  ],
  tables: [
    {
      id: 'mill',
      label: 'The mill',
      entries: [
        'a waterwheel turning steadily in a fast stream',
        'a windmill with patched sails on a bare hill',
        'a horse-mill, a blindfolded pony walking in circles',
        'a tidal mill, working only twice a day',
        'a ruined mill with the wheel locked by weeds',
        'a gnomish mill with far too many gears',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'the groan of the great millstones',
        'flour dust coating everything white',
        'the splash and drip of the wheel',
        'the rhythmic clack of the hopper',
        'sacks piled high, mice everywhere',
        'the creak of sails turning in the wind',
      ],
    },
    {
      id: 'miller',
      label: 'The miller',
      entries: [
        'a miller everyone suspects of short-weighting',
        'a cheerful giant of a man, white to the eyebrows',
        'a widow who outworks anyone in the valley',
        'a miller who hears voices in the millrace',
        'a family that has held the mill for ten generations',
        'a new owner from the city, hated on sight',
      ],
    },
  ],
}

const WAREHOUSE: DescribeSubject = {
  id: 'warehouse',
  label: 'Warehouse or dockside',
  group: 'Working buildings',
  prompts: [
    'What is stored here, officially?',
    'What is stored here, unofficially?',
    'Who is working, and who is watching?',
    'Where is the best place to hide, or to fight?',
  ],
  tables: [
    {
      id: 'building',
      label: 'The building',
      entries: [
        'a cavernous timber shed with a hoist above the door',
        'a stone warehouse on stilts over the water',
        'a crumbling customs house with the seals broken',
        'rows of identical sheds numbered in fading paint',
        'a grain store with rats the size of cats',
        'a bonded warehouse with a tax collector at the door',
      ],
    },
    {
      id: 'cargo',
      label: 'Cargo',
      entries: [
        "crates stamped with a foreign merchant's mark",
        'barrels of wine, some of them sloshing oddly',
        'bales of wool stacked to the rafters',
        'casks of whale oil and the stink to match',
        'coffins, a lot of them, for a small town',
        'a caged animal nobody wants to feed',
        'crates of weapons labelled as farm tools',
        'a single locked crate under a guard',
      ],
    },
    {
      id: 'activity',
      label: 'Activity',
      entries: [
        'stevedores singing as they haul',
        'a clerk counting barrels and losing count',
        'a night watchman asleep on a sack',
        'smugglers unloading by shuttered lantern',
        'a fight over unpaid wages',
        'a cat hunting between the crates',
      ],
    },
  ],
}

const STABLE: DescribeSubject = {
  id: 'stable',
  label: 'Stable or coaching yard',
  group: 'Working buildings',
  prompts: [
    'How many animals, and how well kept?',
    'Who works here, and what do they overhear?',
    'What unusual mount is in the end stall?',
  ],
  tables: [
    {
      id: 'yard',
      label: 'The yard',
      entries: [
        'a cobbled coaching yard ringed by stalls and a hayloft',
        'a ramshackle livery with half the roof missing',
        "a lord's stables cleaner than most houses",
        'a muddy paddock with a lean-to shelter',
        'a cavalry stable, every horse groomed to a shine',
        'a stable carved into rock, cool and dim',
      ],
    },
    {
      id: 'senses',
      label: 'Sense detail',
      entries: [
        'warm horse, leather and hay',
        'the stamp and snort of restless animals',
        "a farrier's hammer from the next yard",
        'a cat asleep on a sleeping horse',
        'manure steaming in the cold',
        'harness bells jingling as a coach arrives',
      ],
    },
    {
      id: 'mount',
      label: 'In the end stall',
      entries: [
        'a warhorse with battle scars and a bad temper',
        'a pony that escapes no matter what',
        'a horse with eyes of two colours that will not let anyone near',
        'a giant lizard kept by a southern merchant',
        'a mule that is clearly smarter than its owner',
        'a winged horse, wings bound, looking miserable',
        'an empty stall nobody is allowed to use',
        'a racehorse under guard before a big wager',
      ],
    },
  ],
}

const LIGHTHOUSE: DescribeSubject = {
  id: 'lighthouse',
  label: 'Lighthouse',
  group: 'Working buildings',
  prompts: [
    'What danger does the light warn ships away from?',
    'Who keeps the light, and how lonely are they?',
    'Has the light ever gone out, and what happened?',
  ],
  tables: [
    {
      id: 'tower',
      label: 'The tower',
      entries: [
        'a white tower on a black rock lashed by waves',
        'a squat stone tower with a beacon fire on top',
        'a lighthouse at the end of a mile-long causeway',
        'a tower whose light is a captured star',
        'a ruined lighthouse with a new one beside it',
        'a lighthouse leaning out over the cliff edge',
      ],
    },
    {
      id: 'keeper',
      label: 'Keeper',
      entries: [
        'an old keeper who talks to the gulls',
        'a family living in the cramped rooms below the lamp',
        'a keeper who logs every ship in obsessive detail',
        'a keeper nobody has seen in a month, though the light still burns',
        'a retired pirate making amends',
        'two keepers who no longer speak to each other',
      ],
    },
    {
      id: 'detail',
      label: 'Detail',
      entries: [
        'a spiral staircase of a hundred iron steps',
        'oil barrels stacked in every corner',
        'a logbook with a page torn out',
        'the lens, polished to a perfect shine',
        'a shipwreck visible on the rocks below at low tide',
        'scratches on the inside of the door',
      ],
    },
  ],
}

export const BUILDING_SUBJECTS: ReadonlyArray<DescribeSubject> = [
  RUIN,
  COTTAGE,
  FARMSTEAD,
  TOWNHOUSE,
  MANOR,
  MARKET_STALL,
  BLACKSMITH,
  APOTHECARY,
  MAGIC_SHOP,
  GENERAL_STORE,
  BATHHOUSE,
  THEATRE,
  GAMBLING_DEN,
  CHURCH,
  MONASTERY,
  GRAVEYARD,
  GUILDHALL,
  LIBRARY,
  GAOL,
  BARRACKS,
  WIZARD_TOWER,
  MILL,
  WAREHOUSE,
  STABLE,
  LIGHTHOUSE,
]
