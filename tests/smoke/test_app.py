import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from civic_budget import __version__
from civic_budget.platform import git_sha
from civic_budget.web import create_app

pytestmark = [pytest.mark.smoke, pytest.mark.ac("AC-1.5")]


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version_returns_sha_from_env(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GIT_SHA", "abc123def4567890")
    git_sha.cache_clear()

    response = client.get("/version")

    assert response.status_code == 200
    assert response.json() == {"version": __version__, "sha": "abc123def456"}
    git_sha.cache_clear()


def test_version_falls_back_to_git(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = Path(__file__).resolve().parents[2]
    head = subprocess.run(
        ["git", "rev-parse", "--short=12", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if head.returncode != 0:
        pytest.skip("запуск не в git-репозиторії (знімок у хуку)")
    monkeypatch.delenv("GIT_SHA", raising=False)
    git_sha.cache_clear()

    response = client.get("/version")

    assert response.json()["sha"] == head.stdout.strip()
    git_sha.cache_clear()
