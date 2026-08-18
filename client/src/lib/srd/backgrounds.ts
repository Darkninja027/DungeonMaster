/**
 * The SRD 5.1 backgrounds (CC BY 4.0 — see ./index.ts).
 *
 * The SRD contains thirteen. The PHB's Charlatan, Guild Artisan, Hermit and
 * others are absent on purpose — see the header of ./races.ts. A player who
 * wants one types the name and the sheet keeps it.
 *
 * `suggestions` are trimmed to a handful each rather than the full d6/d8 tables:
 * they seed the markdown body's Personality section, and the player writes over
 * them immediately. Enough to prompt, not a transcription.
 */

import {
  ALL_LANGUAGES,
  ARTISAN_TOOLS,
  GAMING_SETS,
  MUSICAL_INSTRUMENTS,
  PACKS,
} from './equipment'
import type { BackgroundInfo } from './types'

export const SRD_BACKGROUNDS: Array<BackgroundInfo> = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    summary: 'A servant of a temple, versed in rite and doctrine.',
    feature: {
      name: 'Shelter of the Faithful',
      text: 'You and your companions can receive free healing and care at temples of your faith, and you can call on the priests there for support that does not endanger them.',
    },
    grant: {
      skills: ['insight', 'religion'],
      items: [
        { text: 'Holy symbol', weight: 1 },
        { text: 'Prayer book', weight: 5 },
        { text: 'Stick of incense', qty: 5 },
        { text: 'Vestments', weight: 4 },
        { text: 'Common clothes', weight: 3 },
        PACKS.priest,
      ],
      currency: { gp: 15 },
      picks: [
        {
          id: 'acolyte-languages',
          kind: 'language',
          label: 'Two languages of your choice',
          count: 2,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I idolise a particular hero of my faith and constantly refer to their deeds.',
        'I can find common ground between the fiercest enemies.',
        'I see omens in every event and action.',
      ],
      ideals: [
        'Tradition. The ancient rites must be preserved.',
        'Charity. I always try to help those in need.',
        'Faith. I trust that my deity will guide my actions.',
      ],
      bonds: [
        'I would die to recover an ancient relic of my faith.',
        'Everything I do is for the common people.',
        'I owe my life to the priest who took me in.',
      ],
      flaws: [
        'I judge others harshly, and myself even more severely.',
        'I put too much trust in those who wield power in my temple.',
        'My piety sometimes leads me to blindly trust those who profess faith.',
      ],
    },
  },
  {
    id: 'criminal',
    name: 'Criminal',
    summary: 'An experienced lawbreaker with contacts in the underworld.',
    feature: {
      name: 'Criminal Contact',
      text: 'You have a reliable contact in a criminal network who acts as your liaison, and you know how to get messages to and from them.',
    },
    grant: {
      skills: ['deception', 'stealth'],
      tools: ['Thieves’ tools'],
      items: [
        { text: 'Crowbar', weight: 5 },
        { text: 'Common clothes (dark, with a hood)', weight: 3, fits: null },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 15 },
      picks: [
        {
          id: 'criminal-gaming-set',
          kind: 'tool',
          label: 'One type of gaming set',
          count: 1,
          options: [...GAMING_SETS],
        },
      ],
    },
    suggestions: {
      traits: [
        'I always have a plan for what to do when things go wrong.',
        'I am incredibly slow to trust.',
        'The best way to get me to do something is to tell me I can’t.',
      ],
      ideals: [
        'Freedom. Chains are meant to be broken.',
        'Honour. I don’t steal from others in the trade.',
        'Greed. I will do whatever it takes to become wealthy.',
      ],
      bonds: [
        'I’m trying to pay off an old debt to a generous benefactor.',
        'Something important was taken from me, and I aim to get it back.',
        'I will become the greatest thief who ever lived.',
      ],
      flaws: [
        'When I see something valuable, I can think of nothing but how to steal it.',
        'I turn tail and run when things look bad.',
        'An innocent person is in prison for a crime I committed.',
      ],
    },
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    summary: 'A commoner who stood up when nobody else would.',
    feature: {
      name: 'Rustic Hospitality',
      text: 'Common folk will shelter and hide you from the law or anyone else searching for you, though they will not risk their lives for you.',
    },
    grant: {
      skills: ['animal-handling', 'survival'],
      tools: ['Vehicles (land)'],
      items: [
        { text: 'Shovel', weight: 5 },
        { text: 'Iron pot', weight: 10 },
        { text: 'Common clothes', weight: 3 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
      picks: [
        {
          id: 'folk-hero-tools',
          kind: 'tool',
          label: 'One type of artisan’s tools',
          count: 1,
          options: [...ARTISAN_TOOLS],
        },
      ],
    },
    suggestions: {
      traits: [
        'I judge people by their actions, not their words.',
        'If someone is in trouble, I’m always ready to help.',
        'I have a strong sense of fair play and always try to find the most equitable solution.',
      ],
      ideals: [
        'Respect. People deserve to be treated with dignity.',
        'Sincerity. There’s no good in pretending to be something I’m not.',
        'Destiny. Nothing and no one can steer me away from my higher calling.',
      ],
      bonds: [
        'I have a family, but I have no idea where they are.',
        'I worked the land, I love the land, and I will protect the land.',
        'A proud noble once gave me a horrible beating, and I will have my revenge.',
      ],
      flaws: [
        'The tyrant who rules my land will stop at nothing to see me killed.',
        'I’m convinced of the significance of my destiny, and blind to my shortcomings.',
        'I have a weakness for the vices of the city, especially hard drink.',
      ],
    },
  },
  {
    id: 'noble',
    name: 'Noble',
    summary: 'Born to wealth, privilege and obligation.',
    feature: {
      name: 'Position of Privilege',
      text: 'People are inclined to think the best of you. You are welcome in high society, and can secure an audience with a local noble if you need one.',
    },
    grant: {
      skills: ['history', 'persuasion'],
      items: [
        { text: 'Fine clothes', weight: 6 },
        { text: 'Signet ring', fits: 'ring1' },
        { text: 'Scroll of pedigree' },
        { text: 'Purse', weight: 1 },
      ],
      currency: { gp: 25 },
      picks: [
        {
          id: 'noble-gaming-set',
          kind: 'tool',
          label: 'One type of gaming set',
          count: 1,
          options: [...GAMING_SETS],
        },
        {
          id: 'noble-language',
          kind: 'language',
          label: 'One language of your choice',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'My eloquent flattery makes everyone I talk to feel like the most wonderful person in the world.',
        'I take great pains to always look my best and follow the latest fashions.',
        'I don’t like to get my hands dirty, and I won’t be caught dead in unsuitable accommodations.',
      ],
      ideals: [
        'Noble Obligation. It is my duty to protect and care for the people beneath me.',
        'Independence. I must prove that I can handle myself without coddling.',
        'Power. If I can attain more power, no one will tell me what to do.',
      ],
      bonds: [
        'I will face any challenge to win the approval of my family.',
        'My house’s alliance with another noble family must be sustained at all costs.',
        'The common folk must see me as a hero of the people.',
      ],
      flaws: [
        'I secretly believe that everyone is beneath me.',
        'I hide a truly scandalous secret that could ruin my family forever.',
        'I have an insatiable desire for carnal pleasures.',
      ],
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    summary: 'A scholar who has spent years among books and questions.',
    feature: {
      name: 'Researcher',
      text: 'When you attempt to learn or recall a piece of lore, you often know where and from whom you can obtain it, even if that place or person is dangerous to reach.',
    },
    grant: {
      skills: ['arcana', 'history'],
      items: [
        { text: 'Bottle of black ink' },
        { text: 'Quill' },
        { text: 'Small knife', weight: 1 },
        {
          text: 'Letter from a dead colleague posing a question you have not yet solved',
        },
        { text: 'Common clothes', weight: 3 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
      picks: [
        {
          id: 'sage-languages',
          kind: 'language',
          label: 'Two languages of your choice',
          count: 2,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I use polysyllabic words that convey the impression of great erudition.',
        'I am used to helping out those who aren’t as smart as I am, and I patiently explain anything.',
        'I’m willing to listen to every side of an argument before I make my own judgement.',
      ],
      ideals: [
        'Knowledge. The path to power and self-improvement is through knowledge.',
        'Beauty. What is beautiful points us beyond itself toward what is true.',
        'No Limits. Nothing should fetter the infinite possibility inherent in all existence.',
      ],
      bonds: [
        'It is my duty to protect my students.',
        'I have an ancient text that holds terrible secrets that must not fall into the wrong hands.',
        'I work to preserve a library, university, scriptorium or monastery.',
      ],
      flaws: [
        'I am easily distracted by the promise of information.',
        'Most people scream and run when they see a demon. I stop and take notes on its anatomy.',
        'I speak without really thinking through my words, invariably insulting others.',
      ],
    },
  },
  {
    id: 'soldier',
    name: 'Soldier',
    summary: 'Trained, drilled and blooded in someone’s war.',
    feature: {
      name: 'Military Rank',
      text: 'Soldiers loyal to your former organisation still recognise your authority. You can invoke your rank to requisition simple equipment or gain access to a friendly encampment.',
    },
    grant: {
      skills: ['athletics', 'intimidation'],
      tools: ['Vehicles (land)'],
      items: [
        { text: 'Insignia of rank' },
        { text: 'Trophy taken from a fallen enemy' },
        { text: 'Common clothes', weight: 3 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
      picks: [
        {
          id: 'soldier-gaming-set',
          kind: 'tool',
          label: 'One type of gaming set',
          count: 1,
          options: [...GAMING_SETS],
        },
      ],
    },
    suggestions: {
      traits: [
        'I’m always polite and respectful.',
        'I face problems head-on. A simple, direct solution is the best path to success.',
        'I can stare down a hell hound without flinching.',
      ],
      ideals: [
        'Greater Good. Our lot is to lay down our lives in defence of others.',
        'Responsibility. I do what I must and obey just authority.',
        'Live and Let Live. Ideals aren’t worth killing over.',
      ],
      bonds: [
        'I would still lay down my life for the people I served with.',
        'Someone saved my life on the battlefield. To this day, I will never leave a friend behind.',
        'My honour is my life.',
      ],
      flaws: [
        'The monstrous enemy we faced in battle still leaves me quivering with fear.',
        'I have little respect for anyone who is not a proven warrior.',
        'I obey the law, even if the law causes misery.',
      ],
    },
  },
  {
    id: 'charlatan',
    name: 'Charlatan',
    summary: 'A confidence artist with a talent for being someone else.',
    feature: {
      name: 'False Identity',
      text: 'You have a second identity with documentation and established acquaintances, and you can forge documents you have seen an example of.',
    },
    grant: {
      skills: ['deception', 'sleight-of-hand'],
      tools: ['Disguise kit', 'Forgery kit'],
      items: [
        { text: 'Fine clothes', weight: 6 },
        { text: 'Disguise kit', weight: 3 },
        { text: 'Tools of the con' },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 15 },
    },
    suggestions: {
      traits: [
        'I fall in and out of love easily, and am always pursuing someone.',
        'I have a joke for every occasion, especially occasions where humour is inappropriate.',
        'Flattery is my preferred trick for getting what I want.',
      ],
      ideals: [
        'Independence. I am a free spirit — no one tells me what to do.',
        'Fairness. I never target people who can’t afford to lose a few coins.',
        'Charity. I distribute the money I acquire to the people who really need it.',
      ],
      bonds: [
        'I fleeced the wrong person and must work to ensure they never cross my path again.',
        'I owe everything to my mentor — a horrible person who is probably rotting in jail.',
        'Somewhere out there I have a child who doesn’t know me.',
      ],
      flaws: [
        'I can’t resist a pretty face.',
        'I’m convinced no one could ever fool me the way I fool others.',
        'I’m too greedy for my own good.',
      ],
    },
  },
  {
    id: 'entertainer',
    name: 'Entertainer',
    summary: 'A performer who lives by delighting a crowd.',
    feature: {
      name: 'By Popular Demand',
      text: 'You can always find a place to perform in exchange for lodging and food, and your performances make you something of a local figure.',
    },
    grant: {
      skills: ['acrobatics', 'performance'],
      tools: ['Disguise kit'],
      items: [
        { text: 'Costume', weight: 4 },
        { text: 'Favour of an admirer' },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 15 },
      picks: [
        {
          id: 'entertainer-instrument',
          kind: 'tool',
          label: 'One musical instrument',
          count: 1,
          options: [...MUSICAL_INSTRUMENTS],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I know a story relevant to almost every situation.',
        'I love a good insult, even one directed at me.',
        'I change my mood or my mind as quickly as I change key in a song.',
      ],
      ideals: [
        'Beauty. When I perform, I make the world better than it was.',
        'Freedom. Everyone should be free to pursue their own livelihood.',
        'Honesty. Art should reflect the soul; it should come from within.',
      ],
      bonds: [
        'My instrument is my most treasured possession, and it reminds me of someone I love.',
        'Someone stole my precious instrument, and someday I’ll get it back.',
        'I want to be famous, whatever it takes.',
      ],
      flaws: [
        'I’ll do anything to win fame and renown.',
        'I’m a sucker for a pretty face.',
        'Despite my best efforts, I am unreliable to my friends.',
      ],
    },
  },
  {
    id: 'guild-artisan',
    name: 'Guild Artisan',
    summary: 'A skilled crafter with a guild at their back.',
    feature: {
      name: 'Guild Membership',
      text: 'Your guild will provide lodging and food if necessary, and powerful political allies. Membership costs 5 gp a month.',
    },
    grant: {
      skills: ['insight', 'persuasion'],
      items: [
        { text: 'Letter of introduction from your guild' },
        { text: 'Traveller’s clothes', weight: 4 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 15 },
      picks: [
        {
          id: 'guild-artisan-tools',
          kind: 'tool',
          label: 'One type of artisan’s tools',
          count: 1,
          options: [...ARTISAN_TOOLS],
        },
        {
          id: 'guild-artisan-language',
          kind: 'language',
          label: 'One language of your choice',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I believe that anything worth doing is worth doing right. I can’t help it — I’m a perfectionist.',
        'I’m a snob who looks down on those who can’t appreciate fine art.',
        'I always want to know how things work and what makes people tick.',
      ],
      ideals: [
        'Community. It is the duty of all civilised people to strengthen the bonds of community.',
        'Generosity. My talents were given to me so that I could use them to benefit the world.',
        'Aspiration. I work hard to be the best there is at my craft.',
      ],
      bonds: [
        'The workshop where I learned my trade is the most important place in the world to me.',
        'I created a great work for someone, and then found them unworthy to receive it.',
        'One day I will return to my guild and prove that I am the greatest artisan of them all.',
      ],
      flaws: [
        'I’ll do anything to get my hands on something rare or priceless.',
        'I’m quick to assume that someone is trying to cheat me.',
        'I’m never satisfied with what I have — I always want more.',
      ],
    },
  },
  {
    id: 'hermit',
    name: 'Hermit',
    summary: 'Years of seclusion, and something learned in the silence.',
    feature: {
      name: 'Discovery',
      text: 'Your seclusion gave you access to a unique and powerful discovery — a great truth about the cosmos, a lost fact, or a forgotten ritual.',
    },
    grant: {
      skills: ['medicine', 'religion'],
      tools: ['Herbalism kit'],
      items: [
        { text: 'Scroll case stuffed full of notes', weight: 1 },
        { text: 'Winter blanket', weight: 3 },
        { text: 'Common clothes', weight: 3 },
        { text: 'Herbalism kit', weight: 3 },
      ],
      currency: { gp: 5 },
      picks: [
        {
          id: 'hermit-language',
          kind: 'language',
          label: 'One language of your choice',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I’ve been isolated for so long that I rarely speak, preferring gestures and grunts.',
        'I connect everything that happens to me to a grand cosmic plan.',
        'I feel tremendous empathy for all who suffer.',
      ],
      ideals: [
        'Greater Good. My gifts are meant to be shared with all, not used for my own benefit.',
        'Logic. Emotions must not cloud our sense of what is right and true.',
        'Self-Knowledge. If you know yourself, there’s nothing left to know.',
      ],
      bonds: [
        'Nothing is more important than the other members of my hermitage or order.',
        'I entered seclusion to hide from the ones who might still be hunting me.',
        'I’m still seeking the enlightenment I pursued in my seclusion, and it still eludes me.',
      ],
      flaws: [
        'Now that I’ve returned to the world, I enjoy its delights a little too much.',
        'I harbour dark, bloodthirsty thoughts that my isolation failed to quell.',
        'I like keeping secrets and won’t share them with anyone.',
      ],
    },
  },
  {
    id: 'outlander',
    name: 'Outlander',
    summary: 'Raised in the wilds, far from cities and their comforts.',
    feature: {
      name: 'Wanderer',
      text: 'You have an excellent memory for maps and geography, and can find food and fresh water for yourself and up to five others each day.',
    },
    grant: {
      skills: ['athletics', 'survival'],
      items: [
        { text: 'Staff', weight: 4 },
        { text: 'Hunting trap', weight: 25 },
        { text: 'Trophy from an animal you killed' },
        { text: 'Traveller’s clothes', weight: 4 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
      picks: [
        {
          id: 'outlander-instrument',
          kind: 'tool',
          label: 'One musical instrument',
          count: 1,
          options: [...MUSICAL_INSTRUMENTS],
          open: true,
        },
        {
          id: 'outlander-language',
          kind: 'language',
          label: 'One language of your choice',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
    suggestions: {
      traits: [
        'I’m driven by a wanderlust that led me away from home.',
        'I watch over my friends as if they were a litter of newborn pups.',
        'I have a lesson for every situation, drawn from observing nature.',
      ],
      ideals: [
        'Nature. The natural world is more important than all the constructs of civilisation.',
        'Glory. I must earn glory in battle, for myself and my clan.',
        'Change. Life is like the seasons, in constant change, and we must change with it.',
      ],
      bonds: [
        'My family, clan or tribe is the most important thing in my life, even when they are far from me.',
        'An injury to the unspoiled wilderness of my home is an injury to me.',
        'I will bring terrible wrath down on the evildoers who destroyed my homeland.',
      ],
      flaws: [
        'I am too enamoured of ale, wine and other intoxicants.',
        'There’s no room for caution in a life lived to the fullest.',
        'I remember every insult I’ve received and nurse a silent resentment.',
      ],
    },
  },
  {
    id: 'sailor',
    name: 'Sailor',
    summary: 'Years before the mast, and the scars to prove it.',
    feature: {
      name: 'Ship’s Passage',
      text: 'You can secure free passage on a sailing ship for yourself and your companions, in exchange for your help crewing it.',
    },
    grant: {
      skills: ['athletics', 'perception'],
      tools: ['Navigator’s tools', 'Vehicles (water)'],
      items: [
        { text: 'Belaying pin (club)', weight: 2 },
        { text: 'Silk rope (50 feet)', weight: 5 },
        { text: 'Lucky charm' },
        { text: 'Common clothes', weight: 3 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
    },
    suggestions: {
      traits: [
        'My friends know they can rely on me, no matter what.',
        'I work hard so that I can play hard when the work is done.',
        'I never pass up a friendly wager.',
      ],
      ideals: [
        'Respect. The thing that keeps a ship together is mutual respect between captain and crew.',
        'Fairness. We all do the work, so we all share in the rewards.',
        'Freedom. The sea is freedom — the freedom to go anywhere and do anything.',
      ],
      bonds: [
        'I’m loyal to my captain first, everything else second.',
        'The ship is most important — crewmates and captains come and go.',
        'I was cheated out of my fair share of the profits, and I want to get my due.',
      ],
      flaws: [
        'I follow orders, even if I think they’re wrong.',
        'I’ll say anything to avoid having to do extra work.',
        'My pride will probably lead to my destruction.',
      ],
    },
  },
  {
    id: 'urchin',
    name: 'Urchin',
    summary: 'Raised by the streets, and still faster than you.',
    feature: {
      name: 'City Secrets',
      text: 'You know the secret patterns and flow of cities and can find passages through the urban sprawl, travelling twice as fast between locations.',
    },
    grant: {
      skills: ['sleight-of-hand', 'stealth'],
      tools: ['Disguise kit', 'Thieves’ tools'],
      items: [
        { text: 'Small knife', weight: 1 },
        { text: 'Map of the city you grew up in' },
        { text: 'Pet mouse' },
        { text: 'Token to remember your parents by' },
        { text: 'Common clothes', weight: 3 },
        { text: 'Belt pouch', weight: 1 },
      ],
      currency: { gp: 10 },
    },
    suggestions: {
      traits: [
        'I hide scraps of food and trinkets away in my pockets.',
        'I ask a lot of questions.',
        'I like to squeeze into small places where no one else can get to me.',
      ],
      ideals: [
        'Respect. All people, rich or poor, deserve respect.',
        'Community. We have to take care of each other, because no one else is going to.',
        'Change. The low are lifted up, and the high and mighty are brought down.',
      ],
      bonds: [
        'My town or city is my home, and I’ll fight to defend it.',
        'I sponsor an orphanage to keep others from enduring what I endured.',
        'I owe my survival to another urchin who taught me to live on the streets.',
      ],
      flaws: [
        'If I’m outnumbered, I will run away from a fight.',
        'Gold seems like a lot of money to me, and I’ll do just about anything for more of it.',
        'I will never fully trust anyone other than myself.',
      ],
    },
  },
]
