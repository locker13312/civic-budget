/** Порушення бізнес-правила; code стабільний і йде в API. */
export class DomainError extends Error {
  code = 'domain_error';

  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}
