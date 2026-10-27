/** @typedef {{ now(): Date }} Clock */

/** @type {Clock} */
export const systemClock = Object.freeze({ now: () => new Date() });
