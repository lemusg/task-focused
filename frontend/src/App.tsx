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
  clearSavedUserId,
  getAuthToken,
  getExtensionId,
  getOAuthClientId,
  getProfileEmail,
  loadSavedUserId,
  loadSavedToken,
  removeCachedToken,
  saveOrganizationContext,
  saveUserId,
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
  updateOrganizationAllowDuration,
  type OrganizationData,
} from './features/organization/organizationApi';
import { upsertOAuthUser } from './features/users/usersApi';

type View = 'home' | 'blocked-websites' | 'organization';

const authDebugLoggingEnabled = import.meta.env.DEV;

function getBackendUrl() {
  const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  return (configuredBackendUrl || 'http://localhost:8000').replace(/\/+$/, '');
}

const backendUrl = getBackendUrl();

// Only print auth debug logs during local development.
function debugAuthLog(message?: unknown, ...optionalParams: unknown[]) {
  if (!authDebugLoggingEnabled) {
    return;
  }

  console.log(message, ...optionalParams);
}

function App() {
  // Core popup state.
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [view, setView] = useState<View>('home');
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Organization form state.
  const [organizationNameInput, setOrganizationNameInput] = useState<string>('');
  const [joinOrganizationIdInput, setJoinOrganizationIdInput] = useState<string>('');
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [organizationAllowDurationMinutes, setOrganizationAllowDurationMinutes] = useState<number>(5);

  // Personal and org blocklist input state.
  const [personalWebsiteInput, setPersonalWebsiteInput] = useState<string>('');
  const [personalBlockedWebsites, setPersonalBlockedWebsites] = useState<string[]>([]);
  const [orgWebsiteInput, setOrgWebsiteInput] = useState<string>('');
  const [orgBlockedWebsites, setOrgBlockedWebsites] = useState<string[]>([]);
  const role = isAdmin ? 'admin' : 'member';

  // Refresh org membership and role for the signed-in user.
  async function refreshOrganizationForUser(userId: string, authToken: string) {
    if (!userId || !authToken) {
      setOrganization(null);
      setOrgBlockedWebsites([]);
      setIsAdmin(false);
      void saveOrganizationContext(null);
      return;
    }

    try {
      const payload = await loadOrganizationByUser(backendUrl, userId, authToken);
      if (!payload) {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
        void saveOrganizationContext(null);
        return;
      }

      setOrganization(payload.organization);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setIsAdmin(payload.isAdmin);
      const allowDurationMinutes = payload.organization.allowDurationMinutes ?? 5;
      setOrganizationAllowDurationMinutes(allowDurationMinutes);
      void saveOrganizationContext({
        organizationId: payload.organization.id,
        isAdmin: payload.isAdmin,
        allowDurationMinutes,
      });
    } catch (error) {
      console.error('Failed to load organization:', error);
    }
  }

  // Initial load pulls saved auth and both locally cached blocklists.
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const [savedToken, savedUserId, personalWebsites, orgWebsites] = await Promise.all([
          loadSavedToken(),
          loadSavedUserId(),
          loadPersonalBlockedWebsites(),
          loadOrgBlockedWebsites(),
        ]);

        let nextEmail = '';
        try {
          nextEmail = await getProfileEmail();
        } catch (error) {
          console.error('getProfileEmail failed during initialization:', error);
        }

        // Stop if the popup unmounted before the async work completed.
        if (!isMounted) {
          return;
        }

        setPersonalBlockedWebsites(personalWebsites);
        setOrgBlockedWebsites(orgWebsites);
        const resolvedUserId = nextEmail || savedUserId || '';
        setEmail(nextEmail);
        if (resolvedUserId) {
          void saveUserId(resolvedUserId);
        }

        if (savedToken) {
          setToken(savedToken);
          void upsertOAuthUser(backendUrl, savedToken).catch((error) => {
            console.error('upsertOAuthUser failed during initialization:', error);
          });

          if (resolvedUserId) {
            void refreshOrganizationForUser(resolvedUserId, savedToken).catch((error) => {
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

  // Start the Google OAuth flow and then hydrate backend/user state.
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
        await saveUserId(profileEmail);
      }

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

  // Clear local auth state and drop any org blocklist cached in storage.
  async function signOut() {
    if (!token) {
      return;
    }

    await removeCachedToken(token);
    await clearSavedToken();
    await clearSavedUserId();
    await clearOrgBlockedWebsites();
    await saveOrganizationContext(null);
    setToken('');
    setEmail('');
    setOrganizationNameInput('');
    setJoinOrganizationIdInput('');
    setOrganization(null);
    setOrgBlockedWebsites([]);
    setIsAdmin(false);
  }

  // Add a site to the browser-only personal blocklist.
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

  // Remove a site from the browser-only personal blocklist.
  async function removePersonalBlockedWebsite(website: string) {
    const nextWebsites = personalBlockedWebsites.filter((item) => item !== website);
    await savePersonalBlockedWebsites(nextWebsites);
    setPersonalBlockedWebsites(nextWebsites);
  }

  // Add a site to the shared org blocklist through the backend.
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

  // Remove a site from the shared org blocklist through the backend.
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

  // Create a brand-new organization owned by the current user.
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
      const allowDurationMinutes = payload.organization.allowDurationMinutes ?? 5;
      setOrganizationAllowDurationMinutes(allowDurationMinutes);
      await saveOrganizationContext({
        organizationId: payload.organization.id,
        isAdmin: true,
        allowDurationMinutes,
      });
      setOrganizationNameInput('');
      setJoinOrganizationIdInput('');
    } catch (error) {
      console.error('Could not create organization:', error);
    }
  }

  // Join an existing organization using its id.
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
      const allowDurationMinutes = payload.organization.allowDurationMinutes ?? 5;
      setOrganizationAllowDurationMinutes(allowDurationMinutes);
      await saveOrganizationContext({
        organizationId: payload.organization.id,
        isAdmin: payload.isAdmin,
        allowDurationMinutes,
      });
      setJoinOrganizationIdInput('');
      setView('organization');
    } catch (error) {
      console.error('Could not join organization:', error);
    }
  }

  async function updateOrgAllowDuration(minutes: number) {
    if (!token || !organization || !isAdmin) {
      return;
    }

    if (![5, 10, 15, 30, 60].includes(minutes)) {
      console.error('Invalid allow duration minutes:', minutes);
      return;
    }

    try {
      const payload = await updateOrganizationAllowDuration(backendUrl, organization.id, token, minutes);
      setOrganizationAllowDurationMinutes(payload.allowDurationMinutes);
      await saveOrganizationContext({
        organizationId: organization.id,
        isAdmin: true,
        allowDurationMinutes: payload.allowDurationMinutes,
      });
    } catch (error) {
      console.error('Could not update org allow duration:', error);
    }
  }

  // Leave the current organization after confirming the action with the user.
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
      await saveOrganizationContext(null);
      setView('home');
    } catch (error) {
      console.error('Could not leave organization:', error);
    }
  }

  // Mirror the current org list into extension storage for the background worker.
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

  // Show a minimal loading screen while initial storage/auth reads complete.
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

  // Authenticated popup view with tab navigation.
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
              <p>Temporary allow duration: {organizationAllowDurationMinutes} minutes</p>
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
              <div className="website-form">
                <h2>Temporary Allow Duration</h2>
                <select
                  aria-label="Temporary Allow Duration"
                  value={organizationAllowDurationMinutes}
                  onChange={(event) => {
                    const nextMinutes = Number(event.target.value);
                    void updateOrgAllowDuration(nextMinutes);
                  }}
                >
                  {[5, 10, 15, 30, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </div>
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

  // Signed-out popup view.
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
