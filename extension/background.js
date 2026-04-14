const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
const ORG_BLOCKED_WEBSITES_KEY = 'orgBlockedWebsites';
const ENFORCEMENT_DEDUPE_WINDOW_MS = 1500;
const RESCAN_DEDUPE_WINDOW_MS = 3000;
const TEMP_ALLOW_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BLOCKED_PAGE_PATH = 'blocked.html';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Dedup maps prevent the three concurrent listeners from triple-redirecting the same tab.
const recentEnforcements = new Map();
const recentRescans = new Map();
let rescanInFlight = null;

// Temporary allowances granted by the AI chat. Keyed by canonicalized hostname.
const temporaryAllowances = new Map();

// In-memory cache of the combined blocklist. Invalidated on storage changes.
let cachedBlocklistSet = null;

// ─── Hostname helpers ──────────────────────────────────────────────────────────

function canonicalizeHostname(hostname) {
  const cleaned = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!cleaned) return null;
  return cleaned.startsWith('www.') ? cleaned.slice(4) : cleaned;
}

function normalizeHostname(input) {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

    const hostname = canonicalizeHostname(parsed.hostname);
    if (!hostname) return null;
    if (hostname !== 'localhost' && !hostname.includes('.')) return null;

    return hostname;
  } catch {
    return null;
  }
}

function dedupeAndSort(hostnames) {
  return [...new Set(hostnames.map(normalizeHostname).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// Returns true if `hostname` is the blocked domain or any subdomain of it.
// Both sides are canonicalized so www. variants match automatically.
function hostnameMatchesBlockedHostname(hostname, blockedHostname) {
  const a = canonicalizeHostname(hostname);
  const b = canonicalizeHostname(blockedHostname);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}

// ─── Blocklist storage ─────────────────────────────────────────────────────────

async function readCombinedBlocklists() {
  const data = await chrome.storage.local.get([
    PERSONAL_BLOCKED_WEBSITES_KEY,
    ORG_BLOCKED_WEBSITES_KEY,
  ]);

  const personal = Array.isArray(data[PERSONAL_BLOCKED_WEBSITES_KEY])
    ? data[PERSONAL_BLOCKED_WEBSITES_KEY]
    : [];
  const org = Array.isArray(data[ORG_BLOCKED_WEBSITES_KEY])
    ? data[ORG_BLOCKED_WEBSITES_KEY]
    : [];

  return {
    personal: dedupeAndSort(personal),
    org: dedupeAndSort(org),
  };
}

async function getBlockedHostnameSet() {
  if (cachedBlocklistSet !== null) return cachedBlocklistSet;
  const { personal, org } = await readCombinedBlocklists();
  cachedBlocklistSet = new Set([...personal, ...org]);
  return cachedBlocklistSet;
}

// ─── Temporary allowances ──────────────────────────────────────────────────────

function isTemporarilyAllowed(hostname) {
  const canonicalized = canonicalizeHostname(hostname);
  if (!canonicalized) return false;

  const expiry = temporaryAllowances.get(canonicalized);
  if (typeof expiry !== 'number') return false;

  if (Date.now() > expiry) {
    temporaryAllowances.delete(canonicalized);
    return false;
  }

  return true;
}

function addTemporaryAllowance(hostname) {
  const canonicalized = canonicalizeHostname(hostname);
  if (canonicalized) {
    temporaryAllowances.set(canonicalized, Date.now() + TEMP_ALLOW_TTL_MS);
    console.log(`Temporarily allowed: ${canonicalized} for ${TEMP_ALLOW_TTL_MS / 60000} min`);
  }
}

// ─── Dedup helpers ─────────────────────────────────────────────────────────────

function pruneRecentMap(map, windowMs) {
  const now = Date.now();
  for (const [key, timestamp] of map.entries()) {
    if (now - timestamp > windowMs) map.delete(key);
  }
}

function shouldSkipRecentEnforcement(url, tabId) {
  pruneRecentMap(recentEnforcements, ENFORCEMENT_DEDUPE_WINDOW_MS);
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentEnforcements.get(key);
  if (typeof previous === 'number' && now - previous < ENFORCEMENT_DEDUPE_WINDOW_MS) return true;
  recentEnforcements.set(key, now);
  return false;
}

function shouldSkipRecentRescan(url, tabId) {
  pruneRecentMap(recentRescans, RESCAN_DEDUPE_WINDOW_MS);
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentRescans.get(key);
  if (typeof previous === 'number' && now - previous < RESCAN_DEDUPE_WINDOW_MS) return true;
  recentRescans.set(key, now);
  return false;
}

// ─── Blocked page helpers ──────────────────────────────────────────────────────

function isExtensionBlockedPage(url) {
  try {
    const blockedPageUrl = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
    return new URL(url).href.startsWith(blockedPageUrl);
  } catch {
    return false;
  }
}

function buildBlockedPageUrl(blockedUrl, hostname, source) {
  const blockedPageUrl = new URL(chrome.runtime.getURL(BLOCKED_PAGE_PATH));
  blockedPageUrl.searchParams.set('url', blockedUrl);
  blockedPageUrl.searchParams.set('hostname', hostname);
  blockedPageUrl.searchParams.set('source', source);
  return blockedPageUrl.toString();
}

// ─── Core enforcement ──────────────────────────────────────────────────────────

// Returns the canonicalized blocked hostname if `url` matches a blocked entry,
// null otherwise. Uses `canonicalizeHostname` directly since `parsed.hostname`
// is already a clean hostname — no need to re-parse through `normalizeHostname`.
async function getMatchedBlockedHostname(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

    const hostname = canonicalizeHostname(parsed.hostname);
    if (!hostname || (hostname !== 'localhost' && !hostname.includes('.'))) return null;

    if (isTemporarilyAllowed(hostname)) return null;

    const blockedHostnames = await getBlockedHostnameSet();
    for (const blockedHostname of blockedHostnames) {
      if (hostnameMatchesBlockedHostname(hostname, blockedHostname)) return hostname;
    }

    return null;
  } catch {
    return null;
  }
}

async function redirectBlockedTab(url, tabId, hostname, source) {
  if (typeof tabId !== 'number' || tabId < 0) return;

  const blockedPageUrl = buildBlockedPageUrl(url, hostname, source);

  try {
    // Re-fetch the tab to guard against TOCTOU: if the user has already
    // navigated away between the listener firing and here, skip the redirect.
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.url !== url) return;

    await chrome.tabs.update(tabId, { url: blockedPageUrl });
  } catch (error) {
    console.error('Failed to redirect blocked tab', { url, tabId, hostname, source, error });
  }
}

async function enforceBlockedTab(url, tabId, source = 'unknown') {
  try {
    if (typeof tabId !== 'number' || tabId < 0 || !url || isExtensionBlockedPage(url)) return;

    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return;

    const hostname = await getMatchedBlockedHostname(url);
    if (!hostname) return;

    if (shouldSkipRecentEnforcement(url, tabId)) return;

    await redirectBlockedTab(url, tabId, hostname, source);
  } catch (error) {
    console.error('Failed to enforce blocked tab', { url, tabId, source, error });
  }
}

// ─── Open-tab rescan ───────────────────────────────────────────────────────────

async function doRescanOpenTabs(reason = 'rescan') {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || !tab.url || isExtensionBlockedPage(tab.url)) return;
      if (shouldSkipRecentRescan(tab.url, tab.id)) return;
      await enforceBlockedTab(tab.url, tab.id, reason);
    })
  );
}

