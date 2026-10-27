// перевіряє документи за стандартами з standards/: spec і spec інкрементів,
// ADR, DEFENSE і трасування критеріїв прийняття до тестів або npm-скриптів
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE_WORDS = 600;
export const DEFENSE_WORDS = 500;

const SYSTEM_SECTIONS = [
  'Що і навіщо',
  'Компоненти і взаємодія',
  'Дані',
  'Сценарії оновлення даних',
  'Правила меж',
];
const INCREMENT_SECTIONS = ['Що і навіщо', 'Критерії прийняття', 'Поза межами'];
const ADR_SECTIONS = [
  'Контекст і проблема',
  'Розглянуті варіанти',
  'Рішення',
  'Наслідки',
  'Підтвердження',
];
const DEFENSE_SECTIONS = [
  '1. Що і навіщо',
  '2. Топ-3',
  '3. Ключове рішення',
  '4. Перевірка',
];

const ADR_STATUS = /^(proposed|accepted|rejected|deprecated|superseded by ADR-\d{4})$/;
const ADR_NAME = /^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const AC_ROW = /^\|\s*(AC-[^|\s]+)\s*\|([^|]*)\|([^|]*)\|\s*$/gm;
const AC_ID = /^AC-(\d+)\.(\d+)$/;
const AC_TAG = /\[(AC-\d+\.\d+)\]/g;
// `npm run x` або історичне `make x` (до adr/0006) посилаються на npm-скрипт x
const MAKE_REF = /`(?:make|npm run) ([\w-]+)`/g;

/**
 * Текст без блоків коду і діаграм: вони не рахуються в обсяг.
 *
 * @param {string} text
 * @returns {string}
 */
