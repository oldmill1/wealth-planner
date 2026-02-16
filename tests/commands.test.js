import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
	COMMANDS_PATH,
	CONFIG_DIR,
	DB_PATH,
	SQLITE_DB_PATH
} from '../src/constants.js';
import {
	executeCommand,
	loadOrInitCommandRegistry
} from '../src/services/commands.js';
import {DEFAULT_COMMAND_REGISTRY} from '../src/data/demo.js';

async function resetConfigDir() {
	await fs.rm(CONFIG_DIR, {recursive: true, force: true});
	await fs.mkdir(CONFIG_DIR, {recursive: true});
}

test('loadOrInitCommandRegistry adds backup_db for legacy registry files', async () => {
	await resetConfigDir();
	const legacyRegistry = {
		version: 1,
		commands: {
			clean_db: {description: 'old'}
		}
	};
	await fs.writeFile(COMMANDS_PATH, JSON.stringify(legacyRegistry, null, 2), 'utf8');

	const loaded = await loadOrInitCommandRegistry();
	assert.ok(loaded.backup_db);
	assert.equal(
		loaded.backup_db.description,
		DEFAULT_COMMAND_REGISTRY.commands.backup_db.description
	);
});

test('backup_db returns no-op message when no files exist', async () => {
	await resetConfigDir();
	await loadOrInitCommandRegistry();

	const message = await executeCommand('backup_db');
	assert.match(message, /No database files found to back up/i);
});

test('backup_db creates timestamped backups under backups folder', async () => {
	await resetConfigDir();
	await fs.writeFile(DB_PATH, JSON.stringify({meta: {version: 1}}, null, 2), 'utf8');
	await fs.writeFile(SQLITE_DB_PATH, 'sqlite-data', 'utf8');
	await fs.writeFile(`${SQLITE_DB_PATH}-wal`, 'wal-data', 'utf8');
	await fs.writeFile(`${SQLITE_DB_PATH}-shm`, 'shm-data', 'utf8');

	const message = await executeCommand('backup_db');
	assert.match(message, /Backup complete/i);

	const backupsDir = path.join(CONFIG_DIR, 'backups');
	const files = await fs.readdir(backupsDir);
	assert.ok(files.some((file) => /^main\.json\..+\.bak$/.test(file)));
	assert.ok(files.some((file) => /^main\.db\..+\.bak$/.test(file)));
	assert.ok(files.some((file) => /^main\.db-wal\..+\.bak$/.test(file)));
	assert.ok(files.some((file) => /^main\.db-shm\..+\.bak$/.test(file)));
});

