/**
 * One-time Node script: generates data/maps/hargrove/addresses.json
 * from districts.json + streets.json.
 *
 * Run: node scripts/generate_addresses.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, '..', 'data', 'maps', 'hargrove');

const districts = JSON.parse(readFileSync(resolve(DATA, 'districts.json'), 'utf8'));
const streets = JSON.parse(readFileSync(resolve(DATA, 'streets.json'), 'utf8'));

const ZIP_MAP = {
  downtown: '94521', midtown: '94521',
  northside: '94522', valley_heights: '94522',
  eastside: '94523',
  westside: '94524', tech_corridor: '94524',
  university_dist: '94525',
  southside: '94526',
  riverside: '94527',
  harbor_district: '94528'
};

const ZONE_TYPE = {
  commercial: 'commercial',
  commercial_mixed: 'commercial',
  commercial_tech: 'commercial',
  commercial_historic: 'commercial',
  industrial: 'industrial',
  industrial_port: 'industrial',
  residential_upper: 'residential',
  residential_middle: 'residential',
  residential_low: 'residential',
  mixed: 'mixed',
  mixed_edu: 'mixed'
};

function districtAt(x, y) {
  for (const d of districts) {
    const b = d.bounds;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return d;
  }
  let best = null, bestDist = Infinity;
  for (const d of districts) {
    const cx = d.bounds.x + d.bounds.w / 2;
    const cy = d.bounds.y + d.bounds.h / 2;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

function walkPolyline(points, spacing) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 1) continue;
    const steps = Math.max(1, Math.floor(segLen / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [x, y] = lerp(a, b, t);
      out.push([Math.round(x), Math.round(y)]);
    }
  }
  const last = points[points.length - 1];
  out.push([Math.round(last[0]), Math.round(last[1])]);
  return out;
}

let seq = 0;
const addresses = [];

function addAddr(number, street, unit, x, y, districtObj) {
  seq++;
  const id = `addr_${String(seq).padStart(5, '0')}`;
  const zip = ZIP_MAP[districtObj.id] || '94521';
  const type = ZONE_TYPE[districtObj.zone] || 'mixed';
  const unitStr = unit ? `, ${unit}` : '';
  const label = `${number} ${street}${unitStr}, Hargrove, CA ${zip}`;
  addresses.push({
    id, number, street, unit: unit || null,
    district: districtObj.id, city: 'Hargrove', state: 'CA', zip,
    type, label, coords: { x, y }
  });
}

const RESIDENTIAL_SPACING = 18;
const COMMERCIAL_SPACING = 22;
const INDUSTRIAL_SPACING = 30;

for (const st of streets) {
  const pts = st.points;
  if (!pts || pts.length < 2) continue;
  const spacing = st.type === 'major' ? COMMERCIAL_SPACING : RESIDENTIAL_SPACING;
  const positions = walkPolyline(pts, spacing);

  let baseNumber = 100;
  const increment = st.type === 'major' ? 4 : 2;

  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[i];
    const dist = districtAt(x, y);
    if (!dist) continue;
    const num = baseNumber + i * increment;
    const isCommercial = dist.zone.startsWith('commercial') || dist.zone === 'industrial' || dist.zone === 'industrial_port';
    const isHighDensity = dist.density === 'high';

    // Main address (odd side)
    addAddr(num * 2 - 1, st.name, null, x, y, dist);
    // Even side
    addAddr(num * 2, st.name, null, x + 3, y + 2, dist);

    // Units for commercial addresses
    if (isCommercial && Math.random() < 0.4) {
      const suiteNum = 100 + Math.floor(Math.random() * 9) * 100;
      addAddr(num * 2 - 1, st.name, `Suite ${suiteNum}`, x, y, dist);
    }

    // Apartment units in high-density residential
    if (!isCommercial && isHighDensity && Math.random() < 0.15) {
      const aptCount = 2 + Math.floor(Math.random() * 4);
      for (let a = 0; a < aptCount; a++) {
        const floor = 1 + Math.floor(a / 2);
        const letter = String.fromCharCode(65 + (a % 4));
        addAddr(num * 2, st.name, `Apt ${floor}${letter}`, x + 3, y + 2, dist);
      }
    }
  }
}

// Procedural residential fill for districts that need more addresses
const TARGET = 4500;
const residentialDistricts = districts.filter(d =>
  d.zone.startsWith('residential') || d.zone === 'mixed' || d.zone === 'mixed_edu'
);

const FILLER_STREETS = [
  'Maple Lane', 'Birch Court', 'Willow Way', 'Spruce Street', 'Aspen Drive',
  'Linden Avenue', 'Cherry Lane', 'Poplar Street', 'Hickory Road', 'Magnolia Court',
  'Sycamore Way', 'Laurel Drive', 'Cypress Lane', 'Juniper Street', 'Alder Road',
  'Hazel Court', 'Hemlock Way', 'Dogwood Lane', 'Chestnut Avenue', 'Redwood Drive'
];

let fillerIdx = 0;
while (addresses.length < TARGET) {
  const d = residentialDistricts[fillerIdx % residentialDistricts.length];
  const streetName = FILLER_STREETS[fillerIdx % FILLER_STREETS.length];
  const b = d.bounds;
  const x = b.x + 10 + Math.floor(Math.random() * (b.w - 20));
  const y = b.y + 10 + Math.floor(Math.random() * (b.h - 20));
  const num = 100 + Math.floor(Math.random() * 9800);
  addAddr(num, streetName, null, x, y, d);
  fillerIdx++;
}

// Stats
const byDistrict = {};
const byType = {};
for (const a of addresses) {
  byDistrict[a.district] = (byDistrict[a.district] || 0) + 1;
  byType[a.type] = (byType[a.type] || 0) + 1;
}

console.log(`\nGenerated ${addresses.length} addresses\n`);
console.log('By district:');
for (const [k, v] of Object.entries(byDistrict).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log('\nBy type:');
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}

const outPath = resolve(DATA, 'addresses.json');
writeFileSync(outPath, JSON.stringify(addresses, null, 2));
console.log(`\nWrote ${outPath}`);
