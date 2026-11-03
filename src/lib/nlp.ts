import type { Analysis, PartKind, PartSignal, SongPart, Tempo, ThemeScore } from './types';

/* ------------------------------------------------------------------ vocab */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those i you he she it we they me my your his her its our their
   is am are was were be been being do does did doing have has had having will would can could should shall may
   might must not no nor so as at by for from in into of on onto out over to up with without within about after
   before again all any both each few more most other some such only own same too very just now even still just
   oh ooh yeah la na uh who whom whose what which when where why how there here them us him hers ours yours theirs
   im ima dont cant wont didnt couldnt wouldnt shouldnt isnt arent wasnt aint gonna wanna got get go going
   like down off around through` .split(/\s+/).filter(Boolean),
);

const stem = (word: string): string => {
  let w = word;
  if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('es') && /(ch|sh|x)$/.test(w.slice(0, -2))) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
};

interface ThemeProfile {
  key: string;
  about: string;
  core: string;
  words: Record<string, number>;
  phrases?: Record<string, number>;
}

const THEMES: ThemeProfile[] = [
  {
    key: 'Love',
    about: 'love, closeness and devotion',
    core:
      'The lyrics are about love — the pull between two people and the quiet work of staying close.',
    words: {
      love: 3, loved: 3, loving: 3, lover: 2, lovers: 3, heart: 2, hearts: 2, kiss: 3, kissed: 3,
      kisses: 3, hold: 2, holding: 2, held: 2, embrace: 3, close: 2, near: 2, beside: 2,
      forever: 2, always: 2, darling: 3, honey: 3, baby: 2, sweetheart: 3, dear: 2, tender: 3,
      tenderly: 3, warm: 2, warmth: 2, stay: 2, staying: 2, promise: 2, promised: 2, devotion: 4,
      adore: 3, adoring: 3, cherish: 3, yours: 2, mine: 2, together: 2, arms: 2, skin: 2,
      glance: 2, smile: 1, wedding: 3, vow: 3, vows: 3, marry: 3, home: 2, harbor: 2, sanctuary: 3,
      gentle: 2, patience: 2, faithful: 3, affection: 3, romance: 3, beloved: 3, us: 2,
    },
    phrases: {
      'stay with me': 4, 'hold me': 3, 'holding on': 2, 'be mine': 4, 'i love you': 5,
      'in my arms': 3, 'next to you': 3, 'you and i': 3, 'by my side': 3, 'never letting go': 3,
      'all my life': 2, 'you are the one': 4,
    },
  },
  {
    key: 'Faith',
    about: 'faith, trust and quiet belief',
    core:
      'The lyrics are about faith — trusting something steady without needing to see proof.',
    words: {
      faith: 4, believe: 3, believing: 3, belief: 4, trust: 3, trusting: 3, prayer: 4, pray: 3,
      praying: 3, prayed: 3, god: 4, lord: 4, heaven: 3, holy: 4, grace: 4, blessed: 3, bless: 3,
      soul: 3, spirit: 3, sacred: 4, divine: 4, mercy: 4, forgive: 3, forgiven: 3, forgiveness: 3,
      sin: 3, sinner: 3, redeem: 4, redeemed: 4, salvation: 4, amen: 4, angel: 3, angels: 3,
      church: 3, gospel: 3, testament: 3, worship: 4, hymn: 4, still: 2, stillwater: 2,
      miracle: 3, miracles: 3, providence: 4, righteous: 3, sanctified: 3, rock: 2,
    },
    phrases: {
      'let it be': 2, 'i believe': 3, 'let go': 2, 'in your hands': 4, 'carry me': 3,
      'hold my name': 3, 'do not fear': 3, 'trust the hand': 3, 'lift me up': 3, 'amen': 4,
    },
  },
  {
    key: 'Hope',
    about: 'hope, tomorrow and second chances',
    core:
      'The lyrics are about hope — leaning toward a better tomorrow even from a hard place.',
    words: {
      hope: 4, hopeful: 4, hoping: 4, tomorrow: 3, sunrise: 3, dawn: 3, light: 2, bright: 2,
      brighter: 3, rise: 3, rising: 3, up: 1, start: 2, again: 2, begin: 2, beginning: 2,
      new: 2, free: 2, freedom: 3, chance: 2, better: 2, change: 2, grow: 2, growing: 2,
      bloom: 3, spring: 3, sun: 2, sunlight: 3, morning: 2, door: 2, open: 2, wide: 1,
      sky: 1, far: 1, kites: 1, tomorrows: 3, overcome: 4, stronger: 3, strong: 2,
      steady: 2, brave: 2, dream: 2, dreaming: 2, someday: 3, wait: 2,
    },
    phrases: {
      'hold on': 3, 'not the end': 4, 'better days': 4, 'light at the end': 4,
      'new day': 3, 'keep going': 3, 'one day': 2, 'there is sunlight': 4, 'we will': 2,
      'lift me': 2, 'turn the page': 3,
    },
  },
  {
    key: 'Longing',
    about: 'longing, distance and missing someone',
    core:
      'The lyrics are about longing — distance, memory, and the ache of wanting someone near.',
    words: {
      miss: 4, missing: 4, missed: 4, longing: 4, long: 2, away: 2, distant: 3, distance: 3,
      faraway: 3, lonely: 2, sleep: 1, waiting: 3, waited: 3, wait: 2, return: 3, returning: 3,
      memory: 3, memories: 3, remember: 3, remembered: 3, yesterday: 2, used: 2, dreamt: 2,
      phone: 2, call: 2, voicemail: 3, letters: 3, letter: 3, midnight: 2, train: 2, miles: 2,
      homesick: 4, ache: 3, aching: 3, want: 2, wanted: 2, wishing: 2, echo: 2, echoes: 2,
      photograph: 3, photo: 2, ticket: 2, station: 2, gate: 2,
    },
    phrases: {
      'come back': 4, 'i miss you': 5, 'without you': 3, 'take me home': 3, 'so far away': 3,
      'waiting for you': 4, 'in my head': 2, 'don not look up': 1, 'all alone': 2,
    },
  },
  {
    key: 'Grief',
    about: 'grief, loss and carrying on',
    core:
      'The lyrics are about grief — carrying an absence and learning how to keep going with it.',
    words: {
      grief: 5, lost: 3, loss: 4, gone: 4, dying: 4, died: 4, death: 4, dead: 4, grave: 4,
      funeral: 4, ashes: 3, ash: 3, buried: 3, bury: 3, mourning: 4, mourn: 4, sorrow: 4,
      sad: 3, sadness: 3, cry: 3, crying: 3, cried: 3, tears: 3, tear: 3, empty: 3,
      hollow: 3, ghost: 3, ghosts: 3, absence: 4, weep: 4, wept: 4, regret: 3, break: 2,
      broken: 3, last: 2, goodbye: 3, farewell: 4, cold: 2, coat: 1, quiet: 2, silence: 2,
      stone: 1, salt: 1, winter: 2, shadows: 2, shadow: 2, missing: 2, carry: 2,
    },
    phrases: {
      'not coming home': 4, 'left me here': 3, 'too soon': 3, 'never again': 3,
      'i still hear': 3, 'learn to hold': 3, 'shape of you': 2, 'rest in peace': 4,
      'let you go': 4, 'say goodbye': 4,
    },
  },
  {
    key: 'Heartbreak',
    about: 'heartbreak, endings and letting go',
    core:
      'The lyrics are about heartbreak — the sharp end of love and the work of letting go.',
    words: {
      heartbreak: 5, broken: 3, breakup: 4, cheat: 4, cheating: 4, liar: 3, lies: 3, lied: 3,
      betrayed: 4, betrayal: 4, hurt: 3, hurting: 3, pain: 3, wound: 3, scars: 2, scar: 2,
      over: 2, done: 2, enough: 2, fool: 3, foolish: 3, sorry: 2, blame: 2, angry: 3,
      mad: 2, fight: 2, fought: 2, argument: 3, leave: 2, leaving: 3, left: 2, alone: 2,
      mistake: 2, wrong: 2, bitter: 3, cold: 2, walk: 1, away: 2, admit: 2, truth: 2,
      poison: 3, toxic: 3, goodbye: 3, crush: 2,
    },
    phrases: {
      'you lied': 4, 'not enough': 3, 'walk away': 3, 'let you go': 4, 'no more': 3,
      'it is over': 4, 'you broke': 4, 'i am done': 4, 'my fault': 3,
    },
  },
  {
    key: 'Joy',
    about: 'joy, celebration and small pleasures',
    core:
      'The lyrics are about joy — small bright moments that are worth singing out loud.',
    words: {
      joy: 4, happy: 4, happiness: 4, laugh: 3, laughing: 3, laughter: 3, smile: 2, smiling: 2,
      dance: 3, dancing: 3, sang: 3, sing: 2, singing: 2, song: 2, party: 3, celebrate: 4,
      celebration: 4, bright: 2, gold: 2, golden: 2, sunshine: 3, sweet: 2, fun: 3, play: 2,
      playing: 2, clap: 3, clapping: 3, loud: 2, summer: 2, weekend: 2, sunday: 2,
      friends: 2, soda: 2, toast: 2, glow: 2, disco: 3, move: 2, moving: 2, alive: 3,
      wonderful: 3, beautiful: 2, best: 2, good: 2, alright: 2, fine: 2, hallelujah: 3,
    },
    phrases: {
      'so good': 3, 'feel alive': 4, 'all night': 3, 'turn it up': 3, 'good stuff': 3,
      'dance with me': 3, 'have a good time': 3, 'here we go': 2,
    },
  },
  {
    key: 'Freedom',
    about: 'freedom, escape and finding your own road',
    core:
      'The lyrics are about freedom — breaking out, breathing wide, and choosing your own road.',
    words: {
      free: 3, freedom: 5, escape: 4, escaped: 4, run: 2, running: 3, ran: 2, road: 2,
      highway: 3, open: 2, wild: 3, wings: 3, fly: 3, flying: 3, flyer: 2, chains: 3,
      cage: 4, caged: 4, walls: 3, break: 2, breaking: 3, out: 1, own: 1, mine: 2,
      skyline: 2, horizon: 3, sail: 3, sailing: 3, drift: 2, driftwood: 2, bound: 2,
      rules: 2, rebel: 3, loud: 2, young: 2, untamed: 4, fearless: 3, unchained: 4,
    },
    phrases: {
      'set me free': 5, 'break free': 5, 'on my own': 3, 'no one tells me': 3,
      'run away': 3, 'spread my wings': 4, 'let me go': 2, 'wide open': 3,
    },
  },
  {
    key: 'Home',
    about: 'home, belonging and the people who hold you',
    core:
      'The lyrics are about home — the people and places that hold you when the day is done.',
    words: {
      home: 4, hometown: 4, house: 3, porch: 3, kitchen: 3, door: 2, floorboards: 3,
      familiar: 3, belonging: 4, belong: 4, roots: 3, family: 3, mother: 3, father: 3,
      brother: 2, sister: 2, daughter: 2, son: 2, child: 2, children: 2, neighbor: 2,
      street: 2, garden: 2, yard: 2, roof: 2, returned: 2, road: 1, hometowns: 4,
      settle: 2, safe: 3, shelter: 3, kettle: 2, table: 2, supper: 2, porchlight: 3,
    },
    phrases: {
      'coming home': 4, 'back home': 3, 'take me home': 4, 'at the door': 2,
      'waiting at the gate': 3, 'front porch': 3, 'where i belong': 4,
    },
  },
  {
    key: 'Gratitude',
    about: 'gratitude and naming what was given',
    core:
      'The lyrics are about gratitude — naming what was given and saying thank you out loud.',
    words: {
      thank: 5, thanks: 5, thankful: 5, grateful: 5, gratitude: 5, given: 3, gift: 4,
      blessed: 3, blessing: 3, blessings: 4, owe: 3, owed: 2, appreciate: 4,
      kindness: 3, generous: 3, grace: 2, honor: 2, humbled: 3, humble: 2, treasure: 3,
    },
    phrases: {
      'thank you': 5, 'so grateful': 4, 'count my blessings': 5, 'i owe you': 3,
      'for everything': 3,
    },
  },
  {
    key: 'Wonder',
    about: 'wonder at the world, the sky and the sea',
    core:
      'The lyrics are about wonder — sky, sea, and how enormous everything feels.',
    words: {
      wonder: 4, stars: 3, star: 2, moon: 3, moonlight: 3, universe: 4, galaxy: 3,
      ocean: 3, sea: 3, tide: 3, tides: 3, water: 2, wave: 2, waves: 3, river: 3,
      mountain: 3, mountains: 3, forest: 3, field: 2, fields: 2, wind: 2, rain: 2,
      thunder: 3, storm: 3, night: 1, constellation: 4, aurora: 4, infinite: 3,
      mystery: 3, creation: 3, earth: 2, sunset: 3, horizon: 2, glow: 2, orbit: 3,
    },
    phrases: {
      'the whole sky': 3, 'look up': 2, 'out to sea': 3, 'the universe': 4,
      'how big': 3, 'small as': 2,
    },
  },
  {
    key: 'Courage',
    about: 'courage, standing up and walking forward scared',
    core:
      'The lyrics are about courage — standing your ground and walking forward even when scared.',
    words: {
      brave: 3, bravery: 4, courage: 5, courageous: 5, fearless: 4, strength: 3, strong: 3,
      fight: 3, fighting: 3, warrior: 4, army: 3, battle: 3, soldier: 3, shield: 3, sword: 3,
      stand: 2, standing: 2, face: 2, rise: 2, rising: 2, scared: 2, afraid: 2, fear: 2,
      survive: 3, survived: 3, overcome: 4, bold: 3, unbroken: 4, scars: 2, loud: 2,
      roar: 4, shout: 3, louder: 3, enough: 2, braveheart: 4,
    },
    phrases: {
      'stand up': 3, 'i will not back down': 4, 'hold the line': 3, 'stand your ground': 4,
      'not afraid': 3, 'i am still here': 4, 'roar': 4,
    },
  },
];

const POSITIVE = new Set(
  `love joy hope happy smile laugh light bright warm sweet gentle calm peace free shine sun gold
   blessing grace gift beautiful wonderful best good alive bloom rise grateful thankful celebrate
   sing dance promise safe home forever amen brave strong steady kind tender friend family
   sunrise dawn morning glow delight bliss content merry glad`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem),
);

const NEGATIVE = new Set(
  `sad pain hurt cry tears broke broken grief loss lost lonely alone cold dark empty fear afraid
   scared dead death grave ash dying hurt wound scar blame liar lies betrayed betrayal bitter
   sorrow mourning miss missing ache acheing regret sorry sorry fool poison toxic tired weary
   stone hollow ghost winter rain storm silence numb fail failed`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem),
);

const HIGH_ENERGY = new Set(
  `run running dance dancing shout singing loud jump move moving fire burn burning alive awake
   fight fighting faster fast drive driving thunder storm strong rise rising roar clap party
   fly flying wild rush electric drum beat scream turn up`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem),
);

const LOW_ENERGY = new Set(
  `slow quiet still calm breathe breathing gentle soft tender sleep sleeping hold holding
   whisper hush floating float rest resting slow drift driftwood evening night lullaby
   wait waiting stone still water sea tide`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem),
);

/* --------------------------------------------------------------- indexes */

const THEME_WORDS = new Map<string, { theme: string; weight: number }[]>();
const THEME_PHRASES: { theme: string; phrase: string; weight: number }[] = [];

for (const theme of THEMES) {
  for (const [word, weight] of Object.entries(theme.words)) {
    const key = stem(word.toLowerCase());
    const bucket = THEME_WORDS.get(key) || [];
    bucket.push({ theme: theme.key, weight });
    THEME_WORDS.set(key, bucket);
  }
  for (const [phrase, weight] of Object.entries(theme.phrases || {})) {
    THEME_PHRASES.push({ theme: theme.key, phrase: phrase.toLowerCase(), weight });
  }
}

/* ------------------------------------------------------------- tokenizer */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function textLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------- classifier */

interface RawResult {
  signals: ThemeScore[];
  valence: number;
  energy: number;
  matched: Map<string, number>;
  wordCount: number;
  topLine: string;
}

function analyzeText(text: string): RawResult {
  const lower = text.toLowerCase().replace(/[’']/g, '');
  const tokens = tokenize(text);
  const scores = new Map<string, number>();
  const matched = new Map<string, number>();
  let positive = 0;
  let negative = 0;
  let high = 0;
  let low = 0;

  for (const token of tokens) {
    const key = stem(token);
    const hits = THEME_WORDS.get(key);
    if (hits) {
      for (const hit of hits) {
        scores.set(hit.theme, (scores.get(hit.theme) || 0) + hit.weight);
      }
      matched.set(token, (matched.get(token) || 0) + 1);
    }
    if (POSITIVE.has(key)) positive += 1;
    if (NEGATIVE.has(key)) negative += 1;
    if (HIGH_ENERGY.has(key)) high += 1;
    if (LOW_ENERGY.has(key)) low += 1;
  }

  for (const { theme, phrase, weight } of THEME_PHRASES) {
    if (lower.includes(phrase)) {
      const times = lower.split(phrase).length - 1;
      scores.set(theme, (scores.get(theme) || 0) + weight * Math.min(times, 3));
      const first = phrase.split(' ')[0];
      matched.set(first, (matched.get(first) || 0) + 1);
    }
  }

  const sentimentTotal = positive + negative || 1;
  const valence = Math.max(0, Math.min(1, 0.5 + ((positive - negative) / sentimentTotal) * 0.5));
  const energyTotal = high + low || 1;
  const energy = Math.max(0, Math.min(1, 0.5 + ((high - low) / energyTotal) * 0.5));

  const signals = [...scores.entries()]
    .map(([theme, score]) => ({ theme, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Pick the line that carries the strongest theme signal.
  let topLine = '';
  let best = 0;
  for (const line of textLines(text)) {
    const lineTokens = tokenize(line);
    let score = 0;
    for (const token of lineTokens) {
      const hits = THEME_WORDS.get(stem(token));
      if (hits) score += Math.max(...hits.map((h) => h.weight));
    }
    if (score > best && lineTokens.length >= 3) {
      best = score;
      topLine = line;
    }
  }

  return { signals, valence, energy, matched, wordCount: tokens.length, topLine };
}

function toneFrom(valence: number, energy: number) {
  const vHigh = valence >= 0.58;
  const vLow = valence <= 0.42;
  const eHigh = energy >= 0.56;

  if (vHigh && eHigh) return { tone: 'bright-driving', toneLabel: 'Bright and driving' };
  if (vHigh && !eHigh) return { tone: 'warm-tender', toneLabel: 'Warm and tender' };
  if (vLow && eHigh) return { tone: 'restless-raw', toneLabel: 'Restless and raw' };
  if (vLow && !eHigh) return { tone: 'soft-sorrowful', toneLabel: 'Soft and sorrowful' };
  return { tone: 'reflective', toneLabel: 'Reflective and measured' };
}

const TONE_SENTENCE: Record<string, string> = {
  'bright-driving': 'It moves with a lifted, forward energy.',
  'warm-tender': 'It sits low and close, like a hand on the shoulder.',
  'restless-raw': 'There is friction in it — the words push before they settle.',
  'soft-sorrowful': 'It is hushed, and the sadness is handled gently.',
  reflective: 'The tone stays even, turning the idea over rather than declaring it.',
};

function confidenceOf(signals: ThemeScore[], wordCount: number): number {
  if (signals.length === 0) return 0;
  const top = signals[0].score;
  const total = signals.reduce((sum, s) => sum + s.score, 0) || 1;
  const share = top / total;
  const density = Math.min(1, top / (wordCount * 0.11 + 3));
  const spread = signals.length > 1 ? top / (top + signals[1].score) : 1;
  const value = 0.34 * share + 0.4 * density + 0.26 * spread;
  return Math.round(Math.max(0.24, Math.min(0.97, value)) * 100);
}

const describeKeywords = (keywords: string[]) => {
  if (keywords.length === 0) return 'everyday images and small details';
  if (keywords.length === 1) return keywords[0];
  if (keywords.length === 2) return `${keywords[0]} and ${keywords[1]}`;
  return `${keywords.slice(0, 3).join(', ')}`;
};

function keywordsOf(matched: Map<string, number>, text: string): string[] {
  const scored = [...matched.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word)
    .filter((word) => word.length > 2);

  if (scored.length >= 5) return scored.slice(0, 6);

  const freq = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 4) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const fallback = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word)
    .filter((word) => !scored.includes(word));
  return [...scored, ...fallback].slice(0, 6);
}

export function analyzeLyrics(parts: SongPart[]): Analysis {
  const fullText = parts.map((p) => p.lyrics).join('\n');
  const raw = analyzeText(fullText);

  const hasSignal = raw.signals.length > 0 && raw.signals[0].score >= 1.6;
  const topTheme = hasSignal ? raw.signals[0].theme : 'Reflection';
  const profile = THEMES.find((t) => t.key === topTheme);
  const keywords = keywordsOf(raw.matched, fullText);
  const { tone, toneLabel } = toneFrom(raw.valence, raw.energy);
  const confidence = hasSignal
    ? confidenceOf(raw.signals, raw.wordCount)
    : Math.max(20, Math.min(38, raw.wordCount > 0 ? 30 : 20));

  const suggestedTempo: Tempo = raw.energy >= 0.54 ? 'fast' : 'slow';

  const core = profile
    ? profile.core
    : 'The lyrics read as reflection — turning something over until it starts to make sense.';

  const message =
    `${core} ${TONE_SENTENCE[tone]}` +
    (keywords.length ? ` The strongest images are ${describeKeywords(keywords)}.` : '');

  const evidence: string[] = [];
  if (raw.topLine) evidence.push(`"${raw.topLine}"`);
  evidence.push(
    hasSignal
      ? `Matched ${raw.signals.reduce((n, s) => n + s.score, 0).toFixed(0)} weighted theme signals across ${raw.wordCount} content words.`
      : `Only ${raw.wordCount} content words — classifying on overall tone instead.`,
  );
  evidence.push(`Tempo read: ${suggestedTempo} (energy ${Math.round(raw.energy * 100)}/100).`);

  const partSignals: PartSignal[] = parts.map((part) => {
    const partRaw = analyzeText(part.lyrics);
    if (partRaw.signals.length === 0) {
      return { label: part.label, kind: part.kind, theme: topTheme, confidence: 20 };
    }
    return {
      label: part.label,
      kind: part.kind,
      theme: partRaw.signals[0].theme,
      confidence: confidenceOf(partRaw.signals, partRaw.wordCount),
    };
  });

  const about = profile ? profile.about : 'reflection and mixed feeling';

  return {
    theme: topTheme,
    confidence,
    tone,
    toneLabel,
    valence: Math.round(raw.valence * 100) / 100,
    energy: Math.round(raw.energy * 100) / 100,
    suggestedTempo,
    keywords,
    message,
    about,
    evidence,
    wordCount: raw.wordCount,
    lineCount: textLines(fullText).length,
    signals: raw.signals,
    parts: partSignals,
    generatedAt: Date.now(),
  };
}

/** Analysis for display: stored one, or one derived on the fly. */
export function effectiveAnalysis(song: { parts: SongPart[]; analysis: Analysis | null }) {
  return song.analysis ?? analyzeLyrics(song.parts);
}

export const THEME_LIST = THEMES.map((t) => t.key);

/** How strongly a song belongs to a given class/message (0-100). */
export function themeMatch(song: { parts: SongPart[]; analysis: Analysis | null; title: string }, theme: string) {
  if (!theme) return 100;
  const analysis = effectiveAnalysis(song);
  if (analysis.theme.toLowerCase() === theme.toLowerCase()) {
    return Math.round(70 + analysis.confidence * 0.3);
  }
  const samePart = analysis.parts.some((p) => p.theme.toLowerCase() === theme.toLowerCase());
  return samePart ? 48 : 0;
}

export const PART_KINDS: { kind: PartKind; label: string }[] = [
  { kind: 'intro', label: 'Intro' },
  { kind: 'verse', label: 'Verse' },
  { kind: 'prechorus', label: 'Pre-Chorus' },
  { kind: 'chorus', label: 'Chorus' },
  { kind: 'bridge', label: 'Bridge' },
  { kind: 'refrain', label: 'Refrain' },
  { kind: 'outro', label: 'Outro' },
  { kind: 'other', label: 'Other' },
];
