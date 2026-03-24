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

type BlocklistResponse = {
  blockedWebsites: string[];
  message?: string;
};

type LeaveOrganizationResponse = {
  message?: string;
};

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

function authHeaders(authToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

export async function loadOrganizationByUser(
  backendUrl: string,
  userId: string,
  authToken: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/by-user/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (res.status === 404) {
    return null;
  }

  return parseJson<OrganizationByUserResponse>(res);
}

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