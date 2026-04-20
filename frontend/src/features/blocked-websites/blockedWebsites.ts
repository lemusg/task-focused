type ChromeStorage = {
  local: {
    set: (items: Record<string, unknown>) => Promise<void>;
    get: (key: string | string[]) => Promise<Record<string, unknown>>;
  };
};

type ChromeRuntime = {
  sendMessage?: (message: Record<string, unknown>) => Promise<unknown>;
};

type ChromeApi = {
  storage?: ChromeStorage;
  runtime?: ChromeRuntime;
};

export const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
export const ORG_BLOCKED_WEBSITES_KEY = 'orgBlockedWebsites';
const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome;

// Normalize popup input into the hostname format used everywhere else.
export function normalizeWebsite(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Enter a website to block.');
  }

  const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!parsed.hostname) {
    throw new Error('Enter a valid website.');
  }

  // Reject hostnames that are too incomplete to match reliably.
  if (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
    throw new Error('Enter a valid website.');
  }

  // Strip trailing dots and common www. prefixes for stable storage.
  const hostnameWithoutTrailingDot = parsed.hostname.replace(/\.+$/, '');
  const hostname = hostnameWithoutTrailingDot.startsWith('www.')
    ? hostnameWithoutTrailingDot.slice(4)
    : hostnameWithoutTrailingDot;

  return hostname;
}

// Keep stored lists unique, sorted, and limited to string values.
function sanitizeWebsiteList(websites: unknown): string[] {
  if (!Array.isArray(websites)) {
    return [];
  }

  return [...new Set(websites.filter((item): item is string => typeof item === 'string'))].sort(
    (a, b) => a.localeCompare(b)
  );
}

// Load the personal blocklist from extension storage.
export async function loadPersonalBlockedWebsites(): Promise<string[]> {
  if (!chromeApi?.storage?.local) {
    return [];
  }

  const data = await chromeApi.storage.local.get(PERSONAL_BLOCKED_WEBSITES_KEY);
  return sanitizeWebsiteList(data[PERSONAL_BLOCKED_WEBSITES_KEY]);
}

// Save the personal blocklist in normalized order.
export async function savePersonalBlockedWebsites(websites: string[]) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({
      [PERSONAL_BLOCKED_WEBSITES_KEY]: sanitizeWebsiteList(websites),
    });
  }
}

// Load the org blocklist cached in extension storage.
export async function loadOrgBlockedWebsites(): Promise<string[]> {
  if (!chromeApi?.storage?.local) {
    return [];
  }

  const data = await chromeApi.storage.local.get(ORG_BLOCKED_WEBSITES_KEY);
  return sanitizeWebsiteList(data[ORG_BLOCKED_WEBSITES_KEY]);
}

// Save the org blocklist used by the background worker.
export async function saveOrgBlockedWebsites(websites: string[]) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [ORG_BLOCKED_WEBSITES_KEY]: sanitizeWebsiteList(websites) });
  }
}

// Clear the org blocklist when a user signs out or leaves an org.
export async function clearOrgBlockedWebsites() {
  await saveOrgBlockedWebsites([]);
}

// Ask the background worker to re-evaluate open tabs after blocklist changes.
export async function syncBlockingRules() {
  try {
    await chromeApi?.runtime?.sendMessage?.({ type: 'RESCAN_BLOCKED_TABS' });
  } catch {
    // Storage change events usually trigger the same refresh path.
  }
}
