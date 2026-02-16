import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const configDir = path.join(os.homedir(), '.config', 'wealth-planner');
export const dbPath = path.join(configDir, 'main.json');
export const sqliteDbPath = path.join(configDir, 'main.db');

export async function cleanDb() {
	await fs.mkdir(configDir, {recursive: true});

	let hasJsonDb = false;
	let hasSqliteDb = false;
	let hasSqliteWal = false;
	let hasSqliteShm = false;

	try {
		await fs.access(dbPath);
		hasJsonDb = true;
	} catch (error) {
		if (!error || error.code !== 'ENOENT') {
			throw error;
		}
	}

	try {
		await fs.access(sqliteDbPath);
		hasSqliteDb = true;
	} catch (error) {
		if (!error || error.code !== 'ENOENT') {
			throw error;
		}
	}

	try {
		await fs.access(`${sqliteDbPath}-wal`);
		hasSqliteWal = true;
	} catch (error) {
		if (!error || error.code !== 'ENOENT') {
			throw error;
		}
	}

	try {
		await fs.access(`${sqliteDbPath}-shm`);
		hasSqliteShm = true;
	} catch (error) {
		if (!error || error.code !== 'ENOENT') {
			throw error;
		}
	}

	if (!hasJsonDb && !hasSqliteDb && !hasSqliteWal && !hasSqliteShm) {
		return {
			dbPath,
			sqliteDbPath,
			removed: false
		};
	}

	if (hasJsonDb) {
		await fs.rm(dbPath);
	}

	if (hasSqliteDb) {
		await fs.rm(sqliteDbPath);
	}
	if (hasSqliteWal) {
		await fs.rm(`${sqliteDbPath}-wal`);
	}
	if (hasSqliteShm) {
		await fs.rm(`${sqliteDbPath}-shm`);
	}

	return {
		dbPath,
		sqliteDbPath,
		removed: true
	};
}
