"""Перевіряє документи за стандартами з standards/.

spec і spec інкрементів, ADR, DEFENSE і трасування критеріїв прийняття
до тестів або make-цілей. Повертає 1 і список порушень, якщо щось не так.
"""

import re
import sys
from collections.abc import Iterable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGE_WORDS = 600
DEFENSE_WORDS = 500

SYSTEM_SECTIONS = (
    "Що і навіщо",
    "Компоненти і взаємодія",
    "Дані",
    "Сценарії оновлення даних",
    "Правила меж",
)
INCREMENT_SECTIONS = ("Що і навіщо", "Критерії прийняття", "Поза межами")
ADR_SECTIONS = (
    "Контекст і проблема",
    "Розглянуті варіанти",
    "Рішення",
    "Наслідки",
    "Підтвердження",
)
DEFENSE_SECTIONS = (
    "1. Що і навіщо",
    "2. Топ-3",
    "3. Ключове рішення",
    "4. Перевірка",
)
ADR_STATUS = re.compile(
    r"^(proposed|accepted|rejected|deprecated|superseded by ADR-\d{4})$"
)
ADR_NAME = re.compile(r"^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$")
AC_ROW = re.compile(r"^\|\s*(AC-[^|\s]+)\s*\|([^|]*)\|([^|]*)\|\s*$", re.MULTILINE)
AC_ID = re.compile(r"^AC-(\d+)\.(\d+)$")
AC_MARKER = re.compile(r"""\bac\(\s*["'](AC-\d+\.\d+)["']\s*\)""")
MAKE_REF = re.compile(r"`make ([\w-]+)`")


def prose(text: str) -> str:
    """Текст без блоків коду і діаграм: вони не рахуються в обсяг."""
    return re.sub(r"^```.*?^```", "", text, flags=re.MULTILINE | re.DOTALL)


def word_count(text: str) -> int:
    return len(re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", prose(text)))


def headings(text: str) -> list[str]:
    return re.findall(r"^#{2,3} (.+?)\s*$", prose(text), flags=re.MULTILINE)


def missing_sections(text: str, required: Iterable[str]) -> list[str]:
    found = headings(text)
    return [s for s in required if not any(h.startswith(s) for h in found)]


def check_page(path: Path, text: str, required: Iterable[str], limit: int) -> list[str]:
    errors = [f"{path}: немає розділу «{s}»" for s in missing_sections(text, required)]
    words = word_count(text)
    if words > limit:
        errors.append(f"{path}: {words} слів, ліміт {limit}")
    return errors


def ac_markers(tests_dir: Path) -> set[str]:
    found: set[str] = set()
    for file in tests_dir.rglob("*.py"):
        found.update(AC_MARKER.findall(file.read_text(encoding="utf-8")))
    return found


def make_targets(makefile: Path) -> set[str]:
    if not makefile.exists():
        return set()
    text = makefile.read_text(encoding="utf-8")
    return set(re.findall(r"^([\w-]+):", text, flags=re.MULTILINE))


def check_criteria(
    path: Path, text: str, task: int, markers: set[str], targets: set[str]
) -> list[str]:
    errors: list[str] = []
    rows = AC_ROW.findall(text)
    if not rows:
        return [f"{path}: таблиця критеріїв прийняття порожня"]
    seen: set[str] = set()
    for ac, criterion, check in rows:
        where = f"{path}: {ac}"
        match = AC_ID.match(ac)
        if not match or int(match.group(1)) != task:
            errors.append(f"{where}: ID має бути AC-{task}.<номер>")
        if ac in seen:
            errors.append(f"{where}: ID повторюється")
        seen.add(ac)
        if not criterion.strip():
            errors.append(f"{where}: порожній критерій")
        refs = MAKE_REF.findall(check)
        needs_test = "тест" in check
        if not refs and not needs_test:
            errors.append(f"{where}: у колонці «Перевірка» немає тесту чи make-цілі")
        if needs_test and ac not in markers:
            errors.append(f'{where}: немає тесту з @pytest.mark.ac("{ac}")')
        errors.extend(
            f"{where}: у Makefile немає цілі `{t}`" for t in refs if t not in targets
        )
    return errors


def front_matter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        return {}
    pairs = (line.split(":", 1) for line in match.group(1).splitlines())
    return {k.strip(): v.strip() for k, v in pairs if v}


def section_body(text: str, title: str) -> str:
    match = re.search(
        rf"^## {re.escape(title)}\s*$(.*?)(?=^## |\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else ""


def check_adr(path: Path, text: str) -> list[str]:
    errors: list[str] = []
    if not ADR_NAME.match(path.name):
        errors.append(f"{path}: ім'я має бути NNNN-kebab-case.md")
    meta = front_matter(text)
    if not ADR_STATUS.match(meta.get("status", "")):
        errors.append(f"{path}: недійсний або відсутній status")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta.get("date", "")):
        errors.append(f"{path}: date має бути РРРР-ММ-ДД")
    errors.extend(
        f"{path}: немає розділу «{s}»" for s in missing_sections(text, ADR_SECTIONS)
    )
    options = re.findall(
        r"^\* (.+?)\s*$", section_body(text, "Розглянуті варіанти"), re.MULTILINE
    )
    if len(options) < 2:
        errors.append(f"{path}: розглянуто менше двох варіантів")
    chosen = re.search(r"Обрано: «(.+?)»", section_body(text, "Рішення"))
    if not chosen:
        errors.append(f"{path}: у «Рішення» немає рядка «Обрано: «…»»")
    elif chosen.group(1) not in options:
        errors.append(f"{path}: обраний варіант відсутній у переліку варіантів")
    return errors


def task_number(task_dir: Path) -> int:
    match = re.match(r"^(\d+)-", task_dir.name)
    return int(match.group(1)) if match else -1


def run(root: Path) -> list[str]:
    errors: list[str] = []

    def rel(path: Path) -> Path:
        return path.relative_to(root)

    spec = root / "spec.md"
    if spec.exists():
        errors += check_page(
            rel(spec), spec.read_text(encoding="utf-8"), SYSTEM_SECTIONS, PAGE_WORDS
        )
    else:
        errors.append("spec.md: файл відсутній")

    markers = ac_markers(root / "tests")
    targets = make_targets(root / "Makefile")
    for task_dir in sorted((root / "tasks").glob("*/")):
        task_spec = task_dir / "spec.md"
        if not task_spec.exists():
            errors.append(f"{rel(task_dir)}: немає spec.md")
            continue
        text = task_spec.read_text(encoding="utf-8")
        errors += check_page(rel(task_spec), text, INCREMENT_SECTIONS, PAGE_WORDS)
        errors += check_criteria(
            rel(task_spec), text, task_number(task_dir), markers, targets
        )
        defense = task_dir / "DEFENSE.md"
        if defense.exists():
            errors += check_page(
                rel(defense),
                defense.read_text(encoding="utf-8"),
                DEFENSE_SECTIONS,
                DEFENSE_WORDS,
            )

    for adr in sorted((root / "adr").glob("*.md")):
        errors += check_adr(rel(adr), adr.read_text(encoding="utf-8"))
    return errors


def main() -> int:
    errors = run(ROOT)
    for error in errors:
        print(error)
    if errors:
        print(f"check_docs: {len(errors)} порушень")
        return 1
    print("check_docs: spec, ADR, DEFENSE і трасування критеріїв у порядку")
    return 0


if __name__ == "__main__":
    sys.exit(main())
