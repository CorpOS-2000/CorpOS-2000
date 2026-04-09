/**
 * Generates data/parody-brands.json — 200 parody brands, each with 1–50 offerings (weighted ~3–25).
 * Run: node data/build-parody-brands.mjs
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
  if (!arr?.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

const PREFIX = [
  'Mega',
  'Ultra',
  'Nano',
  'Turbo',
  'Cyber',
  'Meta',
  'Omni',
  'Hyper',
  'Proto',
  'Neo',
  'Micro',
  'Macro',
  'Sudo',
  'Euro',
  'Pacific',
  'Frontier',
  'Vintage',
  'Atomic',
  'Silver',
  'Golden'
];

const STEM = [
  'Munch',
  'Byte',
  'Nibble',
  'Crisp',
  'Fizz',
  'Glide',
  'Spark',
  'Nest',
  'Vault',
  'Cart',
  'Lane',
  'Works',
  'Wave',
  'Rush',
  'Haze',
  'Fuel',
  'Mint',
  'Chill',
  'Buzz',
  'Bolt',
  'Axis',
  'Orbit',
  'Pulse',
  'Grain',
  'Vapor',
  'Slate',
  'Crest',
  'Drift',
  'Flux',
  'Glimmer'
];

const SUFFIX = [
  'Co',
  'Labs',
  'Industries',
  'Systems',
  'Brands',
  'Group',
  'Holdings',
  'Unlimited',
  'Digital',
  'Express',
  'Ware',
  'Mart',
  'Depot',
  'Outlet',
  'House',
  'Brothers',
  '& Sons',
  'Partners',
  'International',
  'Domestic'
];

const KINDS = [
  'Snack',
  'Beverage',
  'Software',
  'Gadget',
  'Media',
  'Service',
  'Subscription',
  'Appliance',
  'Apparel',
  'Toy',
  'Book',
  'Course',
  'Consulting',
  'Insurance',
  'Delivery',
  'Stream',
  'Download',
  'License'
];

const PRODUCT_LEAD = [
  'Deluxe',
  'Family',
  'Lite',
  'Pro',
  'Xtreme',
  'Classic',
  'Artisan',
  'Federal',
  'Certified',
  'Bulk',
  'Travel',
  'Office',
  'Home',
  'Student',
  'Enterprise'
];

const PRODUCT_TAIL = [
  'Crunchers',
  'Os',
  'Chunks',
  'Puffs',
  'Wheels',
  'Strips',
  'Bites',
  'Logs',
  'Bars',
  'Mix',
  'Pack',
  'Bucket',
  'Suite',
  'Kit',
  'Pass',
  'Plus',
  '2000',
  'CR-7 Edition',
  'RapidGate Memorial',
  'CorpOS Ready'
];

const brands = [];
for (let i = 0; i < 200; i++) {
  const rng = mulberry32((i + 1) * 0x9e3779b9);
  const name = `${pick(rng, PREFIX)}${pick(rng, STEM)} ${pick(rng, SUFFIX)}`.replace(/\s+/g, ' ').trim();
  const nOffer = Math.min(50, 1 + Math.floor(rng() * 50));
  const offerings = [];
  for (let j = 0; j < nOffer; j++) {
    const r2 = mulberry32((i + 1) * 9973 + j * 7919);
    offerings.push({
      id: `sku-${i}-${j}`,
      name: `${pick(r2, PRODUCT_LEAD)} ${pick(r2, STEM)} ${pick(r2, PRODUCT_TAIL)}`.replace(/\s+/g, ' ').trim(),
      kind: pick(r2, KINDS)
    });
  }
  brands.push({
    id: `brand-${i}`,
    name,
    tagline: `The ${pick(rng, KINDS).toLowerCase()} brand you deserve in ${1999 + (i % 2)}.`,
    offerings
  });
}

const out = { version: 1, generated: 'parody', brands };
const dest = join(__dirname, 'parody-brands.json');
writeFileSync(dest, JSON.stringify(out), 'utf8');
console.log('Wrote', dest, brands.length, 'brands,', brands.reduce((s, b) => s + b.offerings.length, 0), 'SKUs');
