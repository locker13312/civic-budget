from pathlib import Path

from scripts.check_docs import (
    PAGE_WORDS,
    check_adr,
    check_criteria,
    check_page,
    run,
)

ROOT = Path(__file__).resolve().parents[2]
SPEC = Path("tasks/07-x/spec.md")

ADR = """---
status: accepted
date: 2026-10-14
---
# Обрати щось

## Контекст і проблема
## Розглянуті варіанти

* Варіант А
* Варіант Б

## Рішення

Обрано: «{choice}», бо так.

### Наслідки
### Підтвердження
"""


def test_repository_documents_pass() -> None:
    assert run(ROOT) == []


def test_adr_choice_must_be_one_of_options() -> None:
    path = Path("adr/0009-obraty-shchos.md")

    assert check_adr(path, ADR.format(choice="Варіант Б")) == []
    assert any(
        "відсутній у переліку" in e for e in check_adr(path, ADR.format(choice="В"))
    )


def test_criterion_marked_test_needs_marker() -> None:
    table = "| AC-7.1 | щось видно | тест |\n"

    assert check_criteria(SPEC, table, 7, {"AC-7.1"}, set()) == []
    assert check_criteria(SPEC, table, 7, set(), set()) != []


def test_criterion_make_target_must_exist() -> None:
    table = "| AC-7.1 | щось видно | `make demo` |\n"

    assert check_criteria(SPEC, table, 7, set(), {"demo"}) == []
    assert check_criteria(SPEC, table, 7, set(), set()) != []


def test_criterion_id_must_match_task_number() -> None:
    table = "| AC-3.1 | щось видно | тест |\n"

    assert any("AC-7" in e for e in check_criteria(SPEC, table, 7, {"AC-3.1"}, set()))


def test_page_limit_ignores_code_blocks() -> None:
    sections = ("Що і навіщо",)
    code = "```\n" + "слово " * (PAGE_WORDS * 2) + "\n```\n"
    long_prose = "слово " * (PAGE_WORDS + 1)

    assert check_page(SPEC, "## Що і навіщо\n" + code, sections, PAGE_WORDS) == []
    assert check_page(SPEC, "## Що і навіщо\n" + long_prose, sections, PAGE_WORDS)
