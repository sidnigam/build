// ============================================================
// CHAKRAVYUHA — data.js : all game content, data-driven
// Gods & boons, weapons, enemies, biomes, bosses, meta
// upgrades, codex lore, dialogue. Edit here to balance.
// ============================================================
'use strict';

const DATA = {};

// ---------- RARITY ----------
DATA.RARITIES = [
  { id: 0, name: 'Common',    color: '#cfcfcf', mult: 1.0 },
  { id: 1, name: 'Rare',      color: '#5cb8ff', mult: 1.5 },
  { id: 2, name: 'Epic',      color: '#c77dff', mult: 2.25 },
];

// ---------- GODS ----------
DATA.GODS = {
  hanuman: {
    id: 'hanuman', name: 'Hanuman', color: '#ff8c42', sym: '🐒',
    title: 'Son of the Wind, Devotee of Rama',
    greet: '"Jai Shri Ram! Your arms are strong, young Kuru — let them be stronger."',
  },
  agni: {
    id: 'agni', name: 'Agni', color: '#ff4430', sym: '🔥',
    title: 'God of Fire, Witness of All Oaths',
    greet: '"Every offering passes through me. Let your enemies be the next."',
  },
  indra: {
    id: 'indra', name: 'Indra', color: '#ffd34d', sym: '⚡',
    title: 'King of the Devas, Wielder of the Vajra',
    greet: '"The storm follows my chariot. Today, it follows you."',
  },
  vayu: {
    id: 'vayu', name: 'Vayu', color: '#7fdcb7', sym: '🌪️',
    title: 'Lord of the Winds, Breath of the World',
    greet: '"Be as the wind, child — unseen, unbound, unstoppable."',
  },
  krishna: {
    id: 'krishna', name: 'Krishna', color: '#5c7cff', sym: '🪈',
    title: 'The Charioteer, Speaker of the Gita',
    greet: '"You have the right to your actions alone, Abhimanyu. Act — I will steer."',
  },
  durga: {
    id: 'durga', name: 'Durga', color: '#e84a8a', sym: '🔱',
    title: 'The Invincible Mother, Slayer of Mahishasura',
    greet: '"Ten arms I have, and every one is raised for you."',
  },
};

