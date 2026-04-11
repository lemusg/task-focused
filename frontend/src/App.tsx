import { useEffect, useState } from 'react';
import { BlockedWebsitesPage } from './features/blocked-websites/BlockedWebsitesPage';
import { PersonalBlockedWebsitesPage } from './features/blocked-websites/PersonalBlockedWebsitesPage';
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
  leaveOrganization,
  loadOrganizationByUser,
  removeWebsiteFromBlocklist,
  type OrganizationData,
} from './features/organization/organizationApi';
import { upsertOAuthUser } from './features/users/usersApi';

type View = 'home' | 'blocked-websites' | 'organization';
type PopupPage =
  | 'user-home'
  | 'user-login-choice'
  | 'user-personal'
  | 'user-create-organization'
  | 'user-organization-owner'
  | 'user-join-organization'
  | 'user-organization-member'
  | 'dev-tools';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [popupPage, setPopupPage] = useState<PopupPage>('user-home');
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
  const [userCreateOrganizationName, setUserCreateOrganizationName] = useState<string>('');
  const [userJoinOrganizationId, setUserJoinOrganizationId] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready');

  function goToCreatedOrganizationHome() {
    if (!userCreateOrganizationName.trim()) {
      return;
    }
    setPopupPage('user-organization-owner');
  }

  function goToJoinedOrganizationHome() {
    if (!userJoinOrganizationId.trim()) {
      return;
    }
    setPopupPage('user-organization-member');
  }

  async function refreshOrganizationForUser(userId: string, authToken: string) {
    if (!userId || !authToken) {
      setOrganization(null);
      setOrgBlockedWebsites([]);
      setIsAdmin(false);
      setPopupPage('user-home');
      return;
    }

    try {
      const payload = await loadOrganizationByUser(backendUrl, userId, authToken);
      if (!payload) {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
        setPopupPage('user-personal');
        return;
      }

      setOrganization(payload.organization);
      setOrgBlockedWebsites(payload.organization.blockedWebsites);
      setIsAdmin(payload.isAdmin);

      if(payload.isAdmin) {
        setPopupPage('user-organization-owner');
      } else {
        setPopupPage('user-organization-member');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load organization.';
      setStatus(message);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const savedToken = await loadSavedToken();
        const personalWebsites = await loadPersonalBlockedWebsites();
        const orgWebsites = await loadOrgBlockedWebsites();

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

          setPopupPage('user-personal');

          void upsertOAuthUser(backendUrl, savedToken).catch((error) => {
            console.error('upsertOAuthUser failed during initialization:', error);
          });

          if (nextEmail) {
            setPopupPage('user-personal');

            if(nextEmail) {
              void refreshOrganizationForUser(nextEmail, savedToken).catch((error) => {
                console.error('initialize org refresh failed:', error);
              });
            }
          } else {
            setOrganization(null);
            setOrgBlockedWebsites([]);
            setIsAdmin(false);
          }
        } else {
          setOrganization(null);
          setOrgBlockedWebsites([]);
          setIsAdmin(false);
          setPopupPage('user-home');
        }
      } catch (error) {
        console.error('initialize failed:', error);
        setStatus(error instanceof Error ? error.message : "Initialization failed");
        setPopupPage('user-home');
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
      console.log('signIn started');
      
      const nextToken = await getAuthToken(true);
      console.log('token received:', !!nextToken);

      await saveToken(nextToken);
      console.log('token saved');

      let profileEmail = '';
      try {
        profileEmail = await getProfileEmail();
        console.log('profileEmail:', profileEmail);
      } catch (error) {
        console.error('getProfileEmail failed during signIn:', error);
      }

      setToken(nextToken);
      setEmail(profileEmail);
      setPopupPage('user-personal');
      setStatus('Signed in with Google.');

      if(profileEmail) {
        void upsertOAuthUser(backendUrl, nextToken)
          .then(() => refreshOrganizationForUser(profileEmail, nextToken))
          .catch((error) => {
            console.error('upsertOAuthUser failed during signIn:', error);
            setStatus(error instanceof Error ? error.message : 'Sign-in succeeded but failed to sync user with backend.');
          });
      } else {
        setOrganization(null);
        setOrgBlockedWebsites([]);
        setIsAdmin(false);
      }

      setStatus('Signed in with chrome.identity token.');
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
    setOrganization(null);
    setOrgBlockedWebsites([]);
    setIsAdmin(false);
    setPopupPage('user-home');
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
      if (!token) {
        setStatus('Sign in first to edit the organization blocklist.');
        return;
      }

      if (!organization) {
        setStatus('Create an organization first.');
        return;
      }

      if (!token) {
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
      setStatus(`Organization ${payload.organization.name} created.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create organization.';
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

  if (isInitializing) {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <p>Loading...</p>
        </div>
      </>
    );
  }

  if (popupPage === 'user-home') {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <button onClick={() => setPopupPage('user-login-choice')}>Login</button>
          <button onClick={() => setPopupPage('dev-tools')}>Open Developer UI</button>\
          <p>{status}</p>
        </div>
      </>
    );
  }

  if (popupPage === 'user-login-choice') {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <p>
            If you want to use this extension for yourself, select 'Personal', if you want to create
            an organization for managing other users, select 'Create Organization', if you want to join
            an existing organization, select 'Join Organization'.
          </p>
          <button onClick={() => void signIn()}>Personal</button>
          <button onClick={() => void signIn().then(() => setPopupPage('user-create-organization'))}>Create Organization</button>
          <button onClick={() => void signIn().then(() => setPopupPage('user-join-organization'))}>Join Organization</button>
          <p>{status}</p>
        </div>
      </>
    );
  }

  if (popupPage === 'user-personal') {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <button>Blocked Sites</button>
          <button onClick={() => void signOut()}>Logout</button>
        </div>
      </>
    );
  }

  if (popupPage === 'user-create-organization') {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <label htmlFor="user-create-org-name">Organization Name:</label>
          <input
            id="user-create-org-name"
            type="text"
            value={userCreateOrganizationName}
            onChange={(event) => setUserCreateOrganizationName(event.target.value)}
          />
          <button onClick={goToCreatedOrganizationHome}>Create Organization</button>
          <button onClick={() => setPopupPage('user-login-choice')}>Back</button>
        </div>
      </>
    );
  }

  if (popupPage === 'user-organization-owner') {
    return (
      <>
        <h1>TaskFocused</h1>
        <p className="org-name-subtitle">Organization Name: Placeholder Organization</p>
        <div className="card organization-owner-page">
          <button>Blocked Sites</button>
          <button>View Users</button>
          <button onClick={() => void signOut()}>Logout</button>
          <button className="danger-button">Delete Organization</button>
          <p className="org-id-footer">Organization ID:</p>
        </div>
      </>
    );
  }

  if (popupPage === 'user-join-organization') {
    return (
      <>
        <h1>TaskFocused</h1>
        <div className="card user-home-actions">
          <label htmlFor="user-join-org-id">Organization ID:</label>
          <input
            id="user-join-org-id"
            type="text"
            value={userJoinOrganizationId}
            onChange={(event) => setUserJoinOrganizationId(event.target.value)}
          />
          <p className="helper-text">If you don't know your organization ID, ask your administrator.</p>
          <button onClick={goToJoinedOrganizationHome}>Join Organization</button>
          <button onClick={() => setPopupPage('user-login-choice')}>Back</button>
        </div>
      </>
    );
  }

  if (popupPage === 'user-organization-member') {
    return (
      <>
        <h1>TaskFocused</h1>
        <p className="org-name-subtitle">Organization Name: Placeholder Organization</p>
        <div className="card user-home-actions">
          <button onClick={() => void signOut()}>Logout</button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Task Focused</h1>
      <div className="view-switch">
        <button onClick={() => setPopupPage('user-home')}>Home</button>
        <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
          Developer
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
