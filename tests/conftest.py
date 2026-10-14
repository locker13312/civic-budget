import os
from datetime import UTC, datetime, timedelta

import pytest

from civic_budget.cycles import Category, CategoryLimit, Cycle
from civic_budget.identity import Role, User

T0 = datetime(2026, 3, 1, tzinfo=UTC)
DAY = timedelta(days=1)

# моменти всередині кожної фази тестового раунду
IN_SUBMISSION = T0 + 10 * DAY
IN_REVIEW = T0 + 35 * DAY
IN_VOTING = T0 + 50 * DAY
IN_RESULTS = T0 + 70 * DAY


def make_cycle(
    *,
    cycle_id: int = 1,
    max_votes: int = 2,
    min_votes: int = 2,
    small_budget: int = 100_000,
    small_max_cost: int = 60_000,
) -> Cycle:
    return Cycle(
        id=cycle_id,
        title="Громадський бюджет 2026",
        submission_from=T0,
        submission_to=T0 + 30 * DAY,
        voting_from=T0 + 45 * DAY,
        voting_to=T0 + 60 * DAY,
        max_votes=max_votes,
        min_votes=min_votes,
        limits=(
            CategoryLimit(Category.SMALL, small_budget, small_max_cost),
            CategoryLimit(Category.LARGE, 1_000_000, 500_000),
        ),
    )


def make_user(
    user_id: int = 1, role: Role = Role.RESIDENT, *, verified: bool = True
) -> User:
    return User(
        id=user_id,
        full_name=f"Користувач {user_id}",
        role=role,
        verified_at=T0 - DAY if verified else None,
    )


@pytest.fixture
def cycle() -> Cycle:
    return make_cycle()


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    # усередині тимчасового репозиторію хук-тести не запускаємо, інакше рекурсія
    if os.environ.get("CIVIC_NESTED") != "1":
        return
    skip = pytest.mark.skip(reason="вкладений запуск з тесту хуків")
    for item in items:
        if item.get_closest_marker("hooks"):
            item.add_marker(skip)
