import { createHash } from 'node:crypto';

/**
 * Відбиток тіла запиту для Idempotency-Key: той самий ключ з іншим тілом —
 * помилка клієнта, а не повтор.
 *
 * @param {unknown} payload
 * @returns {string}
 */
export function fingerprint(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
