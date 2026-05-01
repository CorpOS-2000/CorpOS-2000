/**
 * CorpOS 2000 Media Player engine — playback, persistence hooks, System Override.
 * UI lives in js/media-player.js. Register on window.GameSystems.mediaPlayer after init.
 */

function musicBaseUrl() {
  try {
    return new URL('assets/music/', window.location.href).href;
  } catch {
    return 'assets/music/';
  }
}

function parseDurationToSec(label) {
  if (!label || typeof label !== 'string') return 0;
  const p = label.split(':').map((x) => parseInt(x, 10));
  if (p.length === 2 && !Number.isNaN(p[0]) && !Number.isNaN(p[1])) return p[0] * 60 + p[1];
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return 0;
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export const MediaPlayer = {
  audio: null,
  currentTrack: null,
  tracks: [],
  _baseRegistry: [],
  /** @type {string[]} filenames from disk (Electron) merged into library */
  _discoveredFilenames: [],
  favorites: new Set(),
  shuffle: false,
  repeat: 'off',
  volume: 0.2,
  isOverride: false,
  overrideTrack: null,
  overrideAudio: null,
  /** @type {{ trackId: string | null, positionSec: number, paused: boolean, volume: number } | null} */
  preOverrideSnapshot: null,
  _prewarmAudios: [],
  _shufflePlayed: new Set(),
  _listeners: new Set(),
  _persistTimer: null,
  getState: null,
  patchState: null,
  getSessionState: null,
  patchSession: null,

  /**
   * Avoid unhandled promise rejection when pause() interrupts play() (Electron shows global dialog).
   * @param {HTMLMediaElement | null | undefined} el
   */
  _safePlay(el) {
    if (!el) return;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (err && err.name !== 'AbortError') console.warn('[MediaPlayer] play:', err);
      });
    }
  },

  /** Game time > 1× — library playback stays paused (ambient handled separately). */
  _simSpeedBlocksPlayback() {
    const sp = Number(this.getState?.()?.sim?.speed);
    return Number.isFinite(sp) && sp > 1;
  },

  _notify() {
    for (const fn of this._listeners) {
      try {
        fn(this);
      } catch (e) {
        console.error(e);
      }
    }
  },

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  init(deps) {
    this.getState = deps.getState;
    this.patchState = deps.patchState;
    this.getSessionState = deps.getSessionState;
    this.patchSession = deps.patchSession;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.overrideAudio = new Audio();
    this.overrideAudio.preload = 'auto';

    const st = this.getState().mediaPlayer;
    this.volume = typeof st.volume === 'number' ? st.volume : 0.2;
    this.shuffle = !!st.shuffle;
    this.repeat = st.repeat === 'all' || st.repeat === 'one' ? st.repeat : 'off';
    this.favorites = new Set(Array.isArray(st.favorites) ? st.favorites : []);

    this._wireAudioEvents();
    this._wireOverrideAudioEvents();
    this.applyVolume();

    return this.loadRegistry().then(() => {
      this.syncFavoritesFromState();
      this._restoreSessionTrackNoAutoplay();
      this._notify();
    });
  },

  syncFavoritesFromState() {
    const st = this.getState().mediaPlayer;
    this.favorites = new Set(Array.isArray(st.favorites) ? st.favorites.map(String) : []);
    this.shuffle = !!st.shuffle;
    this.repeat = st.repeat === 'all' || st.repeat === 'one' ? st.repeat : 'off';
    if (typeof st.volume === 'number') this.volume = st.volume;
    this.applyVolume();
  },

  _restoreSessionTrackNoAutoplay() {
    const st = this.getState().mediaPlayer;
    const id = st.currentTrackId;
    if (!id) return;
    const t = this.getTrackById(id);
    if (!t || t.isOverride || !this.isTrackUnlocked(t)) return;
    this.currentTrack = t;
    const url = this._urlForTrack(t);
    if (!url) return;
    this.audio.src = url;
    this.audio.volume = this.volume;
    const pos = Math.max(0, Number(st.positionSec) || 0);
    const onMeta = () => {
      this.audio.removeEventListener('loadedmetadata', onMeta);
      try {
        this.audio.currentTime = pos;
      } catch {
        /* ignore */
      }
      this._notify();
    };
    this.audio.addEventListener('loadedmetadata', onMeta, { once: true });
    try {
      void this.audio.load();
    } catch {
      /* ignore */
    }
  },

  _wireAudioEvents() {
    const a = this.audio;
    a.addEventListener('timeupdate', () => this._queuePersist());
    a.addEventListener('ended', () => this._onEnded());
    a.addEventListener('play', () => this._notify());
    a.addEventListener('pause', () => {
      this._queuePersist();
      this._notify();
    });
  },

  _wireOverrideAudioEvents() {
    this.overrideAudio.addEventListener('ended', () => {
      /* override loops at game discretion — exit is external */
    });
  },

  _queuePersist() {
    if (this.isOverride) return;
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this.persistPlaybackState();
    }, 250);
  },

  persistPlaybackState() {
    if (!this.patchState || this.isOverride) return;
    const pos = Number(this.audio?.currentTime || 0);
    const id = this.currentTrack?.id ?? null;
    this.patchState((st) => {
      st.mediaPlayer.currentTrackId = id;
      st.mediaPlayer.positionSec = pos;
      st.mediaPlayer.volume = this.volume;
      st.mediaPlayer.shuffle = this.shuffle;
      st.mediaPlayer.repeat = this.repeat;
      st.mediaPlayer.favorites = [...this.favorites];
      return st;
    });
  },

  async loadRegistry() {
    const base = musicBaseUrl();
    try {
      const res = await fetch(`${base}tracks.json`, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('[MediaPlayer] tracks.json HTTP', res.status, res.statusText);
        this._baseRegistry = [];
      } else {
        try {
          const data = await res.json();
          this._baseRegistry = Array.isArray(data) ? data : [];
        } catch (e) {
          console.warn('[MediaPlayer] tracks.json invalid JSON', e);
          this._baseRegistry = [];
        }
      }
    } catch (err) {
      console.warn('[MediaPlayer] tracks.json fetch failed', err);
      this._baseRegistry = [];
    }

    let discovered = [];
    if (typeof window !== 'undefined' && window.corpOS?.listAssetsMusicFiles) {
      try {
        const files = await window.corpOS.listAssetsMusicFiles();
        if (Array.isArray(files)) discovered = files;
      } catch (e) {
        console.warn('[MediaPlayer] listAssetsMusicFiles failed', e);
      }
    }
    this._discoveredFilenames = discovered;

    this._mergeTracks();
    this._prewarmOverrides();
  },

  /** Re-fetch tracks.json + disk list (context menu Refresh). */
  reloadLibrary() {
    return this.loadRegistry();
  },

  _prewarmOverrides() {
    for (const el of this._prewarmAudios) {
      try {
        el.removeAttribute('src');
        el.load();
      } catch {
        /* ignore */
      }
    }
    this._prewarmAudios = [];
    const base = musicBaseUrl();
    for (const t of this._baseRegistry) {
      if (!t.isOverride) continue;
      const url = `${base}${encodeURIComponent(String(t.filename || ''))}`;
      const pre = new Audio(url);
      pre.preload = 'auto';
      try {
        void pre.load();
      } catch {
        /* ignore */
      }
      this._prewarmAudios.push(pre);
    }
  },

  _discoveredTrackEntries() {
    const fromJson = this._baseRegistry.map((t) => ({ ...t }));
    const seen = new Set(
      fromJson.map((t) => String(t.filename || '').toLowerCase()).filter(Boolean)
    );
    const out = [];
    for (const fn of this._discoveredFilenames || []) {
      if (!fn || typeof fn !== 'string') continue;
      const low = fn.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      const baseTitle = fn.replace(/\.[^.]+$/i, '');
      out.push({
        id: `disc_${fn.replace(/[^a-zA-Z0-9._-]+/g, '_')}`,
        title: baseTitle,
        artist: 'My Music',
        album: 'assets/music',
        duration: '—',
        filename: fn,
        type: 'ost',
        purchasable: false,
        unlocked: true,
        isOverride: false,
        tags: ['local'],
        _discoveredFile: true
      });
    }
    return out;
  },

  _mergeTracks() {
    const sessionImports = this.getSessionState?.()?.mediaPlayer?.importedTracks || [];
    const merged = [
      ...this._baseRegistry.map((t) => ({ ...t })),
      ...this._discoveredTrackEntries(),
      ...sessionImports.map((t) => ({ ...t }))
    ];
    this.tracks = merged.map((t, i) => ({ ...t, _libraryOrder: i }));
  },

  /** Sync session imports (e.g. after import) */
  refreshMergedTracks() {
    this._mergeTracks();
    this._notify();
  },

  isTrackUnlocked(track) {
    if (!track || track.isOverride) return false;
    const st = this.getState().mediaPlayer;
    const ids = new Set((st.unlockedIds || []).map(String));
    if (track.unlocked === false && !ids.has(String(track.id))) return false;
    return true;
  },

  getLibraryTracks() {
    return this.tracks.filter((t) => !t.isOverride && this.isTrackUnlocked(t));
  },

  getTrackById(id) {
    return this.tracks.find((t) => String(t.id) === String(id)) || null;
  },

  _urlForTrack(track) {
    if (!track) return '';
    if (track.objectUrl) return track.objectUrl;
    const fn = String(track.filename || '');
    if (!fn) return '';
    return `${musicBaseUrl()}${encodeURIComponent(fn)}`;
  },

  play(trackId) {
    const track = typeof trackId === 'object' ? trackId : this.getTrackById(trackId);
    if (!track || track.isOverride) return;
    if (!this.isTrackUnlocked(track)) return;
    if (this.isOverride) return;

    this.currentTrack = track;
    const url = this._urlForTrack(track);
    if (!url) return;

    this.audio.src = url;
    this.audio.volume = this.volume;
    this.audio.currentTime = 0;
    if (this._simSpeedBlocksPlayback()) {
      try {
        this.audio.pause();
      } catch {
        /* ignore */
      }
    } else {
      this._safePlay(this.audio);
    }
    this._shufflePlayed.add(String(track.id));
    this.persistPlaybackState();
    this._notify();
  },

  pause() {
    if (this.isOverride) return;
    this.audio.pause();
    this.persistPlaybackState();
    this._notify();
  },

  resume() {
    if (this.isOverride) return;
    if (this._simSpeedBlocksPlayback()) return;
    this._safePlay(this.audio);
    this._notify();
  },

  togglePlayPause() {
    if (this.isOverride) return;
    if (this.audio.paused) this.resume();
    else this.pause();
  },

  seek(percent) {
    if (this.isOverride) return;
    const d = this.audio.duration;
    if (!d || Number.isNaN(d)) return;
    this.audio.currentTime = Math.max(0, Math.min(1, percent)) * d;
    this._notify();
    this.persistPlaybackState();
  },

  seekSeconds(delta) {
    if (this.isOverride) return;
    const d = this.audio.duration;
    if (!d || Number.isNaN(d)) return;
    this.audio.currentTime = Math.max(0, Math.min(d, (this.audio.currentTime || 0) + delta));
    this._notify();
    this.persistPlaybackState();
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    if (!this.isOverride) this.audio.volume = this.volume;
    this.patchState?.((st) => {
      st.mediaPlayer.volume = this.volume;
      return st;
    });
    this._notify();
  },

  applyVolume() {
    if (this.isOverride) {
      this.audio.volume = 0;
      this.overrideAudio.volume = 1;
    } else {
      this.audio.volume = this.volume;
    }
  },

  _libraryOrderedList() {
    return this.getLibraryTracks();
  },

  _currentIndexInLibrary() {
    const lib = this._libraryOrderedList();
    if (!this.currentTrack) return -1;
    return lib.findIndex((t) => t.id === this.currentTrack.id);
  },

  next() {
    if (this.isOverride) return;
    const lib = this._libraryOrderedList();
    if (!lib.length) return;

    if (this.repeat === 'one' && this.currentTrack) {
      this.audio.currentTime = 0;
      if (!this._simSpeedBlocksPlayback()) this._safePlay(this.audio);
      return;
    }

    if (this.shuffle) {
      const pool = lib.filter((t) => !this._shufflePlayed.has(String(t.id)));
      const pickFrom = pool.length ? pool : lib;
      const t = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (pool.length === 0) this._shufflePlayed = new Set([String(t.id)]);
      this.play(t.id);
      return;
    }

    let idx = this._currentIndexInLibrary();
    if (idx < 0) idx = -1;
    idx += 1;
    if (idx >= lib.length) {
      if (this.repeat === 'all') {
        this.play(lib[0].id);
      }
      return;
    }
    this.play(lib[idx].id);
  },

  prev() {
    if (this.isOverride) return;
    const lib = this._libraryOrderedList();
    if (!lib.length) return;

    const played = (this.audio.currentTime || 0) > 3;
    if (played && this.currentTrack) {
      this.audio.currentTime = 0;
      if (!this._simSpeedBlocksPlayback()) this._safePlay(this.audio);
      this._notify();
      return;
    }

    let idx = this._currentIndexInLibrary();
    if (idx < 0) idx = 0;
    else idx -= 1;
    if (idx < 0) {
      if (this.repeat === 'all') this.play(lib[lib.length - 1].id);
      return;
    }
    this.play(lib[idx].id);
  },

  _onEnded() {
    if (this.repeat === 'one') {
      this.audio.currentTime = 0;
      if (!this._simSpeedBlocksPlayback()) this._safePlay(this.audio);
      return;
    }
    this.next();
  },

  toggleShuffle() {
    if (this.isOverride) return;
    this.shuffle = !this.shuffle;
    this._shufflePlayed = new Set();
    if (this.currentTrack) this._shufflePlayed.add(String(this.currentTrack.id));
    this.patchState?.((st) => {
      st.mediaPlayer.shuffle = this.shuffle;
      return st;
    });
    this._notify();
  },

  cycleRepeat() {
    if (this.isOverride) return;
    const order = ['off', 'all', 'one'];
    const i = order.indexOf(this.repeat);
    this.repeat = order[(i + 1) % order.length];
    this.patchState?.((st) => {
      st.mediaPlayer.repeat = this.repeat;
      return st;
    });
    this._notify();
  },

  toggleFavorite(trackId) {
    const id = String(trackId ?? this.currentTrack?.id ?? '');
    if (!id) return;
    if (this.favorites.has(id)) this.favorites.delete(id);
    else this.favorites.add(id);
    this.patchState?.((st) => {
      st.mediaPlayer.favorites = [...this.favorites];
      return st;
    });
    this._notify();
  },

  getFavorites() {
    return [...this.favorites];
  },

  isFavorite(id) {
    return this.favorites.has(String(id));
  },

  /**
   * System Override — full volume stinger; UI must gray out (handled in media-player.js).
   * @param {string} overrideTrackId
   */
  enterOverride(overrideTrackId) {
    const track = this._baseRegistry.find(
      (t) => String(t.id) === String(overrideTrackId) && t.isOverride
    );
    if (!track) {
      console.warn('MediaPlayer.enterOverride: unknown override track', overrideTrackId);
      return;
    }

    if (!this.isOverride) {
      this.preOverrideSnapshot = {
        trackId: this.currentTrack?.id ?? null,
        positionSec: Number(this.audio?.currentTime || 0),
        paused: !this.audio || this.audio.paused,
        volume: this.volume
      };
      if (!this.preOverrideSnapshot.paused) {
        try {
          this.audio.pause();
        } catch {
          /* ignore */
        }
      }
    }

    this.isOverride = true;
    this.overrideTrack = track;
    const url = this._urlForTrack(track);
    this.overrideAudio.src = url;
    this.overrideAudio.volume = 1;
    try {
      this.overrideAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.audio.volume = 0;
    this._safePlay(this.overrideAudio);
    this._notify();
  },

  exitOverride() {
    if (!this.isOverride) return;
    try {
      this.overrideAudio.pause();
      this.overrideAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.isOverride = false;
    this.overrideTrack = null;

    const snap = this.preOverrideSnapshot;
    this.preOverrideSnapshot = null;

    this.applyVolume();

    if (snap?.trackId) {
      const t = this.getTrackById(snap.trackId);
      if (t && !t.isOverride && this.isTrackUnlocked(t)) {
        this.currentTrack = t;
        this.audio.src = this._urlForTrack(t);
        this.audio.volume = this.volume;
        const seekTo = Math.max(0, snap.positionSec || 0);
        const onMeta = () => {
          this.audio.removeEventListener('loadedmetadata', onMeta);
          try {
            this.audio.currentTime = seekTo;
          } catch {
            /* ignore */
          }
          if (!snap.paused && !this._simSpeedBlocksPlayback()) this._safePlay(this.audio);
          else this.audio.pause();
          this._notify();
        };
        this.audio.addEventListener('loadedmetadata', onMeta, { once: true });
        void this.audio.load();
      } else {
        this.currentTrack = null;
        this._notify();
      }
    } else {
      this._notify();
    }
    this.persistPlaybackState();
  },

  /** Elapsed / duration for UI */
  getPlaybackTimes() {
    if (this.isOverride) {
      const t = this.overrideAudio;
      const d = t?.duration;
      return {
        elapsed: Number(t?.currentTime || 0),
        duration: d && !Number.isNaN(d) ? d : parseDurationToSec(this.overrideTrack?.duration),
        labelTotal: formatTime(
          d && !Number.isNaN(d) ? d : parseDurationToSec(this.overrideTrack?.duration)
        )
      };
    }
    const t = this.audio;
    const d = t?.duration;
    const fallback = parseDurationToSec(this.currentTrack?.duration);
    return {
      elapsed: Number(t?.currentTime || 0),
      duration: d && !Number.isNaN(d) ? d : fallback,
      labelTotal: formatTime(d && !Number.isNaN(d) ? d : fallback)
    };
  },

  /** Add imported track (session storage via patchSession). */
  addImportedTrack({ id, title, artist, album, duration, objectUrl, filename }) {
    const row = {
      id,
      title,
      artist: artist || 'Unknown Artist',
      album: album || '',
      duration,
      filename,
      type: 'imported',
      purchasable: false,
      unlocked: true,
      isOverride: false,
      objectUrl,
      tags: []
    };
    this.patchSession?.((s) => {
      s.mediaPlayer.importedTracks = s.mediaPlayer.importedTracks || [];
      s.mediaPlayer.importedTracks.push(row);
    });
    this._mergeTracks();
    this._notify();
    return row;
  },

  unlockTrackInState(trackId) {
    const id = String(trackId);
    this.patchState?.((st) => {
      if (!st.mediaPlayer.unlockedIds.includes(id)) st.mediaPlayer.unlockedIds.push(id);
      return st;
    });
    this._notify();
  }
};

export { parseDurationToSec, formatTime, musicBaseUrl };
