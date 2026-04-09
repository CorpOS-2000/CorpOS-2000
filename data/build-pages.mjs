import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { worldnetPages } from '../js/worldnet-pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.writeFileSync(
  path.join(__dirname, 'pages.json'),
  JSON.stringify(worldnetPages, null, 0),
  'utf8'
);
console.log('Wrote pages.json');
