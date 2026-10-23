import { test as base, expect, type Page } from '@playwright/test';
import { test } from './fixtures/authenticated-test';
import { createAdminOverview, createPagination, createProblem, createProfile, createUserDetail } from './helpers/factories';

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

test.describe('Product intelligence analytics', () => {
  test('keeps exact UTC windows, definitions and unavailable metrics visible', async ({authenticatedPage:page}) => {
    await mockProfile(page);
    const windows:number[]=[];
    await page.route('**/api/v1/admin/analytics/overview?*',route=>{
      const days=Number(new URL(route.request().url()).searchParams.get('days')); windows.push(days);
      return route.fulfill({json:{coverage:{generated_at:'2026-10-22T12:00:00Z',since:'2026-10-01T00:00:00Z',until:'2026-10-22T12:00:00Z',telemetry_since:null,history:'Fixture only'},
        metrics:{registered_users:{value:45,status:'measured',definition:'Actual profiles',source:'profiles'},official_solves:{value:3,status:'measured',definition:'Certified official acceptance only',source:'jobs'}},features:[],daily:[],details:{}}});
    });
    await page.goto('/admin');
    await expect(page.getByRole('heading',{name:'Product Intelligence',exact:true})).toBeVisible();
    await expect(page.getByText('Registered Users',{exact:true}).locator('..')).toContainText('45');
    await expect(page.getByText(/no collection coverage recorded/)).toBeVisible();
    await page.getByRole('button',{name:'7 days',exact:true}).click();
    await expect.poll(()=>windows).toEqual([30,7]);
    await page.getByRole('button',{name:'90 days',exact:true}).click();
    await expect.poll(()=>windows).toEqual([30,7,90]);
    await page.getByRole('button',{name:'Dsa',exact:true}).click();
    await expect(page.getByText('Official Solves',{exact:true}).locator('..')).toContainText('3');
    await expect(page.getByText('Local Runs',{exact:true}).locator('..')).toContainText('Not tracked');
  });
  for(const status of [401,403,422]) test(`renders HTTP ${status} without losing reporting controls`,async({authenticatedPage:page})=>{
    await mockProfile(page);
    await page.route('**/api/v1/admin/analytics/overview?*',route=>route.fulfill({status,json:{detail:'Fixture permission or validation failure'}}));
    await page.goto('/admin');
    await expect(page.getByRole('button',{name:'7 days',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:status===401?'Session expired':status===403?'Access denied':'Invalid filters',exact:true})).toBeVisible();
  });
});

test.describe('Admin user workflows', () => {
  test('uses server-driven product segments without inferred readiness',async({authenticatedPage:page})=>{
    await mockProfile(page);let requested='';
    await page.route('**/api/v1/admin/analytics/users?*',route=>{requested=route.request().url();return route.fulfill({json:{coverage:{generated_at:'2026-10-22T12:00:00Z',since:'2026-10-01T00:00:00Z',until:'2026-10-22T12:00:00Z',telemetry_since:null,history:'Fixture only'},total:0,items:[]}});});
    await page.goto('/admin/users');await page.getByLabel('Search email/name').fill('ada');
    await expect.poll(()=>requested).toContain('search=ada');
    await page.getByLabel('Recorded segment').selectOption('dsa');
    await expect.poll(()=>requested).toContain('segment=dsa');
    await expect(page.getByText('0 registered records matching filter')).toBeVisible();
    await expect(page.getByText(/readiness|eligible/i)).toHaveCount(0);
  });

  test('renders all difficulties, unavailable metrics, topics, revisions, mock-test state and signup activity', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    await page.route('**/api/v1/admin/users/*/activity?*', route => route.fulfill({ json: {
      items: [{ activity_id: 'signup-1', activity_type: 'user_signed_up', occurred_at: '2026-07-01T10:00:00Z', problem: null, metadata: {} }],
      pagination: createPagination(1),
    } }));
    await page.route('**/api/v1/admin/users/*', route => route.fulfill({ json: createUserDetail() }));
    await page.goto('/admin/users/00000000-0000-0000-0000-000000000100?tab=legacy_practice');
    for (const difficulty of ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']) await expect(page.getByText(difficulty, { exact: true })).toBeVisible();
    await expect(page.getByText('Not available', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Arrays')).toBeVisible();
    await expect(page.getByRole('cell', { name: '30%', exact: true })).toBeVisible();
    await expect(page.getByText('Not available yet')).toBeVisible();
    await page.getByRole('tab', { name: 'Legacy Activity' }).click();
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

  test('empty out-of-range product lists retain a route to the previous page', async ({ authenticatedPage: page }) => {
    await mockProfile(page);
    let requestedOffset = -1;
    await page.route('**/api/v1/admin/analytics/users?*', route => {
      requestedOffset = Number(new URL(route.request().url()).searchParams.get('offset'));
      return route.fulfill({ json: {
        coverage: { generated_at:'2026-10-23T06:00:00Z',since:'2026-10-01T00:00:00Z',until:'2026-10-23T06:00:00Z',telemetry_since:null,history:'Fixture only' },
        items: [], total: requestedOffset === 0 ? 26 : 0,
      } });
    });
    await page.goto('/admin/users');
    await page.getByRole('button', {name:'Next',exact:true}).click();
    await expect.poll(() => requestedOffset).toBe(25);
    await expect(page.getByText('0 registered records matching filter')).toBeVisible();
    await page.getByRole('button', {name:'Previous',exact:true}).click();
    // The first page may be served from the query cache without another request.
    await expect(page.getByText('26 registered records matching filter')).toBeVisible();
    await expect(page.getByRole('button', {name:'Previous',exact:true})).toBeDisabled();
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
