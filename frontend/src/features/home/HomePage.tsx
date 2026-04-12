type HomePageProps = {
  email: string;
  token: string;
  organizationNameInput: string;
  onSignOut: () => void;
  onOrganizationNameInputChange: (value: string) => void;
  onCreateOrganization: () => void;
};

export function HomePage({
  email,
  token,
  organizationNameInput,
  onSignOut,
  onOrganizationNameInputChange,
  onCreateOrganization,
}: HomePageProps) {
  return (
    <>
      <button onClick={onSignOut}>Sign out</button>
      <div className="website-form">
        <input
          type="text"
          value={organizationNameInput}
          placeholder="New organization name"
          onChange={(event) => onOrganizationNameInputChange(event.target.value)}
        />
        <button onClick={onCreateOrganization}>Create organization</button>
      </div>
      <p>{email ? `Email: ${email}` : 'No profile email available'}</p>
      <p>{token ? `Token saved (${token.slice(0, 14)}...)` : 'No token saved yet'}</p>
    </>
  );
}