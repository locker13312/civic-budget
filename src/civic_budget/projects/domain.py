from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum

from civic_budget.cycles.domain import Category, Cycle, Phase
from civic_budget.identity.domain import Role, User
from civic_budget.platform.errors import DomainError


class ProjectStatus(StrEnum):
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class Decision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class SubmissionError(DomainError):
    code = "submission_rejected"


class ReviewError(DomainError):
    code = "review_rejected"


@dataclass(frozen=True, slots=True)
class Project:
    id: int
    cycle_id: int
    author_id: int
    category: Category
    title: str
    cost: int  # копійки
    status: ProjectStatus
    submitted_at: datetime


@dataclass(frozen=True, slots=True)
class Review:
    project_id: int
    moderator_id: int
    decision: Decision
    reason: str
    decided_at: datetime


def submit(
    *,
    project_id: int,
    cycle: Cycle,
    author: User,
    category: Category,
    title: str,
    cost: int,
    now: datetime,
) -> Project:
    """Сценарій 1: подання заявки."""
    if not author.is_verified:
        raise SubmissionError("автор не верифікований")
    if cycle.phase_at(now) is not Phase.SUBMISSION:
        raise SubmissionError("подання заявок зараз закрите")
    if not title.strip():
        raise SubmissionError("назва проєкту порожня")
    max_cost = cycle.limit_for(category).max_cost
    if not 0 < cost <= max_cost:
        raise SubmissionError(
            f"вартість має бути від 1 коп. до {max_cost} коп. для категорії {category}"
        )
    return Project(
        id=project_id,
        cycle_id=cycle.id,
        author_id=author.id,
        category=category,
        title=title.strip(),
        cost=cost,
        status=ProjectStatus.SUBMITTED,
        submitted_at=now,
    )


def review(
    project: Project,
    *,
    cycle: Cycle,
    moderator: User,
    decision: Decision,
    reason: str,
    now: datetime,
) -> tuple[Project, Review]:
    """Сценарій 2: рішення модератора; статус і Review змінюються разом."""
    if moderator.role is not Role.MODERATOR:
        raise ReviewError("рішення ухвалює лише модератор")
    if project.cycle_id != cycle.id:
        raise ReviewError("проєкт з іншого раунду")
    if cycle.phase_at(now) not in (Phase.SUBMISSION, Phase.REVIEW):
        raise ReviewError("модерація можлива лише до початку голосування")
    if project.status is not ProjectStatus.SUBMITTED:
        raise ReviewError(f"проєкт уже має статус {project.status}")
    if decision is Decision.REJECT and not reason.strip():
        raise ReviewError("для відхилення потрібна причина")

    status = (
        ProjectStatus.APPROVED
        if decision is Decision.APPROVE
        else ProjectStatus.REJECTED
    )
    decided = Review(
        project_id=project.id,
        moderator_id=moderator.id,
        decision=decision,
        reason=reason.strip(),
        decided_at=now,
    )
    return replace(project, status=status), decided
