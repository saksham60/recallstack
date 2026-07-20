import { Page } from '@playwright/test';

/**
 * Sets up a deterministic authenticated state for Playwright tests.
 * 
 * 1. Sets the E2E bypass cookie to skip the Next.js server-side middleware redirect.
 * 2. Mocks the Supabase auth endpoints to trick the browser-side AuthProvider 
 *    into believing a valid user is logged in.
 */
export async function setupAuth(page: Page, userParams?: { id?: string, email?: string }) {
  const mockSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userParams?.id || 'test-user-id', 
      email: userParams?.email || 'test@example.com'
    }
  };

  // 1. Bypass Server-Side Route Protection (proxy.ts)
  await page.context().addCookies([
    { 
      name: 'e2e-bypass-auth', 
      value: '1', 
      domain: 'localhost', 
      path: '/' 
    },
    {
      name: 'sb-127-0-0-1-auth-token',
      value: encodeURIComponent(JSON.stringify(mockSession)),
      domain: 'localhost',
      path: '/'
    },
    {
      name: 'sb-localhost-auth-token',
      value: encodeURIComponent(JSON.stringify(mockSession)),
      domain: 'localhost',
      path: '/'
    }
  ]);

  // 2. Bypass Client-Side Route Protection (AuthProvider.tsx)
  await page.route('**/auth/v1/**', async route => {
    // Return a mock user session for any Supabase auth request
    await route.fulfill({ 
      json: { 
        user: { 
          id: userParams?.id || 'test-user-id', 
          email: userParams?.email || 'test@example.com' 
        },
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: userParams?.id || 'test-user-id', 
            email: userParams?.email || 'test@example.com'
          }
        }
      } 
    });
  });
}
