// чернетка правил меж R1, R2, R4 зі spec.md для аудиту (до виправлень)
const lower = {
  web: 'results|voting|projects|identity|cycles|platform',
  results: 'voting|projects|identity|cycles|platform',
  voting: 'projects|identity|cycles|platform',
  projects: 'identity|cycles|platform',
  identity: 'platform',
  cycles: 'platform',
  platform: '',
};

module.exports = {
  forbidden: [
    ...Object.entries(lower).map(([module, allowed]) => ({
      name: `R1-${module}`,
      comment: `R1: ${module} залежить лише від нижчих модулів`,
      severity: 'error',
      from: { path: `^src/${module}/` },
      to: {
        path: '^src/[^/]+/',
        pathNot: allowed ? `^src/(${module}|${allowed})/` : `^src/${module}/`,
      },
    })),
    {
      name: 'R2-index-only',
      comment: 'R2: інший модуль імпортує лише index.js модуля',
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/[^/]+/', pathNot: ['^src/$1/', '^src/[^/]+/index\\.js$'] },
    },
    {
      name: 'R4-fastify-only-in-web',
      comment: 'R4: fastify лише у web',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(web/|server\\.js$)' },
      to: { path: '^node_modules/fastify/' },
    },
  ],
  options: { doNotFollow: { path: 'node_modules' } },
};
