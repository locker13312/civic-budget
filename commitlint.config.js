// conventional commits (adr/0013): типи config-conventional + `audit` для
// комітів зі знахідками аудиту (audit(03): …), як в історії репозиторію
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'audit',
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
    // опис часто починається з назви: PostgreSQL, E2E, CI
    'subject-case': [0],
    // тіла комітів містять таблиці й посилання, довгі рядки там доречні
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
