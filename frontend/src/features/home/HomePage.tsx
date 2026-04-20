type HomePageProps = {
  email: string;
  hasOrganization: boolean;
  organizationNameInput: string;
  joinOrganizationIdInput: string;
  onSignOut: () => void;
  onOrganizationNameInputChange: (value: string) => void;
  onJoinOrganizationIdInputChange: (value: string) => void;
  onCreateOrganization: () => void;
  onJoinOrganization: () => void;
};

export function HomePage({
  email,
  hasOrganization,
  organizationNameInput,
  joinOrganizationIdInput,
  onSignOut,
  onOrganizationNameInputChange,
  onJoinOrganizationIdInputChange,
  onCreateOrganization,
  onJoinOrganization,
}: HomePageProps) {
  return (
    <>
      <button onClick={onSignOut}>Sign out</button>
      {!hasOrganization ? (
        <>
          <div className="website-form">
            <input
              type="text"
              value={organizationNameInput}
              placeholder="New organization name"
              onChange={(event) => onOrganizationNameInputChange(event.target.value)}
            />
            <button onClick={onCreateOrganization}>Create organization</button>
          </div>
          <div className="website-form">
            <input
              type="text"
              value={joinOrganizationIdInput}
              placeholder="Organization ID"
              onChange={(event) => onJoinOrganizationIdInputChange(event.target.value)}
            />
            <button onClick={onJoinOrganization}>Join organization</button>
          </div>
        </>
      ) : null}
      {email ? null : <p>No profile email available.</p>}
    </>
  );
}