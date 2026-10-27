// точка збирання (composition root): єдине місце, де вирішується, яке сховище
// і які ресурси отримують сервіси. Сервіси бачать залежності через awilix,
// а не через параметри кожної функції (adr/0008).
import { InjectionMode, asFunction, asValue, createContainer } from 'awilix';

import {
  createCyclesService,
  createMemoryCyclesRepository,
  createPgCyclesRepository,
} from './cycles/index.js';
import {
  createIdentityService,
  createMemoryIdentityRepository,
  createPgIdentityRepository,
} from './identity/index.js';
import { createLogger, systemClock } from './platform/index.js';
import {
  createMemoryProjectsRepository,
  createPgProjectsRepository,
  createProjectsService,
} from './projects/index.js';
import {
  createMemoryResultsRepository,
  createPgResultsRepository,
  createResultsService,
} from './results/index.js';
import {
  createMemoryVotingRepository,
  createPgVotingRepository,
  createVotingService,
} from './voting/index.js';

/**
 * @typedef {'memory' | 'postgres'} Storage
 * @typedef {import('./web/app.js').Services & {
 *   clock: import('./platform/index.js').Clock,
 *   identityRepository: import('./identity/index.js').IdentityRepository,
 *   cyclesRepository: import('./cycles/index.js').CyclesRepository,
 *   projectsRepository: import('./projects/index.js').ProjectsRepository,
 *   votingRepository: import('./voting/index.js').VotingRepository,
 *   resultsRepository: import('./results/index.js').ResultsRepository,
 * }} Cradle
 */

/**
 * @param {{
 *   storage?: Storage,
 *   db?: import('./platform/db/index.js').Db,
 *   logger?: import('pino').Logger,
 *   clock?: import('./platform/index.js').Clock,
 * }} [options] для postgres потрібен db, уже підключений через connectDb
 */
export function buildContainer({
  storage = 'memory',
  db,
  logger = createLogger(),
  clock = systemClock,
} = {}) {
  const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });

  container.register({
    logger: asValue(logger),
    clock: asValue(clock),
  });

  if (storage === 'memory') {
    container.register({
      identityRepository: asFunction(createMemoryIdentityRepository).singleton(),
      cyclesRepository: asFunction(createMemoryCyclesRepository).singleton(),
      projectsRepository: asFunction(createMemoryProjectsRepository).singleton(),
      votingRepository: asFunction(createMemoryVotingRepository).singleton(),
      resultsRepository: asFunction(createMemoryResultsRepository).singleton(),
      readiness: asValue({ check: async () => {} }),
    });
  } else {
    if (!db) {
      throw new Error('для сховища postgres потрібен db з connectDb');
    }
    container.register({
      db: asValue(db),
      identityRepository: asFunction(createPgIdentityRepository).singleton(),
      cyclesRepository: asFunction(createPgCyclesRepository).singleton(),
      projectsRepository: asFunction(createPgProjectsRepository).singleton(),
      votingRepository: asFunction(createPgVotingRepository).singleton(),
      resultsRepository: asFunction(createPgResultsRepository).singleton(),
      readiness: asValue({ check: () => db.ping() }),
    });
  }

  container.register({
    identityService: asFunction(createIdentityService).singleton(),
    cyclesService: asFunction(createCyclesService).singleton(),
    projectsService: asFunction(createProjectsService).singleton(),
    votingService: asFunction(createVotingService).singleton(),
    resultsService: asFunction(createResultsService).singleton(),
  });

  return /** @type {import('awilix').AwilixContainer<Cradle>} */ (container);
}
