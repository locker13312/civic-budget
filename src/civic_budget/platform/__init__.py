"""Інфраструктура без бізнес-правил: налаштування, помилки, версія збірки."""

from civic_budget.platform.build import git_sha
from civic_budget.platform.config import Settings
from civic_budget.platform.errors import DomainError

__all__ = ["DomainError", "Settings", "git_sha"]
