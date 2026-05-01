/**
 * Ambient Music System — CorpOS 2000
 *
 * Plays background music based on in-game time-of-day when the player
 * has NOT started the Media Player (or it is paused/idle).
 *
 * Parts of the Day (in-game UTC hours):
 *   Morning       05–12   → folder "Morning Music"
 *   Afternoon     12–17   → folder "Afternoon Music"
 *   Evening / Night 17–04 → folder "Night Music"
 *   Standby               → folder "standby" (played between transitions)
 *
 * The system:
 *   1. Watches the sim clock via 'hour' EventSystem events.
 *   2. When no Media Player track is actively playing, picks a shuffled
 *      track from the folder that matches the current hour.
 *   3. Between part transitions, plays one standby track before switching.
 *   4. Tracks within a part are shuffled without immediate repeats.
 *   5. Volume mirrors the MediaPlayer volume setting.
 */

import { on } from './events.js';
import { getGameEpochMs, getState } from './gameState.js';
import { MediaPlayer } from '../engine/MediaPlayer.js';

// ── Folder → hour ranges ────────────────────────────────────────────────
const PARTS = [
  { name: 'Morning Music',   startH: 5,  endH: 12 },
  { name: 'Afternoon Music', startH: 12, endH: 17 },
  { name: 'Night Music',     startH: 17, endH: 29 }  // 17→(24+5), wraps at midnight
];
const STANDBY_FOLDER = 'standby';

/** @type {HTMLAudioElement | null} */
let _audio = null;
/** @type {string[]} Full relative paths (e.g. "Morning Music/Soft and Mellow.mp3") */
let _allFiles = [];
/** Currently active part name (null = nothing decided yet) */
let _activePart = null;
/** Shuffled playlist for active part */
let _playlist = [];
let _playlistIdx = 0;
/** True while playing a standby track before switching to a new part */
let _playingStandby = false;
/** Part we are transitioning TO (after standby finishes) */
let _nextPart = null;
/** Whether init has run */
let _ready = false;

/** While sim speed > 1× — ambient is paused and evaluate() is suppressed */
let _ambientHeldForFastSim = false;
/** Ambient was actively playing when fast-sim hold began */
let _ambientWasAudibleBeforeFastSim = false;

// ── Helpers ──────────────────────────────────────────────────────────────

function currentGameHour() {
  const simMs = getState().sim?.elapsedMs ?? 0;
  const epochMs = getGameEpochMs();
  const d = new Date(epochMs + simMs);
  return d.getUTCHours();
}

function partForHour(h) {
  // Wrap night into 24+ space: hours 0–4 become 24–28
  const wrapped = h < 5 ? h + 24 : h;
  for (const part of PARTS) {
    if (wrapped >= part.startH && wrapped < part.endH) return part.name;
  }
  return PARTS[2].name; // default night
}

/** Fisher-Yates shuffle */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function filesInFolder(folder) {
  return _allFiles.filter((f) => {
    const slash = f.indexOf('/');
    if (slash < 0) return false;
    return f.slice(0, slash).toLowerCase() === folder.toLowerCase();
  });
}

function baseUrl() {
  try {
    return new URL('assets/music/', window.location.href).href;
  } catch {
    return 'assets/music/';
  }
}

function urlFor(relPath) {
  // relPath is "Folder Name/Track.mp3" — encode each segment separately
  const parts = relPath.split('/');
  return baseUrl() + parts.map((p) => encodeURIComponent(p)).join('/');
}

// ── Playback ──────────────────────────────────────────────────────────────

/** Returns true only when the player is fully logged into the desktop. */
function isLoggedIn() {
  if (typeof document === 'undefined') return false;
  const desktop = document.getElementById('desktop');
  return !!desktop && desktop.classList.contains('show');
}

function mediaPlayerIsActive() {
  if (!MediaPlayer.audio) return false;
  if (MediaPlayer.isOverride) return true;
  return !MediaPlayer.audio.paused && MediaPlayer.currentTrack != null;
}

function currentVolume() {
  return typeof MediaPlayer.volume === 'number' ? Math.max(0, Math.min(1, MediaPlayer.volume)) : 0.6;
}

