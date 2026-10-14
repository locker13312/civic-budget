import re
import tomllib
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "src" / "civic_budget"


def modules_in_spec() -> set[str]:
    text = (ROOT / "spec.md").read_text(encoding="utf-8")
    section = text.split("## Компоненти і взаємодія", 1)[1].split("\n## ", 1)[0]
    return set(re.findall(r"^\| `(\w+)` \|", section, flags=re.MULTILINE))


def modules_in_code() -> set[str]:
    return {p.parent.name for p in PACKAGE.glob("*/__init__.py")}


@pytest.mark.ac("AC-1.6")
def test_packages_match_spec_modules() -> None:
    in_spec = modules_in_spec()

    assert in_spec, "у spec.md не знайдено таблицю модулів"
    assert modules_in_code() == in_spec


def contracts() -> list[dict[str, Any]]:
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    found: list[dict[str, Any]] = config["tool"]["importlinter"]["contracts"]
    return found


@pytest.mark.ac("AC-1.9")
def test_every_spec_module_is_covered_by_boundary_contracts() -> None:
    by_type: dict[str, list[dict[str, Any]]] = {}
    for contract in contracts():
        by_type.setdefault(contract["type"], []).append(contract)
    modules = modules_in_spec()

    layered = {
        name.strip().removeprefix("civic_budget.")
        for layer in by_type["layers"][0]["layers"]
        for name in layer.split("|")
    }
    protected = {
        c["allowed_importers"][0].removeprefix("civic_budget.")
        for c in by_type["protected"]
    }
    web_free = {
        name.removeprefix("civic_budget.")
        for name in by_type["forbidden"][0]["source_modules"]
    }

    assert layered == modules, "R1: шари не збігаються з модулями spec"
    assert protected == modules, "R2: не для кожного модуля є контракт"
    assert web_free == modules - {"web"}, "R4: fastapi має бути заборонений поза web"
