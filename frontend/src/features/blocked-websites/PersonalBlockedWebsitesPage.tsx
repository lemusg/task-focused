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
  // Match the org page behavior so Enter submits from the text field.
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      onAddWebsite();
    }
  }

  return (
    <>
      {/* Header copy for the browser-only personal list. */}
      <h2>Blocked websites</h2>
      <p>Personal list stored in this browser profile.</p>

      {/* Controls for adding a new hostname to the personal list. */}
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

      {/* Show either the empty state or the current personal blocklist. */}
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
