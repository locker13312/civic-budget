// правила меж зі spec.md: R1, R2, R4 (adr/0005)

// R1: кожен модуль може залежати лише від нижчих за схемою spec.md
const lower = {
  web: ['results', 'voting', 'projects', 'identity', 'cycles', 'platform'],
  results: ['voting', 'projects', 'identity', 'cycles', 'platform'],
  voting: ['projects', 'identity', 'cycles', 'platform'],
  projects: ['identity', 'cycles', 'platform'],
  identity: ['platform'],
  cycles: ['platform'],
  platform: [],
};

module.exports = {
  forbidden: [
    ...Object.entries(lower).map(([module, allowed]) => ({
      name: `R1-${module}`,
      comment: `R1: ${module} може залежати лише від ${allowed.join(', ') || 'нікого'}`,
      severity: 'error',
      from: { path: `^src/${module}/` },
      to: { path: '^src/[^/]+/', pathNot: `^src/(${[module, ...allowed].join('|')})/` },
    })),
    {
      name: 'R1-no-cycles',
      comment: 'R1: без циклічних залежностей',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'R2-index-only',
      comment: 'R2: інший модуль імпортує лише index.js модуля',
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/[^/]+/', pathNot: ['^src/$1/', '^src/[^/]+/index\\.js$'] },
    },
    {
      name: 'R5-driver-only-in-platform-db',
      comment: 'R5: драйвер postgres підключає лише src/platform/db',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/platform/db/' },
      to: { path: '^node_modules/postgres/' },
    },
    {
      name: 'R5-db-only-in-composition-root',
      comment:
        "R5: src/platform/db бачать лише точка збирання і сервер; репозиторії отримують Db ін'єкцією",
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: ['^src/(container|server)\\.js$', '^src/platform/db/'],
      },
      to: { path: '^src/platform/db/' },
    },
    {
      name: 'R4-fastify-only-in-web',
      comment: 'R4: fastify використовує лише web',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(web/|server\\.js$)' },
      to: { path: '^node_modules/fastify/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
  },
};