export function prose(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

/**
 * @param {string} text
 * @returns {number}
 */
export function wordCount(text) {
  return prose(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function headings(text) {
  return [...prose(text).matchAll(/^#{2,3} (.+?)\s*$/gm)].map((m) => String(m[1]));
}

/**
 * @param {string} text
 * @param {readonly string[]} required
 * @returns {string[]}
 */
function missingSections(text, required) {
  const found = headings(text);
  return required.filter((section) => !found.some((h) => h.startsWith(section)));
}

/**
 * @param {string} path
 * @param {string} text
 * @param {readonly string[]} required
 * @param {number} limit
 * @returns {string[]}
 */
export function checkPage(path, text, required, limit) {
  const errors = missingSections(text, required).map(
    (s) => `${path}: немає розділу «${s}»`,
  );
  const words = wordCount(text);
  if (words > limit) {
    errors.push(`${path}: ${words} слів, ліміт ${limit}`);
  }
  return errors;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function jsFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * @param {string} testsDir
 * @returns {Set<string>}
 */
function acTags(testsDir) {
  const found = new Set();
  for (const file of jsFiles(testsDir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(AC_TAG)) {
      found.add(match[1]);
    }
  }
  return found;
}

/**
 * @param {string} packageJson
 * @returns {Set<string>}
 */
function npmScripts(packageJson) {
  if (!existsSync(packageJson)) {
    return new Set();
  }
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8'));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

/**
 * @param {string} path
 * @param {string} text
 * @param {number} task
 * @param {Set<string>} tags
 * @param {Set<string>} targets
 * @returns {string[]}
 */
export function checkCriteria(path, text, task, tags, targets) {
  const rows = [...text.matchAll(AC_ROW)];
  if (rows.length === 0) {
    return [`${path}: таблиця критеріїв прийняття порожня`];
  }
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  for (const [, ac = '', criterion = '', check = ''] of rows) {
    const where = `${path}: ${ac}`;
    const id = AC_ID.exec(ac);
    if (!id || Number(id[1]) !== task) {
      errors.push(`${where}: ID має бути AC-${task}.<номер>`);
    }
    if (seen.has(ac)) {
      errors.push(`${where}: ID повторюється`);
    }
    seen.add(ac);
    if (!criterion.trim()) {
      errors.push(`${where}: порожній критерій`);
    }
    const refs = [...check.matchAll(MAKE_REF)].map((m) => String(m[1]));
    const needsTest = check.includes('тест');
    if (refs.length === 0 && !needsTest) {
      errors.push(`${where}: у колонці «Перевірка» немає тесту чи npm-скрипта`);
    }
    if (needsTest && !tags.has(ac)) {
      errors.push(`${where}: немає тесту з [${ac}] у назві`);
    }
    for (const target of refs) {
      if (!targets.has(target)) {
        errors.push(`${where}: у package.json немає скрипта \`${target}\``);
      }
    }
  }
  return errors;
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of match?.[1]?.split('\n') ?? []) {
    const at = line.indexOf(':');
    if (at > 0) {
      meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return meta;
}

/**
 * @param {string} text
 * @param {string} title
 * @returns {string}
 */
function sectionBody(text, title) {
  const start = text.search(new RegExp(`^## ${title}\\s*$`, 'm'));
  if (start < 0) {
    return '';
  }
  const rest = text.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * @param {string} path
 * @param {string} text
 * @returns {string[]}
 */
export function checkAdr(path, text) {
  /** @type {string[]} */
  const errors = [];
  const name = path.split('/').pop() ?? '';
  if (!ADR_NAME.test(name)) {
    errors.push(`${path}: ім'я має бути NNNN-kebab-case.md`);
  }
  const meta = frontMatter(text);
  if (!ADR_STATUS.test(meta.status ?? '')) {
    errors.push(`${path}: недійсний або відсутній status`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '')) {
    errors.push(`${path}: date має бути РРРР-ММ-ДД`);
  }
  for (const section of missingSections(text, ADR_SECTIONS)) {
    errors.push(`${path}: немає розділу «${section}»`);
  }
  const options = [
    ...sectionBody(text, 'Розглянуті варіанти').matchAll(/^\* (.+?)\s*$/gm),
  ].map((m) => String(m[1]));
  if (options.length < 2) {
    errors.push(`${path}: розглянуто менше двох варіантів`);
  }
  const chosen = /Обрано: «(.+?)»/.exec(sectionBody(text, 'Рішення'));
  if (!chosen) {
    errors.push(`${path}: у «Рішення» немає рядка «Обрано: «…»»`);
  } else if (!options.includes(String(chosen[1]))) {
    errors.push(`${path}: обраний варіант відсутній у переліку варіантів`);
  }
  return errors;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function run(root) {
  /** @type {string[]} */
  const errors = [];
  /**
   * @param {string} path
   * @returns {string}
   */
  const rel = (path) => relative(root, path);
  /**
   * @param {string} path
   * @returns {string}
   */
  const read = (path) => readFileSync(path, 'utf8');

  const spec = join(root, 'spec.md');
  if (existsSync(spec)) {
    errors.push(...checkPage(rel(spec), read(spec), SYSTEM_SECTIONS, PAGE_WORDS));
  } else {
    errors.push('spec.md: файл відсутній');
  }

  const tags = acTags(join(root, 'test'));
  const targets = npmScripts(join(root, 'package.json'));
  const tasks = join(root, 'tasks');
  const taskDirs = existsSync(tasks)
    ? readdirSync(tasks, { withFileTypes: true }).filter((d) => d.isDirectory())
    : [];
  for (const dir of taskDirs.map((d) => d.name).sort()) {
    const taskSpec = join(tasks, dir, 'spec.md');
    if (!existsSync(taskSpec)) {
      errors.push(`tasks/${dir}: немає spec.md`);
      continue;
    }
    const text = read(taskSpec);
    const number = Number(/^(\d+)-/.exec(dir)?.[1] ?? -1);
    errors.push(...checkPage(rel(taskSpec), text, INCREMENT_SECTIONS, PAGE_WORDS));
    errors.push(...checkCriteria(rel(taskSpec), text, number, tags, targets));
    const defense = join(tasks, dir, 'DEFENSE.md');
    if (existsSync(defense)) {
      errors.push(
        ...checkPage(rel(defense), read(defense), DEFENSE_SECTIONS, DEFENSE_WORDS),
      );
    }
  }

  const adrDir = join(root, 'adr');
  const adrs = existsSync(adrDir)
    ? readdirSync(adrDir).filter((f) => f.endsWith('.md'))
    : [];
  for (const file of adrs.sort()) {
    errors.push(...checkAdr(`adr/${file}`, read(join(adrDir, file))));
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = run(fileURLToPath(new URL('..', import.meta.url)));
  for (const error of errors) {
    console.log(error);
  }
  if (errors.length > 0) {
    console.log(`check-docs: ${errors.length} порушень`);
    process.exitCode = 1;
  } else {
    console.log('check-docs: spec, ADR, DEFENSE і трасування критеріїв у порядку');
  }
}
