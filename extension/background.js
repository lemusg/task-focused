const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
const ORG_BLOCKED_WEBSITES_KEY = 'orgBlockedWebsites';
const ENFORCEMENT_DEDUPE_WINDOW_MS = 1500;
const RESCAN_DEDUPE_WINDOW_MS = 3000;
const BLOCKED_PAGE_PATH = 'blocked.html';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const recentEnforcements = new Map();
const recentRescans = new Map();
let rescanInFlight = null;

function canonicalizeHostname(hostname) {
  const cleaned = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('www.')) {
    return cleaned.slice(4);
  }

  return cleaned;
}

function normalizeHostname(input) {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    const hostname = canonicalizeHostname(parsed.hostname);
    if (!hostname) {
      return null;
    }

    if (hostname !== 'localhost' && !hostname.includes('.')) {
      return null;
    }

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

function hostnameMatchesBlockedHostname(hostname, blockedHostname) {
  const normalizedHostname = canonicalizeHostname(hostname);
  const normalizedBlockedHostname = canonicalizeHostname(blockedHostname);

  if (!normalizedHostname || !normalizedBlockedHostname) {
    return false;
  }

  return (
    normalizedHostname === normalizedBlockedHostname ||
    normalizedHostname.endsWith(`.${normalizedBlockedHostname}`)
  );
}

async function readCombinedBlocklists() {
  const data = await chrome.storage.local.get([
    PERSONAL_BLOCKED_WEBSITES_KEY,
    ORG_BLOCKED_WEBSITES_KEY,
  ]);

  const personal = Array.isArray(data[PERSONAL_BLOCKED_WEBSITES_KEY])
    ? data[PERSONAL_BLOCKED_WEBSITES_KEY]
    : [];
  const org = Array.isArray(data[ORG_BLOCKED_WEBSITES_KEY]) ? data[ORG_BLOCKED_WEBSITES_KEY] : [];

  return {
    personal: dedupeAndSort(personal),
    org: dedupeAndSort(org),
  };
}

async function getBlockedHostnameSet() {
  const { personal, org } = await readCombinedBlocklists();
  return new Set([...personal, ...org]);
}

function pruneRecentMap(map, windowMs) {
  const now = Date.now();

  for (const [existingKey, timestamp] of map.entries()) {
    if (now - timestamp > windowMs) {
      map.delete(existingKey);
    }
  }
}

function shouldSkipRecentEnforcement(url, tabId) {
  pruneRecentMap(recentEnforcements, ENFORCEMENT_DEDUPE_WINDOW_MS);

  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentEnforcements.get(key);
  if (typeof previous === 'number' && now - previous < ENFORCEMENT_DEDUPE_WINDOW_MS) {
    return true;
  }

  recentEnforcements.set(key, now);
  return false;
}

function shouldSkipRecentRescan(url, tabId) {
  pruneRecentMap(recentRescans, RESCAN_DEDUPE_WINDOW_MS);

  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = recentRescans.get(key);
  if (typeof previous === 'number' && now - previous < RESCAN_DEDUPE_WINDOW_MS) {
    return true;
  }

  recentRescans.set(key, now);
  return false;
}

function isExtensionBlockedPage(url) {
  try {
    const parsed = new URL(url);
    const blockedPageUrl = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
    return parsed.href.startsWith(blockedPageUrl);
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

async function getMatchedBlockedHostname(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) {
      return null;
    }

    const blockedHostnames = await getBlockedHostnameSet();

    for (const blockedHostname of blockedHostnames) {
      if (hostnameMatchesBlockedHostname(hostname, blockedHostname)) {
        return hostname;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function redirectBlockedTab(url, tabId, hostname, source) {
  if (typeof tabId !== 'number' || tabId < 0) {
    return;
  }

  const blockedPageUrl = buildBlockedPageUrl(url, hostname, source);

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.url !== url) {
      return;
    }

    await chrome.tabs.update(tabId, { url: blockedPageUrl });
  } catch (error) {
    console.error('Failed to redirect blocked tab', {
      url,
      tabId,
      hostname,
      source,
      error,
    });
  }
}

async function enforceBlockedTab(url, tabId, source = 'unknown') {
  try {
    if (typeof tabId !== 'number' || tabId < 0 || !url || isExtensionBlockedPage(url)) {
      return;
    }

    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return;
    }

    const hostname = await getMatchedBlockedHostname(url);
    if (!hostname) {
      return;
    }

    if (shouldSkipRecentEnforcement(url, tabId)) {
      return;
    }

    await redirectBlockedTab(url, tabId, hostname, source);
  } catch (error) {
    console.error('Failed to enforce blocked tab', { url, tabId, source, error });
  }
}

async function doRescanOpenTabs(reason = 'rescan') {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || !tab.url || isExtensionBlockedPage(tab.url)) {
        return;
      }

      if (shouldSkipRecentRescan(tab.url, tab.id)) {
        return;
      }

      await enforceBlockedTab(tab.url, tab.id, reason);
    })
  );
}

function rescanOpenTabs(reason = 'rescan') {
  if (!rescanInFlight) {
    rescanInFlight = doRescanOpenTabs(reason).finally(() => {
      rescanInFlight = null;
    });
  }

  return rescanInFlight;
}

async function initializeBlocking() {
  try {
    await chrome.storage.local.remove('websiteActivityLog');
    await rescanOpenTabs('initializeBlocking');
  } catch (error) {
    console.error('Failed to initialize JS blocking', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  void initializeBlocking();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  void initializeBlocking();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes[PERSONAL_BLOCKED_WEBSITES_KEY] || changes[ORG_BLOCKED_WEBSITES_KEY]) {
    void rescanOpenTabs('storage.onChanged').catch((error) => {
      console.error('Failed to rescan blocked tabs after storage change', error);
    });
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !details.url) {
    return;
  }

  void enforceBlockedTab(details.url, details.tabId, 'onCommitted');
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0 || !details.url) {
    return;
  }

  void enforceBlockedTab(details.url, details.tabId, 'onHistoryStateUpdated');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }

  void enforceBlockedTab(changeInfo.url, tabId, 'tabs.onUpdated');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SYNC_BLOCKING_RULES' || message?.type === 'RESCAN_BLOCKED_TABS') {
    rescanOpenTabs('runtime.onMessage')
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('Failed to rescan blocked tabs from message', error);
        sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' });
      });

    return true;
  }

  return false;
});

console.log('Background service worker running with JS-only blocking');
void initializeBlocking();
