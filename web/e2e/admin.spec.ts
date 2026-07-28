import { test as base, expect, type Page } from '@playwright/test';
import { test } from './fixtures/authenticated-test';
import { createAdminOverview, createAdminUser, createPagination, createProblem, createProfile, createUserDetail } from './helpers/factories';

async function mockProfile(page: Page, roles = ['admin']) {
  await page.route('**/api/v1/me', route => route.fulfill({ json: createProfile({ roles }) }));
}

test.describe('Admin access and overview', () => {
  base('redirects unauthenticated visitors to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('blocks a signed-in non-admin and hides normal admin navigation', async ({ authenticatedPage: page }) => {
    await mockProfile(page, []);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Administrator access is required' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('renders real overview metrics, percentages, and refresh', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let requests = 0;
    await page.route('**/api/v1/admin/overview', route => {
      requests += 1;
      return route.fulfill({ json: createAdminOverview() });
    });
    await page.goto('/admin');
    await expect(page.getByText('1,234')).toBeVisible();
    await expect(page.getByText('60%')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect.poll(() => requests).toBeGreaterThan(1);
  });
});

test.describe('Admin user workflows', () => {
  test('search persists in URL, valid sorting is sent, and eligibility boundaries render', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let requestedUrl = '';
    await page.route('**/api/v1/admin/users?*', route => {
      requestedUrl = route.request().url();
      return route.fulfill({ json: { items: [createAdminUser(99), createAdminUser(100), createAdminUser(101)], pagination: createPagination(3) } });
    });
    await page.goto('/admin/users');
    await page.getByPlaceholder('Search users…').fill('ada');
    await expect(page).toHaveURL(/search=ada/);
    await page.getByLabel('Sort by').selectOption('name');
    await expect.poll(() => requestedUrl).toContain('sort_by=name');
    await expect(page.getByText('1 remaining')).toBeVisible();
    await expect(page.locator('tbody').getByText('Eligible', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('option', { name: /streak/i })).toHaveCount(0);
  });

  test('renders all difficulties, unavailable metrics, topics, revisions, mock-test state and signup activity', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    await page.route('**/api/v1/admin/users/*/activity?*', route => route.fulfill({ json: {
      items: [{ activity_id: 'signup-1', activity_type: 'user_signed_up', occurred_at: '2026-07-01T10:00:00Z', problem: null, metadata: {} }],
      pagination: createPagination(1),
    } }));
    await page.route('**/api/v1/admin/users/*', route => route.fulfill({ json: createUserDetail() }));
    await page.goto('/admin/users/00000000-0000-0000-0000-000000000100');
    for (const difficulty of ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']) await expect(page.getByText(difficulty, { exact: true })).toBeVisible();
    await expect(page.getByText('Not available', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Arrays')).toBeVisible();
    await expect(page.getByText('Not available yet')).toBeVisible();
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByRole('cell', { name: 'User Signed Up' })).toBeVisible();
    await expect(page.locator('tbody tr').getByText('—')).toHaveCount(7);
  });

  test('confirms role grant once and displays final-admin conflict', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    const target = '00000000-0000-0000-0000-000000000100';
    let grants = 0;
    await page.route(`**/api/v1/admin/users/${target}/roles?*`, route => route.fulfill({ json: { items: [], pagination: createPagination() } }));
    await page.route('**/api/v1/admin/users/test-user-id/roles?*', route => route.fulfill({ json: { items: [{ grant_id: 1, role_id: 7, role_code: 'admin', role_description: 'Platform administrator', granted_at: '2026-07-01T10:00:00Z', granted_by: null, revoked_at: null, revoked_by: null, active: true }], pagination: createPagination(1) } }));
    await page.route(`**/api/v1/admin/users/${target}/roles`, route => {
      grants += 1;
      return route.fulfill({ json: { changed: true, grant: { grant_id: 2, role_id: 7, role_code: 'admin', role_description: null, granted_at: '2026-07-01T10:00:00Z', granted_by: 'test-user-id', revoked_at: null, revoked_by: null, active: true } } });
    });
    await page.route(`**/api/v1/admin/users/${target}`, route => route.fulfill({ json: createUserDetail() }));
    await page.goto(`/admin/users/${target}?tab=roles`);
    await page.getByRole('button', { name: 'Make Admin' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Make Admin' }).dblclick();
    await expect.poll(() => grants).toBe(1);
    await expect(page.getByText('Admin access granted successfully.')).toBeVisible();
  });

  test('shows the backend final-admin conflict when revocation is rejected', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    const target = '00000000-0000-0000-0000-000000000100';
    const activeRole = { grant_id: 1, role_id: 7, role_code: 'admin', role_description: 'Platform administrator', granted_at: '2026-07-01T10:00:00Z', granted_by: null, revoked_at: null, revoked_by: null, active: true };
    await page.route(`**/api/v1/admin/users/${target}/roles?*`, route => route.fulfill({ json: { items: [activeRole], pagination: createPagination(1) } }));
    await page.route('**/api/v1/admin/users/test-user-id/roles?*', route => route.fulfill({ json: { items: [activeRole], pagination: createPagination(1) } }));
    await page.route(`**/api/v1/admin/users/${target}/roles/7/revoke`, route => route.fulfill({
      status: 409,
      json: { detail: 'Grant the admin role to another active profile before revoking it' },
    }));
    await page.route(`**/api/v1/admin/users/${target}`, route => route.fulfill({ json: createUserDetail() }));
    await page.goto(`/admin/users/${target}?tab=roles`);
    await page.getByRole('button', { name: 'Remove Admin' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove Admin' }).click();
    await expect(page.getByText('Grant the admin role to another active profile before revoking it')).toBeVisible();
  });
});

test.describe('Problems and audit logs', () => {
  test('renders null problem analytics without source code and forwards filters', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let requestUrl = '';
    await page.route('**/api/v1/admin/problems/analytics?*', route => {
      requestUrl = route.request().url();
      return route.fulfill({ json: { items: [createProblem()], pagination: createPagination(1) } });
    });
    await page.goto('/admin/problems');
    await expect(page.getByText('Not captured')).toBeVisible();
    await page.getByLabel('Difficulty').selectOption('easy');
    await expect.poll(() => requestUrl).toContain('difficulty=easy');
    await expect(page.getByText(/source code/i)).toHaveCount(0);
  });

  test('filters audit logs and never renders sensitive metadata', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    await page.route('**/api/v1/admin/audit-logs?*', route => route.fulfill({ json: {
      items: [{
        id: 1, admin_user_id: 'test-user-id', action: 'admin.user.viewed', resource_type: 'user',
        resource_id: 'target-id', request_method: 'GET', request_path: '/api/v1/admin/users/target-id',
        request_id: 'request-id', metadata_json: { page: 1, authorization: 'Bearer secret-token' },
        created_at: '2026-07-28T12:00:00Z',
      }],
      pagination: createPagination(1),
    } }));
    await page.goto('/admin/audit-logs');
    await expect(page.getByText('"page": 1')).toBeVisible();
    await expect(page.getByText(/secret-token/)).toHaveCount(0);
    await page.getByLabel('Action').fill('admin.user.viewed');
    await expect(page).toHaveURL(/action=admin.user.viewed/);
  });
});
