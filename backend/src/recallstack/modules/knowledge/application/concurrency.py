import asyncio
from collections.abc import Awaitable, Callable, Sequence


async def bounded_map[T, R](
    items: Sequence[T],
    action: Callable[[T], Awaitable[R]],
    concurrency: int,
) -> tuple[R, ...]:
    """Fixed workers, ordered results, and no task-per-article fanout."""
    if concurrency < 1:
        raise ValueError("concurrency must be positive")
    pending = iter(enumerate(items))
    results: dict[int, R] = {}

    async def worker() -> None:
        for index, item in pending:
            results[index] = await action(item)

    async with asyncio.TaskGroup() as group:
        for _ in range(min(concurrency, len(items))):
            group.create_task(worker())
    return tuple(results[index] for index in range(len(items)))
