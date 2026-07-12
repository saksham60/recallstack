from contextvars import ContextVar

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
trace_id_context: ContextVar[str | None] = ContextVar("trace_id", default=None)
profile_id_context: ContextVar[str | None] = ContextVar("profile_id", default=None)
