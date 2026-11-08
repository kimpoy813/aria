#!/usr/bin/env node
/**
 * Accuracy benchmark for Aria's Church & Christian Worship Song Classifier:
 *   - Tests all 10 Christian worship classes across hymns, modern CCM,
 *     Tagalog worship songs, and Ilokano church hymns
 *   - Verifies morphological lemmatization (praising -> praise, glorified -> glorify, etc.)
 *   - Verifies Chorus + Title structural weighting over Verse narrative tension
 *   - Verifies contextual disambiguation (e.g. "Bless the Lord" = Praise vs
 *     "Count your blessings" = Thanksgiving; "How Deep the Father's Love" at the cross
 *     = Grace & Salvation vs "Good Good Father" = God's Love)
 *   - Verifies fast vs. slow worship tempo estimation
 */

import { createServer } from 'vite';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { analyzeLyrics, lemma } = await vite.ssrLoadModule('/src/lib/nlp.ts');

  console.log('\nAria · Christian worship classifier accuracy benchmark\n');

  console.log('1 · Morphological lemmatization');
  check('praising / praised / praises -> praise', lemma('praising') === 'praise' && lemma('praised') === 'praise' && lemma('praises') === 'praise');
  check('glorified / glorifying -> glorify', lemma('glorified') === 'glorify' && lemma('glorifying') === 'glorify');
  check('crucified -> crucify, forgiven -> forgive', lemma('crucified') === 'crucify' && lemma('forgiven') === 'forgive');
  check('preserves morning, king, anointing, holiness, jesus', lemma('morning') === 'morning' && lemma('king') === 'king' && lemma('anointing') === 'anointing' && lemma('holiness') === 'holiness' && lemma('jesus') === 'jesus');

  console.log('\n2 · Core 10 Christian worship classes (English hymns & modern worship)');
  const cases = [
    {
      name: '10,000 Reasons (Bless the Lord) -> Praise & Adoration',
      title: 'Bless the Lord',
      expected: 'Praise & Adoration',
      parts: [
        { kind: 'chorus', label: 'Chorus', lyrics: 'Bless the Lord O my soul, O my soul\nWorship His holy name\nSing like never before, O my soul\nI will worship Your holy name' },
        { kind: 'verse', label: 'Verse 1', lyrics: 'The sun comes up it is a new day dawning\nIt is time to sing Your song again' },
      ],
    },
    {
      name: 'Holy, Holy, Holy -> Praise & Adoration',
      title: 'Holy Holy Holy',
      expected: 'Praise & Adoration',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'Holy holy holy Lord God Almighty\nEarly in the morning our song shall rise to Thee' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'All the saints adore Thee casting down their golden crowns around the glassy sea\nMajesty and glory to the King of Kings' },
      ],
    },
    {
      name: 'Amazing Grace / At the Cross -> Grace & Salvation',
      title: 'Amazing Grace',
      expected: 'Grace & Salvation',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'Amazing grace how sweet the sound that saved a wretch like me\nI once was lost but now am found, was blind but now I see' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'Jesus paid it all, washed in the blood at the cross of Calvary, my sins are forgiven' },
      ],
    },
    {
      name: 'How Deep the Father’s Love (cross atonement disambiguation) -> Grace & Salvation',
      title: 'How Deep the Fathers Love',
      expected: 'Grace & Salvation',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'How deep the Father love for us, how vast beyond all measure\nThat He should give His only Son to make a wretch His treasure' },
        { kind: 'verse', label: 'Verse 2', lyrics: 'Behold the Man upon a cross, my sin upon His shoulders\nIt was my sin that held Him there, His dying breath has brought me life\nHis wounds have paid my ransom' },
      ],
    },
    {
      name: 'Good Good Father / Reckless Love -> God’s Love',
      title: 'Good Good Father',
      expected: 'God’s Love',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'Oh I have heard a thousand stories of what they think You are like\nBut I have heard the tender whisper of love in the dead of night' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'You are a good good Father, it is who You are\nAnd I am loved by You, Your steadfast love never fails' },
      ],
    },
    {
      name: 'Cornerstone / Firm Foundation -> Faith & Trust',
      title: 'Cornerstone',
      expected: 'Faith & Trust',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'My hope is built on nothing less than Jesus blood and righteousness\nWhen darkness seems to hide His face I rest on His unchanging grace\nIn every high and stormy gale my anchor holds within the veil' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'Christ alone, Cornerstone\nWeak made strong in the Saviors love\nThrough the storm He is Lord, Lord of all' },
      ],
    },
    {
      name: 'Way Maker -> Faith & Trust',
      title: 'Way Maker',
      expected: 'Faith & Trust',
      parts: [
        { kind: 'chorus', label: 'Chorus', lyrics: 'Way maker, miracle worker, promise keeper, light in the darkness\nMy God that is who You are\nEven when I dont see it Youre working, I will trust in You' },
      ],
    },
    {
      name: 'I Surrender All / Have Thine Own Way -> Surrender & Devotion',
      title: 'I Surrender All',
      expected: 'Surrender & Devotion',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'All to Jesus I surrender, all to Him I freely give\nHave Thine own way Lord, Thou art the potter I am the clay' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'I surrender all, I surrender all\nTake my life a living sacrifice upon Your altar Lord' },
      ],
    },
    {
      name: 'Holy Spirit / Fresh Wind -> Prayer & Presence',
      title: 'Holy Spirit',
      expected: 'Prayer & Presence',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'There is nothing worth more that could ever come close\nYour presence Lord' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'Holy Spirit You are welcome here\nCome flood this place and fill the atmosphere\nFall afresh on us as we pray in Your sanctuary' },
      ],
    },
    {
      name: 'When We All Get to Heaven -> Hope & Heaven',
      title: 'When We All Get to Heaven',
      expected: 'Hope & Heaven',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'Sing the wondrous love of Jesus, in the mansions bright and blessed He will prepare for us a place' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'When we all get to heaven what a day of rejoicing that will be\nNo more tears on the streets of gold for all eternity' },
      ],
    },
    {
      name: 'Give Thanks / Count Your Blessings -> Thanksgiving & Joy',
      title: 'Give Thanks',
      expected: 'Thanksgiving & Joy',
      parts: [
        { kind: 'chorus', label: 'Chorus', lyrics: 'Give thanks with a grateful heart, give thanks to the Holy One\nThank You Lord for all Your blessings, my cup overflows with gratitude and joy' },
      ],
    },
    {
      name: 'Break Every Chain / Battle Belongs -> Deliverance & Victory',
      title: 'Break Every Chain',
      expected: 'Deliverance & Victory',
      parts: [
        { kind: 'chorus', label: 'Chorus', lyrics: 'There is power in the name of Jesus to break every chain\nNo longer slaves to fear, the battle belongs to the Lord, we see a victory' },
      ],
    },
    {
      name: 'Here I Am Send Me / Follow Jesus -> Mission & Discipleship',
      title: 'Here I Am Send Me',
      expected: 'Mission & Discipleship',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'I have decided to follow Jesus, no turning back\nThe harvest is ready among the nations, let your light shine and proclaim the Gospel' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'Here I am Lord send me, we are the church united to serve and make disciples into all the world' },
      ],
    },
    {
      name: 'Goodness of God -> God’s Love',
      title: 'Goodness of God',
      expected: 'God’s Love',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'I love You Lord, oh Your mercy never fails me\nAll my days I have been held in Your hands' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'All my life You have been faithful\nAll my life You have been so so good\nWith every breath that I am able I will sing of the goodness of God' },
      ],
    },
    {
      name: 'It Is Well with My Soul -> Faith & Trust',
      title: 'It Is Well with My Soul',
      expected: 'Faith & Trust',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'When peace like a river attendeth my way, when sorrows like sea billows roll\nWhatever my lot Thou hast taught me to say, it is well with my soul' },
        { kind: 'chorus', label: 'Chorus', lyrics: 'It is well with my soul, through every storm my anchor holds and I trust in the Lord' },
      ],
    },
    {
      name: 'Sweet Hour of Prayer -> Prayer & Presence',
      title: 'Sweet Hour of Prayer',
      expected: 'Prayer & Presence',
      parts: [
        { kind: 'verse', label: 'Verse 1', lyrics: 'Sweet hour of prayer that calls me from a world of care\nIn seasons of distress and grief my soul has often found relief as we pray in Your presence' },
      ],
    },
    {
      name: 'Dakilang Katapatan (Tagalog faithfulness & love) -> God’s Love',
      title: 'Dakilang Katapatan',
      expected: 'God’s Love',
      parts: [
        { kind: 'chorus', label: 'Koro', lyrics: 'Dakilang katapatan Mo sa akin Ama, tapat kailanpaman ang Iyong pag-ibig at habag' },
      ],
    },
  ];

  for (const c of cases) {
    const res = analyzeLyrics(
      c.parts.map((p, idx) => ({ id: `p${idx}`, ...p })),
      c.title,
    );
    check(
      c.name,
      res.theme === c.expected && res.confidence >= 60,
      `got "${res.theme}" (${res.confidence}%) — top signals: ${res.signals.map((s) => `${s.theme}:${s.score}`).join(', ')}`,
    );
  }

  console.log('\n3 · Tagalog & Ilokano Christian worship songs');
  const tagalogPraise = analyzeLyrics(
    [
      {
        id: 'p1',
        kind: 'chorus',
        label: 'Koro',
        lyrics: 'Walang hanggang sasambahin, purihin ang Panginoon, banal at dakila ang Iyong luwalhati',
      },
    ],
    'Walang Hanggang Sasambahin',
  );
  check(
    'Tagalog praise chorus classifies as Praise & Adoration',
    tagalogPraise.theme === 'Praise & Adoration',
    `got ${tagalogPraise.theme}`,
  );

  const ilokanoThanks = analyzeLyrics(
    [
      {
        id: 'p1',
        kind: 'chorus',
        label: 'Koro',
        lyrics: 'Agyamanak Apo iti amin a bendision ken panagyaman, napno ti pusok iti rag-o',
      },
    ],
    'Agyamanak Apo',
  );
  check(
    'Ilokano thanksgiving hymn classifies as Thanksgiving & Joy',
    ilokanoThanks.theme === 'Thanksgiving & Joy',
    `got ${ilokanoThanks.theme}`,
  );

  console.log('\n4 · Chorus structural priority & tempo estimation');
  const chorusPriority = analyzeLyrics(
    [
      {
        id: 'v1',
        kind: 'verse',
        label: 'Verse 1',
        lyrics: 'Walking through the valley and the storm, afraid in the shadow',
      },
      {
        id: 'c1',
        kind: 'chorus',
        label: 'Chorus',
        lyrics: 'I surrender all to Jesus, take my life upon Your altar, Thou art the potter and I am the clay',
      },
    ],
    'I Surrender All',
  );
  check(
    'Chorus + Title outweigh Verse narrative setup',
    chorusPriority.theme === 'Surrender & Devotion' && chorusPriority.suggestedTempo === 'slow',
    `got ${chorusPriority.theme} (${chorusPriority.suggestedTempo})`,
  );

  const upbeatPraise = analyzeLyrics([
    {
      id: 'c1',
      kind: 'chorus',
      label: 'Chorus',
      lyrics: 'Shout unto God with a voice of triumph! Dance and clap your hands, celebrate and rejoice in victory! Hallelujah!',
    },
  ]);
  check(
    'Upbeat praise song predicts suggestedTempo = fast',
    upbeatPraise.suggestedTempo === 'fast',
    `got ${upbeatPraise.suggestedTempo} (energy ${upbeatPraise.energy})`,
  );
} finally {
  await vite.close();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
