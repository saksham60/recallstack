import type { components } from '../../src/lib/api/types';

type PublishedStudyNoteResponse = components['schemas']['PublishedStudyNoteResponse'];
type ProfileResponse = components['schemas']['ProfileResponse'];
type OverviewResponse = components['schemas']['OverviewResponse'];
type AdminUserListItem = components['schemas']['AdminUserListItem'];
type UserDetailResponse = components['schemas']['UserDetailResponse'];
type ProblemAnalyticsItem = components['schemas']['ProblemAnalyticsItem'];

export function createPagination(totalItems = 0, pageSize = 25) {
  return {
    page: 1,
    page_size: pageSize,
    total_items: totalItems,
    total_pages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

export function createStudyNoteResponse(
  overrides: Partial<PublishedStudyNoteResponse> = {},
): PublishedStudyNoteResponse {
  return {
    content_item_id: 'content-1',
    slug: 'mock-slug',
    domain: { id: 'domain-1', name: 'DSA', slug: 'dsa' },
    categories: [{ id: 'category-1', slug: 'category', name: 'Category', sort_order: 0 }],
    topics: [{ id: 'topic-1', slug: 'topic', name: 'Topic', kind: 'pattern', is_primary: true, sort_order: 0 }],
    primary_topic: { id: 'topic-1', slug: 'topic', name: 'Topic', kind: 'pattern', is_primary: true, sort_order: 0 },
    type: 'problem',
    difficulty: 'easy',
    published_version_number: 1,
    title: 'Mock Problem',
    summary: null,
    blocks: [],
    related_content: [],
    prerequisites: [],
    practice_resources: [],
    user_progress: { status: 'new', confidence: 0, last_opened_at: null },
    is_bookmarked: false,
    review_card: null,
    ...overrides,
  };
}

export function createProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 'test-user-id',
    display_name: 'Test Admin',
    avatar_url: null,
    timezone: 'UTC',
    roles: ['admin'],
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

export function createAdminOverview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
  return {
    users: {
      total: 1234, new_today: 4, new_last_7_days: 30, new_last_30_days: 100,
      active_last_24_hours: 80, active_last_7_days: 300, active_last_30_days: 800,
    },
    problems: {
      total_published: 150, total_attempts: 5000, accepted_attempts: 2000,
      unique_user_problem_attempts: 3000, unique_user_problem_completions: 1800,
      completion_rate: 0.6,
    },
    progress: {
      average_unique_problems_completed: 42.5, users_with_zero_completions: 200,
      users_with_1_to_69_completions: 700, users_with_70_to_99_completions: 200,
      users_with_100_or_more_completions: 134,
    },
    generated_at: '2026-07-28T12:00:00Z',
    ...overrides,
  };
}

export function createAdminUser(
  completed: number,
  overrides: Partial<AdminUserListItem> = {},
): AdminUserListItem {
  return {
    user_id: `00000000-0000-0000-0000-000000000${completed}`,
    name: `User ${completed}`,
    email: `user${completed}@example.com`,
    created_at: '2026-07-01T10:00:00Z',
    last_active_at: null,
    account_status: 'active',
    unique_problems_attempted: completed + 5,
    unique_problems_completed: completed,
    current_streak: null,
    readiness_score: null,
    interview_unlock: {
      required_completions: 100,
      current_completions: completed,
      remaining_completions: Math.max(0, 100 - completed),
      eligible: completed >= 100,
    },
    ...overrides,
  };
}

export function createUserDetail(overrides: Partial<UserDetailResponse> = {}): UserDetailResponse {
  return {
    profile: {
      user_id: '00000000-0000-0000-0000-000000000100',
      name: 'Detail User',
      email: 'detail@example.com',
      created_at: '2026-07-01T10:00:00Z',
      last_active_at: null,
      account_status: 'active',
    },
    progress_summary: {
      unique_problems_attempted: 12, unique_problems_completed: 10, total_attempts: 20,
      accepted_attempts: 10, first_attempt_successes: 6, first_attempt_success_rate: 0.6,
      current_streak: null, longest_streak: null, readiness_score: null,
    },
    interview_unlock: { required_completions: 100, current_completions: 10, remaining_completions: 90, eligible: false },
    difficulty_breakdown: ['beginner', 'easy', 'medium', 'hard', 'expert'].map((difficulty) => ({ difficulty, attempted: 2, completed: 1 })),
    topic_progress: [{ topic_id: '00000000-0000-0000-0000-000000000001', topic_name: 'Arrays', available_problems: 10, attempted_problems: 4, completed_problems: 3, completion_percentage: 0.3 }],
    revision_summary: { available: true, total_revision_items: 4, completed_revisions: 2, overdue_revisions: 1, last_revision_at: null },
    mock_test_summary: { available: false, total_attempts: 0, completed_tests: 0, average_score: null },
    ...overrides,
  };
}

export function createProblem(overrides: Partial<ProblemAnalyticsItem> = {}): ProblemAnalyticsItem {
  return {
    problem_id: '00000000-0000-0000-0000-000000000200',
    title: 'Two Sum',
    difficulty: 'easy',
    publication_status: 'published',
    topics: ['Arrays'],
    total_attempts: 100,
    accepted_attempts: 50,
    unique_users_attempted: 80,
    unique_users_completed: 40,
    solve_rate: 0.5,
    first_attempt_successes: 20,
    first_attempt_success_rate: 0.25,
    average_attempts_before_completion: null,
    average_solve_time_seconds: null,
    hint_usage_count: null,
    ...overrides,
  };
}
