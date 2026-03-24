type ChromeStorage = {
  local: {
    set: (items: Record<string, unknown>) => Promise<void>;
    get: (key: string) => Promise<Record<string, unknown>>;
  };
};

type ChromeApi = {
  storage?: ChromeStorage;
};

const PERSONAL_BLOCKED_WEBSITES_KEY = 'personalBlockedWebsites';
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

  return parsed.hostname;
}

export async function loadPersonalBlockedWebsites(): Promise<string[]> {
  if (!chromeApi?.storage?.local) {
    return [];
  }

  const data = await chromeApi.storage.local.get(PERSONAL_BLOCKED_WEBSITES_KEY);
  const websites = data[PERSONAL_BLOCKED_WEBSITES_KEY];

  if (!Array.isArray(websites)) {
    return [];
  }

  return websites.filter((item): item is string => typeof item === 'string');
}

export async function savePersonalBlockedWebsites(websites: string[]) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [PERSONAL_BLOCKED_WEBSITES_KEY]: websites });
  }
}