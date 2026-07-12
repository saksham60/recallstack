from typing import Annotated, cast

from fastapi import APIRouter, Path, Request

from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.modules.catalog.presentation.schemas import CategoryDashboardResponse
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency

router = APIRouter(prefix="/domains", tags=["catalog"])


@router.get(
    "/{domainSlug}/categories",
    response_model=list[CategoryDashboardResponse],
    operation_id="getDomainCategoryDashboard",
)
async def get_category_dashboard(
    domain_slug: Annotated[str, Path(alias="domainSlug", min_length=1, max_length=100)],
    current_user: CurrentUserDependency,
    request: Request,
) -> list[CategoryDashboardResponse]:
    service = cast(CategoryDashboardService, request.app.state.category_dashboard_service)
    items = await service.query(domain_slug=domain_slug, profile_id=current_user.profile_id)
    return [CategoryDashboardResponse.model_validate(item, from_attributes=True) for item in items]
