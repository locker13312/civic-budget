from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from civic_budget.cycles import Cycle, Phase
from civic_budget.platform import DomainError
from civic_budget.projects import Project, ProjectStatus
from civic_budget.voting import Vote, count_votes


class TallyError(DomainError):
    code = "tally_rejected"


@dataclass(frozen=True, slots=True)
class Outcome:
    project_id: int
    votes: int
    rank: int  # місце в категорії, з 1
    funded: bool
    decided_at: datetime


def tally(
    cycle: Cycle,
    projects: Sequence[Project],
    votes: Sequence[Vote],
    now: datetime,
) -> list[Outcome]:
    """Сценарій 4: переможці кожної категорії в межах її бюджету."""
    if cycle.phase_at(now) is not Phase.RESULTS:
        raise TallyError("підрахунок можливий лише після кінця голосування")

    counts = count_votes(v for v in votes if v.cycle_id == cycle.id)
    outcomes: list[Outcome] = []
    for limit in cycle.limits:
        candidates = [
            p
            for p in projects
            if p.cycle_id == cycle.id
            and p.category is limit.category
            and p.status is ProjectStatus.APPROVED
        ]
        # за рівності голосів вище раніше поданий, далі менший id
        candidates.sort(key=lambda p: (-counts.get(p.id, 0), p.submitted_at, p.id))
        left = limit.budget
        for rank, project in enumerate(candidates, start=1):
            got = counts.get(project.id, 0)
            funded = got >= cycle.min_votes and project.cost <= left
            if funded:
                left -= project.cost
            outcomes.append(
                Outcome(
                    project_id=project.id,
                    votes=got,
                    rank=rank,
                    funded=funded,
                    decided_at=now,
                )
            )
    return outcomes