// ---------- BOONS ----------
// slot: attack | special | dash | cast | passive (passives stack, others are exclusive)
// base: number scaled by rarity mult; desc(v) renders with the scaled value
DATA.BOONS = [
  // HANUMAN — raw strength
  { id: 'han_attack', god: 'hanuman', slot: 'attack', name: 'Vajra Fists',
    base: 40, desc: v => `Your attacks deal +${Math.round(v)}% damage and knock foes back.` },
  { id: 'han_special', god: 'hanuman', slot: 'special', name: 'Mountain Bearer',
    base: 60, desc: v => `Your special deals +${Math.round(v)}% damage in a wider area.` },
  { id: 'han_cast', god: 'hanuman', slot: 'cast', name: 'Gada Throw',
    base: 50, desc: v => `Your astra deals +${Math.round(v)}% damage and stuns foes for 1s.` },
  { id: 'han_hp', god: 'hanuman', slot: 'passive', name: 'Leap to Lanka',
    base: 25, desc: v => `Gain +${Math.round(v)} max life, restored on pickup.` },
  { id: 'han_bhakti', god: 'hanuman', slot: 'passive', name: 'Unwavering Bhakti',
    base: 10, desc: v => `Every ${(12 - v / 5).toFixed(1)}s, your next attack deals 300% damage.` },

  // AGNI — burn damage over time
  { id: 'agni_attack', god: 'agni', slot: 'attack', name: 'Flame of Sacrifice',
    base: 7, desc: v => `Your attacks inflict Burn: ${Math.round(v)} damage/s for 3s (stacks ×3).` },
  { id: 'agni_special', god: 'agni', slot: 'special', name: 'Pyre Burst',
    base: 10, desc: v => `Your special inflicts Burn: ${Math.round(v)} damage/s for 3s (stacks ×3).` },
  { id: 'agni_cast', god: 'agni', slot: 'cast', name: 'Agneyastra',
    base: 22, desc: v => `Your astra leaves a fire pool dealing ${Math.round(v)} damage/s for 4s.` },
  { id: 'agni_ghee', god: 'agni', slot: 'passive', name: 'Ghee Offering',
    base: 15, desc: v => `Burning foes take +${Math.round(v)}% damage from all sources.` },

  // INDRA — chain lightning
  { id: 'indra_attack', god: 'indra', slot: 'attack', name: 'Vajra Strike',
    base: 16, desc: v => `Your attacks have 30% chance to loose chain lightning (${Math.round(v)} damage, 3 jumps).` },
  { id: 'indra_special', god: 'indra', slot: 'special', name: 'Thunderclap',
    base: 26, desc: v => `Your special calls a thunderbolt on every foe struck (${Math.round(v)} damage).` },
  { id: 'indra_cast', god: 'indra', slot: 'cast', name: 'Indrastra',
    base: 22, desc: v => `Your astra summons a storm: 5 bolts rain near impact (${Math.round(v)} damage each).` },
  { id: 'indra_tribute', god: 'indra', slot: 'passive', name: "King's Tribute",
    base: 30, desc: v => `Gain +${Math.round(v)}% mudra from all sources.` },

  // VAYU — speed and dashes
  { id: 'vayu_dash', god: 'vayu', slot: 'dash', name: 'Gale Step',
    base: 30, desc: v => `Your dash tears through foes for ${Math.round(v)} damage.` },
  { id: 'vayu_attack', god: 'vayu', slot: 'attack', name: 'Tailwind',
    base: 20, desc: v => `Your attacks strike +${Math.round(v)}% faster.` },
  { id: 'vayu_cast', god: 'vayu', slot: 'cast', name: 'Vayavyastra',
    base: 30, desc: v => `Your astra becomes a roaming cyclone dealing ${Math.round(v)} damage/s for 5s.` },
  { id: 'vayu_speed', god: 'vayu', slot: 'passive', name: 'Swift as Thought',
    base: 15, desc: v => `Move +${Math.round(v)}% faster.` },
  { id: 'vayu_gust', god: 'vayu', slot: 'passive', name: 'Second Gust',
    base: 1, desc: v => `Gain +1 dash charge. Dashes recover ${Math.round((v - 1) * 20)}% faster.` },

  // KRISHNA — guile, marks, dodge
  { id: 'kri_attack', god: 'krishna', slot: 'attack', name: 'Mark of Maya',
    base: 20, desc: v => `Your attacks inflict Maya for 5s: marked foes take +${Math.round(v)}% damage.` },
  { id: 'kri_special', god: 'krishna', slot: 'special', name: "Govardhan's Shadow",
    base: 40, desc: v => `Your special slows foes by ${Math.round(Math.min(v, 80))}% for 4s.` },
  { id: 'kri_cast', god: 'krishna', slot: 'cast', name: 'Sudarshana',
    base: 30, desc: v => `Your astra becomes a discus orbiting you for 6s (${Math.round(v)} damage per strike).` },
  { id: 'kri_lila', god: 'krishna', slot: 'passive', name: 'Lila',
    base: 10, desc: v => `${Math.round(Math.min(v, 40))}% chance to dodge any strike — mere play, to him.` },

  // DURGA — protection and retaliation
  { id: 'dur_kavacha', god: 'durga', slot: 'passive', name: 'Kavacha of the Mother',
    base: 10, desc: v => `Take ${Math.round(Math.min(v, 40))}% less damage.` },
  { id: 'dur_special', god: 'durga', slot: 'special', name: "Lion's Roar",
    base: 1.0, desc: v => `Your special stuns foes for ${v.toFixed(1)}s.` },
  { id: 'dur_dash', god: 'durga', slot: 'dash', name: 'Trishula Step',
    base: 50, desc: v => `Dash invulnerability lasts +${Math.round(v)}% longer; dashing through projectiles destroys them.` },
  { id: 'dur_cast', god: 'durga', slot: 'cast', name: 'Trident of the Mother',
    base: 70, desc: v => `Your astra deals +${Math.round(v)}% damage and pierces all foes.` },
  { id: 'dur_thorns', god: 'durga', slot: 'passive', name: 'Thorned Halo',
    base: 30, desc: v => `Foes that strike you in melee take ${Math.round(v)} damage.` },
];

