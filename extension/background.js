const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
const ORG_BLOCKED_WEBSITES_KEY = 'orgBlockedWebsites';
const AUTH_TOKEN_KEY = 'authToken';
const USER_ID_KEY = 'userId';
const ORG_ID_KEY = 'organizationId';
const ORG_IS_ADMIN_KEY = 'organizationIsAdmin';
const ORG_ALLOW_DURATION_MINUTES_KEY = 'organizationAllowDurationMinutes';
const ORG_BLOCKLIST_LAST_SYNC_KEY = 'orgBlockedWebsitesLastSyncedAt';
const ENFORCEMENT_DEDUPE_WINDOW_MS = 1500;
const RESCAN_DEDUPE_WINDOW_MS = 3000;
const TEMP_ALLOW_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TEMP_ALLOW_MIN_MS = 60 * 1000; // 1 minute
const TEMP_ALLOW_MAX_MS = 60 * 60 * 1000; // 60 minutes
const BLOCKED_PAGE_PATH = 'blocked.html';
const ORG_BLOCKLIST_SYNC_ALARM = 'ORG_BLOCKLIST_SYNC';
const ORG_BLOCKLIST_MIN_SYNC_WINDOW_MS = 60 * 1000; // 1 minute

// Keep in sync with extension/blocked-page.js (dev default).
const BACKEND_URL = 'http://localhost:8000';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Track recent redirect attempts so the same tab is not handled repeatedly.
const recentEnforcements = new Map();
const recentRescans = new Map();
let rescanInFlight = null;

// Hostnames approved by the blocked-page flow get a short grace period.
const temporaryAllowances = new Map();

// Cache the merged blocklist until storage changes invalidate it.
let cachedBlocklistSet = null;

async function writeOrgBlocklistToStorage(websites, { syncedAt } = {}) {
  const nextWebsites = dedupeAndSort(Array.isArray(websites) ? websites : []);
  const payload = {
    [ORG_BLOCKED_WEBSITES_KEY]: nextWebsites,
  };
  if (typeof syncedAt === 'number') {
    payload[ORG_BLOCKLIST_LAST_SYNC_KEY] = syncedAt;
  }
  await chrome.storage.local.set(payload);
}

async function readOrgSyncContext() {
  const data = await chrome.storage.local.get([AUTH_TOKEN_KEY, USER_ID_KEY, ORG_BLOCKLIST_LAST_SYNC_KEY]);
  return {
    authToken: typeof data[AUTH_TOKEN_KEY] === 'string' ? data[AUTH_TOKEN_KEY] : '',
    userId: typeof data[USER_ID_KEY] === 'string' ? data[USER_ID_KEY] : '',
    lastSyncedAt: typeof data[ORG_BLOCKLIST_LAST_SYNC_KEY] === 'number' ? data[ORG_BLOCKLIST_LAST_SYNC_KEY] : 0,
  };
}

