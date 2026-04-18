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
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      onAddWebsite();
    }
  }

  return (
    <>
      <h2>Org blocked websites</h2>
      <p>{organizationName ? `` : 'No organization yet.'}</p>
      {!canManage ? <p>Only admins can edit this blocklist.</p> : null}
      <div className="website-form">
        <input
          type="text"
          value={websiteInput}
          placeholder="example.com"
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={!canManage}
        />
        <button onClick={onAddWebsite} disabled={!canManage}>
          Add website
        </button>
      </div>
      {blockedWebsites.length === 0 ? (
        <p>No blocked websites yet.</p>
      ) : (
        <ul className="website-list">
          {blockedWebsites.map((website) => (
            <li key={website}>
              <span>{website}</span>
              <button onClick={() => onRemoveWebsite(website)} disabled={!canManage}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}