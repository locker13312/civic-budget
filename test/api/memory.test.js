// прототип: усі сценарії на статичних даних у пам'яті
import { memoryApp } from '../support/app.js';
import { defineScenarioSuite } from './scenarios.js';

defineScenarioSuite("статичні дані в пам'яті", () => memoryApp());
