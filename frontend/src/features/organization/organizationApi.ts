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

export async function loadOrganizationByUser(backendUrl: string, userId: string) {
  const res = await fetch(
    `${backendUrl}/api/organizations/by-user/${encodeURIComponent(userId)}`
  );

  if (res.status === 404) {
    return null;
  }

  return parseJson<OrganizationByUserResponse>(res);
}

export async function createOrganization(
  backendUrl: string,
  userId: string,
  organizationName: string
) {
  const res = await fetch(`${backendUrl}/api/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, organizationName }),
  });

  return parseJson<CreateOrganizationResponse>(res);
}

export async function addWebsiteToBlocklist(
  backendUrl: string,
  organizationId: string,
  userId: string,
  website: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/blocklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, website }),
  });

  return parseJson<BlocklistResponse>(res);
}

export async function removeWebsiteFromBlocklist(
  backendUrl: string,
  organizationId: string,
  userId: string,
  website: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/blocklist`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, website }),
  });

  return parseJson<BlocklistResponse>(res);
}

export async function leaveOrganization(
  backendUrl: string,
  organizationId: string,
  userId: string
) {
  const res = await fetch(`${backendUrl}/api/organizations/${organizationId}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  return parseJson<LeaveOrganizationResponse>(res);
}