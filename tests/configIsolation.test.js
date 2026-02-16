import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import {COMMANDS_PATH, CONFIG_DIR, DB_PATH, SQLITE_DB_PATH} from '../src/constants.js';

test('tests run against isolated config directory', () => {
	const homeConfigDir = path.join(os.homedir(), '.config', 'wealth-planner');
	const expectedTestConfigDir = String(process.env.WEALTH_PLANNER_CONFIG_DIR ?? '').trim();

	assert.notEqual(CONFIG_DIR, homeConfigDir);
	assert.ok(expectedTestConfigDir.length > 0);
	assert.equal(CONFIG_DIR, expectedTestConfigDir);
	assert.equal(DB_PATH, path.join(CONFIG_DIR, 'main.json'));
	assert.equal(SQLITE_DB_PATH, path.join(CONFIG_DIR, 'main.db'));
	assert.equal(COMMANDS_PATH, path.join(CONFIG_DIR, 'commands.json'));
});
