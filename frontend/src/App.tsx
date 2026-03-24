import { useEffect, useState } from 'react';
import { BlockedWebsitesPage } from './features/blocked-websites/BlockedWebsitesPage';
import { PersonalBlockedWebsitesPage } from './features/blocked-websites/PersonalBlockedWebsitesPage';
import {
  loadPersonalBlockedWebsites,
  normalizeWebsite,
  savePersonalBlockedWebsites,
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
import {
  addWebsiteToBlocklist,
  createOrganization,
  leaveOrganization,
  loadOrganizationByUser,
  removeWebsiteFromBlocklist,
  type OrganizationData,
} from './features/organization/organizationApi';
import { upsertOAuthUser } from './features/users/usersApi';

type View = 'home' | 'blocked-websites' | 'organization';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [view, setView] = useState<View>('home');
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [organizationNameInput, setOrganizationNameInput] = useState<string>('');
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [personalWebsiteInput, setPersonalWebsiteInput] = useState<string>('');
  const [personalBlockedWebsites, setPersonalBlockedWebsites] = useState<string[]>([]);
  const [orgWebsiteInput, setOrgWebsiteInput] = useState<string>('');
  const [orgBlockedWebsites, setOrgBlockedWebsites] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready');

  async function refreshOrganizationForUser(userId: string) {
    if (!userId) {
      return;
    }

    try {
      const payload = await loadOrganizationByUser(backendUrl, userId);
      if (!payload) {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
        return;
      }

      setOrganization(payload.organization);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setIsAdmin(payload.isAdmin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load organization.';
      setStatus(message);
    }
  }

  useEffect(() => {
    loadSavedToken().then((savedToken) => {
      if (savedToken) {
        setToken(savedToken);
        setStatus('Loaded existing identity token from storage.');
      }
    });
    loadPersonalBlockedWebsites().then(setPersonalBlockedWebsites);
    getProfileEmail().then((nextEmail) => {
      setEmail(nextEmail);
      if (nextEmail) {
        void upsertOAuthUser(backendUrl, nextEmail).catch(() => {
          // Ignore background sync errors here; sign-in path shows actionable status.
        });
      }
      void refreshOrganizationForUser(nextEmail);
    });
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
      if (profileEmail) {
        await upsertOAuthUser(backendUrl, profileEmail);
      }
      setEmail(profileEmail);
      await refreshOrganizationForUser(profileEmail);
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
    setOrganization(null);
    setOrgBlockedWebsites([]);
    setIsAdmin(false);
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

  async function addPersonalBlockedWebsite() {
    try {
      const normalizedWebsite = normalizeWebsite(personalWebsiteInput);
      if (personalBlockedWebsites.includes(normalizedWebsite)) {
        setStatus(`${normalizedWebsite} is already in your personal blocked websites.`);
        return;
      }

      const nextWebsites = [...personalBlockedWebsites, normalizedWebsite].sort((a, b) =>
        a.localeCompare(b)
      );
      await savePersonalBlockedWebsites(nextWebsites);
      setPersonalBlockedWebsites(nextWebsites);
      setPersonalWebsiteInput('');
      setStatus(`Added ${normalizedWebsite} to personal blocked websites.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add website.';
      setStatus(message);
    }
  }

  async function removePersonalBlockedWebsite(website: string) {
    const nextWebsites = personalBlockedWebsites.filter((item) => item !== website);
    await savePersonalBlockedWebsites(nextWebsites);
    setPersonalBlockedWebsites(nextWebsites);
    setStatus(`Removed ${website} from personal blocked websites.`);
  }

  async function addOrgBlockedWebsite() {
    try {
      if (!organization) {
        setStatus('Create an organization first.');
        return;
      }

      if (!email) {
        setStatus('Sign in first to edit the organization blocklist.');
        return;
      }

      if (!isAdmin) {
        setStatus('Only organization admins can edit blocklist.');
        return;
      }

      const normalizedWebsite = normalizeWebsite(orgWebsiteInput);
      const payload = await addWebsiteToBlocklist(
        backendUrl,
        organization.id,
        email,
        normalizedWebsite
      );

      setOrgBlockedWebsites(payload.blockedWebsites);
      setOrgWebsiteInput('');
      setStatus(`Added ${normalizedWebsite} to org blocked websites.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add website.';
      setStatus(message);
    }
  }

  async function removeOrgBlockedWebsite(website: string) {
    if (!organization) {
      setStatus('Create an organization first.');
      return;
    }

    if (!email) {
      setStatus('Sign in first to edit the organization blocklist.');
      return;
    }

    if (!isAdmin) {
      setStatus('Only organization admins can edit blocklist.');
      return;
    }

    try {
      const payload = await removeWebsiteFromBlocklist(backendUrl, organization.id, email, website);
      setOrgBlockedWebsites(payload.blockedWebsites);
      setStatus(`Removed ${website} from org blocked websites.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove website.';
      setStatus(message);
    }
  }

  async function createOrganizationForCurrentUser() {
    const nextOrgName = organizationNameInput.trim();
    if (!email) {
      setStatus('Sign in first to create an organization.');
      return;
    }

    if (!nextOrgName) {
      setStatus('Enter an organization name.');
      return;
    }

    try {
      const payload = await createOrganization(backendUrl, email, nextOrgName);
      setOrganization(payload.organization);
      setIsAdmin(true);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setOrganizationNameInput('');
      setStatus(`Organization ${payload.organization.name} created.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create organization.';
      setStatus(message);
    }
  }

  async function leaveCurrentOrganization() {
    if (!organization || !email) {
      setStatus('No organization to leave.');
      return;
    }

    const confirmed = globalThis.confirm('Are you sure you want to leave this organization?');
    if (!confirmed) {
      return;
    }

    try {
      const payload = await leaveOrganization(backendUrl, organization.id, email);
      setOrganization(null);
      setIsAdmin(false);
      setOrgBlockedWebsites([]);
      setOrgWebsiteInput('');
      setView('home');
      setStatus(payload.message ?? 'Left organization.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not leave organization.';
      setStatus(message);
    }
  }

  return (
    <>
      <h1>Task Focused</h1>
      <div className="view-switch">
        <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
          Home
        </button>
        <button
          className={view === 'blocked-websites' ? 'active' : ''}
          onClick={() => setView('blocked-websites')}
        >
          Blocked websites
        </button>
        {organization ? (
          <button
            className={view === 'organization' ? 'active' : ''}
            onClick={() => setView('organization')}
          >
            Organization
          </button>
        ) : null}
      </div>
      <div className="card">
        {view === 'home' ? (
          <HomePage
            email={email}
            token={token}
            organizationNameInput={organizationNameInput}
            organizationName={organization?.name ?? ''}
            isAdmin={isAdmin}
            onPingBackend={pingBackend}
            onPingDb={pingDb}
            onSignIn={signIn}
            onSignOut={signOut}
            onOrganizationNameInputChange={setOrganizationNameInput}
            onCreateOrganization={() => {
              void createOrganizationForCurrentUser();
            }}
          />
        ) : view === 'blocked-websites' ? (
          <PersonalBlockedWebsitesPage
            websiteInput={personalWebsiteInput}
            blockedWebsites={personalBlockedWebsites}
            onInputChange={setPersonalWebsiteInput}
            onAddWebsite={() => {
              void addPersonalBlockedWebsite();
            }}
            onRemoveWebsite={(website) => {
              void removePersonalBlockedWebsite(website);
            }}
          />
        ) : !organization ? (
          <>
            <h2>Organization</h2>
            <p>No organization yet. Create one from the Home screen.</p>
          </>
        ) : !isAdmin ? (
          <>
            <h2>Organization</h2>
            <p>Organization: {organization.name}</p>
            <p>Only admins can view org blocked websites.</p>
            <button className="leave-org-button" onClick={() => void leaveCurrentOrganization()}>
              Leave organization
            </button>
          </>
        ) : (
          <>
            <BlockedWebsitesPage
              websiteInput={orgWebsiteInput}
              blockedWebsites={orgBlockedWebsites}
              canManage={true}
              organizationName={organization.name}
              onInputChange={setOrgWebsiteInput}
              onAddWebsite={() => {
                void addOrgBlockedWebsite();
              }}
              onRemoveWebsite={(website) => {
                void removeOrgBlockedWebsite(website);
              }}
            />
            <button className="leave-org-button" onClick={() => void leaveCurrentOrganization()}>
              Leave organization
            </button>
          </>
        )}
        <p>{status}</p>
      </div>
    </>
  );
}

export default App;
