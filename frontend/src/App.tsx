import { useEffect, useState } from 'react';
import { BlockedWebsitesPage } from './features/blocked-websites/BlockedWebsitesPage';
import { PersonalBlockedWebsitesPage } from './features/blocked-websites/PersonalBlockedWebsitesPage';
import './App.css';
import {
  clearOrgBlockedWebsites,
  loadOrgBlockedWebsites,
  loadPersonalBlockedWebsites,
  normalizeWebsite,
  saveOrgBlockedWebsites,
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
  joinOrganization,
  leaveOrganization,
  loadOrganizationByUser,
  removeWebsiteFromBlocklist,
  type OrganizationData,
} from './features/organization/organizationApi';
import { upsertOAuthUser } from './features/users/usersApi';

type View = 'home' | 'blocked-websites' | 'organization';

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const authDebugLoggingEnabled = import.meta.env.DEV;

function debugAuthLog(message?: unknown, ...optionalParams: unknown[]) {
  if (!authDebugLoggingEnabled) {
    return;
  }

  console.log(message, ...optionalParams);
}

function App() {
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [view, setView] = useState<View>('home');
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [organizationNameInput, setOrganizationNameInput] = useState<string>('');
  const [joinOrganizationIdInput, setJoinOrganizationIdInput] = useState<string>('');
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [personalWebsiteInput, setPersonalWebsiteInput] = useState<string>('');
  const [personalBlockedWebsites, setPersonalBlockedWebsites] = useState<string[]>([]);
  const [orgWebsiteInput, setOrgWebsiteInput] = useState<string>('');
  const [orgBlockedWebsites, setOrgBlockedWebsites] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const role = isAdmin ? 'admin' : 'member';

  async function refreshOrganizationForUser(userId: string, authToken: string) {
    if (!userId || !authToken) {
      setOrganization(null);
      setOrgBlockedWebsites([]);
      setIsAdmin(false);
      return;
    }

    try {
      const payload = await loadOrganizationByUser(backendUrl, userId, authToken);
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
    let isMounted = true;

    async function initialize() {
      try {
        const [savedToken, personalWebsites, orgWebsites] = await Promise.all([
          loadSavedToken(),
          loadPersonalBlockedWebsites(),
          loadOrgBlockedWebsites(),
        ]);

        let nextEmail = '';
        try {
          nextEmail = await getProfileEmail();
        } catch (error) {
          console.error('getProfileEmail failed during initialization:', error);
        }

        if (!isMounted) {
          return;
        }

        setPersonalBlockedWebsites(personalWebsites);
        setOrgBlockedWebsites(orgWebsites);
        setEmail(nextEmail);

        if (savedToken) {
          setToken(savedToken);
          setStatus((currentStatus) =>
            currentStatus === 'Ready'
              ? 'Loaded existing identity token from storage.'
              : currentStatus
          );

          void upsertOAuthUser(backendUrl, savedToken).catch((error) => {
            console.error('upsertOAuthUser failed during initialization:', error);
          });

          if (nextEmail) {
            void refreshOrganizationForUser(nextEmail, savedToken).catch((error) => {
              console.error('initialize org refresh failed:', error);
            });
          } else {
            setOrganization(null);
            setOrgBlockedWebsites([]);
            setIsAdmin(false);
          }
        } else {
          setOrganization(null);
          setOrgBlockedWebsites([]);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('initialize failed:', error);
        setStatus(error instanceof Error ? error.message : 'Initialization failed');
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }

    void initialize();
    return () => {
      isMounted = false;
    };
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
      debugAuthLog('signIn started');

      const nextToken = await getAuthToken(true);
      debugAuthLog('token received:', !!nextToken);

      await saveToken(nextToken);
      debugAuthLog('token saved');

      let profileEmail = '';
      try {
        profileEmail = await getProfileEmail();
        debugAuthLog('profileEmail:', profileEmail);
      } catch (error) {
        console.error('getProfileEmail failed during signIn:', error);
      }

      setToken(nextToken);
      setEmail(profileEmail);
      setStatus('Signed in with Google.');

      if (profileEmail) {
        void upsertOAuthUser(backendUrl, nextToken)
          .then(() => refreshOrganizationForUser(profileEmail, nextToken))
          .catch((error) => {
            console.error('upsertOAuthUser failed during signIn:', error);
            setStatus(
              error instanceof Error
                ? error.message
                : 'Sign-in succeeded but failed to sync user with backend.'
            );
          });
      } else {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('signIn error:', error);
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
    await clearOrgBlockedWebsites();
    setToken('');
    setEmail('');
    setOrganizationNameInput('');
    setJoinOrganizationIdInput('');
    setOrganization(null);
    setOrgBlockedWebsites([]);
    setIsAdmin(false);
    setStatus('Signed out and token cleared.');
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
      if (!token) {
        setStatus('Sign in first to edit the organization blocklist.');
        return;
      }

      if (!organization) {
        setStatus('Create an organization first.');
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
        token,
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
    if (!token) {
      setStatus('Sign in first to edit the organization blocklist.');
      return;
    }

    if (!organization) {
      setStatus('Create an organization first.');
      return;
    }

    if (!isAdmin) {
      setStatus('Only organization admins can edit blocklist.');
      return;
    }

    try {
      const payload = await removeWebsiteFromBlocklist(backendUrl, organization.id, token, website);
      setOrgBlockedWebsites(payload.blockedWebsites);
      setStatus(`Removed ${website} from org blocked websites.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove website.';
      setStatus(message);
    }
  }

  async function createOrganizationForCurrentUser() {
    const nextOrgName = organizationNameInput.trim();
    if (!token) {
      setStatus('Sign in first to create an organization.');
      return;
    }

    if (!nextOrgName) {
      setStatus('Enter an organization name.');
      return;
    }

    try {
      const payload = await createOrganization(backendUrl, token, nextOrgName);
      setOrganization(payload.organization);
      setIsAdmin(true);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setOrganizationNameInput('');
      setJoinOrganizationIdInput('');
      setStatus(`Organization ${payload.organization.name} created.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create organization.';
      setStatus(message);
    }
  }


  async function joinOrganizationForCurrentUser() {
    const nextOrganizationId = joinOrganizationIdInput.trim();
    if (!token) {
      setStatus('Sign in first to join an organization.');
      return;
    }

    if (!nextOrganizationId) {
      setStatus('Enter an organization ID.');
      return;
    }

    try {
      const payload = await joinOrganization(backendUrl, token, nextOrganizationId);
      setOrganization(payload.organization);
      setIsAdmin(payload.isAdmin);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setJoinOrganizationIdInput('');
      setView('organization');
      setStatus(`Joined organization ${payload.organization.name} as a member.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join organization.';
      setStatus(message);
    }
  }

  async function leaveCurrentOrganization() {
    if (!token || !organization) {
      setStatus('No organization to leave.');
      return;
    }

    const confirmed = globalThis.confirm('Are you sure you want to leave this organization?');
    if (!confirmed) {
      return;
    }

    try {
      const payload = await leaveOrganization(backendUrl, organization.id, token);
      setOrganization(null);
      setIsAdmin(false);
      setOrgBlockedWebsites([]);
      setOrgWebsiteInput('');
      setJoinOrganizationIdInput('');
      await clearOrgBlockedWebsites();
      setView('home');
      setStatus(payload.message ?? 'Left organization.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not leave organization.';
      setStatus(message);
    }
  }

  useEffect(() => {
    void saveOrgBlockedWebsites(orgBlockedWebsites);
  }, [orgBlockedWebsites]);

  const headerLabel = token
    ? view === 'home'
      ? 'Home'
      : view === 'blocked-websites'
        ? 'Blocked websites'
        : 'Organization'
    : 'Sign in';

  if (isInitializing) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <span className="app-logo">TaskFocused</span>
          <span className="divider-dot" />
          <span className="header-label">{headerLabel}</span>
        </header>
        <div className="card user-home-actions">
          <h1>TaskFocused</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (token) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <span className="app-logo">TaskFocused</span>
          <span className="divider-dot" />
          <span className="header-label">{headerLabel}</span>
        </header>

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
              hasOrganization={Boolean(organization)}
              organizationNameInput={organizationNameInput}
              joinOrganizationIdInput={joinOrganizationIdInput}
              onSignOut={signOut}
              onOrganizationNameInputChange={setOrganizationNameInput}
              onJoinOrganizationIdInputChange={setJoinOrganizationIdInput}
              onCreateOrganization={() => {
                void createOrganizationForCurrentUser();
              }}
              onJoinOrganization={() => {
                void joinOrganizationForCurrentUser();
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
              <p>Org ID: {organization.id}</p>
              <p>Role: {role}</p>
              <BlockedWebsitesPage
                websiteInput={orgWebsiteInput}
                blockedWebsites={orgBlockedWebsites}
                canManage={false}
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
          ) : (
            <>
              <h2>Organization</h2>
              <p>Organization: {organization.name}</p>
              <p>Org ID: {organization.id}</p>
              <p>Role: {role}</p>
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

          <div className="status-line">{status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">TaskFocused</span>
        <span className="divider-dot" />
        <span className="header-label">{headerLabel}</span>
      </header>
      <div className="card user-home-actions">
        <h1>TaskFocused</h1>
        <button onClick={() => void signIn()}>Login</button>
        <div className="status-line">{status}</div>
      </div>
    </div>
  );
}

export default App;