async function syncOrgBlocklist(reason = 'sync') {
  try {
    const { authToken, userId, lastSyncedAt } = await readOrgSyncContext();
    if (!authToken || !userId) {
      return;
    }

    // Avoid hammering the backend if multiple triggers happen in quick succession.
    if (Date.now() - lastSyncedAt < ORG_BLOCKLIST_MIN_SYNC_WINDOW_MS) {
      return;
    }

    const res = await fetch(
      `${BACKEND_URL}/api/organizations/by-user/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    // No org membership means org blocklist should be empty locally.
    if (res.status === 404) {
      await writeOrgBlocklistToStorage([], { syncedAt: Date.now() });
      return;
    }

    if (!res.ok) {
      console.warn('Org blocklist sync failed', { reason, status: res.status });
      return;
    }

    const data = await res.json();
    await writeOrgBlocklistToStorage(data?.organization?.blockedWebsites ?? [], { syncedAt: Date.now() });
    const allowDurationMinutes = Number(data?.organization?.allowDurationMinutes ?? 5);
    await chrome.storage.local.set({
      [ORG_ALLOW_DURATION_MINUTES_KEY]:
        Number.isFinite(allowDurationMinutes) ? Math.min(60, Math.max(1, Math.floor(allowDurationMinutes))) : 5,
    });
  } catch (error) {
    console.warn('Org blocklist sync error', { reason, error });
  }
}

// Convert hostnames into the normalized form used across the extension.
function canonicalizeHostname(hostname) {
  const cleaned = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!cleaned) return null;
  return cleaned.startsWith('www.') ? cleaned.slice(4) : cleaned;
}

// Accept URLs or raw hostnames and return a valid blocklist hostname.
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

// Normalize, dedupe, and sort hostnames before storing or comparing them.
function dedupeAndSort(hostnames) {
  return [...new Set(hostnames.map(normalizeHostname).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// Match a blocked hostname against the same host or any of its subdomains.
function hostnameMatchesBlockedHostname(hostname, blockedHostname) {
  const a = canonicalizeHostname(hostname);
  const b = canonicalizeHostname(blockedHostname);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}

// Read both personal and org blocklists from extension storage.
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

// Reuse the merged blocklist until a storage change clears the cache.
async function getBlockedHostnameSet() {
  if (cachedBlocklistSet !== null) return cachedBlocklistSet;

  const { personal, org } = await readCombinedBlocklists();
  cachedBlocklistSet = new Set([...personal, ...org]);
  return cachedBlocklistSet;
}

// Check whether a hostname is still inside its temporary allow window.
function isTemporarilyAllowed(hostname) {
  const canonicalized = canonicalizeHostname(hostname);
  if (!canonicalized) return false;

  const now = Date.now();

  // Allow applies to the exact hostname OR any subdomain of an allowed hostname.
  // This is important for flows like login/2FA that hop across subdomains.
  for (const [allowedHostname, expiry] of temporaryAllowances.entries()) {
    if (typeof expiry !== 'number') continue;

    // Drop expired entries the first time they are checked again.
    if (now > expiry) {
      temporaryAllowances.delete(allowedHostname);
      continue;
    }

    if (hostnameMatchesBlockedHostname(canonicalized, allowedHostname)) {
      return true;
    }
  }

  return false;
}

// Grant short-term access after the blocked-page AI approves a visit.
function addTemporaryAllowance(hostname) {
  addTemporaryAllowanceWithDuration(hostname, TEMP_ALLOW_TTL_MS);
}

function clampDurationMs(ms) {
  if (!Number.isFinite(ms)) return TEMP_ALLOW_TTL_MS;
  return Math.min(TEMP_ALLOW_MAX_MS, Math.max(TEMP_ALLOW_MIN_MS, Math.floor(ms)));
}

function addTemporaryAllowanceWithDuration(hostname, durationMs) {
  const canonicalized = canonicalizeHostname(hostname);
  if (!canonicalized) return;

  const clamped = clampDurationMs(durationMs);
  temporaryAllowances.set(canonicalized, Date.now() + clamped);
  console.log(`Temporarily allowed: ${canonicalized} for ${Math.round(clamped / 60000)} min`);
}

// Remove stale entries from a recent-event map before adding new ones.
function pruneRecentMap(map, windowMs) {
  const now = Date.now();
  for (const [key, timestamp] of map.entries()) {
    if (now - timestamp > windowMs) map.delete(key);
  }
}

// Skip repeated redirect attempts for the same tab/url pair.
function shouldSkipRecentEnforcement(url, tabId) {
  pruneRecentMap(recentEnforcements, ENFORCEMENT_DEDUPE_WINDOW_MS);
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentEnforcements.get(key);
  if (typeof previous === 'number' && now - previous < ENFORCEMENT_DEDUPE_WINDOW_MS) return true;
  recentEnforcements.set(key, now);
  return false;
}

// Skip repeated rescans for the same tab/url pair inside a short window.
function shouldSkipRecentRescan(url, tabId) {
  pruneRecentMap(recentRescans, RESCAN_DEDUPE_WINDOW_MS);
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentRescans.get(key);
  if (typeof previous === 'number' && now - previous < RESCAN_DEDUPE_WINDOW_MS) return true;
  recentRescans.set(key, now);
  return false;
}

// Recognize the extension's own blocked page so it does not get re-blocked.
function isExtensionBlockedPage(url) {
  try {
    const blockedPageUrl = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
    return new URL(url).href.startsWith(blockedPageUrl);
  } catch {
    return false;
  }
}

// Build the internal blocked-page URL with the original site context attached.
function buildBlockedPageUrl(blockedUrl, hostname, source) {
  const blockedPageUrl = new URL(chrome.runtime.getURL(BLOCKED_PAGE_PATH));
  blockedPageUrl.searchParams.set('url', blockedUrl);
  blockedPageUrl.searchParams.set('hostname', hostname);
  blockedPageUrl.searchParams.set('source', source);
  return blockedPageUrl.toString();
}

// Decide whether a navigated URL matches any currently blocked hostname.
async function getMatchedBlockedHostname(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

    const hostname = canonicalizeHostname(parsed.hostname);
    if (!hostname || (hostname !== 'localhost' && !hostname.includes('.'))) return null;

    // A temporary allowance bypasses normal blocklist matching.
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

// Replace the current tab URL with the extension's blocked page.
async function redirectBlockedTab(url, tabId, hostname, source) {
  if (typeof tabId !== 'number' || tabId < 0) return;

  const blockedPageUrl = buildBlockedPageUrl(url, hostname, source);

  try {
    // Recheck the tab first so we do not overwrite a newer navigation.
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.url !== url) return;

    await chrome.tabs.update(tabId, { url: blockedPageUrl });
  } catch (error) {
    console.error('Failed to redirect blocked tab', { url, tabId, hostname, source, error });
  }
}

// Apply blocklist rules to a single tab update event.
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

// Re-evaluate every open tab after startup or storage changes.
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

// Share one in-flight rescan so duplicate triggers reuse the same work.
function rescanOpenTabs(reason = 'rescan') {
  if (!rescanInFlight) {
    rescanInFlight = doRescanOpenTabs(reason).finally(() => {
      rescanInFlight = null;
    });
  }
  return rescanInFlight;
}

// Run the initial scan when the worker starts or installs.
async function initializeBlocking() {
  try {
    // Keep org blocklist in local storage even when popup isn't opened.
    await syncOrgBlocklist('initializeBlocking');
    await rescanOpenTabs('initializeBlocking');
  } catch (error) {
    console.error('Failed to initialize blocking', error);
  }
}

// Install-time startup path.
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  void initializeBlocking();
});

// Browser startup path.
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  void initializeBlocking();
});

// Periodically refresh the org blocklist from the backend.
chrome.alarms?.create?.(ORG_BLOCKLIST_SYNC_ALARM, { periodInMinutes: 5 });
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm?.name !== ORG_BLOCKLIST_SYNC_ALARM) return;
  void syncOrgBlocklist('alarms.onAlarm');
});

// Clear the cached blocklist and rescan when local storage changes.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes[AUTH_TOKEN_KEY] || changes[USER_ID_KEY]) {
    void syncOrgBlocklist('storage.onChanged.auth').catch(() => {});
  }

  if (changes[PERSONAL_BLOCKED_WEBSITES_KEY] || changes[ORG_BLOCKED_WEBSITES_KEY]) {
    cachedBlocklistSet = null;

    void rescanOpenTabs('storage.onChanged').catch((error) => {
      console.error('Failed to rescan blocked tabs after storage change', error);
    });
  }
});

// Catch regular page navigations.
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  void enforceBlockedTab(details.url, details.tabId, 'onCommitted');
});

// Catch client-side route changes in single-page apps.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  void enforceBlockedTab(details.url, details.tabId, 'onHistoryStateUpdated');
});

// Catch tab URL changes that may not surface through webNavigation.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  void enforceBlockedTab(changeInfo.url, tabId, 'tabs.onUpdated');
});

// Handle runtime messages from the popup and blocked page.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SYNC_BLOCKING_RULES' || message?.type === 'RESCAN_BLOCKED_TABS') {
    rescanOpenTabs('runtime.onMessage')
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('Failed to rescan from message', error);
        sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' });
      });
    return true;
  }

  // Allow the blocked page to request a short-term exception for a hostname.
  if (message?.type === 'ALLOW_TEMPORARILY' && typeof message.hostname === 'string') {
    const durationMs = typeof message.durationMs === 'number' ? message.durationMs : undefined;

    // Org users always use the organization-wide duration. Only users without an org can choose a custom duration.
    chrome.storage.local
      .get([ORG_ID_KEY, ORG_ALLOW_DURATION_MINUTES_KEY])
      .then((data) => {
        const orgId = typeof data[ORG_ID_KEY] === 'string' ? data[ORG_ID_KEY] : '';
        const orgMinutes = Number(data[ORG_ALLOW_DURATION_MINUTES_KEY] ?? 5);
        const orgDurationMs = Number.isFinite(orgMinutes) ? orgMinutes * 60 * 1000 : TEMP_ALLOW_TTL_MS;

        const chosen = orgId
          ? orgDurationMs
          : typeof durationMs === 'number'
            ? durationMs
            : TEMP_ALLOW_TTL_MS;

        addTemporaryAllowanceWithDuration(message.hostname, chosen);
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.warn('Failed to read org context for allowance duration', error);
        addTemporaryAllowanceWithDuration(message.hostname, TEMP_ALLOW_TTL_MS);
        sendResponse({ ok: true });
      });
    return true; // async response
  }

  return false;
});

console.log('Background service worker running with JS-only blocking');
void initializeBlocking();
