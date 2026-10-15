"""Run tests in a disposable local PostgreSQL cluster, without Docker or .env edits.

Usage: uv run python scripts/run_postgres_tests.py --postgres-bin PATH [pytest arguments]
The binaries must already be installed. Nothing is downloaded or installed by this script.
"""

# All subprocess arguments come from this script or the local developer's CLI;
# no shell is involved.
# ruff: noqa: S603

import argparse
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-bin", type=Path, required=True)
    args, pytest_args = parser.parse_known_args()
    binary = args.postgres_bin.resolve()
    suffix = ".exe" if os.name == "nt" else ""
    initdb, pg_ctl, createdb = [
        binary / f"{name}{suffix}" for name in ("initdb", "pg_ctl", "createdb")
    ]
    if not all(p.is_file() for p in (initdb, pg_ctl, createdb)):
        parser.error("--postgres-bin must contain initdb, pg_ctl and createdb")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    cluster_parent = Path(".pytest_cache/postgres-clusters").resolve()
    cluster_parent.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="recallstack-dsa-tests-", dir=cluster_parent))
    data = root / "data"
    started = False
    try:
        subprocess.run(
            [
                str(initdb),
                "-D",
                str(data),
                "-U",
                "postgres",
                "-A",
                "trust",
                "--encoding=UTF8",
                "--locale=C",
            ],
            check=True,
        )
        subprocess.run(
            [
                str(pg_ctl),
                "-D",
                str(data),
                "-l",
                str(root / "postgres.log"),
                "-o",
                f"-h 127.0.0.1 -p {port}",
                "-w",
                "start",
            ],
            check=True,
        )
        started = True
        subprocess.run(
            [
                str(createdb),
                "-h",
                "127.0.0.1",
                "-p",
                str(port),
                "-U",
                "postgres",
                "recallstack_dsa_test",
            ],
            check=True,
        )
        environment = dict(os.environ)
        # Existing test switches only, confined to this child process.
        environment["RUN_INTEGRATION_TESTS"] = "1"
        environment["TEST_DATABASE_URL"] = (
            f"postgresql+psycopg://postgres@127.0.0.1:{port}/recallstack_dsa_test"
        )
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                "--basetemp",
                str(root / "pytest-temp"),
                *(pytest_args or ["-q"]),
            ],
            env=environment,
            check=False,
        ).returncode
    finally:
        if started:
            subprocess.run([str(pg_ctl), "-D", str(data), "-m", "fast", "-w", "stop"], check=True)
        # root is created by this invocation, never supplied by the caller.
        if root.resolve().parent != cluster_parent:
            raise RuntimeError("Disposable cluster path escaped the temporary directory")
        shutil.rmtree(root.resolve())


if __name__ == "__main__":
    raise SystemExit(main())
