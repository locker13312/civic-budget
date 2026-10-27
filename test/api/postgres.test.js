// той самий набір сценаріїв, що й на статичних даних, тепер на PostgreSQL
import { pgApp } from '../support/app.js';
import { defineScenarioSuite } from './scenarios.js';

defineScenarioSuite('PostgreSQL', () => pgApp());
