import ast
import inspect
from datetime import timedelta
from pathlib import Path

import pytest

from civic_budget.cycles import Category
from civic_budget.projects import Project, ProjectStatus
from civic_budget.results import Outcome, TallyError, tally
from tests.conftest import IN_RESULTS, IN_SUBMISSION, IN_VOTING, make_cycle

pytestmark = pytest.mark.ac("AC-1.7")

ROOT = Path(__file__).resolve().parents[2]


def project(
    project_id: int,
    cost: int,
    *,
    status: ProjectStatus = ProjectStatus.APPROVED,
    minutes: int = 0,
) -> Project:
    return Project(
        id=project_id,
        cycle_id=1,
        author_id=1,
        category=Category.SMALL,
        title=f"Проєкт {project_id}",
        cost=cost,
        status=status,
        submitted_at=IN_SUBMISSION + timedelta(minutes=minutes),
    )


def funded(outcomes: list[Outcome]) -> set[int]:
    return {o.project_id for o in outcomes if o.funded}


def test_winners_fill_budget_by_votes_skipping_what_does_not_fit() -> None:
    cycle = make_cycle(small_budget=100_000, small_max_cost=60_000, min_votes=1)
    projects = [project(1, 60_000), project(2, 50_000), project(3, 40_000)]
    outcomes = tally(cycle, projects, {1: 10, 2: 8, 3: 5}, IN_RESULTS)

    # 1 вміщається, 2 вже ні (60+50 > 100), 3 вміщається в залишок 40
    assert funded(outcomes) == {1, 3}
    assert [o.rank for o in outcomes] == [1, 2, 3]


def test_projects_below_min_votes_are_not_funded() -> None:
    cycle = make_cycle(min_votes=3)

    outcomes = tally(cycle, [project(1, 10_000)], {1: 2}, IN_RESULTS)

    assert funded(outcomes) == set()
    assert outcomes[0].votes == 2


def test_tie_goes_to_earlier_submission() -> None:
    cycle = make_cycle(small_budget=60_000, min_votes=1)
    late, early = project(1, 60_000, minutes=5), project(2, 60_000, minutes=1)

    outcomes = tally(cycle, [late, early], {1: 4, 2: 4}, IN_RESULTS)

    assert funded(outcomes) == {2}


def test_only_approved_projects_get_outcome() -> None:
    cycle = make_cycle(min_votes=0)
    rejected = project(2, 10_000, status=ProjectStatus.REJECTED)

    outcomes = tally(cycle, [project(1, 10_000), rejected], {}, IN_RESULTS)

    assert [o.project_id for o in outcomes] == [1]


def test_tally_is_repeatable() -> None:
    cycle = make_cycle(min_votes=1)
    projects = [project(1, 30_000), project(2, 30_000)]
    counts = {1: 3, 2: 3}

    assert tally(cycle, projects, counts, IN_RESULTS) == tally(
        cycle, projects, counts, IN_RESULTS
    )


def test_tally_rejected_before_voting_ends() -> None:
    with pytest.raises(TallyError):
        tally(make_cycle(), [], {}, IN_VOTING)


@pytest.mark.ac("AC-1.11")
def test_results_takes_only_vote_counts_from_voting() -> None:
    package = ROOT / "src" / "civic_budget" / "results"
    imported: set[str] = set()
    for file in package.glob("*.py"):
        for node in ast.walk(ast.parse(file.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom) and (node.module or "").startswith(
                "civic_budget.voting"
            ):
                imported.update(alias.name for alias in node.names)

    assert imported == {"VoteCounts"}
    assert "counts" in inspect.signature(tally).parameters
