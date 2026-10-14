import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  jsdoc.configs['flat/recommended-typescript-flavor'],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      eqeqeq: 'error',
      curly: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      // типи важливіші за описи: опис лише там, де ім'я не пояснює
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/require-jsdoc': ['error', { publicOnly: true }],
    },
  },
  {
    files: ['test/**/*.js'],
    // у тестах JSDoc потрібен лише для типів, повний опис зайвий
    rules: { 'jsdoc/require-jsdoc': 'off', 'jsdoc/require-returns': 'off' },
  },
];
