/**
 * Shared AES-256-GCM pack helpers (Node / Electron main).
 * Payload JSON: { npcs, companies, government, pages, ads?, shops? }
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function deriveKey(passphrase) {
  return crypto.createHash('sha256').update(String(passphrase), 'utf8').digest();
}

function encryptPack(obj, passphrase) {
  const key = deriveKey(passphrase);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const raw = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decryptPack(buffer, passphrase) {
  const key = deriveKey(passphrase);
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

module.exports = { encryptPack, decryptPack };
