from recallstack.modules.identity.domain.entities import Profile
from recallstack.modules.identity.infrastructure.sqlalchemy_models import ProfileModel


def profile_to_domain(model: ProfileModel) -> Profile:
    return Profile(
        id=model.id,
        display_name=model.display_name,
        avatar_url=model.avatar_url,
        timezone=model.timezone,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )
