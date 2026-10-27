import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

// R5 зі spec.md: SQL і транзакції лише в */repository.pg.js і src/platform/db
const SQL_OUTSIDE_REPOSITORIES = [
  {
    selector: 'TaggedTemplateExpression[tag.name=/^(sql|tx)$/]',
    message: 'SQL лише в */repository.pg.js і src/platform/db (R5)',
  },
  {
    selector: "TaggedTemplateExpression > MemberExpression.tag[property.name='sql']",
    message: 'SQL лише в */repository.pg.js і src/platform/db (R5)',
  },
  {
    selector: 'CallExpression[callee.property.name=/^(tx|begin|unsafe)$/]',
    message: 'транзакції й сирий SQL лише в репозиторіях (R5)',
  },
];

// роути й сервіси не ловлять помилки: їх обробляє один глобальний обробник
const NO_TRY = {
  selector: 'TryStatement',
  message: 'помилки обробляє глобальний обробник (src/web/errors.js), не try/catch',
};

export default [
  { ignores: ['dist/', 'coverage/', '.civic-tmp-*/', 'tasks/**/reports/'] },
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
      // фабрики модулів (create*, build*, seed*) повертають об'єкт, тип якого
      // tsc виводить сам і експортує як ReturnType; решта функцій документує @returns
      'jsdoc/require-returns': [
        'warn',
        {
          contexts: [
            'FunctionDeclaration:not([id.name=/^(create|build|seed)[A-Z]/])',
            'FunctionExpression',
            'ArrowFunctionExpression',
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/**/repository.pg.js', 'src/platform/db/**'],
    rules: { 'no-restricted-syntax': ['error', ...SQL_OUTSIDE_REPOSITORIES] },
  },
  {
    files: ['src/web/**/*.js', 'src/*/service.js'],
    rules: { 'no-restricted-syntax': ['error', ...SQL_OUTSIDE_REPOSITORIES, NO_TRY] },
  },
  {
    files: ['test/**/*.js'],
    // у тестах JSDoc потрібен лише для типів, повний опис зайвий
    rules: { 'jsdoc/require-jsdoc': 'off', 'jsdoc/require-returns': 'off' },
  },
];
