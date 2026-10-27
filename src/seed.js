// статичні дані: користувачі й раунди в кожній фазі, щоб усі сценарії можна
// було пройти через API (spec Завдання 2). Пишуться прямо через репозиторії,
// бо статичні дані не проходять фази: заявки в раунді голосування вже схвалені.
import { Category, makeCategoryLimit } from './cycles/index.js';
import { Role } from './identity/index.js';
import { Decision, ProjectStatus } from './projects/index.js';

const DAY = 24 * 60 * 60 * 1000;
const UAH = 100; // копійок у гривні

/**
 * @param {Date} now
 * @param {number} days
 * @returns {Date}
 */
const shift = (now, days) => new Date(now.getTime() + days * DAY);

/**
 * @param {Pick<import('./container.js').Cradle,
 *   'identityService' | 'cyclesRepository' | 'projectsRepository' | 'votingRepository' | 'clock'>} cradle
 */
export async function seedStaticData({
  identityService,
  cyclesRepository,
  projectsRepository,
  votingRepository,
  clock,
}) {
  const now = clock.now();
  const verified = shift(now, -200);

  /**
   * @param {string} fullName
   * @param {import('./identity/index.js').User['role']} role
   * @param {string} taxIdHash
   * @param {boolean} [isVerified]
   * @returns {Promise<import('./identity/index.js').User>}
   */
  const user = (fullName, role, taxIdHash, isVerified = true) =>
    identityService.register({
      fullName,
      role,
      taxIdHash,
      verifiedAt: isVerified ? verified : null,
    });

  const users = {
    admin: await user('Олена Коваль', Role.ADMIN, 'seed-admin'),
    moderator: await user('Андрій Бондар', Role.MODERATOR, 'seed-moderator'),
    iryna: await user('Ірина Шевчук', Role.RESIDENT, 'seed-iryna'),
    petro: await user('Петро Мельник', Role.RESIDENT, 'seed-petro'),
    oksana: await user('Оксана Ткаченко', Role.RESIDENT, 'seed-oksana'),
    taras: await user('Тарас Кравчук', Role.RESIDENT, 'seed-taras'),
    maria: await user('Марія Олійник', Role.RESIDENT, 'seed-maria'),
    bohdan: await user('Богдан Лисенко', Role.RESIDENT, 'seed-bohdan', false),
    natalia: await user('Наталія Савченко', Role.RESIDENT, 'seed-natalia'),
  };

  const limits = () => [
    makeCategoryLimit(Category.SMALL, 1_000_000 * UAH, 400_000 * UAH),
    makeCategoryLimit(Category.LARGE, 3_000_000 * UAH, 1_500_000 * UAH),
  ];

  /**
   * @param {string} title
   * @param {[number, number, number, number]} days подання з/до, голосування з/до
   * @param {{ maxVotes: number, minVotes: number, limits?: import('./cycles/index.js').CategoryLimit[] }} rules
   * @returns {Promise<import('./cycles/index.js').Cycle>}
   */
  const cycle = (title, [subFrom, subTo, voteFrom, voteTo], rules) =>
    cyclesRepository.insert({
      title,
      submissionFrom: shift(now, subFrom),
      submissionTo: shift(now, subTo),
      votingFrom: shift(now, voteFrom),
      votingTo: shift(now, voteTo),
      maxVotes: rules.maxVotes,
      minVotes: rules.minVotes,
      limits: rules.limits ?? limits(),
    });

  const cycles = {
    submission: await cycle('ГБ-2027: подання', [-5, 10, 20, 35], {
      maxVotes: 3,
      minVotes: 2,
    }),
    review: await cycle('ГБ-2026 осінь: модерація', [-40, -3, 4, 20], {
      maxVotes: 3,
      minVotes: 2,
    }),
    voting: await cycle('ГБ-2026 літо: голосування', [-60, -30, -5, 10], {
      maxVotes: 2,
      minVotes: 1,
    }),
    finished: await cycle('ГБ-2026 весна: завершено', [-120, -90, -60, -30], {
      maxVotes: 3,
      minVotes: 2,
      limits: [
        makeCategoryLimit(Category.SMALL, 1_000_000 * UAH, 400_000 * UAH),
        makeCategoryLimit(Category.LARGE, 3_000_000 * UAH, 1_500_000 * UAH),
      ],
    }),
  };

  /**
   * @param {import('./cycles/index.js').Cycle} inCycle
   * @param {import('./identity/index.js').User} author
   * @param {string} title
   * @param {number} costUah
   * @param {'submitted' | 'approve' | 'reject'} [state]
   * @returns {Promise<import('./projects/index.js').Project>}
   */
  const project = async (inCycle, author, title, costUah, state = 'submitted') => {
    const submittedAt = shift(inCycle.submissionFrom, 1);
    const { project: saved } = await projectsRepository.insertSubmission(
      {
        cycleId: inCycle.id,
        authorId: author.id,
        category: Category.SMALL,
        title,
        cost: costUah * UAH,
        status: ProjectStatus.SUBMITTED,
        submittedAt,
      },
      { idempotencyKey: null, requestHash: '' },
    );
    if (state === 'submitted') {
      return saved;
    }
    const decided = {
      ...saved,
      status: state === 'approve' ? ProjectStatus.APPROVED : ProjectStatus.REJECTED,
    };
    await projectsRepository.saveReview(decided, {
      projectId: saved.id,
      moderatorId: users.moderator.id,
      decision: state === 'approve' ? Decision.APPROVE : Decision.REJECT,
      reason: state === 'approve' ? '' : 'проєкт дублює вже профінансований',
      decidedAt: shift(inCycle.submissionTo, 1),
    });
    return decided;
  };

  const projects = {
    benches: await project(
      cycles.submission,
      users.iryna,
      'Лавки в сквері на Шевченка',
      120_000,
    ),
    library: await project(
      cycles.review,
      users.petro,
      'Коворкінг у бібліотеці №5',
      350_000,
    ),
    stadium: await project(
      cycles.review,
      users.oksana,
      'Покриття шкільного стадіону',
      390_000,
    ),
    bikes: await project(
      cycles.review,
      users.taras,
      'Велопарковки біля метро',
      80_000,
      'approve',
    ),
    voting: [
      await project(
        cycles.voting,
        users.iryna,
        'Дитячий майданчик на Липовій',
        300_000,
        'approve',
      ),
      await project(
        cycles.voting,
        users.petro,
        'Освітлення парку Перемоги',
        250_000,
        'approve',
      ),
      await project(
        cycles.voting,
        users.oksana,
        'Пандуси до поліклініки',
        150_000,
        'approve',
      ),
      await project(
        cycles.voting,
        users.taras,
        'Сад на даху школи №12',
        200_000,
        'approve',
      ),
      await project(
        cycles.voting,
        users.maria,
        'Фонтанчики з питною водою',
        90_000,
        'approve',
      ),
      await project(cycles.voting, users.iryna, 'Укриття біля ліцею', 380_000, 'approve'),
      await project(cycles.voting, users.petro, 'Ще одні лавки', 50_000, 'reject'),
    ],
    finished: [
      await project(
        cycles.finished,
        users.iryna,
        'Зупинка з навісом',
        400_000,
        'approve',
      ),
      await project(
        cycles.finished,
        users.petro,
        'Тренажери у дворі',
        350_000,
        'approve',
      ),
      await project(
        cycles.finished,
        users.oksana,
        'Клумби на набережній',
        300_000,
        'approve',
      ),
      await project(
        cycles.finished,
        users.taras,
        'Будиночок для котів',
        200_000,
        'approve',
      ),
    ],
  };

  /**
   * @param {import('./identity/index.js').User} voter
   * @param {import('./projects/index.js').Project} target
   * @returns {Promise<import('./voting/index.js').Vote>}
   */
  const vote = (voter, target) =>
    votingRepository.castVote({ voterId: voter.id, cycleId: target.cycleId }, () =>
      Object.freeze({
        voterId: voter.id,
        projectId: target.id,
        cycleId: target.cycleId,
        castAt: shift(now, -1),
      }),
    );

  const [playground, lights] = projects.voting;
  await vote(
    users.iryna,
    /** @type {import('./projects/index.js').Project} */ (playground),
  );
  await vote(
    users.petro,
    /** @type {import('./projects/index.js').Project} */ (playground),
  );
  await vote(users.petro, /** @type {import('./projects/index.js').Project} */ (lights));

  // завершений раунд: 5, 4, 3 і 1 голос; бюджет 1 млн вміщає перші два
  const [stop, gym, flowers, cats] = projects.finished.map(
    (p) => /** @type {import('./projects/index.js').Project} */ (p),
  );
  for (const [target, voters] of /** @type {const} */ ([
    [stop, [users.iryna, users.petro, users.oksana, users.taras, users.maria]],
    [gym, [users.iryna, users.petro, users.oksana, users.taras]],
    [flowers, [users.oksana, users.taras, users.maria]],
    [cats, [users.maria]],
  ])) {
    for (const voter of voters) {
      await vote(voter, /** @type {import('./projects/index.js').Project} */ (target));
    }
  }

  return { users, cycles, projects };
}

/** @typedef {Awaited<ReturnType<typeof seedStaticData>>} StaticData */
