from typing import Protocol, TypeVar

SessionT = TypeVar("SessionT", covariant=True)


class DatabaseSessionFactory(Protocol[SessionT]):
    """Provider-neutral port for creating request or unit-of-work sessions."""

    def create_session(self) -> SessionT: ...
