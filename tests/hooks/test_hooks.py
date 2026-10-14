"""Хуки перевіряються на справжньому git у тимчасовому репозиторії."""

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

pytestmark = pytest.mark.hooks

ROOT = Path(__file__).resolve().parents[2]
SKIP = shutil.ignore_patterns(
    ".git",
    ".venv",
    "dist",
    "__pycache__",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
    ".env",
)

DIRTY = "import os,sys\nx=1\n"  # не відформатовано і невикористані імпорти
CLEAN = "x = 1\n"
TYPE_ERROR = 'x: int = "один"\n'  # формат і лінтер чисті, mypy ні
NEW_FILE = "src/civic_budget/platform/sample.py"


@dataclass
class Repo:
    path: Path
    env: dict[str, str]

    def git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args],
            cwd=self.path,
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )

    def write(self, rel: str, text: str) -> None:
        (self.path / rel).write_text(text, encoding="utf-8")

    def commit(self, message: str, *flags: str) -> subprocess.CompletedProcess[str]:
        return self.git("commit", "-m", message, *flags)


@pytest.fixture
def repo(tmp_path: Path) -> Repo:
    path = tmp_path / "repo"
    shutil.copytree(ROOT, path, ignore=SKIP)
    venv = Path(os.environ.get("VENV", ROOT / ".venv")).resolve()
    env = {
        **os.environ,
        "VENV": str(venv),
        "CIVIC_NESTED": "1",
        "GIT_AUTHOR_NAME": "test",
        "GIT_AUTHOR_EMAIL": "test@example.com",
        "GIT_COMMITTER_NAME": "test",
        "GIT_COMMITTER_EMAIL": "test@example.com",
    }
    # змінні, які git виставляє, коли тести запускає сам хук
    for var in ("GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "PYTHONPATH"):
        env.pop(var, None)
    repo = Repo(path, env)
    repo.git("init", "-q", "-b", "main")
    repo.git("config", "commit.gpgsign", "false")
    repo.git("add", "-A")
    first = repo.git("-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "init")
    assert first.returncode == 0, first.stderr
    repo.git("config", "core.hooksPath", ".githooks")
    return repo


@pytest.mark.ac("AC-1.2")
def test_pre_commit_blocks_dirty_and_passes_clean(repo: Repo) -> None:
    repo.write(NEW_FILE, DIRTY)
    repo.git("add", NEW_FILE)

    blocked = repo.commit("dirty")

    assert blocked.returncode != 0
    assert "коміт відхилено" in blocked.stderr
    assert repo.git("rev-list", "--count", "HEAD").stdout.strip() == "1"

    repo.write(NEW_FILE, CLEAN)
    repo.git("add", NEW_FILE)

    passed = repo.commit("clean")

    assert passed.returncode == 0, passed.stdout + passed.stderr


@pytest.mark.ac("AC-1.3")
def test_pre_commit_ignores_unstaged_dirty_changes(repo: Repo) -> None:
    repo.write(NEW_FILE, CLEAN)
    repo.git("add", NEW_FILE)
    repo.write(NEW_FILE, DIRTY)  # робоча копія брудна, індекс чистий

    result = repo.commit("staged is clean")

    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.ac("AC-1.3")
def test_pre_commit_checks_staged_not_working_copy(repo: Repo) -> None:
    repo.write(NEW_FILE, DIRTY)
    repo.git("add", NEW_FILE)
    repo.write(NEW_FILE, CLEAN)  # виправлено, але не проіндексовано

    result = repo.commit("staged is dirty")

    assert result.returncode != 0
    assert "коміт відхилено" in result.stderr


@pytest.mark.ac("AC-1.4")
def test_pre_push_runs_full_check(repo: Repo, tmp_path: Path) -> None:
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    repo.git("remote", "add", "origin", str(remote))

    # pre-commit пропускає (формат і лінтер чисті), ловить лише mypy
    repo.write(NEW_FILE, TYPE_ERROR)
    repo.git("add", NEW_FILE)
    assert repo.commit("type error").returncode == 0

    rejected = repo.git("push", "origin", "main")

    assert rejected.returncode != 0
    assert "push відхилено" in rejected.stderr

    repo.write(NEW_FILE, 'x: str = "один"\n')
    repo.git("add", NEW_FILE)
    assert repo.commit("fix types").returncode == 0

    accepted = repo.git("push", "origin", "main")

    assert accepted.returncode == 0, accepted.stdout + accepted.stderr
