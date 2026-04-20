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
      console.error('Failed to load organization:', error);
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
        console.error(
          `Set extension/manifest.json oauth2.client_id to a real Google OAuth client. Redirect URI must include https://${extensionId}.chromiumapp.org/`
        );
        return;
      }

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

      if (profileEmail) {
        void upsertOAuthUser(backendUrl, nextToken)
          .then(() => refreshOrganizationForUser(profileEmail, nextToken))
          .catch((error) => {
            console.error('upsertOAuthUser failed during signIn:', error);
          });
      } else {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('signIn error:', error);
    }
  }

  async function signOut() {
    if (!token) {
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
  }

  async function addPersonalBlockedWebsite() {
    try {
      const normalizedWebsite = normalizeWebsite(personalWebsiteInput);
      if (personalBlockedWebsites.includes(normalizedWebsite)) {
        return;
      }

      const nextWebsites = [...personalBlockedWebsites, normalizedWebsite].sort((a, b) =>
        a.localeCompare(b)
      );
      await savePersonalBlockedWebsites(nextWebsites);
      setPersonalBlockedWebsites(nextWebsites);
      setPersonalWebsiteInput('');
    } catch (error) {
      console.error('Could not add website:', error);
    }
  }

  async function removePersonalBlockedWebsite(website: string) {
    const nextWebsites = personalBlockedWebsites.filter((item) => item !== website);
    await savePersonalBlockedWebsites(nextWebsites);
    setPersonalBlockedWebsites(nextWebsites);
  }

  async function addOrgBlockedWebsite() {
    try {
      if (!token) {
        return;
      }

      if (!organization) {
        return;
      }

      if (!isAdmin) {
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
    } catch (error) {
      console.error('Could not add org blocked website:', error);
    }
  }

  async function removeOrgBlockedWebsite(website: string) {
    if (!token) {
      return;
    }

    if (!organization) {
      return;
    }

    if (!isAdmin) {
      return;
    }

    try {
      const payload = await removeWebsiteFromBlocklist(backendUrl, organization.id, token, website);
      setOrgBlockedWebsites(payload.blockedWebsites);
    } catch (error) {
      console.error('Could not remove org blocked website:', error);
    }
  }

  async function createOrganizationForCurrentUser() {
    const nextOrgName = organizationNameInput.trim();
    if (!token) {
      return;
    }

    if (!nextOrgName) {
      return;
    }

    try {
      const payload = await createOrganization(backendUrl, token, nextOrgName);
      setOrganization(payload.organization);
      setIsAdmin(true);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setOrganizationNameInput('');
      setJoinOrganizationIdInput('');
    } catch (error) {
      console.error('Could not create organization:', error);
    }
  }


  async function joinOrganizationForCurrentUser() {
    const nextOrganizationId = joinOrganizationIdInput.trim();
    if (!token) {
      return;
    }

    if (!nextOrganizationId) {
      return;
    }

    try {
      const payload = await joinOrganization(backendUrl, token, nextOrganizationId);
      setOrganization(payload.organization);
      setIsAdmin(payload.isAdmin);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setJoinOrganizationIdInput('');
      setView('organization');
    } catch (error) {
      console.error('Could not join organization:', error);
    }
  }

  async function leaveCurrentOrganization() {
    if (!token || !organization) {
      return;
    }

    const confirmed = globalThis.confirm('Are you sure you want to leave this organization?');
    if (!confirmed) {
      return;
    }

    try {
      await leaveOrganization(backendUrl, organization.id, token);
      setOrganization(null);
      setIsAdmin(false);
      setOrgBlockedWebsites([]);
      setOrgWebsiteInput('');
      setJoinOrganizationIdInput('');
      await clearOrgBlockedWebsites();
      setView('home');
    } catch (error) {
      console.error('Could not leave organization:', error);
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
      </div>
    </div>
  );
}

export default App;
