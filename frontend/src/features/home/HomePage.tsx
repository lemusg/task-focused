type HomePageProps = {
  email: string;
  onSignOut: () => void;
};

export function HomePage({
  email,
  onSignOut,
}: HomePageProps) {
  return (
    <>
      {/* Sign-out action for the current popup session. */}
      <button onClick={onSignOut}>Sign out</button>
      {email ? null : <p>No profile email available.</p>}
    </>
  );
}
