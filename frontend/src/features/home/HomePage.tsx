type HomePageProps = {
  email: string;
  token: string;
  onPingBackend: () => void;
  onPingDb: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function HomePage({
  email,
  token,
  onPingBackend,
  onPingDb,
  onSignIn,
  onSignOut,
}: HomePageProps) {
  return (
    <>
      <button onClick={onPingBackend}>Ping backend</button>
      <button onClick={onPingDb}>Ping database</button>
      <button onClick={onSignIn}>Sign in with Google</button>
      <button onClick={onSignOut}>Sign out</button>
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