// Singleton: if a rescan is already in flight, return the same promise rather
// than launching a second concurrent scan.
function rescanOpenTabs(reason = 'rescan') {
  if (!rescanInFlight) {
    rescanInFlight = doRescanOpenTabs(reason).finally(() => {
      rescanInFlight = null;
    });
  }
  return rescanInFlight;
}

// ─── Initialization ────────────────────────────────────────────────────────────

async function initializeBlocking() {
  try {
    await rescanOpenTabs('initializeBlocking');
  } catch (error) {
    console.error('Failed to initialize blocking', error);
  }
}

// ─── Extension lifecycle ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  void initializeBlocking();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  void initializeBlocking();
});

// ─── Storage change listener ───────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes[PERSONAL_BLOCKED_WEBSITES_KEY] || changes[ORG_BLOCKED_WEBSITES_KEY]) {
    // Invalidate the in-memory cache so the next enforcement reads fresh data.
    cachedBlocklistSet = null;

    void rescanOpenTabs('storage.onChanged').catch((error) => {
      console.error('Failed to rescan blocked tabs after storage change', error);
    });
  }
});

// ─── Navigation listeners ──────────────────────────────────────────────────────

// onCommitted: catches standard navigations (including hard refreshes).
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  void enforceBlockedTab(details.url, details.tabId, 'onCommitted');
});

// onHistoryStateUpdated: catches SPA client-side route changes.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  void enforceBlockedTab(details.url, details.tabId, 'onHistoryStateUpdated');
});

// tabs.onUpdated: catches URL changes not surfaced by webNavigation (e.g. extensions modifying tabs).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  void enforceBlockedTab(changeInfo.url, tabId, 'tabs.onUpdated');
});

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Rescan all open tabs (triggered after popup changes the blocklist).
  if (message?.type === 'SYNC_BLOCKING_RULES' || message?.type === 'RESCAN_BLOCKED_TABS') {
    rescanOpenTabs('runtime.onMessage')
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('Failed to rescan from message', error);
        sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' });
      });
    return true;
  }

  // Granted by the AI chat: temporarily allow a hostname for TEMP_ALLOW_TTL_MS.
  if (message?.type === 'ALLOW_TEMPORARILY' && typeof message.hostname === 'string') {
    addTemporaryAllowance(message.hostname);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

console.log('Background service worker running with JS-only blocking');
void initializeBlocking();
