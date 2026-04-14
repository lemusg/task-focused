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

  if (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
    throw new Error('Enter a valid website.');
  }

  // Strip www. so stored hostnames are consistent with what background.js canonicalizes.
  const hostname = parsed.hostname.startsWith('www.')
    ? parsed.hostname.slice(4)
    : parsed.hostname;

  return hostname;
}

function sanitizeWebsiteList(websites: unknown): string[] {
  if (!Array.isArray(websites)) {
    return [];
  }

  return [...new Set(websites.filter((item): item is string => typeof item === 'string'))].sort(
    (a, b) => a.localeCompare(b)
  );
}

export async function loadPersonalBlockedWebsites(): Promise<string[]> {
  if (!chromeApi?.storage?.local) {
    return [];
  }

  const data = await chromeApi.storage.local.get(PERSONAL_BLOCKED_WEBSITES_KEY);
  return sanitizeWebsiteList(data[PERSONAL_BLOCKED_WEBSITES_KEY]);
}

export async function savePersonalBlockedWebsites(websites: string[]) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({
      [PERSONAL_BLOCKED_WEBSITES_KEY]: sanitizeWebsiteList(websites),
    });
  }
}

export async function loadOrgBlockedWebsites(): Promise<string[]> {
  if (!chromeApi?.storage?.local) {
    return [];
  }

  const data = await chromeApi.storage.local.get(ORG_BLOCKED_WEBSITES_KEY);
  return sanitizeWebsiteList(data[ORG_BLOCKED_WEBSITES_KEY]);
}

export async function saveOrgBlockedWebsites(websites: string[]) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [ORG_BLOCKED_WEBSITES_KEY]: sanitizeWebsiteList(websites) });
  }
}

export async function clearOrgBlockedWebsites() {
  await saveOrgBlockedWebsites([]);
}

export async function syncBlockingRules() {
  try {
    await chromeApi?.runtime?.sendMessage?.({ type: 'RESCAN_BLOCKED_TABS' });
  } catch {
    // Storage change listener in the background handles normal rescans.
  }
}
