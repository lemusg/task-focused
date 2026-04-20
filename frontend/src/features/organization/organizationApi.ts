export type OrganizationData = {
  id: string;
  name: string;
  blockedWebsites: string[];
};

type OrganizationByUserResponse = {
  organization: OrganizationData;
  isAdmin: boolean;
  message?: string;
};

type CreateOrganizationResponse = {
  organization: OrganizationData;
  message?: string;
};

type JoinOrganizationResponse = {
  organization: OrganizationData;
  isAdmin: boolean;
  message?: string;
};

type BlocklistResponse = {
  blockedWebsites: string[];
  message?: string;
};

type LeaveOrganizationResponse = {
  message?: string;
};

// Parse JSON once and convert non-2xx responses into thrown errors.
async function parseJson<T>(res: Response): Promise<T> {
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new Error('Unexpected server response.');
  }

  if (!res.ok) {
    const errorData = data as { message?: string };
    throw new Error(errorData.message ?? `Request failed (${res.status}).`);
  }

  return data;
}

// Build the common JSON + bearer token headers for protected endpoints.
function authHeaders(authToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

// Load the authenticated user's current organization, if any.
export async function loadOrganizationByUser(
  backendUrl: string,
  userId: string,
  authToken: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/by-user/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  // A 404 here means the user simply has no org yet.
  if (res.status === 404) {
    return null;
  }

  return parseJson<OrganizationByUserResponse>(res);
}

// Create a new organization owned by the current user.
export async function createOrganization(
  backendUrl: string,
  authToken: string,
  organizationName: string
) {
  const res = await fetch(`${backendUrl}/api/organizations`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ organizationName }),
  });

  return parseJson<CreateOrganizationResponse>(res);
}

// Join an existing organization by id.
export async function joinOrganization(
  backendUrl: string,
  authToken: string,
  organizationId: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/join`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ organizationId }),
  });

  return parseJson<JoinOrganizationResponse>(res);
}

// Add a hostname to the org blocklist.
export async function addWebsiteToBlocklist(
  backendUrl: string,
  organizationId: string,
  authToken: string,
  website: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/blocklist`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ website }),
  });

  return parseJson<BlocklistResponse>(res);
}

// Remove a hostname from the org blocklist.
export async function removeWebsiteFromBlocklist(
  backendUrl: string,
  organizationId: string,
  authToken: string,
  website: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/blocklist`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
    body: JSON.stringify({ website }),
  });

  return parseJson<BlocklistResponse>(res);
}

// Leave the current organization and let the backend clean up membership.
export async function leaveOrganization(
  backendUrl: string,
  organizationId: string,
  authToken: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/leave`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({}),
  });

  return parseJson<LeaveOrganizationResponse>(res);
}
