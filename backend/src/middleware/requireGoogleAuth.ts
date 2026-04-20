import type { NextFunction, Request, Response } from 'express';

type GoogleUserInfo = {
  email?: string;
};

// Extract the bearer token from the Authorization header.
function getBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization') ?? '';

  // Only accept standard Bearer token formatting.
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

// Ask Google who owns the token so routes can trust the email.
async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Invalid Google access token.');
  }

  return (await res.json()) as GoogleUserInfo;
}

// Route handlers use this helper instead of reading the request cast directly.
export function getAuthenticatedUserId(req: Request): string {
  return String((req as Request & { authUserId?: string }).authUserId ?? '');
}

// Validate the Google token and attach the normalized email to the request.
export async function requireGoogleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      res.status(401).json({ message: 'Missing Authorization Bearer token.' });
      return;
    }

    const userInfo = await fetchGoogleUserInfo(accessToken);
    const email = String(userInfo.email ?? '').trim().toLowerCase();

    // The backend uses email as the stable app-level user id.
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
