const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
const ORG_BLOCKED_WEBSITES_KEY = 'orgBlockedWebsites';
const DYNAMIC_RULE_ID_BASE = 1000;

function normalizeHostname(input) {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function dedupeAndSort(hostnames) {
  return [...new Set(hostnames.map(normalizeHostname).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function buildRule(id, hostname) {
  return {
    id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      requestDomains: [hostname],
      resourceTypes: ['main_frame'],
    },
  };
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

async function syncDynamicRules() {
  const { personal, org } = await readCombinedBlocklists();
  const combined = dedupeAndSort([...personal, ...org]);

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules
    .map((rule) => rule.id)
    .filter((id) => id >= DYNAMIC_RULE_ID_BASE);

  const rulesToAdd = combined.map((hostname, index) =>
    buildRule(DYNAMIC_RULE_ID_BASE + index, hostname)
  );

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIdsToRemove,
    addRules: rulesToAdd,
  });

  console.log('Synced blocked website rules', {
    personalCount: personal.length,
    orgCount: org.length,
    combinedCount: combined.length,
  });
}

async function initializeBlocking() {
  try {
    await syncDynamicRules();
  } catch (error) {
    console.error('Failed to initialize blocking rules', error);
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
    void syncDynamicRules();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SYNC_BLOCKING_RULES') {
    return false;
  }

  syncDynamicRules()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error('Failed to sync blocking rules from message', error);
      sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' });
    });

  return true;
});

console.log('Background service worker running');
void initializeBlocking();
