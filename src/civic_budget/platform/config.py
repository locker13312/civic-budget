from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CIVIC_", env_file=".env")

    database_url: str = "sqlite:///./civic_budget.db"
    git_sha: str | None = Field(default=None, validation_alias="GIT_SHA")