// ---------- WEAPONS ----------
DATA.WEAPONS = {
  khanda: {
    id: 'khanda', name: 'Khanda of the Kuru Prince', sym: '⚔️', unlock: 0,
    blurb: 'The straight blade Abhimanyu carried into the Chakravyuha. Swift three-stroke combos.',
    type: 'melee', combo: [20, 20, 38], arc: 1.9, range: 78, rate: 0.27, knockback: 160,
    special: { name: 'Bhairava Whirl', dmg: 35, radius: 110, cd: 4, desc: 'Spin, striking all nearby foes.' },
  },
  gandiva: {
    id: 'gandiva', name: 'Gandiva, the Celestial Bow', sym: '🏹', unlock: 120,
    blurb: "Arjuna's bow, gifted by Varuna. Hold to draw; a full draw pierces everything in line.",
    type: 'bow', dmgMin: 14, dmgMax: 55, chargeTime: 0.7, projSpeed: 780, rate: 0.18,
    special: { name: 'Arrow Storm', dmg: 14, count: 7, cd: 5, desc: 'Loose a fan of seven arrows.' },
  },
  gada: {
    id: 'gada', name: 'Gada of Bhima', sym: '🔨', unlock: 300,
    blurb: "The mace of the strongest Pandava — Abhimanyu's uncle. Slow, devastating arcs.",
    type: 'melee', combo: [48, 48], arc: 2.4, range: 92, rate: 0.55, knockback: 340,
    special: { name: 'Earthshatter Slam', dmg: 60, radius: 150, cd: 6, stun: 0.8, desc: 'Slam the ground, stunning all around you.' },
  },
};

// ---------- ENEMIES ----------
// ai: chase | lunge | shoot | spread | teleport | tank | charge | summon
DATA.ENEMIES = {
  preta:     { id: 'preta', name: 'Preta', ai: 'chase', hp: 26, spd: 165, r: 11, dmg: 8,
               color: '#9ce0c8', cost: 1 },
  rakshasa:  { id: 'rakshasa', name: 'Rakshasa Blade', ai: 'lunge', hp: 62, spd: 112, r: 15, dmg: 14,
               color: '#ff7058', cost: 2 },
  archer:    { id: 'archer', name: 'Asura Archer', ai: 'shoot', hp: 40, spd: 95, r: 13, dmg: 10,
               color: '#d8b35c', cost: 2, projSpeed: 360 },
  naga:      { id: 'naga', name: 'Naga Spitter', ai: 'spread', hp: 55, spd: 85, r: 14, dmg: 9,
               color: '#3fe09f', cost: 2, projSpeed: 300 },
  vetala:    { id: 'vetala', name: 'Vetala', ai: 'teleport', hp: 50, spd: 0, r: 13, dmg: 13,
               color: '#b48aff', cost: 3 },
  bhuta:     { id: 'bhuta', name: 'Bhuta Husk', ai: 'tank', hp: 135, spd: 55, r: 21, dmg: 16,
               color: '#8a93b8', cost: 3 },
  daitya:    { id: 'daitya', name: 'Daitya Brute', ai: 'charge', hp: 115, spd: 80, r: 19, dmg: 18,
               color: '#e0a23c', cost: 4 },
  yatudhana: { id: 'yatudhana', name: 'Yatudhana Conjurer', ai: 'summon', hp: 72, spd: 75, r: 14, dmg: 8,
               color: '#ff9ad5', cost: 4 },
};

// ---------- BOSSES ----------
DATA.BOSSES = {
  tataka: {
    id: 'tataka', name: 'TATAKA', sub: 'The Devourer of Forests', hp: 950, r: 34, color: '#ff5533',
    intro: '"Little prince... Rama\'s arrow freed me once. You carry no such arrow."',
    lore: 'The yaksha princess cursed into a rakshasi, first foe slain by young Rama.',
  },
  ahiravana: {
    id: 'ahiravana', name: 'AHIRAVANA', sub: 'Sorcerer-King of Patala', hp: 1500, r: 30, color: '#2ee6a8',
    intro: '"I stole Rama and Lakshmana from under Hanuman\'s nose. You, I will simply keep."',
    lore: 'Ravana\'s ally who dragged the brothers to the netherworld — slain only when Hanuman snuffed five lamps at once.',
  },
  kumbhakarna: {
    id: 'kumbhakarna', name: 'KUMBHAKARNA', sub: 'The Sleeping Mountain', hp: 2300, r: 46, color: '#ffcf5c',
    intro: '"...who dares... six months... I was promised six months..."',
    lore: 'Ravana\'s giant brother, tricked by Saraswati into sleeping half the year. Waking him early always ends badly.',
  },
  yama: {
    id: 'yama', name: 'YAMA DHARMARAJA', sub: 'Lord of Death, Keeper of the Ledger', hp: 2800, r: 36, color: '#9fb8ff',
    intro: '"Abhimanyu. Sixteen rings you have broken to stand here. The ledger says you died well. Why is that not enough?"',
    lore: 'The first mortal to die, who became the judge of all the dead. Even he was once argued into returning a soul — ask Savitri.',
  },
};

