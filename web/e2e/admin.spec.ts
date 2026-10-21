import { test as base, expect, type Page } from '@playwright/test';
import { test } from './fixtures/authenticated-test';
import { createAdminOverview, createAdminUser, createPagination, createProblem, createProfile, createUserDetail } from './helpers/factories';
import observedGrowth from './fixtures/admin-growth-observed.json';

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
    await page.goto('/admin/dsa');
    await expect(page.getByRole('link', { name: 'ReasonAI Admin', exact: true })).toBeVisible();
    await expect(page.getByText('1,234')).toBeVisible();
    await expect(page.getByText('60%')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect.poll(() => requests).toBeGreaterThan(1);
  });
});

test.describe('Platform growth analytics', () => {
  test('renders genuine aggregate snapshot and requests exact 7/30/90 filters', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    const requests: number[] = [];
    await page.route('**/api/v1/admin/growth?*', route => {
      const days = Number(new URL(route.request().url()).searchParams.get('days')) as 7 | 30 | 90;
      requests.push(days);
      return route.fulfill({ json: observedGrowth[days] });
    });
    await page.goto('/admin');
    for (const days of [30, 7, 90] as const) {
      await page.getByLabel('Reporting period').selectOption(String(days));
      await expect(page.getByText(`${days}-day window`, { exact: true })).toBeVisible();
      await expect(page.getByText('Total accounts', { exact: true }).locator('..')).toContainText(String(observedGrowth[days].total_users));
      await expect(page.getByText('Server Submit requests', { exact: true }).locator('..')).toContainText(String(observedGrowth[days].server_submissions));
    }
    expect(requests).toEqual([30,7,90]);
    await expect(page.getByText(/Country-level activity is unavailable/)).toBeVisible();
    await expect(page.getByText(/Billed costs and complete token usage are unavailable/)).toBeVisible();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => requests.length).toBe(4);
    await page.screenshot({ path: '../docs/evidence/screenshots/2026-10-21/admin-audit/growth-observed-counts-local-fixture.png', fullPage: true });
  });

  test('keeps range and refresh controls during loading, validation error and empty recovery', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    await page.route('**/api/v1/admin/growth?*', async route => {
      attempts++;
      const days = Number(new URL(route.request().url()).searchParams.get('days'));
      if (attempts === 1) {
        await pending;
        return route.fulfill({ status: 422, json: { detail: 'query.days: Input should be 7, 30 or 90' } });
      }
      const data = observedGrowth[7];
      return route.fulfill({ json: { ...data, period_days: days, total_users:0,new_users:0,tracked_engaged_users:0,newly_engaged_users:0,activation_rate:0,daily_signups:[],feature_usage:[] } });
    });
    await page.goto('/admin');
    await expect(page.getByLabel('Reporting period')).toBeVisible();
    await expect(page.getByLabel('Loading', { exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('heading', { name: 'Invalid filters' })).toBeVisible();
    await expect(page.getByText('query.days: Input should be 7, 30 or 90')).toBeVisible();
    await page.getByLabel('Reporting period').selectOption('7');
    await expect(page.getByText('7-day window', { exact: true })).toBeVisible();
    await expect(page.getByText('Recorded activation rate', { exact: true }).locator('..')).toContainText('0%');
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
    expect(attempts).toBe(2);
  });

  for (const status of [401,403]) test(`shows Growth HTTP ${status} accurately without automatic retries`, async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let requests=0;
    await page.route('**/api/v1/admin/growth?*', route => { requests++; return route.fulfill({status,json:{detail:'Session or admin permission must be renewed'}}); });
    await page.goto('/admin');
    await expect(page.getByRole('heading', {name:status===401?'Session expired':'Access denied'})).toBeVisible();
    expect(requests).toBe(1);
  });

  test('shows persisted registration and feature metrics without inventing attribution', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    await page.route('**/api/v1/admin/growth?*', route => route.fulfill({ json: {
      period_days: 30, generated_at: '2026-10-16T00:00:00Z',
      total_users: 40, new_users: 32, tracked_engaged_users: 7,
      newly_engaged_users: 2, activation_rate: 0.0625,
      ai_runs: 12, ai_failed_runs: 1, knowledge_events: 31, dsa_submissions: 2,
      tracking_source_available: false, signup_source_unknown: 32,
      daily_signups: [{ day: '2026-10-15', signups: 15 }],
      feature_usage: [
        { feature: 'dsa', unique_users: 3 },
        { feature: 'ai_dsa', unique_users: 2 },
        { feature: 'ai_system_design', unique_users: 1 },
        { feature: 'knowledge_feed', unique_users: 4 },
      ],
    } }));
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Platform intelligence' })).toBeVisible();
    await expect(page.getByText('Recorded activation rate')).toBeVisible();
    await expect(page.getByText('Unknown source · historical registrations')).toBeVisible();
    await page.getByLabel('Reporting period').selectOption('7');
    await expect(page).toHaveURL(/admin/);
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
    await expect(page.getByRole('cell', { name: '30%', exact: true })).toBeVisible();
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
  test('diagram library exposes API errors, prevents duplicate actions and recovers on refresh', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    const errors: string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    let reads=0,duplicates=0;
    let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/api/v1/diagrams**', async route => {
      if (route.request().method()==='POST') {
        duplicates++; await pending;
        return route.fulfill({status:409,json:{detail:'Diagram changed elsewhere. Reload and try again.'}});
      }
      reads++;
      if(reads===1) return route.fulfill({status:503,json:{detail:'Diagram storage temporarily unavailable'}});
      return route.fulfill({json:[{id:'00000000-0000-0000-0000-000000000001',title:'Audit diagram',schema_version:2,revision:1,page_count:1,element_count:0,enabled_pack_ids:['generic'],created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T00:00:00Z'}]});
    });
    await page.goto('/admin/diagrams', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status')).toHaveText('Diagram storage temporarily unavailable');
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(page.getByRole('link',{name:'Audit diagram',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Duplicate Audit diagram',exact:true}).click();
    await expect(page.getByRole('button',{name:'Duplicate Audit diagram',exact:true})).toBeDisabled();
    release();
    await expect(page.getByRole('status')).toHaveText('Diagram changed elsewhere. Reload and try again.');
    expect(duplicates).toBe(1);
    expect(errors).toEqual([]);
  });

  test('empty out-of-range lists retain a route back to the first page', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    await page.route('**/api/v1/admin/users?*', route => {
      const requested = Number(new URL(route.request().url()).searchParams.get('page'));
      return route.fulfill({ json: { items: [], pagination: { page:requested,page_size:25,total_items:0,total_pages:0 } } });
    });
    await page.goto('/admin/users?page=99');
    await expect(page.getByText('Nothing to show yet', {exact:true})).toBeVisible();
    await page.getByRole('button',{name:'First page',exact:true}).click();
    await expect(page).toHaveURL(/page=1(?:&|$)/);
  });

  test('problem detail keeps nullable measurements separate from learning outcomes', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    const data=createProblem();
    await page.route('**/api/v1/admin/problems/*/analytics', route => route.fulfill({ json: {
      problem:{problem_id:data.problem_id,title:data.title,difficulty:data.difficulty,publication_status:data.publication_status,topics:data.topics},
      analytics:{total_attempts:100,accepted_attempts:50,unique_users_attempted:80,unique_users_completed:40,solve_rate:0.5,first_attempt_success_rate:0.25,average_attempts_before_completion:null,average_solve_time_seconds:null,hint_usage_count:null},
      recent_attempts:[],
    } }));
    await page.goto(`/admin/problems/${data.problem_id}`);
    await expect(page.getByRole('heading',{name:'Two Sum',exact:true})).toBeVisible();
    await expect(page.getByText('Not captured',{exact:true})).toHaveCount(3);
    await expect(page.getByText('Independent practice outcomes',{exact:true})).toBeVisible();
    await expect(page.getByText('50%',{exact:true})).toBeVisible();
    await expect(page.getByText('Nothing to show yet',{exact:true})).toBeVisible();
  });

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
