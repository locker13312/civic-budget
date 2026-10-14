import pytest

from civic_budget.cycles import Category, Cycle
from civic_budget.identity import Role
from civic_budget.projects import (
    Decision,
    Project,
    ProjectStatus,
    ReviewError,
    SubmissionError,
    review,
    submit,
)
from tests.conftest import IN_REVIEW, IN_SUBMISSION, IN_VOTING, make_user

pytestmark = pytest.mark.ac("AC-1.7")

MODERATOR = make_user(90, Role.MODERATOR)


def submitted(cycle: Cycle, cost: int = 50_000) -> Project:
    return submit(
        project_id=1,
        cycle=cycle,
        author=make_user(1),
        category=Category.SMALL,
        title="  Лавки в сквері  ",
        cost=cost,
        now=IN_SUBMISSION,
    )


def test_submit_creates_submitted_project(cycle: Cycle) -> None:
    project = submitted(cycle)

    assert project.status is ProjectStatus.SUBMITTED
    assert project.title == "Лавки в сквері"
    assert project.submitted_at == IN_SUBMISSION


def test_submit_accepts_cost_equal_to_category_max(cycle: Cycle) -> None:
    assert submitted(cycle, cost=60_000).cost == 60_000


@pytest.mark.parametrize("cost", [0, -1, 60_001])
def test_submit_rejects_cost_outside_category_limit(cycle: Cycle, cost: int) -> None:
    with pytest.raises(SubmissionError):
        submitted(cycle, cost=cost)


def test_submit_rejects_unverified_author(cycle: Cycle) -> None:
    with pytest.raises(SubmissionError, match="верифікований"):
        submit(
            project_id=1,
            cycle=cycle,
            author=make_user(1, verified=False),
            category=Category.SMALL,
            title="Лавки",
            cost=100,
            now=IN_SUBMISSION,
        )


def test_submit_rejects_outside_submission_phase(cycle: Cycle) -> None:
    with pytest.raises(SubmissionError, match="закрите"):
        submit(
            project_id=1,
            cycle=cycle,
            author=make_user(1),
            category=Category.SMALL,
            title="Лавки",
            cost=100,
            now=IN_REVIEW,
        )


def test_review_approves_and_records_decision(cycle: Cycle) -> None:
    project, decided = review(
        submitted(cycle),
        cycle=cycle,
        moderator=MODERATOR,
        decision=Decision.APPROVE,
        reason="",
        now=IN_REVIEW,
    )

    assert project.status is ProjectStatus.APPROVED
    assert decided.moderator_id == MODERATOR.id
    assert decided.decision is Decision.APPROVE


def test_review_reject_requires_reason(cycle: Cycle) -> None:
    with pytest.raises(ReviewError, match="причина"):
        review(
            submitted(cycle),
            cycle=cycle,
            moderator=MODERATOR,
            decision=Decision.REJECT,
            reason="   ",
            now=IN_REVIEW,
        )


def test_review_only_by_moderator(cycle: Cycle) -> None:
    with pytest.raises(ReviewError, match="модератор"):
        review(
            submitted(cycle),
            cycle=cycle,
            moderator=make_user(5),
            decision=Decision.APPROVE,
            reason="",
            now=IN_REVIEW,
        )


def test_review_closed_once_voting_started(cycle: Cycle) -> None:
    with pytest.raises(ReviewError, match="голосування"):
        review(
            submitted(cycle),
            cycle=cycle,
            moderator=MODERATOR,
            decision=Decision.APPROVE,
            reason="",
            now=IN_VOTING,
        )


def test_review_cannot_change_decided_project(cycle: Cycle) -> None:
    approved, _ = review(
        submitted(cycle),
        cycle=cycle,
        moderator=MODERATOR,
        decision=Decision.APPROVE,
        reason="",
        now=IN_REVIEW,
    )

    with pytest.raises(ReviewError, match="статус"):
        review(
            approved,
            cycle=cycle,
            moderator=MODERATOR,
            decision=Decision.REJECT,
            reason="передумали",
            now=IN_REVIEW,
        )