// ---------- BIOMES ----------
DATA.BIOMES = [
  {
    id: 'naraka', name: 'NARAKA', sub: 'The Iron City of Yama', rooms: 5,
    bg: '#160a0e', floor: '#241016', accent: '#ff5533', wall: '#3d1a20',
    enemies: ['preta', 'rakshasa', 'archer'], boss: 'tataka',
    scale: 1.0, budget: [4, 9], droneHz: 110,
  },
  {
    id: 'patala', name: 'PATALA', sub: 'Realm of the Serpent Kings', rooms: 6,
    bg: '#061412', floor: '#0b201c', accent: '#2ee6a8', wall: '#143830',
    enemies: ['naga', 'vetala', 'archer', 'rakshasa'], boss: 'ahiravana',
    scale: 1.35, budget: [7, 12], droneHz: 98,
  },
  {
    id: 'ranabhoomi', name: 'RANABHOOMI', sub: 'Field of the Fallen Warriors', rooms: 6,
    bg: '#171107', floor: '#241b0d', accent: '#ffcf5c', wall: '#403018',
    enemies: ['daitya', 'bhuta', 'yatudhana', 'vetala'], boss: 'kumbhakarna',
    scale: 1.8, budget: [9, 15], droneHz: 123,
  },
  {
    id: 'vaitarani', name: 'VAITARANI', sub: 'The River Between Worlds', rooms: 2,
    bg: '#0a0e16', floor: '#121828', accent: '#9fb8ff', wall: '#222c4a',
    enemies: ['preta', 'rakshasa', 'naga', 'vetala', 'bhuta', 'daitya'], boss: 'yama',
    scale: 2.1, budget: [12, 16], droneHz: 82,
  },
];

// ---------- DOOR REWARDS ----------
DATA.REWARDS = {
  boon:   { id: 'boon',   name: 'Divine Boon',   sym: '✦', color: '#ffd34d', w: 30 },
  mudra:  { id: 'mudra',  name: 'Mudra',         sym: '¤', color: '#ffcf5c', w: 20 },
  punya:  { id: 'punya',  name: 'Punya',         sym: 'ॐ', color: '#c77dff', w: 14 },
  maxhp:  { id: 'maxhp',  name: 'Amrita Drop',   sym: '♥', color: '#ff6b81', w: 10 },
  amrit:  { id: 'amrit',  name: 'Amrit',         sym: '◈', color: '#5cb8ff', w: 10 },
  sarovar:{ id: 'sarovar',name: 'Sacred Pool',   sym: '☽', color: '#7fdcb7', w: 8 },
  kubera: { id: 'kubera', name: "Kubera's Wares",sym: '⚖', color: '#ffa94d', w: 8 },
  boss:   { id: 'boss',   name: 'The Warden',    sym: '☠', color: '#ff4430', w: 0 },
};

// ---------- KUBERA SHOP ----------
DATA.SHOP_ITEMS = [
  { id: 'heal',    name: 'Soma Draught',      desc: 'Restore 35% of your life.', cost: 70 },
  { id: 'maxhp',   name: 'Amrita Phial',      desc: '+25 max life, and heal 25.', cost: 110 },
  { id: 'boon',    name: 'Sealed Blessing',   desc: 'A boon from a random god.', cost: 160 },
  { id: 'amrit',   name: 'Amrit',             desc: 'Upgrade a random boon\'s rarity.', cost: 130 },
  { id: 'revive',  name: 'Sanjeevani Sprig',  desc: 'Restore one spent death defiance.', cost: 220 },
];

