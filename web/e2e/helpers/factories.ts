import type { components } from '../../src/lib/api/types';

type PublishedStudyNoteResponse = components['schemas']['PublishedStudyNoteResponse'];

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
