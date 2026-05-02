/**
 * Launch Electron with CORPOS_NO_GPU=1 (mitigates common Windows GPU-related renderer crashes).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
process.env.CORPOS_NO_GPU = '1';
const electronPath = require('electron');
const result = spawnSync(electronPath, ['.'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env
});
process.exit(result.status === null ? 1 : result.status);
