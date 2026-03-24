import type { KeyboardEvent } from 'react';

type PersonalBlockedWebsitesPageProps = {
  websiteInput: string;
  blockedWebsites: string[];
  onInputChange: (value: string) => void;
  onAddWebsite: () => void;
  onRemoveWebsite: (website: string) => void;
};

export function PersonalBlockedWebsitesPage({
  websiteInput,
  blockedWebsites,
  onInputChange,
  onAddWebsite,
  onRemoveWebsite,
}: PersonalBlockedWebsitesPageProps) {
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      onAddWebsite();
    }
  }

  return (
    <>
      <h2>Blocked websites</h2>
      <p>Personal list stored in this browser profile.</p>
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
      {blockedWebsites.length === 0 ? (
        <p>No blocked websites yet.</p>
      ) : (
        <ul className="website-list">
          {blockedWebsites.map((website) => (
            <li key={website}>
              <span>{website}</span>
              <button onClick={() => onRemoveWebsite(website)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
