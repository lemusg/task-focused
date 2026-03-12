import { useEffect, useState } from 'react';

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
    set: (items: Record<string, string>) => Promise<void>;
    get: (key: string) => Promise<Record<string, unknown>>;
    remove: (key: string) => Promise<void>;
  };
};

type ChromeApi = {
  identity?: ChromeIdentity;
  runtime?: ChromeRuntime;
  storage?: ChromeStorage;
};

const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome;

const backendUrl = import.meta.env.VITE_BACKEND_URL;

async function saveToken(token: string) {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ authToken: token });
  }
}

async function loadSavedToken() {
  if (!chromeApi?.storage?.local) {
    return null;
  }

  const data = await chromeApi.storage.local.get('authToken');
  return (data.authToken as string | undefined) ?? null;
}

async function clearSavedToken() {
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.remove('authToken');
  }
}

function getAuthToken(interactive: boolean): Promise<string> {
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

function getProfileEmail(): Promise<string> {
  return new Promise((resolve) => {
    if (!chromeApi?.identity) {
      resolve('');
      return;
    }

    // Use ANY so dev profiles without Chrome Sync can still return account info.
    chromeApi.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      resolve(info.email ?? '');
    });
  });
}

function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!chromeApi?.identity) {
      resolve();
      return;
    }

    chromeApi.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

function App() {
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready');

  useEffect(() => {
    loadSavedToken().then((savedToken) => {
      if (savedToken) {
        setToken(savedToken);
        setStatus('Loaded existing identity token from storage.');
      }
    });
    getProfileEmail().then(setEmail);
  }, []);

  async function signIn() {
    try {
      const clientId = chromeApi?.runtime?.getManifest?.().oauth2?.client_id ?? '';
      if (
        !clientId ||
        clientId.includes('YOUR_GOOGLE_OAUTH_CLIENT_ID') ||
        !clientId.endsWith('.apps.googleusercontent.com')
      ) {
        const extensionId = chromeApi?.runtime?.id ?? '<your-extension-id>';
        setStatus(
          `Set extension/manifest.json oauth2.client_id to a real Google OAuth client. Redirect URI must include https://${extensionId}.chromiumapp.org/`
        );
        return;
      }

      setStatus('Opening Google sign-in...');
      const nextToken = await getAuthToken(true);
      await saveToken(nextToken);
      const profileEmail = await getProfileEmail();
      setEmail(profileEmail);
      setToken(nextToken);
      setStatus('Signed in with chrome.identity token.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed';
      setStatus(message);
    }
  }

  async function signOut() {
    if (!token) {
      setStatus('No active token.');
      return;
    }

    await removeCachedToken(token);
    await clearSavedToken();
    setToken('');
    setStatus('Signed out and token cleared.');
  }

  async function pingBackend() {
    try {
      const res = await fetch(`${backendUrl}/api/ping`);
      const data = (await res.json()) as { message?: string };
      setStatus(data.message ?? 'Backend connected');
    } catch {
      setStatus('Ping failed');
    }
  }

  async function pingDb() {
    try {
      const res = await fetch(`${backendUrl}/api/ping-db`);
      const data = (await res.json()) as { message?: string };
      setStatus(data.message ?? 'Database connected');
    } catch {
      setStatus('Ping DB failed');
    }
  }

  return (
    <>
      <h1>Task Focused</h1>
      <div className="card">
        <button onClick={pingBackend}>Ping backend</button>
        <button onClick={pingDb}>Ping database</button>
        <button onClick={signIn}>Sign in with Google</button>
        <button onClick={signOut}>Sign out</button>
        <p>{status}</p>
        <p>{email ? `Email: ${email}` : 'No profile email available'}</p>
        <p>{token ? `Token saved (${token.slice(0, 14)}...)` : 'No token saved yet'}</p>
        <p>
          Edit <code>src/App.tsx</code>
        </p>
        <p>run 'npm run build'</p>
        <p>reload extension to see changes</p>
      </div>
    </>
  );
}

export default App;
