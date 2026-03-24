import type { NextFunction, Request, Response } from 'express';

type GoogleUserInfo = {
  email?: string;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Invalid Google access token.');
  }

  return (await res.json()) as GoogleUserInfo;
}

export function getAuthenticatedUserId(req: Request): string {
  return String((req as Request & { authUserId?: string }).authUserId ?? '');
}

export async function requireGoogleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      res.status(401).json({ message: 'Missing Authorization Bearer token.' });
      return;
    }

    const userInfo = await fetchGoogleUserInfo(accessToken);
    const email = String(userInfo.email ?? '').trim().toLowerCase();
    if (!email) {
      res.status(401).json({ message: 'Google token did not include an email.' });
      return;
    }

    (req as Request & { authUserId?: string }).authUserId = email;
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized. Invalid Google token.' });
  }
}
