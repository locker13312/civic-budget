// JSON Schema для параметрів і тіл: роут перевіряє форму, сервіс — правила

const id = { type: 'integer', minimum: 1 };

/**
 * @param {string} name
 * @returns {object}
 */
export const idParams = (name) => ({
  type: 'object',
  required: [name],
  properties: { [name]: id },
});

export const idempotencyHeaders = {
  type: 'object',
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 128 } },
};

export const money = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };

export const category = { type: 'string', enum: ['small', 'large'] };
