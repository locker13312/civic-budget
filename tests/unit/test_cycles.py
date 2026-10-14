from datetime import datetime, timedelta

import pytest

from civic_budget.cycles import Category, CategoryLimit, CycleError, Phase
from tests.conftest import (
    IN_RESULTS,
    IN_REVIEW,
    IN_SUBMISSION,
    IN_VOTING,
    T0,
    make_cycle,
)

pytestmark = pytest.mark.ac("AC-1.7")


@pytest.mark.parametrize(
    ("moment", "phase"),
    [
        (T0 - timedelta(seconds=1), Phase.PLANNED),
        (T0, Phase.SUBMISSION),
        (IN_SUBMISSION, Phase.SUBMISSION),
        (IN_REVIEW, Phase.REVIEW),
        (IN_VOTING, Phase.VOTING),
        (IN_RESULTS, Phase.RESULTS),
    ],
)
def test_phase_follows_cycle_dates(moment: datetime, phase: Phase) -> None:
    assert make_cycle().phase_at(moment) is phase


def test_cycle_rejects_overlapping_phases() -> None:
    cycle = make_cycle()

    with pytest.raises(CycleError):
        type(cycle)(
            id=2,
            title="зламаний",
            submission_from=cycle.submission_from,
            submission_to=cycle.voting_from,
            voting_from=cycle.submission_to,
            voting_to=cycle.voting_to,
            max_votes=5,
            min_votes=0,
            limits=cycle.limits,
        )


def test_limit_cost_cannot_exceed_category_budget() -> None:
    with pytest.raises(CycleError):
        CategoryLimit(Category.SMALL, budget=100, max_cost=101)
