from fastapi import FastAPI
from pydantic import BaseModel

from civic_budget import __version__
from civic_budget.platform.build import git_sha


class Health(BaseModel):
    status: str


class VersionInfo(BaseModel):
    version: str
    sha: str


def create_app() -> FastAPI:
    app = FastAPI(title="Громадський бюджет", version=__version__)

    @app.get("/health")
    def health() -> Health:
        return Health(status="ok")

    @app.get("/version")
    def version() -> VersionInfo:
        return VersionInfo(version=__version__, sha=git_sha())

    return app
