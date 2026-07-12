from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserProgressModel


def progress_status_to_domain(model: UserProgressModel) -> LearningStatus:
    return model.status