function ensureAudio() {
  if (_audio) return _audio;
  _audio = new Audio();
  _audio.preload = 'auto';
  _audio.volume = currentVolume();
  _audio.addEventListener('ended', _onTrackEnded);
  return _audio;
}

function playFile(relPath) {
  const a = ensureAudio();
  a.volume = currentVolume();
  a.src = urlFor(relPath);
  a.currentTime = 0;
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch((e) => {
      if (e?.name !== 'AbortError') console.warn('[AmbientMusic] play error:', e?.message ?? e);
    });
  }
}

function buildPlaylist(folder) {
  const tracks = filesInFolder(folder);
  if (!tracks.length) return [];
  return shuffle(tracks);
}

function playNextInPlaylist() {
  if (!_playlist.length) {
    _playlist = buildPlaylist(_activePart ?? partForHour(currentGameHour()));
    _playlistIdx = 0;
  }
  if (!_playlist.length) return; // folder empty

  // Advance without repeat of last played
  if (_playlistIdx >= _playlist.length) {
    const last = _playlist[_playlist.length - 1];
    _playlist = buildPlaylist(_activePart ?? partForHour(currentGameHour()));
    _playlistIdx = 0;
    // Avoid immediate repeat of the last track when playlist has >1 track
    if (_playlist.length > 1 && _playlist[0] === last) {
      _playlist = [..._playlist.slice(1), _playlist[0]];
    }
  }

  const track = _playlist[_playlistIdx++];
  playFile(track);
}

function _onTrackEnded() {
  if (mediaPlayerIsActive()) return;

  if (_playingStandby) {
    // Standby done → switch to next part
    _playingStandby = false;
    if (_nextPart) {
      _activePart = _nextPart;
      _nextPart = null;
      _playlist = buildPlaylist(_activePart);
      _playlistIdx = 0;
    }
  }

  playNextInPlaylist();
}

