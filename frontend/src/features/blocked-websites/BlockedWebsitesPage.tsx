import type { KeyboardEvent } from 'react';

type BlockedWebsitesPageProps = {
  websiteInput: string;
  blockedWebsites: string[];
  canManage: boolean;
  organizationName: string;
  onInputChange: (value: string) => void;
  onAddWebsite: () => void;
  onRemoveWebsite: (website: string) => void;
};

export function BlockedWebsitesPage({
  websiteInput,
  blockedWebsites,
  canManage,
  organizationName,
  onInputChange,
  onAddWebsite,
  onRemoveWebsite,
}: BlockedWebsitesPageProps) {
  // Allow Enter to submit the website field without clicking the button.
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (canManage && event.key === 'Enter') {
      onAddWebsite();
    }
  }

  return (
    <>
      {/* Header copy for the shared organization list. */}
      <h2>Org blocked websites</h2>
      <p>{organizationName ? `` : 'No organization yet.'}</p>
      {!canManage ? <p>Only admins can edit this blocklist.</p> : null}
      {canManage ? (
        <div className="website-form">
          <input
            type="text"
            value={websiteInput}
            placeholder="example.com"
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <button onClick={onAddWebsite}>Add website</button>
        </div>
      ) : null}
      {blockedWebsites.length === 0 ? (
        <p>No blocked websites yet.</p>
      ) : (
        <ul className="website-list">
          {blockedWebsites.map((website) => (
            <li key={website}>
              <span>{website}</span>
              {canManage ? <button onClick={() => onRemoveWebsite(website)}>Remove</button> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
