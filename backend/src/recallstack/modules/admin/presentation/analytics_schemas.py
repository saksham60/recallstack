from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from recallstack.modules.admin.presentation.schemas import PaginationResponse


class AdminSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InterviewUnlock(AdminSchema):
    required_completions: int = 100
    current_completions: int
    remaining_completions: int
    eligible: bool


class UserMetrics(AdminSchema):
    total: int
    new_today: int
    new_last_7_days: int
    new_last_30_days: int
    active_last_24_hours: int
    active_last_7_days: int
    active_last_30_days: int


class ProblemMetrics(AdminSchema):
    total_published: int
    total_attempts: int
    accepted_attempts: int
    unique_user_problem_attempts: int
    unique_user_problem_completions: int
    completion_rate: float


class ProgressMetrics(AdminSchema):
    average_unique_problems_completed: float
    users_with_zero_completions: int
    users_with_1_to_69_completions: int
    users_with_70_to_99_completions: int
    users_with_100_or_more_completions: int


class OverviewResponse(AdminSchema):
    users: UserMetrics
    problems: ProblemMetrics
    progress: ProgressMetrics
    generated_at: datetime


class AdminUserListItem(AdminSchema):
    user_id: UUID
    name: str | None
    email: str
    created_at: datetime
    last_active_at: datetime | None
    account_status: Literal["active"] = "active"
    unique_problems_attempted: int
    unique_problems_completed: int
    current_streak: None = None
    readiness_score: None = None
    interview_unlock: InterviewUnlock


class AnalyticsUserListResponse(AdminSchema):
    items: list[AdminUserListItem]
    pagination: PaginationResponse


class UserProfile(AdminSchema):
    user_id: UUID
    name: str | None
    email: str
    created_at: datetime
    last_active_at: datetime | None
    account_status: Literal["active"] = "active"


class ProgressSummary(AdminSchema):
    unique_problems_attempted: int
    unique_problems_completed: int
    total_attempts: int
    accepted_attempts: int
    first_attempt_successes: int
    first_attempt_success_rate: float
    current_streak: None = None
    longest_streak: None = None
    readiness_score: None = None


class DifficultyProgress(AdminSchema):
    difficulty: str
    attempted: int
    completed: int


class TopicProgress(AdminSchema):
    topic_id: UUID
    topic_name: str
    available_problems: int
    attempted_problems: int
    completed_problems: int
    completion_percentage: float


class RevisionSummary(AdminSchema):
    available: bool
    total_revision_items: int
    completed_revisions: int
    overdue_revisions: int
    last_revision_at: datetime | None


class MockTestSummary(AdminSchema):
    available: bool = False
    total_attempts: int = 0
    completed_tests: int = 0
    average_score: None = None


class UserDetailResponse(AdminSchema):
    profile: UserProfile
    progress_summary: ProgressSummary
    interview_unlock: InterviewUnlock
    difficulty_breakdown: list[DifficultyProgress]
    topic_progress: list[TopicProgress]
    revision_summary: RevisionSummary
    mock_test_summary: MockTestSummary


class ActivityProblem(AdminSchema):
    problem_id: UUID
    title: str
    difficulty: str
    topic: str | None


class ActivityItem(AdminSchema):
    activity_id: str
    activity_type: str
    occurred_at: datetime
    problem: ActivityProblem | None
    metadata: dict[str, object | None]


class ActivityListResponse(AdminSchema):
    items: list[ActivityItem]
    pagination: PaginationResponse


class ProblemAnalyticsItem(AdminSchema):
    problem_id: UUID
    title: str
    difficulty: str
    publication_status: str
    topics: list[str]
    total_attempts: int
    accepted_attempts: int
    unique_users_attempted: int
    unique_users_completed: int
    solve_rate: float
    first_attempt_successes: int
    first_attempt_success_rate: float
    average_attempts_before_completion: float | None
    average_solve_time_seconds: float | None
    hint_usage_count: int | None


class ProblemAnalyticsListResponse(AdminSchema):
    items: list[ProblemAnalyticsItem]
    pagination: PaginationResponse


class ProblemIdentity(AdminSchema):
    problem_id: UUID
    title: str
    difficulty: str
    publication_status: str
    topics: list[str]


class ProblemAnalyticsSummary(AdminSchema):
    total_attempts: int
    accepted_attempts: int
    unique_users_attempted: int
    unique_users_completed: int
    solve_rate: float
    first_attempt_success_rate: float
    average_attempts_before_completion: float | None
    average_solve_time_seconds: float | None
    hint_usage_count: int | None


class RecentAttempt(AdminSchema):
    user_id: UUID
    user_name: str | None
    attempted_at: datetime
    status: str
    attempt_number: int


class ProblemDetailResponse(AdminSchema):
    problem: ProblemIdentity
    analytics: ProblemAnalyticsSummary
    recent_attempts: list[RecentAttempt]


class AuditLogItem(AdminSchema):
    id: int
    admin_user_id: UUID
    action: str
    resource_type: str
    resource_id: str | None
    request_method: str
    request_path: str
    request_id: str
    metadata_json: dict[str, object]
    created_at: datetime


class AuditLogListResponse(AdminSchema):
    items: list[AuditLogItem]
    pagination: PaginationResponse
