import asyncio
import sys


def configure_psycopg_event_loop() -> None:
    """Use the selector loop required by psycopg async connections on Windows."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