/** Folder/track path from ambient element src whether paused or playing (for daypart checks). */
function _ambientRelPathFromSrc() {
  if (!_audio?.src) return null;
  try {
    const url = new URL(_audio.src);
    const segments = url.pathname.split('/').filter(Boolean);
    const last2 = segments.slice(-2);
    if (last2.length < 2) return null;
    return last2.map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

function _ambientFolderFromPath(rel) {
  if (!rel || typeof rel !== 'string') return null;
  const i = rel.indexOf('/');
  if (i <= 0) return null;
  return rel.slice(0, i);
}

function _ambientTrackMatchesDaypart() {
  const path = _ambientRelPathFromSrc();
  if (!path) return true;
  const folder = _ambientFolderFromPath(path);
  const want = partForHour(currentGameHour());
  return !!(folder && folder.toLowerCase() === want.toLowerCase());
}

function _hardSwitchAmbientToCurrentDaypart() {
  if (mediaPlayerIsActive()) return;
  const desiredPart = partForHour(currentGameHour());
  _playingStandby = false;
  _nextPart = null;
  _activePart = desiredPart;
  _playlist = buildPlaylist(_activePart);
  _playlistIdx = 0;
  playNextInPlaylist();
}

function _resumeAmbientAfterReturnTo1x() {
  if (!_ready || !isLoggedIn() || mediaPlayerIsActive()) return;
  if (!_ambientTrackMatchesDaypart()) {
    _hardSwitchAmbientToCurrentDaypart();
    return;
  }
  if (_ambientWasAudibleBeforeFastSim) {
    const a = ensureAudio();
    a.volume = currentVolume();
    if (a.src) {
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      evaluate();
    }
  } else {
    evaluate();
  }
}

function _onSimSpeedChangedForAmbient(speed) {
  const sp = Number(speed);
  const fast = sp > 1;
  if (fast) {
    if (!_ambientHeldForFastSim) {
      _ambientHeldForFastSim = true;
      const a = _audio;
      _ambientWasAudibleBeforeFastSim = !!(a && !a.paused && a.src);
      if (a) a.pause();
    }
    return;
  }
  if (sp === 1 && _ambientHeldForFastSim) {
    _ambientHeldForFastSim = false;
    _resumeAmbientAfterReturnTo1x();
  }
}

/** Called when the hour changes or when ambient music should start. */
function evaluate() {
  if (_ambientHeldForFastSim) return;
  if (!_ready) return;
  if (!isLoggedIn()) {
    // Not on the desktop — ensure ambient audio is stopped
    if (_audio && !_audio.paused) {
      _audio.pause();
      _audio.src = '';
    }
    return;
  }
  if (mediaPlayerIsActive()) return; // Media Player is using audio — stay silent

  const a = ensureAudio();
  a.volume = currentVolume();

  const desiredPart = partForHour(currentGameHour());

  // Already playing the right part — let it continue
  if (!a.paused && !_playingStandby && _activePart === desiredPart) return;

  // If nothing is playing yet, start immediately
  if (a.paused || a.ended || a.src === '' || a.src === window.location.href) {
    _activePart = desiredPart;
    _playlist = buildPlaylist(_activePart);
    _playlistIdx = 0;
    playNextInPlaylist();
    return;
  }

  // Part changed while something is playing → schedule standby transition
  if (_activePart !== desiredPart && !_playingStandby) {
    const standbyTracks = filesInFolder(STANDBY_FOLDER);
    if (standbyTracks.length) {
      _playingStandby = true;
      _nextPart = desiredPart;
      const pick = standbyTracks[Math.floor(Math.random() * standbyTracks.length)];
      // Let current track finish then play standby via ended event... OR interrupt now:
      // We interrupt at transition boundary (hour event = natural boundary)
      playFile(pick);
    } else {
      // No standby tracks — switch directly
      _activePart = desiredPart;
      _playlist = buildPlaylist(_activePart);
      _playlistIdx = 0;
      playNextInPlaylist();
    }
  }
}

// ── MediaPlayer bridge: pause ambient when player starts ─────────────────

function onMediaPlayerChange() {
  if (mediaPlayerIsActive()) {
    // Media player started → fade out ambient
    if (_audio && !_audio.paused) {
      _audio.pause();
    }
  } else {
    // Media player stopped/paused → resume ambient after brief delay
    setTimeout(() => {
      if (!mediaPlayerIsActive()) evaluate();
    }, 1500);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Call once after MediaPlayer and IPC file list are available.
 * @param {string[]} allMusicFiles - output of `list-assets-music-files` IPC (includes subpaths)
 */
export function initAmbientMusic(allMusicFiles) {
  _allFiles = Array.isArray(allMusicFiles) ? allMusicFiles : [];
  _ready = true;

  // Listen to game hour ticks
  on('hour', () => evaluate());

  on('simSpeedChanged', ({ speed }) => _onSimSpeedChangedForAmbient(speed));

  // Sync volume when MediaPlayer volume changes; also handle player stopping
  MediaPlayer.subscribe(() => {
    if (_audio) _audio.volume = currentVolume();
    onMediaPlayerChange();
  });

  // Watch the #desktop element's class list so we start/stop music exactly
  // when the player logs in or is logged out / rebooted.
  if (typeof document !== 'undefined') {
    const watchDesktop = () => {
      const desktop = document.getElementById('desktop');
      if (!desktop) return;
      const obs = new MutationObserver(() => evaluate());
      obs.observe(desktop, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchDesktop, { once: true });
    } else {
      watchDesktop();
    }
  }

  // Start immediately (will no-op if not yet logged in)
  evaluate();
}

/** Forcibly stop ambient music (e.g. entering a full-screen cutscene). */
export function stopAmbientMusic() {
  if (_audio) {
    _audio.pause();
    _audio.src = '';
  }
}

/** Resume ambient music after an external pause. */
export function resumeAmbientMusic() {
  if (_ambientHeldForFastSim) return;
  evaluate();
}

/** Returns the currently playing ambient track filename, or null. */
export function getCurrentAmbientTrack() {
  if (!_audio || _audio.paused) return null;
  const src = _audio.src;
  if (!src) return null;
  // Decode the last two path segments (folder/file)
  try {
    const url = new URL(src);
    const segments = url.pathname.split('/').filter(Boolean);
    const last2 = segments.slice(-2);
    return last2.map(decodeURIComponent).join('/');
  } catch {
    return src;
  }
}
