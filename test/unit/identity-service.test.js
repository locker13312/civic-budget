// реєстрація користувачів для статичних даних: прогалина, яку показав
// звіт мутацій (перевірки імені й ролі не виконувались жодним тестом)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  Role,
  createIdentityService,
  createMemoryIdentityRepository,
} from '../../src/identity/index.js';

const service = () =>
  createIdentityService({ identityRepository: createMemoryIdentityRepository() });

describe('identityService.register', () => {
  test("ім'я обрізається і зберігається", async () => {
    const user = await service().register({
      fullName: '  Ірина Коваль  ',
      role: Role.RESIDENT,
      verifiedAt: null,
      taxIdHash: 'h',
    });

    assert.equal(user.fullName, 'Ірина Коваль');
  });

  test("порожнє ім'я і невідома роль відхиляються", async () => {
    const identity = service();

    await assert.rejects(
      identity.register({
        fullName: '   ',
        role: Role.RESIDENT,
        verifiedAt: null,
        taxIdHash: 'h',
      }),
      { code: 'domain_error' },
    );
    await assert.rejects(
      identity.register({
        fullName: 'Хтось',
        role: /** @type {import('../../src/identity/index.js').Role} */ ('guest'),
        verifiedAt: null,
        taxIdHash: 'h',
      }),
      { code: 'domain_error' },
    );
  });
});
