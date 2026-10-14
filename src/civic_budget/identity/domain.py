from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class Role(StrEnum):
    RESIDENT = "resident"
    MODERATOR = "moderator"
    ADMIN = "admin"


@dataclass(frozen=True, slots=True)
class User:
    id: int
    full_name: str
    role: Role
    verified_at: datetime | None = None

    @property
    def is_verified(self) -> bool:
        return self.verified_at is not None
