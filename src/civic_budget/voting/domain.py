from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime

from civic_budget.cycles.domain import Cycle, Phase
from civic_budget.identity.domain import User
from civic_budget.platform.errors import DomainError
from civic_budget.projects.domain import Project, ProjectStatus


class VoteError(DomainError):
    code = "vote_rejected"


@dataclass(frozen=True, slots=True)
class Vote:
    voter_id: int
    project_id: int
    cycle_id: int
    cast_at: datetime


def cast_vote(
    *,
    voter: User,
    project: Project,
    cycle: Cycle,
    voter_votes: Sequence[Vote],
    now: datetime,
) -> Vote:
    """Сценарій 3: голос мешканця. voter_votes це вже віддані голоси виборця."""
    if not voter.is_verified:
        raise VoteError("голосувати можуть лише верифіковані мешканці")
    if cycle.phase_at(now) is not Phase.VOTING:
        raise VoteError("голосування зараз закрите")
    if project.cycle_id != cycle.id or project.status is not ProjectStatus.APPROVED:
        raise VoteError("за цей проєкт не можна голосувати")
    in_cycle = [v for v in voter_votes if v.cycle_id == cycle.id]
    if any(v.project_id == project.id for v in in_cycle):
        raise VoteError("ви вже голосували за цей проєкт")
    if len(in_cycle) >= cycle.max_votes:
        raise VoteError(f"вичерпано ліміт: {cycle.max_votes} голосів на раунд")
    return Vote(
        voter_id=voter.id,
        project_id=project.id,
        cycle_id=cycle.id,
        cast_at=now,
    )


def count_votes(votes: Iterable[Vote]) -> dict[int, int]:
    return dict(Counter(v.project_id for v in votes))
