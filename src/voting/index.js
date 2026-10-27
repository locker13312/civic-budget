// голоси і правила голосування
export { VoteError, castVote, countVotes } from './domain.js';
export { createMemoryVotingRepository } from './repository.memory.js';
export { createVotingService } from './service.js';

/** @typedef {import('./domain.js').Vote} Vote */
/** @typedef {import('./domain.js').VoteCounts} VoteCounts */
/** @typedef {import('./service.js').VotingService} VotingService */
/** @typedef {import('./service.js').VotingRepository} VotingRepository */
