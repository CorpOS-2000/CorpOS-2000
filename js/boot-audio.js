/**
 * Resolves boot sound files from /assets next to the app (Electron loadFile).
 * Boot chain: PowerON (drive confirm) → BiosInitialize (first POST line) → BiosExecute stutter
 * (after mouse/keyboard through technical batch) → one full BiosExecute → quiet tail (drivers…) →
 * Phased POST: BiosExecute stutter after mouse through FrontPage, again while loading drivers
 * (until “Starting CorpOS…”), then audio is cut; final blank line is preceded by a deeper POST beep.
 * Logo: corpOSbootingsound. Clicks: Mouse Click Sound CorpOS / MouseClickSoundCorpOS.
 * Legacy POST: PConsound (optional; unused when Bios* sounds are present).
 * Use .mp3, .wav, or .ogg
 */

const PC_ON_BASES = ['PConsound'];
const POWER_ON_BASES = ['PowerON'];
const BIOS_INIT_BASES = ['BiosInitialize'];
const BIOS_EXEC_BASES = ['BiosExecute'];
const CORP_BOOT_BASES = ['corpOSbootingsound'];
const MOUSE_CLICK_BASES = ['Mouse Click Sound CorpOS', 'MouseClickSoundCorpOS'];
const EXT = ['.mp3', '.wav', '.ogg'];

function candidateUrls(baseNames) {
  const out = [];
  for (const base of baseNames) {
    for (const ext of EXT) {
      out.push(new URL(`../assets/${base}${ext}`, import.meta.url).href);
    }
  }
  return out;
}

/**
 * Try candidates until one loads (loadedmetadata).
 * @param {string[]} hrefs
 * @returns {Promise<HTMLAudioElement | null>}
 */
export function loadFirstPlayableAudio(hrefs) {
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= hrefs.length) {
        resolve(null);
        return;
      }
      const src = hrefs[idx++];
      const a = new Audio();
      a.preload = 'auto';
      const ok = () => {
        a.removeEventListener('loadedmetadata', ok);
        a.removeEventListener('error', bad);
        resolve(a);
      };
      const bad = () => {
        a.removeEventListener('loadedmetadata', ok);
        a.removeEventListener('error', bad);
        tryNext();
      };
      a.addEventListener('loadedmetadata', ok, { once: true });
      a.addEventListener('error', bad, { once: true });
      a.src = src;
      a.load();
    };
    tryNext();
  });
}

export function getPcOnCandidates() {
  return candidateUrls(PC_ON_BASES);
}

export function getPowerOnCandidates() {
  return candidateUrls(POWER_ON_BASES);
}

export function getBiosInitializeCandidates() {
  return candidateUrls(BIOS_INIT_BASES);
}

export function getBiosExecuteCandidates() {
  return candidateUrls(BIOS_EXEC_BASES);
}

export function getCorpBootCandidates() {
  return candidateUrls(CORP_BOOT_BASES);
}

export function getMouseClickCandidates() {
  return candidateUrls(MOUSE_CLICK_BASES);
}

/**
 * @param {HTMLAudioElement | null} a
 * @returns {number} duration in ms, or 0 if unknown
 */
export function safeDurationMs(a) {
  if (!a) return 0;
  const d = a.duration;
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round(d * 1000);
}
