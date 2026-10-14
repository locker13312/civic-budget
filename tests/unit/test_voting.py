import pytest

from civic_budget.cycles import Category, Cycle
from civic_budget.projects import Project, ProjectStatus
from civic_budget.voting import Vote, VoteError, cast_vote, count_votes
from tests.conftest import IN_REVIEW, IN_SUBMISSION, IN_VOTING, make_cycle, make_user

pytestmark = pytest.mark.ac("AC-1.7")

VOTER = make_user(7)


def project(
    project_id: int = 1,
    status: ProjectStatus = ProjectStatus.APPROVED,
    cycle_id: int = 1,
) -> Project:
    return Project(
        id=project_id,
        cycle_id=cycle_id,
        author_id=1,
        category=Category.SMALL,
        title=f"Проєкт {project_id}",
        cost=10_000,
        status=status,
        submitted_at=IN_SUBMISSION,
    )


def vote_for(project_id: int, cycle_id: int = 1) -> Vote:
    return Vote(VOTER.id, project_id, cycle_id, IN_VOTING)


def test_vote_for_approved_project(cycle: Cycle) -> None:
    vote = cast_vote(
        voter=VOTER, project=project(), cycle=cycle, voter_votes=[], now=IN_VOTING
    )

    assert vote == Vote(VOTER.id, 1, cycle.id, IN_VOTING)


def test_vote_rejected_when_limit_reached(cycle: Cycle) -> None:
    with pytest.raises(VoteError, match="ліміт"):
        cast_vote(
            voter=VOTER,
            project=project(3),
            cycle=cycle,
            voter_votes=[vote_for(1), vote_for(2)],
            now=IN_VOTING,
        )


def test_votes_from_other_cycle_do_not_count_to_limit(cycle: Cycle) -> None:
    old = [vote_for(1, cycle_id=99), vote_for(2, cycle_id=99)]

    vote = cast_vote(
        voter=VOTER, project=project(3), cycle=cycle, voter_votes=old, now=IN_VOTING
    )

    assert vote.project_id == 3


def test_second_vote_for_same_project_rejected(cycle: Cycle) -> None:
    with pytest.raises(VoteError, match="вже"):
        cast_vote(
            voter=VOTER,
            project=project(1),
            cycle=cycle,
            voter_votes=[vote_for(1)],
            now=IN_VOTING,
        )


@pytest.mark.parametrize(
    "target",
    [
        project(status=ProjectStatus.SUBMITTED),
        project(status=ProjectStatus.REJECTED),
        project(cycle_id=2),
    ],
)
def test_vote_only_for_approved_project_of_this_cycle(
    cycle: Cycle, target: Project
) -> None:
    with pytest.raises(VoteError, match="не можна"):
        cast_vote(
            voter=VOTER, project=target, cycle=cycle, voter_votes=[], now=IN_VOTING
        )


def test_vote_rejected_outside_voting_phase() -> None:
    with pytest.raises(VoteError, match="закрите"):
        cast_vote(
            voter=VOTER,
            project=project(),
            cycle=make_cycle(),
            voter_votes=[],
            now=IN_REVIEW,
        )


def test_unverified_resident_cannot_vote(cycle: Cycle) -> None:
    with pytest.raises(VoteError, match="верифіковані"):
        cast_vote(
            voter=make_user(8, verified=False),
            project=project(),
            cycle=cycle,
            voter_votes=[],
            now=IN_VOTING,
        )


def test_count_votes_per_project_of_cycle() -> None:
    votes = [vote_for(1), vote_for(2), vote_for(1), vote_for(1, cycle_id=99)]

    assert count_votes(votes, cycle_id=1) == {1: 2, 2: 1}