// ---------- META UPGRADES : the Path of Dharma ----------
DATA.META = [
  { id: 'sanjeevani', name: 'Sanjeevani Blessing', max: 3, cost: [60, 180, 450],
    desc: r => `Cheat death ${r} time${r > 1 ? 's' : ''} per run, reviving at 50% life.`,
    lore: 'The glowing herb of Mount Dronagiri that called Lakshmana back from death.' },
  { id: 'bala', name: 'Bala', max: 5, cost: [30, 60, 100, 150, 220],
    desc: r => `Deal +${r * 5}% damage.`, lore: 'Strength, the first of the eight siddhis a warrior earns.' },
  { id: 'kavacha', name: 'Kavacha', max: 5, cost: [30, 60, 100, 150, 220],
    desc: r => `+${r * 10} max life.`, lore: 'Karna was born wearing his; you must earn yours.' },
  { id: 'laghima', name: 'Laghima', max: 3, cost: [40, 80, 140],
    desc: r => `Move +${r * 4}% faster.`, lore: 'The siddhi of weightlessness.' },
  { id: 'drishti', name: 'Drishti', max: 3, cost: [50, 100, 180],
    desc: r => `+${r * 5}% chance to deal critical strikes (×2 damage).`,
    lore: 'Arjuna saw only the eye of the bird. See only the gap in their guard.' },
  { id: 'bhagya', name: 'Bhagya', max: 3, cost: [60, 120, 200],
    desc: r => `Boons are ${r * 12}% more likely to be Rare or Epic.`,
    lore: 'Fortune favors those who have already paid for it.' },
  { id: 'dhana', name: 'Dhana', max: 2, cost: [40, 90],
    desc: r => `Begin each ascent with ${r * 60} mudra.`, lore: 'Kubera honors old debts.' },
  { id: 'vega', name: 'Vega', max: 1, cost: [200],
    desc: () => `+1 dash charge.`, lore: 'Momentum is its own astra.' },
  { id: 'amsha', name: 'Amsha', max: 1, cost: [250],
    desc: () => `The gods offer 4 boons to choose from instead of 3.`,
    lore: 'A larger share of the divine portion.' },
];

// ---------- CODEX : the Pothi (palm-leaf book) ----------
DATA.CODEX = [
  { t: 'The Chakravyuha', s: 'Mahabharata',
    d: 'A spinning, layered battle formation — a wheel of warriors within warriors. Only seven men alive knew how to break it. Abhimanyu learned to pierce its rings while still in his mother Subhadra\'s womb, listening to Arjuna describe the way in. But Arjuna never finished the lesson, and so the boy never learned the way OUT. On the thirteenth day of the Kurukshetra war, sixteen years old, he went in alone.' },
  { t: 'Abhimanyu', s: 'Mahabharata',
    d: 'Son of Arjuna and Subhadra, nephew of Krishna, the brightest blade of his generation. Inside the Chakravyuha he fought six maharathis at once — and fell only when every rule of war was broken against him: disarmed, surrounded, struck from behind. Some say he was the moon-god\'s son Varchas, lent to the earth for sixteen brief years. The moon wanted his child back.' },
  { t: 'Naraka', s: 'Garuda Purana',
    d: 'Not one hell but many — the Garuda Purana counts twenty-eight courts of correction beneath Yama\'s iron city, each fitted precisely to a debt. Unlike the hells of other lands, Naraka is a waystation, not a sentence. Every soul eventually climbs out. You simply intend to climb faster.' },
  { t: 'Patala', s: 'Vishnu Purana',
    d: 'The seven nether-realms — Atala, Vitala, Sutala, Talatala, Mahatala, Rasatala, Patala — more splendid, the sages admit with embarrassment, than heaven itself. Jeweled cities lit by the gems on the hoods of ten thousand nagas. Vasuki rules here, and below it all sleeps Shesha, on whose thousand heads the world rests.' },
  { t: 'The Vaitarani', s: 'Garuda Purana',
    d: 'The river every soul must cross to reach Yama\'s judgment — a hundred leagues of blood, filth, and things with teeth. The virtuous cross by holding a cow\'s tail. The rest swim. You are going the wrong way across it, which has never been attempted, because it has never occurred to anyone.' },
  { t: 'Yama Dharmaraja', s: 'Rig Veda, Katha Upanishad',
    d: 'The first mortal to die, who walked the path so all could follow — and so became its keeper. He is not cruel; he is exact. He taught the boy Nachiketa the secret of what survives death, because the boy asked three times. And he returned Satyavan\'s soul to Savitri, because she out-argued him. Death keeps a ledger, but the ledger has margins.' },
  { t: 'Chitragupta', s: 'Garuda Purana',
    d: 'Yama\'s registrar, born from Brahma\'s mind to keep count when the dead grew too many. He records every deed of every soul in his eternal book. He has, by now, recorded several of your deaths, and his handwriting is getting sarcastic.' },
  { t: 'The Sanjeevani', s: 'Ramayana',
    d: 'When Lakshmana fell in battle, only one herb on one mountain could save him before sunrise. Hanuman, unable to tell which herb it was, brought the mountain. The Sanjeevani calls the breath back into the body. Yama finds this herb professionally insulting.' },
  { t: 'Tataka', s: 'Ramayana',
    d: 'Once a beautiful yaksha princess, cursed into a monstrous rakshasi who ate forests whole. Slaying her was Rama\'s first act as a warrior — and his first hard lesson, for Vishvamitra had to order him twice to strike a woman. Her death freed her. Down here, she has had time to stop being grateful.' },
  { t: 'Ahiravana', s: 'Ramayana (Krittivasi)',
    d: 'Sorcerer-king of Patala and Ravana\'s last trick: he slipped through Hanuman\'s fortress disguised as Vibhishana and carried the sleeping Rama and Lakshmana down to the netherworld for sacrifice. His life was hidden in five lamps burning in five directions — Hanuman took the form of five faces and blew them all out at once.' },
  { t: 'Kumbhakarna', s: 'Ramayana',
    d: 'Ravana\'s colossal brother, who asked the gods for Indra\'s throne but — his tongue tripped by Saraswati — asked instead for sleep, and got six months of it at a time. Woken early for the war at Lanka, he told Ravana plainly that the war was wrong, then fought anyway, because his brother asked. Honor the size of a mountain, asleep in the wrong army.' },
  { t: 'The Astras', s: 'Mahabharata',
    d: 'Divine missiles invoked by mantra — fire of Agni, wind of Vayu, the storm-bolt of Indra, each a god\'s own wrath lent to a mortal\'s hand. An astra is not thrown; it is PRAYED. The chakra you carry answers to whichever god currently favors you.' },
  { t: 'Mudra & Punya', s: 'Dharmashastra',
    d: 'Mudra: coin of the realms below, worthless above — the dead gamble with it, Kubera banks it. Punya: merit, the weight of right action, the only currency that survives the crossing. You are smuggling punya out of hell. Chitragupta has noted this too.' },
  { t: 'Narada', s: 'Puranas',
    d: 'The wandering divine sage, carrier of news between all three worlds, instigator of half the stories worth telling. If he is loitering near the banyan at the edge of the worlds, it is because something interesting is about to happen to you, and he intends to watch.' },
  { t: 'The Banyan at the Edge', s: 'this telling',
    d: 'Between Yama\'s realm and the living world stands an akshaya vata — an undying banyan — where the dead wait out their judgments. Its roots drink the Vaitarani. Souls rest here between attempts at anything. You have made it your war camp.' },
];

