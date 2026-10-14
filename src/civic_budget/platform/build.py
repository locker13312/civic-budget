import subprocess
from functools import cache
from pathlib import Path

from civic_budget.platform.config import Settings


@cache
def git_sha() -> str:
    # у CI і `make run` sha передається через GIT_SHA, локально питаємо git
    sha = Settings().git_sha
    if sha:
        return sha[:12]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=Path(__file__).parent,
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return out.stdout.strip() or "unknown"
