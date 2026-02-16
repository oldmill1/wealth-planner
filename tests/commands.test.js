import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
	COMMANDS_PATH,
	CONFIG_DIR
} from '../src/constants.js';
import {
	loadOrInitCommandRegistry
} from '../src/services/commands.js';

async function resetConfigDir() {
	await fs.rm(CONFIG_DIR, {recursive: true, force: true});
	await fs.mkdir(CONFIG_DIR, {recursive: true});
}

test('loadOrInitCommandRegistry removes backup_db from legacy registry files', async () => {
	await resetConfigDir();
	const legacyRegistry = {
		version: 1,
		commands: {
			clean_db: {description: 'old'},
			backup_db: {description: 'legacy backup command'}
		}
	};
	await fs.writeFile(COMMANDS_PATH, JSON.stringify(legacyRegistry, null, 2), 'utf8');

	const loaded = await loadOrInitCommandRegistry();
	assert.equal(loaded.backup_db, undefined);
	assert.equal(typeof loaded.clean_db, 'object');
});
