import type { Analysis, PartKind, PartSignal, SongPart, Tempo, ThemeScore } from './types';

/* ----------------------------------------------------- stopwords & lemmas */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those i you he she it we they me my your his her its our their
   is am are was were be been being do does did doing have has had having will would can could should shall may
   might must not no nor so as at by for from in into of on onto out over to up with without within about after
   before again all any both each few more most other some such only own same too very just now even still
   oh ooh yeah la na uh who whom whose what which when where why how there here them us him hers ours yours theirs
   im ima ive id youve youll youre weve were theyve dont cant wont didnt couldnt wouldnt shouldnt isnt arent wasnt
   aint gonna wanna gotta got get gets getting go goes going went gone come comes came coming make makes made
   let lets see saw seen know knew known say says said take takes took taken give gives gave given
   like down off around through unto thee thou thy thine ye hath doth art hast`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Words whose -ing / -ed / -s endings are lexical (not inflections to strip).
 */
const PROTECTED_WORDS = new Set([
  'morning', 'king', 'nothing', 'everything', 'something', 'anything', 'offering', 'anointing',
  'everlasting', 'thanksgiving', 'blessing', 'longing', 'beginning', 'living', 'lovingkindness',
  'righteousness', 'holiness', 'faithfulness', 'goodness', 'kindness', 'forgiveness', 'darkness',
  'stillness', 'gladness', 'weakness', 'witness', 'fortress', 'wilderness', 'presence',
  'jesus', 'christ', 'cross', 'precious', 'glorious', 'victorious', 'righteous', 'gracious',
  'marvelous', 'wondrous', 'hosanna', 'hallelujah', 'alleluia', 'messiah', 'jehovah',
  'psalm', 'hymn', 'amen', 'eden', 'zion', 'canaan', 'calvary', 'golgotha',
]);

/**
 * Exact morphological lemma table for high-frequency Christian worship vocabulary.
 */
const IRREGULAR_LEMMAS: Record<string, string> = {
  praising: 'praise', praised: 'praise', praises: 'praise',
  worshipping: 'worship', worshiping: 'worship', worshipped: 'worship', worshiped: 'worship',
  worshipper: 'worship', worshippers: 'worship', worshiper: 'worship', worships: 'worship',
  adoring: 'adore', adored: 'adore', adores: 'adore',
  exalting: 'exalt', exalted: 'exalt', exalts: 'exalt',
  magnifying: 'magnify', magnified: 'magnify', magnifies: 'magnify',
  glorifying: 'glorify', glorified: 'glorify', glorifies: 'glorify',
  sanctifying: 'sanctify', sanctified: 'sanctify',
  purifying: 'purify', purified: 'purify',
  satisfying: 'satisfy', satisfied: 'satisfy', satisfies: 'satisfy',
  testifying: 'testify', testified: 'testify', testifies: 'testify',
  crucifying: 'crucify', crucified: 'crucify',
  saving: 'save', saved: 'save', saves: 'save', saviour: 'savior',
  redeeming: 'redeem', redeemed: 'redeem', redeems: 'redeem',
  ransoming: 'ransom', ransomed: 'ransom',
  atoning: 'atone', atoned: 'atone',
  forgiving: 'forgive', forgiven: 'forgive', forgave: 'forgive', forgives: 'forgive',
  washing: 'wash', washed: 'wash', washes: 'wash',
  cleansing: 'cleanse', cleansed: 'cleanse', cleanses: 'cleanse',
  healing: 'heal', healed: 'heal', heals: 'heal', healer: 'heal',
  rising: 'rise', risen: 'risen', rose: 'rise', arises: 'arise', arising: 'arise', arose: 'arise',
  dying: 'die', died: 'die', bleeding: 'bleed', bled: 'bleed',
  loving: 'love', loved: 'love', loves: 'love',
  abiding: 'abide', abides: 'abide', abode: 'abide',
  holding: 'hold', held: 'hold', holds: 'hold',
  embracing: 'embrace', embraced: 'embrace',
  pursuing: 'pursue', pursued: 'pursue', pursues: 'pursue',
  believing: 'believe', believed: 'believe', believes: 'believe',
  trusting: 'trust', trusted: 'trust', trusts: 'trust',
  standing: 'stand', stood: 'stand', stands: 'stand',
  hiding: 'hide', hidden: 'hide', hid: 'hide',
  anchoring: 'anchor', anchored: 'anchor',
  leaning: 'lean', leaned: 'lean',
  surrendering: 'surrender', surrendered: 'surrender', surrenders: 'surrender',
  yielding: 'yield', yielded: 'yield', yields: 'yield',
  consecrating: 'consecrate', consecrated: 'consecrate',
  devoting: 'devote', devoted: 'devote',
  kneeling: 'kneel', knelt: 'kneel', kneels: 'kneel',
  bowing: 'bow', bowed: 'bow', bows: 'bow',
  humbling: 'humble', humbled: 'humble', humbly: 'humble',
  obeying: 'obey', obeyed: 'obey', obeys: 'obey',
  following: 'follow', followed: 'follow', follows: 'follow',
  pouring: 'pour', poured: 'pour', pours: 'pour',
  laying: 'lay', laid: 'lay',
  praying: 'pray', prayed: 'pray', prays: 'pray', prayers: 'prayer',
  interceding: 'intercede', interceded: 'intercede',
  breathing: 'breathe', breathed: 'breathe', breathes: 'breathe',
  dwelling: 'dwell', dwelt: 'dwell', dwells: 'dwell',
  filling: 'fill', filled: 'fill', fills: 'fill',
  reviving: 'revive', revived: 'revive',
  awakening: 'awaken', awakened: 'awaken', awakens: 'awaken',
  waiting: 'wait', waited: 'wait', waits: 'wait',
  resting: 'rest', rested: 'rest', rests: 'rest',
  hoping: 'hope', hoped: 'hope', hopes: 'hope',
  returning: 'return', returned: 'return', returns: 'return',
  reigning: 'reign', reigned: 'reign', reigns: 'reign',
  thanking: 'thank', thanked: 'thank',
  rejoicing: 'rejoice', rejoiced: 'rejoice', rejoices: 'rejoice',
  celebrating: 'celebrate', celebrated: 'celebrate', celebrates: 'celebrate',
  blessed: 'bless', blesses: 'bless', blessings: 'blessing',
  dancing: 'dance', danced: 'dance', dances: 'dance',
  clapping: 'clap', clapped: 'clap',
  shouting: 'shout', shouted: 'shout', shouts: 'shout',
  singing: 'sing', sang: 'sing', sung: 'sing', sings: 'sing',
  delivering: 'deliver', delivered: 'deliver', delivers: 'deliver',
  breaking: 'break', broke: 'break', breaks: 'break',
  overcoming: 'overcome', overcame: 'overcome', overcomes: 'overcome',
  conquering: 'conquer', conquered: 'conquer', conquers: 'conquer',
  fighting: 'fight', fought: 'fight', fights: 'fight',
  chains: 'chain', strongholds: 'stronghold', battles: 'battle', walls: 'wall',
  sending: 'send', sent: 'send', sends: 'send',
  serving: 'serve', served: 'serve', serves: 'serve', servants: 'servant',
  shining: 'shine', shone: 'shine', shines: 'shine',
  proclaiming: 'proclaim', proclaimed: 'proclaim', proclaims: 'proclaim',
  preaching: 'preach', preached: 'preach',
  disciples: 'disciple', nations: 'nation',
  mercies: 'mercy', promises: 'promise', sins: 'sin', sinners: 'sinner',
  crowns: 'crown', crowned: 'crown', thrones: 'throne', kings: 'king',
  storms: 'storm', waters: 'water', waves: 'wave', mountains: 'mountain', valleys: 'valley',
  tears: 'tear', scars: 'scar', nails: 'nail', wounds: 'wound', wounded: 'wound',
  children: 'child', sons: 'son', daughters: 'daughter', saints: 'saint',
  angels: 'angel', heavens: 'heaven', clouds: 'cloud', trumpets: 'trumpet',
};

export function lemma(raw: string): string {
  const w = raw.toLowerCase();
  if (IRREGULAR_LEMMAS[w]) return IRREGULAR_LEMMAS[w];
  if (PROTECTED_WORDS.has(w)) return w;

  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ied')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ing')) {
    const base = w.slice(0, -3);
    if (PROTECTED_WORDS.has(base)) return base;
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    return base;
  }
  if (w.length > 4 && w.endsWith('ed')) {
    const base = w.slice(0, -2);
    if (PROTECTED_WORDS.has(base)) return base;
    return base;
  }
  if (w.length > 4 && w.endsWith('es') && /(ch|sh|x|z|ss)$/.test(w.slice(0, -2))) {
    return w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    return w.slice(0, -1);
  }
  return w;
}

/* ------------------------------------------- worship theme definitions */

interface ThemeProfile {
  key: string;
  about: string;
  core: string;
  serviceMoment: string;
  words: Record<string, number>;
  phrases: Record<string, number>;
}

/**
 * Discriminative Christian & Church Worship Taxonomy.
 * Ubiquitous worship terms ("god", "lord", "jesus") carry low standalone weight
 * while high-IDF theological terms and scriptural phrases carry high weight.
 */
const THEMES: ThemeProfile[] = [
  {
    key: 'Praise & Adoration',
    about: 'exalting God’s holiness, majesty, and matchless name',
    core:
      'This song centers on praise and adoration — magnifying the holiness, majesty, and matchless name of the Lord in congregational worship.',
    serviceMoment: 'Well-suited for Call to Worship or opening congregational praise.',
    words: {
      praise: 4.5, worship: 3.5, adore: 4.8, adoration: 5.5, exalt: 5.2, magnify: 5.0,
      glorify: 4.8, glory: 3.8, glorious: 3.8, holy: 4.2, holiness: 4.8, worthy: 4.6,
      majesty: 5.4, majestic: 4.8, throne: 4.4, crown: 3.6, king: 3.2, almighty: 4.6,
      hallelujah: 5.0, alleluia: 5.0, hosanna: 5.0, sovereign: 3.6, creator: 4.0,
      wonder: 3.2, wonderful: 3.2, splendor: 4.6, awesome: 3.6, greatness: 4.2,
      psalm: 3.4, hymn: 3.4, anthem: 3.2, honor: 3.8, honour: 3.8, dominion: 4.8,
      omnipotent: 5.2, reign: 3.8, exalted: 5.0, matchless: 4.6,
      // Tagalog & Ilokano church worship vocabulary
      papuri: 5.5, purihin: 5.5, sambahin: 5.2, pagsamba: 5.0, dakila: 4.5, banal: 4.5,
      luwalhati: 4.8, kadakilaan: 4.8, dayaw: 5.2, daydayawen: 5.5, madaydayaw: 5.5,
      nasantoan: 4.8, itanok: 5.0, kangatoan: 4.6,
    },
    phrases: {
      'king of kings': 6.5, 'lord of lords': 6.5, 'holy holy': 6.5, 'worthy is the lamb': 6.0,
      'worthy is your name': 6.0, 'bless the lord': 6.5, 'bless his holy name': 6.5,
      'worship his holy name': 6.0, 'lift your name': 5.2, 'lift high the name': 5.5,
      'name above all names': 6.0, 'how great thou art': 6.5, 'how great is our god': 6.5,
      'most high': 4.8, 'sing praise': 5.0, 'give him glory': 5.2, 'glory to god': 5.8,
      'unto the lord': 4.2, 'crown him': 5.8, 'all hail': 5.5, 'lamb upon the throne': 5.8,
      'ancient of days': 5.5, 'alpha and omega': 5.5, 'lion and the lamb': 5.2,
      'walang hanggang sasambahin': 6.0, 'purihin ang panginoon': 6.0, 'madaydayaw ka apo': 6.0,
    },
  },
  {
    key: 'Grace & Salvation',
    about: 'the cross of Christ, redemption, forgiveness, and saving grace',
    core:
      'This song proclaims grace and salvation — celebrating Jesus’ atoning sacrifice on the cross, forgiveness of sin, and new life in Christ.',
    serviceMoment: 'Fits Communion, Good Friday/Easter, or a Gospel response.',
    words: {
      grace: 4.8, cross: 5.6, calvary: 6.2, golgotha: 6.2, blood: 5.2, lamb: 4.0,
      redeem: 5.4, redeemer: 5.6, redemption: 5.8, save: 4.0, savior: 5.2, salvation: 5.8,
      forgive: 4.8, forgiveness: 5.2, mercy: 3.8, merciful: 3.8, sin: 5.0, sinner: 5.2,
      ransom: 5.8, risen: 4.4, resurrection: 5.2, grave: 3.6, tomb: 4.4, atone: 6.0,
      atonement: 6.2, wash: 4.0, cleanse: 4.4, spotless: 4.8, crucify: 6.0, nail: 4.5,
      scar: 3.8, wound: 4.2, bleed: 4.8, debt: 4.4, paid: 3.6, justify: 5.2,
      righteousness: 4.2, messiah: 4.2,
      // Tagalog & Ilokano
      biyaya: 5.2, kaligtasan: 5.8, krus: 5.8, dugo: 5.0, ligtas: 4.8, tagapagligtas: 5.8,
      patawad: 5.0, kasalanan: 5.0, tinubos: 5.8, manunubos: 5.8,
      parabur: 5.2, pannakaisalakan: 6.0, maisalakan: 5.5, dara: 4.8, pakawan: 5.0, basol: 5.0,
    },
    phrases: {
      'amazing grace': 6.8, 'jesus paid it all': 6.8, 'lamb of god': 5.8, 'son of god': 4.4,
      'washed in the blood': 6.5, 'nothing but the blood': 6.8, 'thank you jesus for the blood': 6.5,
      'at the cross': 6.5, 'the old rugged cross': 6.8, 'upon the cross': 6.2,
      'by his stripes': 6.2, 'once was lost': 5.8, 'blind but now i see': 5.8,
      'empty grave': 5.8, 'up from the grave': 6.0, 'saved my soul': 5.8, 'born again': 5.8,
      'paid my debt': 6.0, 'paid my ransom': 6.2, 'sins are forgiven': 6.2, 'white as snow': 5.8,
      'crimson stain': 6.0, 'my chains are gone': 4.8, 'in christ alone': 4.8,
    },
  },
  {
    key: 'God’s Love',
    about: 'the Father’s unfailing covenant love, compassion, and faithfulness',
    core:
      'This song reflects on God’s unfailing love — resting in the Father’s steadfast mercy, compassion, and covenant faithfulness toward His children.',
    serviceMoment: 'Encouraging for pastoral comfort, assurance of pardon, or family worship.',
    words: {
      love: 4.4, lovingkindness: 6.0, unfailing: 5.5, steadfast: 5.0, father: 4.6,
      abba: 6.0, beloved: 4.8, child: 3.4, adopt: 4.8, adoption: 5.2, compassion: 5.0,
      faithful: 4.2, faithfulness: 4.8, goodness: 4.2, covenant: 5.2, embrace: 3.8,
      shepherd: 4.8, pasture: 4.2, gentle: 3.4, kindness: 4.2, everlasting: 4.0,
      reckless: 4.5, pursue: 4.0, prodigal: 5.4, delight: 3.6, tender: 3.6, care: 3.0,
      // Tagalog & Ilokano
      pagibig: 5.6, pagmamahal: 5.4, minamahal: 5.0, ama: 4.4, tapat: 4.4, katapatan: 4.8,
      habag: 4.6, kabutihan: 4.4, ayat: 5.6, dungngo: 5.2, matalek: 4.6, kinaimbag: 4.4,
    },
    phrases: {
      'love of god': 6.8, 'gods love': 6.5, 'fathers love': 6.5, 'how he loves': 6.8,
      'good good father': 6.8, 'deep deep love': 6.8, 'love never fails': 6.5,
      'your love never fails': 6.8, 'never fails': 4.8, 'his love endures': 6.5,
      'endures forever': 5.2, 'nothing can separate': 6.2, 'separate us from the love': 6.8,
      'child of god': 5.8, 'goodness of god': 6.0, 'overwhelming never ending': 6.2,
      'reckless love': 6.5, 'loving kindness': 6.0, 'dakilang pagibig': 6.5, 'tapat kailanpaman': 5.8,
    },
  },
  {
    key: 'Faith & Trust',
    about: 'standing firm on Christ our Cornerstone and trusting God’s promises in trials',
    core:
      'This song strengthens faith and trust in the Lord — anchoring the church on Christ our Cornerstone and God’s unbreakable promises through every storm.',
    serviceMoment: 'Ideal before or after a sermon on perseverance, trials, and trusting God.',
    words: {
      faith: 5.2, believe: 4.4, trust: 5.4, promise: 4.6, anchor: 5.6, rock: 4.8,
      cornerstone: 6.4, foundation: 5.6, refuge: 5.6, fortress: 5.6, shield: 4.4,
      shelter: 4.6, hide: 3.6, storm: 4.4, stormy: 4.6, gale: 4.6, wave: 3.6,
      wind: 2.8, valley: 4.2, mountain: 3.6, shadow: 3.4, fear: 3.2, afraid: 3.4,
      steady: 3.8, unshaken: 5.6, unshakeable: 5.6, immovable: 5.2, waymaker: 6.0,
      miracle: 4.6, provider: 5.2, jehovah: 4.6, jireh: 5.8, uphold: 4.6, sustain: 4.8,
      lean: 3.8, Sovereign: 3.8,
      // Tagalog & Ilokano
      pananampalataya: 6.0, tiwala: 5.6, magtiwala: 5.6, pangako: 4.8, kanlungan: 5.6,
      bato: 4.6, matatag: 4.8, sandigan: 5.4, bagyo: 4.2,
      pammati: 6.0, talek: 5.6, agtalek: 5.8, kari: 4.6, kamang: 5.6, salaknib: 5.2,
    },
    phrases: {
      'christ alone': 6.2, 'my hope is built': 6.5, 'solid rock': 6.5, 'sinking sand': 6.0,
      'firm foundation': 6.5, 'he will not fail': 6.0, 'do not fear': 5.2, 'be not afraid': 5.2,
      'i will trust': 6.2, 'trust in you': 6.0, 'trust in the lord': 6.5,
      'even when i dont see it': 6.5, 'even when i cannot see': 6.2, 'way maker': 6.5,
      'miracle worker': 6.0, 'promise keeper': 6.2, 'through the storm': 5.8,
      'it is well': 6.2, 'well with my soul': 6.5, 'he is able': 5.8, 'god will make a way': 6.5,
    },
  },
  {
    key: 'Surrender & Devotion',
    about: 'yielding heart, will, and life completely to Jesus in consecration',
    core:
      'This song is a prayer of surrender and devotion — laying everything on the altar before Jesus and choosing to follow Him wholeheartedly.',
    serviceMoment: 'Meaningful for altar ministry, dedication, or response after the Word.',
    words: {
      surrender: 6.4, yield: 5.8, consecrate: 6.0, consecration: 6.0, devotion: 5.4,
      devote: 5.2, altar: 5.6, sacrifice: 4.8, offering: 4.6, potter: 6.0, clay: 5.8,
      mold: 5.0, humble: 4.2, kneel: 4.6, knees: 4.4, bow: 4.2, obey: 4.8, obedience: 5.2,
      thirst: 4.6, thirsty: 4.6, hunger: 4.6, hungry: 4.6, desire: 4.0, nearer: 4.8,
      vessel: 5.0, pour: 3.8, alabaster: 5.8, costly: 4.6, dross: 5.2, refine: 4.8,
      consume: 4.4, allegiance: 5.2,
      // Tagalog & Ilokano
      isuko: 6.2, pagsuko: 6.0, alay: 5.4, iaalay: 5.6, buhay: 3.4, puso: 3.2,
      sumunod: 4.6, kababaan: 4.8, hubugin: 5.6,
      idaton: 5.8, agtulnog: 5.2, pakumbaba: 5.0, biagko: 4.6, pusok: 4.2,
    },
    phrases: {
      'i surrender': 6.8, 'surrender all': 6.8, 'all to jesus': 6.5, 'all to thee': 6.5,
      'take my life': 6.8, 'have your way': 6.5, 'have thine own way': 6.8,
      'thy will be done': 6.5, 'your will be done': 6.5, 'living sacrifice': 6.5,
      'more of you': 6.0, 'less of me': 6.2, 'my heart is yours': 6.2, 'give you my heart': 6.5,
      'build my life': 5.8, 'heart of worship': 6.2, 'all about you': 5.2,
      'nothing else': 5.2, 'at your feet': 5.4, 'draw me close': 6.0, 'nearer my god to thee': 6.5,
      'i give myself away': 6.8, 'lord i need you': 5.6,
    },
  },
  {
    key: 'Prayer & Presence',
    about: 'welcoming the Holy Spirit, reverent stillness, and spiritual renewal',
    core:
      'This song leads the congregation into prayer and God’s presence — welcoming the Holy Spirit and resting in quiet communion with the Lord.',
    serviceMoment: 'Ideal for prayer ministry, invocation, or contemplative worship.',
    words: {
      spirit: 5.0, presence: 5.8, pray: 4.8, prayer: 5.4, intercede: 5.8, intercession: 5.8,
      breathe: 4.8, breath: 4.6, anoint: 5.8, anointing: 6.0, fill: 4.2, overflow: 4.4,
      dwell: 4.8, sanctuary: 5.4, temple: 4.6, tabernacle: 5.4, abide: 4.8, still: 3.8,
      stillness: 5.2, quiet: 4.0, peace: 4.4, shalom: 5.6, comforter: 6.0, counselor: 5.2,
      revive: 5.6, revival: 5.8, awaken: 4.8, afresh: 5.6, Pentecost: 5.8,pentecost: 5.8,
      communion: 5.4, rush: 3.4, wind: 3.4, fire: 3.6,
      // Tagalog & Ilokano
      espiritu: 6.0, presensya: 6.0, panalangin: 5.8, dalangin: 5.8, kapayapaan: 4.8,
      manahan: 5.2, puspusin: 5.6, kararag: 5.8, agkararag: 5.8, talna: 5.0,
    },
    phrases: {
      'holy spirit': 6.8, 'spirit of god': 6.5, 'spirit of the living god': 6.8,
      'in your presence': 6.5, 'come holy spirit': 6.8, 'holy spirit you are welcome': 6.8,
      'fall afresh': 6.5, 'fresh wind': 6.2, 'be still': 5.6, 'be still and know': 6.5,
      'hear our prayer': 6.2, 'sweet hour of prayer': 6.8, 'fill this place': 6.2,
      'abide with me': 6.2, 'prince of peace': 5.6, 'breath of god': 6.5,
      'open the heavens': 5.8, 'resting place': 5.4, 'banal na espiritu': 6.8,
    },
  },
  {
    key: 'Hope & Heaven',
    about: 'living hope in the risen Christ, Christ’s return, and eternal glory',
    core:
      'This song lifts the church’s eyes toward Christian hope and eternity — rejoicing in the risen Savior and the promised glory of heaven.',
    serviceMoment: 'Uplifting for Easter, memorial services, or messages on eternal hope.',
    words: {
      hope: 4.6, hopeful: 4.4, heaven: 5.8, heavenly: 5.2, eternal: 5.6, eternity: 6.2,
      forevermore: 4.4, resurrection: 4.8, return: 4.2, cloud: 3.8, trumpet: 5.6,
      bride: 4.8, bridegroom: 5.6, zion: 5.6, canaan: 5.8, jerusalem: 5.6, kingdom: 4.2,
      saint: 4.4, mansion: 5.6, homeland: 5.2, shore: 4.0, immortality: 6.0,
      hereafter: 5.6, paradise: 5.8, gloryland: 6.0, maranatha: 6.5,
      // Tagalog & Ilokano
      langit: 5.8, pagasa: 5.2, walanghanggan: 5.4, kaharian: 4.6, paraiso: 5.6,
      namnama: 5.6, agnanayon: 5.4, pagarian: 4.6,
    },
    phrases: {
      'living hope': 6.5, 'blessed hope': 6.8, 'christ will return': 6.8, 'jesus is coming': 6.5,
      'soon and very soon': 6.8, 'no more tears': 6.5, 'no more night': 6.5, 'no more pain': 6.0,
      'streets of gold': 6.8, 'crown of life': 6.2, 'thy kingdom come': 5.8,
      'when we all get to heaven': 6.8, 'what a day of rejoicing': 6.5, 'eternal life': 6.2,
      'face to face': 5.4, 'see his face': 5.8, 'new jerusalem': 6.5, 'promised land': 6.0,
      'home in glory': 6.5, 'beyond the river': 5.8,
    },
  },
  {
    key: 'Thanksgiving & Joy',
    about: 'joyful gratitude and testimony for God’s faithfulness and blessings',
    core:
      'This song overflows with Christian thanksgiving and joy — testifying to God’s provision, answered prayer, and abundant blessings.',
    serviceMoment: 'Great for Thanksgiving, Offertory, testimonies, or joyful celebration.',
    words: {
      thank: 6.0, thanks: 5.8, thankful: 6.0, thanksgiving: 6.4, grateful: 6.0, gratitude: 6.4,
      joy: 4.6, joyful: 5.2, rejoice: 5.2, glad: 4.4, gladness: 4.8, blessing: 4.8,
      bountiful: 5.2, bounty: 5.2, provision: 5.0, provide: 4.4, testimony: 5.4,
      testify: 5.2, celebrate: 4.6, celebration: 4.8, feast: 4.2,favor: 4.4, favour: 4.4,
      multiply: 4.2,
      // Tagalog & Ilokano
      salamat: 6.4, pasasalamat: 6.5, nagpapasalamat: 6.4, kagalakan: 5.4, galak: 5.0,
      pagpapala: 5.6, biyaya: 2.5, agyaman: 6.4, agyamanak: 6.6, panagyaman: 6.5,
      rago: 5.2, bendision: 5.6,
    },
    phrases: {
      'give thanks': 6.8, 'thank you lord': 6.8, 'thank you jesus': 6.5, 'thank you father': 6.8,
      'thank you god': 6.8, 'count your blessings': 6.8, 'count your many blessings': 6.8,
      'joy of the lord': 6.5, 'rejoice in the lord': 6.2, 'this is the day': 5.8,
      'he has done great things': 6.5, 'the lord has done': 5.8, 'so grateful': 5.8,
      'grateful heart': 6.5, 'with a grateful heart': 6.8, 'my cup overflows': 6.2,
      'maraming salamat': 6.6, 'walang hanggang pasasalamat': 6.8, 'agyamanak apo': 6.8,
    },
  },
  {
    key: 'Deliverance & Victory',
    about: 'spiritual freedom, breakthrough, and victory in Jesus’ name',
    core:
      'This song declares spiritual deliverance and victory — proclaiming the power of Jesus’ name to break chains, silence fear, and overcome darkness.',
    serviceMoment: 'Powerful for upbeat congregational praise, youth worship, and breakthrough prayer.',
    words: {
      free: 4.2, freedom: 5.6, deliver: 5.8, deliverer: 6.0, deliverance: 6.2,
      chain: 5.4, break: 3.6, breakthrough: 6.2, victory: 6.0, victorious: 6.0,
      overcome: 5.4, overcomer: 6.0, battle: 5.2, fight: 4.2, triumph: 5.6,
      conquer: 5.6, conqueror: 6.0, power: 4.0, mighty: 3.8, stronghold: 6.2,
      wall: 3.8, jericho: 6.2, lion: 4.2, judah: 5.2, darkness: 3.6, weapon: 5.4,
      giant: 5.2, goliath: 6.0, slave: 5.0, bondage: 5.8, captive: 5.6, enemy: 5.0,
      defeat: 4.8, authority: 5.0,
      // Tagalog & Ilokano
      tagumpay: 6.2, mapagtagumpay: 6.2, malaya: 5.6, kalayaan: 5.8, pinalaya: 6.0,
      kapangyarihan: 4.6, gapos: 5.8, balligi: 6.2, wayawaya: 6.0,
    },
    phrases: {
      'set me free': 6.2, 'sets me free': 6.2, 'whom the son sets free': 6.8, 'free indeed': 6.5,
      'no longer slaves': 6.8, 'no longer a slave': 6.8, 'break every chain': 6.8,
      'in jesus name': 5.8, 'battle belongs': 6.8, 'battle belongs to the lord': 6.8,
      'lion of judah': 6.0, 'more than conquerors': 6.8, 'victory in jesus': 6.5,
      'no weapon formed': 6.8, 'walls fall down': 6.2, 'chains fall': 6.5,
      'trample the enemy': 6.0, 'see a victory': 6.8,
    },
  },
  {
    key: 'Mission & Discipleship',
    about: 'following Jesus, unity in the church, serving others, and sharing the Gospel',
    core:
      'This song calls the church to mission and discipleship — walking in Christian unity, serving our neighbors in love, and proclaiming the Gospel to the world.',
    serviceMoment: 'Fitting for Sending/Benediction, Missions Sunday, or church commissioning.',
    words: {
      send: 5.0, nation: 5.2, world: 3.4, gospel: 5.8, witness: 5.6, light: 3.2,
      salt: 5.0, serve: 5.0, servant: 5.4, disciple: 6.0, follow: 4.2, commission: 6.2,
      church: 4.6, unity: 5.6, united: 4.8, brother: 4.0, sister: 4.0, neighbor: 4.8,
      shine: 4.4, proclaim: 5.6, preach: 5.8, harvest: 5.4, laborer: 5.8, footstep: 4.8,
      ambassador: 5.8, fellowship: 5.2, gather: 3.8, build: 3.2,
      // Tagalog & Ilokano
      simbahan: 5.2, iglesya: 5.6, misyon: 6.0, maglingkod: 5.8, lingkod: 5.2,
      ebanghelyo: 6.0, humayo: 6.0, liwanag: 4.2, simbaan: 5.4, agserbi: 5.8, iwaragawag: 6.0,
    },
    phrases: {
      'here i am send me': 6.8, 'send me': 5.6, 'into all the world': 6.5,
      'let your light shine': 6.5, 'this little light of mine': 6.5, 'make disciples': 6.8,
      'follow jesus': 6.2, 'decided to follow': 6.8, 'no turning back': 6.2,
      'one body': 5.6, 'we are the church': 6.5, 'o church arise': 6.5,
      'city on a hill': 6.2, 'good news': 5.4, 'go tell it': 6.2, 'bind us together': 6.5,
      'they will know we are christians': 6.8, 'break my heart for what breaks yours': 6.0,
    },
  },
];

/* ------------------------------------------- sentiment & worship energy */

const POSITIVE = new Set(
  `love joy hope grace glory holy worthy praise worship rejoice glad light peace free freedom
   blessing bless grateful thankful celebrate sing dance promise safe heaven forever amen
   faithful mercy redeem save salvation victory triumph risen alive heal restore strength
   goodness kindness delightalaya salamat agyaman kagalakan tagumpay balligi`
    .split(/\s+/)
    .filter(Boolean)
    .map(lemma),
);

const NEGATIVE = new Set(
  `sin sorrow mourn weep tear broken lost fear afraid scared valley shadow storm
   grave death ash weary burden heavy cry contrite repent repentance chain darkness
   trial trouble suffer pain wound bleed crucify`
    .split(/\s+/)
    .filter(Boolean)
    .map(lemma),
);

const FAST_PRAISE_CUES = new Set(
  `shout dance clap jump celebrate rejoice joyful loud awake arise roar march anthem
   victory triumph freedom break breakthrough hallelujah hosanna glory mighty power
   unstoppable alive sing praise exalt indak palakpak isigaw magpuri agsala`
    .split(/\s+/)
    .filter(Boolean)
    .map(lemma),
);

const SLOW_WORSHIP_CUES = new Set(
  `still stillness quiet calm breathe breath gentle soft tender kneel bow humble abide rest
   wait whisper peace sanctuary altar prayer pray surrender yield holy sacred reverence
   communion mercy cross calvary lamb behold dwell nearer`
    .split(/\s+/)
    .filter(Boolean)
    .map(lemma),
);

const GENERIC_CHRISTIAN_FILLER = new Set([
  'god', 'lord', 'jesus', 'christ', 'king', 'sing', 'song', 'heart', 'life', 'name',
  'day', 'night', 'world', 'hand', 'way', 'forever', 'always', 'good', 'great',
]);

/* --------------------------------------------------------------- indexes */

const THEME_WORDS = new Map<string, { theme: string; weight: number }[]>();
const THEME_PHRASES: { theme: string; regex: RegExp; firstWord: string; weight: number }[] = [];

for (const theme of THEMES) {
  for (const [word, weight] of Object.entries(theme.words)) {
    const key = lemma(word);
    const bucket = THEME_WORDS.get(key) || [];
    const existing = bucket.find((b) => b.theme === theme.key);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
    } else {
      bucket.push({ theme: theme.key, weight });
    }
    THEME_WORDS.set(key, bucket);
  }
  for (const [phrase, weight] of Object.entries(theme.phrases)) {
    const cleanPhrase = phrase
      .toLowerCase()
      .replace(/[’']/g, '')
      .trim()
      .replace(/\s+/g, '\\s+');
    THEME_PHRASES.push({
      theme: theme.key,
      regex: new RegExp(`\\b${cleanPhrase}\\b`, 'g'),
      firstWord: phrase.split(/\s+/)[0].toLowerCase(),
      weight,
    });
  }
}

/* ------------------------------------------------------------- tokenizer */

function normaliseForPhrases(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

const SECTION_WEIGHTS: Record<PartKind | 'title', number> = {
  title: 1.75,
  chorus: 2.15,
  refrain: 2.0,
  bridge: 1.45,
  prechorus: 1.25,
  verse: 1.0,
  intro: 0.9,
  outro: 0.95,
  other: 1.0,
};

/** BM25-style sublinear term frequency saturation within a single section. */
function saturateTf(count: number): number {
  if (count <= 0) return 0;
  return (count / (count + 1.35)) * 2.35;
}

interface RawResult {
  signals: ThemeScore[];
  valence: number;
  energy: number;
  matched: Map<string, number>;
  lemmaSet: Set<string>;
  wordCount: number;
  topLine: string;
}

function scoreSectionInto(
  text: string,
  sectionWeight: number,
  scores: Map<string, number>,
  matched: Map<string, number>,
  lemmaSet: Set<string>,
  stats: { pos: number; neg: number; fast: number; slow: number; words: number; exclamations: number },
) {
  if (!text.trim()) return;
  const tokens = tokenize(text);
  stats.words += tokens.length;
  stats.exclamations += (text.match(/!/g) || []).length;

  // Count lemmas within this section first so repeated chants saturate smoothly
  const sectionLemmaCounts = new Map<string, { count: number; surface: string }>();
  for (const token of tokens) {
    const key = lemma(token);
    lemmaSet.add(key);
    const entry = sectionLemmaCounts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      sectionLemmaCounts.set(key, { count: 1, surface: token });
    }

    if (POSITIVE.has(key)) stats.pos += sectionWeight;
    if (NEGATIVE.has(key)) stats.neg += sectionWeight;
    if (FAST_PRAISE_CUES.has(key)) stats.fast += sectionWeight;
    if (SLOW_WORSHIP_CUES.has(key)) stats.slow += sectionWeight;
  }

  for (const [key, { count, surface }] of sectionLemmaCounts) {
    const hits = THEME_WORDS.get(key);
    if (!hits) continue;
    const tf = saturateTf(count);
    for (const hit of hits) {
      scores.set(hit.theme, (scores.get(hit.theme) || 0) + hit.weight * tf * sectionWeight);
    }
    const kwBoost = GENERIC_CHRISTIAN_FILLER.has(key) ? 0.35 : 1.2;
    matched.set(surface, (matched.get(surface) || 0) + count * kwBoost * sectionWeight);
  }

  // Word-boundary phrase matching
  const norm = normaliseForPhrases(text);
  if (norm) {
    for (const { theme, regex, firstWord, weight } of THEME_PHRASES) {
      regex.lastIndex = 0;
      let count = 0;
      while (regex.exec(norm) !== null) {
        count += 1;
        if (count >= 4) break;
      }
      if (count > 0) {
        const tf = saturateTf(count);
        scores.set(theme, (scores.get(theme) || 0) + weight * tf * sectionWeight);
        if (!STOPWORDS.has(firstWord) && !GENERIC_CHRISTIAN_FILLER.has(firstWord)) {
          matched.set(firstWord, (matched.get(firstWord) || 0) + count * sectionWeight);
        }
      }
    }
  }
}

/**
 * Theological context disambiguation rules when multiple Christian themes co-occur.
 */
function applyContextualRefinements(
  scores: Map<string, number>,
  lemmas: Set<string>,
  fullNorm: string,
) {
  const has = (...ws: string[]) => ws.some((w) => lemmas.has(lemma(w)));
  const countHas = (...ws: string[]) => ws.filter((w) => lemmas.has(lemma(w))).length;

  // 1. Atonement vs. Father's Love: hymns mentioning "love" AT the cross / blood / ransom / wounds
  const atonementDepth = countHas(
    'cross', 'calvary', 'golgotha', 'blood', 'ransom', 'crucify', 'sin', 'atone', 'forgive', 'wound', 'bleed', 'die',
  );
  if (atonementDepth >= 2 && (scores.get('Grace & Salvation') || 0) > 0) {
    const mult = atonementDepth >= 3 ? 1.38 + Math.min(0.24, (atonementDepth - 3) * 0.08) : 1.18;
    scores.set('Grace & Salvation', (scores.get('Grace & Salvation') || 0) * mult);
  }

  // 2. "Bless the Lord" is Adoration/Praise, not counting earthly blessings (unless thank/grateful is present)
  if (/\bbless (?:the lord|his holy name|your name)\b/.test(fullNorm) && !has('thank', 'grateful', 'gratitude')) {
    scores.set('Praise & Adoration', (scores.get('Praise & Adoration') || 0) + 6.5);
  }

  // 3. Anchored storm trust ("my hope is built", "cornerstone", "refuge", "storm") -> Faith & Trust
  const anchorDepth = countHas('cornerstone', 'anchor', 'refuge', 'fortress', 'foundation', 'storm', 'rock', 'trust');
  if (anchorDepth >= 2) {
    scores.set('Faith & Trust', (scores.get('Faith & Trust') || 0) * (1 + Math.min(0.28, anchorDepth * 0.07)));
  }

  // 4. Consecration cues ("surrender", "altar", "potter", "clay", "yield", "sacrifice") -> Surrender & Devotion
  const surrenderDepth = countHas('surrender', 'yield', 'altar', 'potter', 'clay', 'consecrate', 'obey');
  if (surrenderDepth >= 2) {
    scores.set('Surrender & Devotion', (scores.get('Surrender & Devotion') || 0) * 1.22);
  }

  // 5. Explicit Pneumatology ("holy spirit", "anointing", "comforter", "revival", "presence") -> Prayer & Presence
  if (/\b(?:holy spirit|spirit of (?:god|the living god)|come holy spirit|fall afresh)\b/.test(fullNorm)) {
    scores.set('Prayer & Presence', (scores.get('Prayer & Presence') || 0) * 1.25);
  }

  // 6. Eschatology / Heaven ("heaven", "eternity", "streets of gold", "trumpet", "no more tears") -> Hope & Heaven
  const heavenDepth = countHas('heaven', 'eternity', 'eternal', 'trumpet', 'mansion', 'zion', 'canaan', 'bridegroom');
  if (heavenDepth >= 2) {
    scores.set('Hope & Heaven', (scores.get('Hope & Heaven') || 0) * 1.22);
  }
}

function analyzeSongInputs(parts: SongPart[], title = ''): RawResult {
  const scores = new Map<string, number>();
  const matched = new Map<string, number>();
  const lemmaSet = new Set<string>();
  const stats = { pos: 0, neg: 0, fast: 0, slow: 0, words: 0, exclamations: 0 };

  if (title.trim()) {
    scoreSectionInto(title, SECTION_WEIGHTS.title, scores, matched, lemmaSet, stats);
  }

  for (const part of parts) {
    const w = SECTION_WEIGHTS[part.kind] ?? 1.0;
    scoreSectionInto(part.lyrics, w, scores, matched, lemmaSet, stats);
  }

  const fullText = [title, ...parts.map((p) => p.lyrics)].filter(Boolean).join('\n');
  const fullNorm = normaliseForPhrases(fullText);
  applyContextualRefinements(scores, lemmaSet, fullNorm);

  const sentimentTotal = stats.pos + stats.neg || 1;
  const valence = Math.max(
    0,
    Math.min(1, 0.52 + ((stats.pos - stats.neg) / sentimentTotal) * 0.48),
  );

  const exclBoost = Math.min(2.5, stats.exclamations * 0.45);
  const fastTotal = stats.fast + exclBoost;
  const energyTotal = fastTotal + stats.slow || 1;
  const energy =
    stats.fast === 0 && stats.slow === 0
      ? 0.46
      : Math.max(0, Math.min(1, 0.5 + ((fastTotal - stats.slow) / energyTotal) * 0.5));

  const signals = [...scores.entries()]
    .filter(([, score]) => score >= 0.8)
    .map(([theme, score]) => ({ theme, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const topTheme = signals[0]?.theme;

  // Pick the most representative lyric line (preferring lines aligned with the winning theme)
  let topLine = '';
  let best = 0;
  for (const part of parts) {
    const partBoost = part.kind === 'chorus' || part.kind === 'refrain' ? 1.25 : 1.0;
    for (const line of textLines(part.lyrics)) {
      const lineTokens = tokenize(line);
      if (lineTokens.length < 2) continue;
      let lineScore = 0;
      for (const token of lineTokens) {
        const hits = THEME_WORDS.get(lemma(token));
        if (!hits) continue;
        for (const h of hits) {
          lineScore += h.theme === topTheme ? h.weight * 1.6 : h.weight * 0.45;
        }
      }
      const normLine = normaliseForPhrases(line);
      for (const p of THEME_PHRASES) {
        p.regex.lastIndex = 0;
        if (p.regex.test(normLine)) {
          lineScore += p.theme === topTheme ? p.weight * 1.8 : p.weight * 0.5;
        }
      }
      const weighted = lineScore * partBoost;
      if (weighted > best) {
        best = weighted;
        topLine = line;
      }
    }
  }

  return {
    signals,
    valence,
    energy,
    matched,
    lemmaSet,
    wordCount: stats.words,
    topLine,
  };
}

function toneFrom(valence: number, energy: number) {
  const vHigh = valence >= 0.58;
  const vLow = valence <= 0.42;
  const eHigh = energy >= 0.55;

  if (vHigh && eHigh) return { tone: 'joyful-praise', toneLabel: 'Joyful & celebratory' };
  if (vHigh && !eHigh) return { tone: 'reverent-intimate', toneLabel: 'Reverent & intimate' };
  if (vLow && eHigh) return { tone: 'fervent-cry', toneLabel: 'Fervent & earnest' };
  if (vLow && !eHigh) return { tone: 'penitent-reflective', toneLabel: 'Penitent & prayerful' };
  return { tone: 'devotional', toneLabel: 'Devotional & steady' };
}

function confidenceOf(signals: ThemeScore[], wordCount: number, partAgreementRatio = 0.5): number {
  if (signals.length === 0) return 0;
  const top = signals[0].score;
  const second = signals[1]?.score ?? 0;
  const total = signals.reduce((sum, s) => sum + s.score, 0) || 1;

  const dominance = top / (top + second * 0.85);
  const share = top / total;
  const strength = Math.min(1, top / Math.max(8, wordCount * 0.16 + 5));
  const raw = 0.36 * dominance + 0.24 * share + 0.28 * strength + 0.12 * partAgreementRatio;
  return Math.round(Math.max(0.38, Math.min(0.98, raw)) * 100);
}

const describeKeywords = (keywords: string[]) => {
  if (keywords.length === 0) return 'scriptural devotion and worship';
  if (keywords.length === 1) return keywords[0];
  if (keywords.length === 2) return `${keywords[0]} and ${keywords[1]}`;
  return `${keywords.slice(0, 3).join(', ')}`;
};

function keywordsOf(matched: Map<string, number>, text: string): string[] {
  const seenLemmas = new Set<string>();
  const distinct: string[] = [];

  const sorted = [...matched.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  for (const [word] of sorted) {
    if (word.length <= 2) continue;
    const l = lemma(word);
    if (seenLemmas.has(l)) continue;
    seenLemmas.add(l);
    distinct.push(word);
    if (distinct.length >= 6) return distinct;
  }

  const freq = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 4) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  for (const [word] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
    const l = lemma(word);
    if (seenLemmas.has(l)) continue;
    seenLemmas.add(l);
    distinct.push(word);
    if (distinct.length >= 6) break;
  }
  return distinct;
}

export function analyzeLyrics(parts: SongPart[], title = ''): Analysis {
  const fullText = [title, ...parts.map((p) => p.lyrics)].filter(Boolean).join('\n');
  const raw = analyzeSongInputs(parts, title);

  const hasSignal = raw.signals.length > 0 && raw.signals[0].score >= 2.0;
  const topTheme = hasSignal ? raw.signals[0].theme : 'Worship & Reflection';
  const secondaryTheme =
    hasSignal &&
    raw.signals.length > 1 &&
    raw.signals[1].score >= raw.signals[0].score * 0.58
      ? raw.signals[1].theme
      : null;

  const profile = THEMES.find((t) => t.key === topTheme);
  const keywords = keywordsOf(raw.matched, fullText);
  const { tone, toneLabel } = toneFrom(raw.valence, raw.energy);

  const partSignals: PartSignal[] = parts.map((part) => {
    const partRaw = analyzeSongInputs([part]);
    if (partRaw.signals.length === 0) {
      return { label: part.label, kind: part.kind, theme: topTheme, confidence: 35 };
    }
    return {
      label: part.label,
      kind: part.kind,
      theme: partRaw.signals[0].theme,
      confidence: confidenceOf(partRaw.signals, partRaw.wordCount, 0.7),
    };
  });

  const agreeingParts =
    partSignals.length > 0
      ? partSignals.filter((p) => p.theme === topTheme).length / partSignals.length
      : 0.7;

  const confidence = hasSignal
    ? confidenceOf(raw.signals, raw.wordCount, agreeingParts)
    : Math.max(28, Math.min(45, raw.wordCount > 0 ? 36 : 28));

  const suggestedTempo: Tempo = raw.energy >= 0.54 ? 'fast' : 'slow';

  const core = profile
    ? profile.core
    : 'This song invites the church into Christian worship and reflection — fixing hearts and minds on the Lord.';

  const secondaryNote = secondaryTheme
    ? ` Also carries strong themes of ${secondaryTheme}.`
    : '';

  const serviceGuidance = profile
    ? ` ${profile.serviceMoment}`
    : ' Suitable for devotional worship or congregational reflection.';

  const keywordNote =
    keywords.length > 0
      ? ` Key scriptural expressions: ${describeKeywords(keywords)}.`
      : '';

  const message = `${core}${secondaryNote}${serviceGuidance}${keywordNote}`;

  const evidence: string[] = [];
  if (raw.topLine) evidence.push(raw.topLine);
  evidence.push(
    hasSignal
      ? `Matched ${raw.signals.reduce((n, s) => n + s.score, 0).toFixed(0)} weighted worship signals across ${raw.wordCount} lyric words (chorus & title weighted).`
      : `Short lyric excerpt (${raw.wordCount} content words) — classified by overall worship posture.`,
  );
  evidence.push(`Suggested service tempo: ${suggestedTempo} (energy ${Math.round(raw.energy * 100)}/100).`);

  const about = profile ? profile.about : 'Christian worship and reflection before God';

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
export function effectiveAnalysis(song: {
  parts: SongPart[];
  analysis: Analysis | null;
  title?: string;
}) {
  return song.analysis ?? analyzeLyrics(song.parts, song.title || '');
}

export const THEME_LIST = [...THEMES.map((t) => t.key), 'Worship & Reflection'];

/** How strongly a song belongs to a given class/message (0-100). */
export function themeMatch(
  song: { parts: SongPart[]; analysis: Analysis | null; title: string },
  theme: string,
) {
  if (!theme) return 100;
  const analysis = effectiveAnalysis(song);
  if (analysis.theme.toLowerCase() === theme.toLowerCase()) {
    return Math.round(70 + analysis.confidence * 0.3);
  }
  const secondary = analysis.signals?.find(
    (s, idx) => idx > 0 && s.theme.toLowerCase() === theme.toLowerCase(),
  );
  if (secondary && analysis.signals[0]) {
    const ratio = secondary.score / analysis.signals[0].score;
    if (ratio >= 0.5) return Math.round(52 + ratio * 22);
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
