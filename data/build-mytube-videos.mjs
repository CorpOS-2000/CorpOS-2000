/**
 * Generates data/mytube-videos.json — 1256 parody catalog entries.
 * Run: node data/build-mytube-videos.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const CHANNEL_FIRST = [
  'xX',
  'TheReal',
  'Official',
  'Y2K',
  'Corp',
  'Mega',
  'Turbo',
  'Silent',
  'Federal',
  'DialUp',
  'Rapid',
  'Pixel',
  'Glitch',
  'Mint',
  'Chaos'
];
const CHANNEL_LAST = [
  'Gamer2000',
  'Fan99',
  'TubeLord',
  'Snacks',
  'Compliance',
  'Hax0r',
  'Mom',
  'Dad',
  'Intern',
  'CEO',
  'Cat',
  'Dog',
  'VCR',
  'Modem',
  'Ledger'
];

const TITLES = [
  'Unboxing',
  'RANT:',
  'Tutorial:',
  'Y2K survival',
  'CorpOS speedrun',
  'My boss saw this',
  'DO NOT OPEN',
  'RapidGate explained',
  'Buttertoes taste test',
  'WorldNet deep dive',
  'JeeMail hacks',
  'AXIS for beginners',
  'Meridian savings flex',
  'Dark web tour (parody)',
  'StaffingPlus horror stories',
  'SSA queue ASMR',
  'devtools trauma',
  'Wahoo vs',
  'Mandate 2000-CR7 song',
  'Dot-com bubble mixtape'
];

const TAILS = [
  '(gone wrong)',
  '— part 7',
  'in 3 minutes',
  'feat. my cousin',
  'remastered 240p',
  'sub for more',
  'not clickbait',
  'federal disclaimer',
  'viewer discretion',
  'live from basement',
  'VHS rip',
  'RealPlayer test'
];

const CATS = ['Comedy', 'News', 'Music', 'Howto', 'Gaming', 'People', 'Film', 'Autos', 'Pets', 'Corp'];
const TYPES = ['vlog', 'tutorial', 'parody_ad', 'corpos_rant', 'music_rip', 'fake_trailer', 'news_spoof'];
const DURS = ['0:17', '1:03', '2:22', '3:41', '4:20', '7:07', '9:59', '12:00', '15:33', '45:00'];

const videos = [];
for (let i = 0; i < 1256; i++) {
  const rng = mulberry32((i + 1) * 2654435761);
  const ch = `${pick(rng, CHANNEL_FIRST)}${pick(rng, CHANNEL_LAST)}${i % 17 === 0 ? '_TV' : ''}`;
  const title = `${pick(rng, TITLES)} ${pick(rng, TAILS)} #${i + 1}`;
  const desc = `Uploaded during the dot-com rush. ${pick(rng, CATS)} vibes. ${pick(
    rng,
    TAILS
  )}. Parody / simulation — not a real broadcast.`;
  videos.push({
    id: `mt-${i}`,
    title,
    description: desc,
    channel: ch,
    category: pick(rng, CATS),
    postType: pick(rng, TYPES),
    duration: pick(rng, DURS),
    fake: true,
    views: 100 + Math.floor(rng() * 999900)
  });
}

const out = { version: 1, videos };
writeFileSync(join(__dirname, 'mytube-videos.json'), JSON.stringify(out), 'utf8');
console.log('Wrote mytube-videos.json', videos.length, 'entries');
