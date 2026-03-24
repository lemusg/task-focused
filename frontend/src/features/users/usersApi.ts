type UpsertUserResponse = {
  message?: string;
  user?: {
    userId: string;
    role: 'admin' | 'member';
    organization: string | null;
  };
};

export async function upsertOAuthUser(backendUrl: string, userId: string) {
  const res = await fetch(`${backendUrl}/api/users/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  const data = (await res.json()) as UpsertUserResponse;
  if (!res.ok) {
    throw new Error(data.message ?? `Failed to sync user (${res.status}).`);
  }

  return data;
}
