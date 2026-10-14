import re
from pathlib import Path

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