// ---------- DIALOGUE ----------
DATA.NARADA_LINES = [
  '"Narayana, Narayana! Dead again, I see. The moon your grandfather is getting impatient."',
  '"I told Yama you would try again today. He sighed. It was a very long sigh. Geological."',
  '"Your father broke the Chakravyuha from outside, you know. You are breaking it from underneath. Much more stylish."',
  '"Chitragupta has started a separate ledger just for you. He had to requisition more ink."',
  '"The devas are taking bets. Indra has you at sixteen rings. Hanuman bet everything on you. He always does."',
  '"Kumbhakarna asked me to ask you to come at a reasonable hour this time."',
  '"Sixteen years alive, and look how busy you have been since. Death rather suits you."',
  '"A tip, free of charge: Yama is bound by dharma. Every rule that binds him is a door."',
];
DATA.DEATH_LINES = [
  'Chitragupta dips his pen. "Death number %n. Cause: optimism."',
  'Chitragupta does not look up. "Back so soon. I had not even filed the last one."',
  '"Let the record show," Chitragupta mutters, "that the deceased was warned by literally everyone."',
  'Chitragupta writes: "Died as he lived — surrounded, outnumbered, and somehow surprised by it."',
  '"%n deaths," says Chitragupta. "Your uncle Krishna finds this hilarious. He asked me to tell you that."',
  'Chitragupta sharpens a fresh reed. "The ledger has margins, prince. You keep writing in them."',
  '"One day you will break through," Chitragupta says quietly, then pretends he said nothing.',
  'Chitragupta stamps the page. "Processed. Next time, try not to be sixteen about it."',
];
DATA.VICTORY_LINES = [
  'Yama lowers his danda. "The ledger says you died well, Abhimanyu. It will now say you UN-died well. Chitragupta will be furious."',
  '"Go," says Death, almost smiling. "Tell your father the formation has been broken twice — once inward, once out."',
];

// run-end titles by how far you got
DATA.EPITAPHS = [
  'Fell in the Iron City',      // biome 1
  'Coiled in the Serpent Dark', // biome 2
  'Buried with the Warriors',   // biome 3
  'Drowned in sight of dawn',   // biome 4
];
