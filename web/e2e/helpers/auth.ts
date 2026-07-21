import { Page } from '@playwright/test';
import { publicConfig } from '../../src/lib/config/public';
import { getSupabaseAuthCookieName } from '../../src/lib/supabase/constants';

/**
 * Sets up a deterministic authenticated state for Playwright tests.
 *
 * 1. Sets the E2E bypass cookie to skip the Next.js server-side middleware redirect.
 * 2. Writes a Supabase-compatible session to the same stable cookie used by
 *    the application clients.
 */
export async function setupAuth(page: Page, userParams?: { id?: string, email?: string }) {
  const jwtPayload = {
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: userParams?.id || 'test-user-id',
    email: userParams?.email || 'test@example.com',
    role: 'authenticated'
  };
  const base64Payload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  const validJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${base64Payload}.signature`;

  const mockSession = {
    access_token: validJwt,
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: userParams?.id || 'test-user-id',
      email: userParams?.email || 'test@example.com'
    }
  };

  const sessionStr = JSON.stringify(mockSession);
  const base64Str = Buffer.from(sessionStr).toString('base64url');

  await page.context().addCookies([
    {
      name: 'e2e-bypass-auth',
      value: '1',
      domain: 'localhost',
      path: '/'
    },
    {
      name: getSupabaseAuthCookieName(publicConfig.supabaseUrl),
      value: `base64-${base64Str}`,
      domain: 'localhost',
      path: '/'
    }
  ]);

  // Supabase may refresh or verify a restored session depending on SDK
  // internals. Mock those endpoints with their real response shapes instead
  // of intercepting every auth request.
  await page.route('**/auth/v1/token?grant_type=refresh_token', async route => {
    await route.fulfill({ json: mockSession });
  });
  await page.route('**/auth/v1/user', async route => {
    await route.fulfill({ json: mockSession.user });
  });
}
