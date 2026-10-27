# civic-budget

Громадський бюджет міста: мешканці подають проєкти на кошти громади,
модератори міськради їх перевіряють, мешканці голосують, а система обирає
переможців у межах бюджету кожної категорії і показує хід реалізації.

Навчальний проєкт з курсу «Розробка на JS» на весь семестр (Литвиненко
Ілля, ІК-43). Кожне завдання нарощує ту саму кодову базу.

## Чому ця ідея

Предметна область має справжні правила, які легко зламати: фази раунду,
ліміти вартості, «один голос на проєкт», підбір переможців у межах бюджету.
Тож тут є що специфікувати, тестувати і захищати. Громадський бюджет
працює в Києві, Львові, Вінниці, тому правила беруться з реальної практики.

## Швидкий старт

Потрібні Node.js 22+ і `git`. CI перевіряє проєкт на Linux і Windows.

```bash
npm ci                 # залежності + git-хуки
npm run start:static   # прототип: API на статичних даних, БД не потрібна
npm run db:up          # PostgreSQL 16 у Docker на 127.0.0.1:55432
npm run db:seed        # схема і статичні дані в PostgreSQL
npm start              # API на PostgreSQL: http://127.0.0.1:3000/cycles
npm run check          # усі перевірки: формат, лінтер, межі, типи, залежності, документи, тести, збірка
```

Без запущеного PostgreSQL тести БД локально пропускаються, у CI вони
обов'язкові. Інша адреса БД задається в `.env` (не комітиться):
`CIVIC_DATABASE_URL=postgres://civic:civic@127.0.0.1:55432/civic_budget`,
для тестів `CIVIC_TEST_DATABASE_URL=…/postgres`.

### API

Користувача передає заголовок `X-User-Id` (у статичних даних: 1 адмін, 2
модератор, 3–7 і 9 мешканці, 8 неверифікований). Повний список маршрутів і
помилок: [spec Завдання 2](tasks/02-prototype-db/spec.md).

```bash
curl http://127.0.0.1:3000/cycles/3/projects
curl -X POST -H 'x-user-id: 9' http://127.0.0.1:3000/projects/5/votes
curl -X POST -H 'x-user-id: 1' http://127.0.0.1:3000/cycles/4/tally
```

На Windows: встановіть [Node.js LTS](https://nodejs.org) і [Git for
Windows](https://git-scm.com/download/win); команди запускайте з **Git Bash**.
Переноси рядків задає `.gitattributes`, тож налаштовувати `core.autocrlf`
не треба.

Тести за рівнями: `npm run test:unit`, `npm run test:integration` (потрібен
PostgreSQL, `npm run db:up`), `npm run test:e2e`. Покриття з порогами:
`npm run coverage`. Мутаційне тестування (Stryker, ~4 хв): `npm run mutation`,
HTML-звіт у `reports/mutation/index.html`.

## Де що лежить

| Шлях | Що там |
|---|---|
| [spec.md](spec.md) | специфікація системи: модулі, дані (ER), сценарії, правила меж |
| [standards/](standards/) | власні стандарти: формат spec, ADR, DoD, перелік перевірок, стиль коду |
| [adr/](adr/) | архітектурні рішення (MADR) |
| `migrations/` | схема PostgreSQL, файли `NNNN_*.sql` по черзі |
| `src/` | код; тека на кожен модуль зі spec.md, публічний API модуля це його `index.js` |
| `test/` | тести за рівнями: `unit/`, інтеграційні `api/`, `db/`, `hooks/`, `smoke/`, наскрізні `e2e/` |
| `.githooks/` | pre-commit і pre-push |
| `tasks/NN-*/` | здачі: spec інкременту, аудит, звіти запуску, DEFENSE |
| [ai/](ai/) | слід роботи з AI: промпти і рішення |

## Здачі

| Завдання | DEFENSE |
|---|---|
| 1. Фундамент | [tasks/01-foundation/DEFENSE.md](tasks/01-foundation/DEFENSE.md) |
| 2. Прототип → БД | DEFENSE у Classroom; аудит: [tasks/02-prototype-db/audit.md](tasks/02-prototype-db/audit.md) |
| 3. Тестування | DEFENSE у Classroom; аудит: [tasks/03-testing/audit.md](tasks/03-testing/audit.md), невбиті мутанти: [mutation-survivors.md](tasks/03-testing/reports/mutation-survivors.md) |
