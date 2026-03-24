type ProfileInfo = {
  email?: string;
};

type ChromeIdentity = {
  getAuthToken: (
    details: { interactive: boolean },
    callback: (token?: string) => void
  ) => void;
  removeCachedAuthToken: (
    details: { token: string },
    callback: () => void
  ) => void;
  getProfileUserInfo: (
    details: { accountStatus: 'ANY' | 'SYNC' },
    callback: (info: ProfileInfo) => void
  ) => void;
};

type ChromeRuntime = {
  lastError?: { message?: string };
  id?: string;
  getManifest?: () => {
    oauth2?: {
      client_id?: string;
    };
  };
};

type ChromeStorage = {
  local: {
    set: (items: Record<string, unknown>) => Promise<void>;
    get: (key: string) => Promise<Record<string, unknown>>;
    remove: (key: string) => Promise<void>;
  };
};

type ChromeApi = {
  identity?: ChromeIdentity;
  runtime?: ChromeRuntime;
  storage?: ChromeStorage;
};

const AUTH_TOKEN_KEY = 'authToken';
const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome;

export async function saveToken(token: string) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [AUTH_TOKEN_KEY]: token });
  }
}

export async function loadSavedToken() {
  if (!chromeApi?.storage?.local) {
    return null;
  }

  const data = await chromeApi.storage.local.get(AUTH_TOKEN_KEY);
  return (data[AUTH_TOKEN_KEY] as string | undefined) ?? null;
}

export async function clearSavedToken() {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.remove(AUTH_TOKEN_KEY);
  }
}

export function getOAuthClientId() {
  return chromeApi?.runtime?.getManifest?.().oauth2?.client_id ?? '';
}

export function getExtensionId() {
  return chromeApi?.runtime?.id ?? '<your-extension-id>';
}

export function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!chromeApi?.identity || !chromeApi.runtime) {
      reject(new Error('chrome.identity is not available in this context.'));
      return;
    }

    chromeApi.identity.getAuthToken({ interactive }, (token) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message ?? 'Auth failed'));
        return;
      }

      if (!token) {
        reject(new Error('No token returned by chrome.identity'));
        return;
      }

      resolve(token);
    });
  });
}

export function getProfileEmail(): Promise<string> {
  return new Promise((resolve) => {
    if (!chromeApi?.identity) {
      resolve('');
      return;
    }

    chromeApi.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      resolve(info.email ?? '');
    });
  });
}

export function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!chromeApi?.identity) {
      resolve();
      return;
    }

    chromeApi.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}