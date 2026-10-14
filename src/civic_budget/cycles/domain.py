from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from itertools import pairwise

from civic_budget.platform import DomainError


class Phase(StrEnum):
    PLANNED = "planned"
    SUBMISSION = "submission"
    REVIEW = "review"
    VOTING = "voting"
    RESULTS = "results"


class Category(StrEnum):
    SMALL = "small"
    LARGE = "large"


class CycleError(DomainError):
    code = "invalid_cycle"


@dataclass(frozen=True, slots=True)
class CategoryLimit:
    category: Category
    budget: int  # копійки
    max_cost: int  # копійки

    def __post_init__(self) -> None:
        if self.budget <= 0 or self.max_cost <= 0:
            raise CycleError("бюджет і максимальна вартість мають бути додатні")
        if self.max_cost > self.budget:
            raise CycleError("максимальна вартість більша за бюджет категорії")


@dataclass(frozen=True, slots=True)
class Cycle:
    id: int
    title: str
    submission_from: datetime
    submission_to: datetime
    voting_from: datetime
    voting_to: datetime
    max_votes: int
    min_votes: int
    limits: tuple[CategoryLimit, ...]

    def __post_init__(self) -> None:
        dates = (
            self.submission_from,
            self.submission_to,
            self.voting_from,
            self.voting_to,
        )
        if any(a >= b for a, b in pairwise(dates)):
            raise CycleError("фази раунду мають іти по черзі без перекриття")
        if self.max_votes < 1 or self.min_votes < 0:
            raise CycleError("max_votes має бути не менше 1, min_votes не від'ємний")
        categories = [limit.category for limit in self.limits]
        if len(set(categories)) != len(categories):
            raise CycleError("ліміт для категорії задано двічі")

    def phase_at(self, moment: datetime) -> Phase:
        if moment < self.submission_from:
            return Phase.PLANNED
        if moment < self.submission_to:
            return Phase.SUBMISSION
        if moment < self.voting_from:
            return Phase.REVIEW
        if moment < self.voting_to:
            return Phase.VOTING
        return Phase.RESULTS

    def limit_for(self, category: Category) -> CategoryLimit:
        for limit in self.limits:
            if limit.category is category:
                return limit
        raise CycleError(f"у раунді немає категорії {category}")
