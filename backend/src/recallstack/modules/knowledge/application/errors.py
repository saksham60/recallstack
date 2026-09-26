from recallstack.shared.errors import AppError


def invalid(detail: str, *, status: int = 422) -> AppError:
    return AppError(
        error_type="knowledge-invalid-request",
        title="Invalid Knowledge request",
        status=status,
        detail=detail,
    )
