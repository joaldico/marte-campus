export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CookieRequest = {
  headers: {
    cookie?: string;
    [key: string]: string | string[] | undefined;
  };
};

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return undefined;
}

export function isForwardedHttps(req: CookieRequest): boolean {
  const proto = req.headers['x-forwarded-proto'];
  const value = Array.isArray(proto) ? proto[0] : proto;
  return value === 'https';
}

export function sessionCookieOptions(req: CookieRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isForwardedHttps(req),
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export function clearSessionCookieOptions(req: CookieRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isForwardedHttps(req),
    path: '/',
  };
}
