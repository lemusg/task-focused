type HomePageProps = {
  email: string;
  token: string;
  organizationNameInput: string;
  organizationName: string;
  isAdmin: boolean;
  onPingBackend: () => void;
  onPingDb: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOrganizationNameInputChange: (value: string) => void;
  onCreateOrganization: () => void;
};

export function HomePage({
  email,
  token,
  organizationNameInput,
  organizationName,
  isAdmin,
  onPingBackend,
  onPingDb,
  onSignIn,
  onSignOut,
  onOrganizationNameInputChange,
  onCreateOrganization,
}: HomePageProps) {
  return (
    <>
      <button onClick={onPingBackend}>Ping backend</button>
      <button onClick={onPingDb}>Ping database</button>
      <button onClick={onSignIn}>Sign in with Google</button>
      <button onClick={onSignOut}>Sign out</button>
      {organizationName ? (
        <>
          <p>Organization: {organizationName}</p>
          <p>{isAdmin ? 'Role: admin' : 'Role: member'}</p>
        </>
      ) : (
        <div className="website-form">
          <input
            type="text"
            value={organizationNameInput}
            placeholder="New organization name"
            onChange={(event) => onOrganizationNameInputChange(event.target.value)}
          />
          <button onClick={onCreateOrganization}>Create organization</button>
        </div>
      )}
      <p>{email ? `Email: ${email}` : 'No profile email available'}</p>
      <p>{token ? `Token saved (${token.slice(0, 14)}...)` : 'No token saved yet'}</p>
      <p>
        Edit <code>src/App.tsx</code>
      </p>
      <p>run 'npm run build'</p>
      <p>reload extension to see changes</p>
    </>
  );
}