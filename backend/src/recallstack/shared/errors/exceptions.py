class AppError(Exception):
    def __init__(
        self,
        *,
        error_type: str,
        title: str,
        status: int,
        detail: str,
    ) -> None:
        super().__init__(detail)
        self.error_type = error_type
        self.title = title
        self.status = status
        self.detail = detail


class AuthenticationError(AppError):
    def __init__(self, detail: str = "A valid bearer token is required") -> None:
        super().__init__(
            error_type="authentication-required",
            title="Authentication required",
            status=401,
            detail=detail,
        )


class AuthorizationError(AppError):
    def __init__(self, detail: str = "You are not permitted to perform this action") -> None:
        super().__init__(
            error_type="forbidden",
            title="Access denied",
            status=403,
            detail=detail,
        )
