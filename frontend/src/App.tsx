import { useEffect, useState } from 'react';
import { BlockedWebsitesPage } from './features/blocked-websites/BlockedWebsitesPage';
import {
  loadBlockedWebsites,
  normalizeWebsite,
  saveBlockedWebsites,
} from './features/blocked-websites/blockedWebsites';
import {
  clearSavedToken,
  getAuthToken,
  getExtensionId,
  getOAuthClientId,
  getProfileEmail,
  loadSavedToken,
  removeCachedToken,
  saveToken,
} from './features/auth/auth';
import { HomePage } from './features/home/HomePage';

type View = 'home' | 'blocked-websites';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [view, setView] = useState<View>('home');
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [websiteInput, setWebsiteInput] = useState<string>('');
  const [blockedWebsites, setBlockedWebsites] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready');

  useEffect(() => {
    loadSavedToken().then((savedToken) => {
      if (savedToken) {
        setToken(savedToken);
        setStatus('Loaded existing identity token from storage.');
      }
    });
    getProfileEmail().then(setEmail);
    loadBlockedWebsites().then(setBlockedWebsites);
  }, []);

  async function signIn() {
    try {
      const clientId = getOAuthClientId();
      if (
        !clientId ||
        clientId.includes('YOUR_GOOGLE_OAUTH_CLIENT_ID') ||
        !clientId.endsWith('.apps.googleusercontent.com')
      ) {
        const extensionId = getExtensionId();
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

  async function addBlockedWebsite() {
    try {
      const normalizedWebsite = normalizeWebsite(websiteInput);
      if (blockedWebsites.includes(normalizedWebsite)) {
        setStatus(`${normalizedWebsite} is already blocked.`);
        return;
      }

      const nextWebsites = [...blockedWebsites, normalizedWebsite].sort((a, b) =>
        a.localeCompare(b)
      );
      await saveBlockedWebsites(nextWebsites);
      setBlockedWebsites(nextWebsites);
      setWebsiteInput('');
      setStatus(`Added ${normalizedWebsite} to blocked websites.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add website.';
      setStatus(message);
    }
  }

  async function removeBlockedWebsite(website: string) {
    const nextWebsites = blockedWebsites.filter((item) => item !== website);
    await saveBlockedWebsites(nextWebsites);
    setBlockedWebsites(nextWebsites);
    setStatus(`Removed ${website} from blocked websites.`);
  }

  return (
    <>
      <h1>Task Focused</h1>
      <div className="view-switch">
        <button
          className={view === 'home' ? 'active' : ''}
          onClick={() => setView('home')}
        >
          Home
        </button>
        <button
          className={view === 'blocked-websites' ? 'active' : ''}
          onClick={() => setView('blocked-websites')}
        >
          Blocked websites
        </button>
      </div>
      <div className="card">
        {view === 'home' ? (
          <HomePage
            email={email}
            token={token}
            onPingBackend={pingBackend}
            onPingDb={pingDb}
            onSignIn={signIn}
            onSignOut={signOut}
          />
        ) : (
          <BlockedWebsitesPage
            websiteInput={websiteInput}
            blockedWebsites={blockedWebsites}
            onInputChange={setWebsiteInput}
            onAddWebsite={() => {
              void addBlockedWebsite();
            }}
            onRemoveWebsite={(website) => {
              void removeBlockedWebsite(website);
            }}
          />
        )}
        <p>{status}</p>
      </div>
    </>
  );
}

export default App;
