/**
 * WorldNet Site Registry — flat map classifying every in-game URL as
 * legit | scam | marketplace, with category and trust signal metadata.
 *
 * Loaded lazily from data/worldnet-site-meta.json with in-code defaults
 * so the game always boots even if the JSON is missing.
 */

/** @type {Map<string, SiteEntry>} keyed by lowercase hostname */
const _byHost = new Map();

/** @type {Map<string, SiteEntry>} keyed by pageKey (may have multiple per key for scam variants) */
const _byPageKey = new Map();

/** @type {SiteEntry[]} */
let _all = [];
let _loaded = false;

/**
 * @typedef {{
 *   pageKey: string,
 *   host: string,
 *   outcome: 'legit' | 'scam' | 'marketplace',
 *   category: string,
 *   displayTitle?: string,
 *   trustSignals?: string[],
 *   scam?: ScamMeta
 * }} SiteEntry
 *
 * @typedef {{
 *   copyTypoLevel: number,
 *   sslMismatch: boolean,
 *   whoisFake: boolean,
 *   chargeMultiplier: number,
 *   deliveryTable: { p: number, outcome: 'nothing'|'fake'|'jackpot' }[]
 * }} ScamMeta
 */

function normalizeHost(raw) {
  return String(raw || '').toLowerCase().replace(/^www\./, '');
}

function ingest(entries) {
  for (const e of entries) {
    if (!e?.host || !e?.outcome) continue;
    const h = normalizeHost(e.host);
    const wwwH = `www.${h}`;
    const entry = { trustSignals: [], ...e, host: h };
    _byHost.set(h, entry);
    _byHost.set(wwwH, entry);
    if (e.pageKey && e.pageKey !== '__scam__') {
      _byPageKey.set(e.pageKey, entry);
    }
    _all.push(entry);
  }
}

/**
 * Load and index site-meta.json. Safe to call multiple times — only runs once.
 * @param {object|null} json parsed data/worldnet-site-meta.json (may be null)
 */
export function initSiteRegistry(json) {
  if (_loaded) return;
  _loaded = true;
  if (json?.sites && Array.isArray(json.sites)) {
    ingest(json.sites);
  }
}

/**
 * Look up registry entry by pageKey (first legit match wins, then fallback).
 * @param {string} pageKey
 * @returns {SiteEntry | null}
 */
export function getSiteByPageKey(pageKey) {
  return _byPageKey.get(String(pageKey || '')) || null;
}

/**
 * Look up registry entry by hostname.
 * @param {string} host raw hostname (www-prefix optional)
 * @returns {SiteEntry | null}
 */
export function getSiteByHost(host) {
  const h = normalizeHost(host);
  return _byHost.get(h) || _byHost.get(`www.${h}`) || null;
}

/**
 * Classify a URL (full href or host string) and return its outcome.
 * @param {string} url
 * @returns {'legit' | 'scam' | 'marketplace' | 'unknown'}
 */
export function classifyUrl(url) {
  try {
    const href = String(url || '');
    const u = new URL(href.includes('://') ? href : `http://${href}`);
    const entry = getSiteByHost(u.hostname);
    return entry?.outcome ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Return all sites with given outcome.
 * @param {'legit'|'scam'|'marketplace'} outcome
 * @returns {SiteEntry[]}
 */
export function getSitesByOutcome(outcome) {
  return _all.filter((e) => e.outcome === outcome);
}

/**
 * Return all site entries (for directory/registry renders).
 * @returns {SiteEntry[]}
 */
export function getAllSites() {
  return [..._all];
}

/**
 * Trust-signal display helpers — used by subtle scam UI rendering.
 */
export const TRUST_SIGNAL_LABELS = Object.freeze({
  ssl:         'SSL Secured',
  fdic:        'FDIC Insured',
  ncua:        'NCUA Insured',
  government:  'Official .GOV site',
  established: 'Est. 1998–1999'
});

/**
 * Build a small HTML "trust badge" strip shown on legitimate site footers.
 * @param {SiteEntry} entry
 * @returns {string} html
 */
export function trustBadgeHtml(entry) {
  if (!entry?.trustSignals?.length) return '';
  const badges = entry.trustSignals
    .map((sig) => TRUST_SIGNAL_LABELS[sig])
    .filter(Boolean)
    .map(
      (label) =>
        `<span style="display:inline-block;border:1px solid #999;background:#f0f8ff;padding:1px 5px;font-size:9px;margin-right:3px;font-family:Arial,sans-serif;">${label}</span>`
    )
    .join('');
  return badges
    ? `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #ccc;">${badges}</div>`
    : '';
}

/**
 * Return subtle CSS class modifiers for scam sites based on copyTypoLevel.
 * 0 = none, 1 = slightly off, 2 = noticeably off, 3 = obvious
 * @param {SiteEntry|null} entry
 * @returns {string} css class list (may be empty)
 */
export function scamClassModifiers(entry) {
  if (entry?.outcome !== 'scam') return '';
  const level = entry.scam?.copyTypoLevel ?? 0;
  if (level >= 3) return 'wn-scam-heavy';
  if (level >= 2) return 'wn-scam-medium';
  if (level >= 1) return 'wn-scam-light';
  return '';
}
