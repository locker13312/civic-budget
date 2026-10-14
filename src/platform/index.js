// інфраструктура без бізнес-правил: налаштування, помилки, версія збірки
export { gitSha, resetGitShaCache, version } from './build.js';
export { loadSettings } from './config.js';
export { DomainError } from './errors.js';
