import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const configDir = path.join(os.homedir(), '.config', 'wealth-planner');
export const dbPath = path.join(configDir, 'main.json');
export const sqliteDbPath = path.join(configDir, 'main.db');
export const backupsDir = path.join(configDir, 'backups');
const backupSlots = 5;
const nextSlotPath = path.join(backupsDir, '.next_backup_slot');

function jsonBackupPathForSlot(slot) {
	return path.join(backupsDir, `main.json.bak.${slot}`);
}

function sqliteBackupPathForSlot(slot) {
	return path.join(backupsDir, `main.db.bak.${slot}`);
}

async function readNextBackupSlot() {
	try {
		const raw = await fs.readFile(nextSlotPath, 'utf8');
		const parsed = Number.parseInt(raw.trim(), 10);
		if (Number.isInteger(parsed) && parsed >= 1 && parsed <= backupSlots) {
			return parsed;
		}
	} catch (error) {
		if (!error || error.code !== 'ENOENT') {
			throw error;
		}
	}

	for (let slot = 1; slot <= backupSlots; slot += 1) {
		try {
			await fs.access(jsonBackupPathForSlot(slot));
		} catch (error) {
			if (error && error.code === 'ENOENT') {
				return slot;
			}
			throw error;
		}
	}

	return 1;
}

async function writeNextBackupSlot(slot) {
	await fs.writeFile(nextSlotPath, String(slot), 'utf8');
}

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
			backupPaths: {
				json: null,
				sqlite: null
			},
			dbPath,
			sqliteDbPath,
			removed: false
		};
	}

	await fs.mkdir(backupsDir, {recursive: true});
	const slot = await readNextBackupSlot();
	const jsonBackupPath = hasJsonDb ? jsonBackupPathForSlot(slot) : null;
	const sqliteBackupPath = hasSqliteDb ? sqliteBackupPathForSlot(slot) : null;
	const nextSlot = slot >= backupSlots ? 1 : slot + 1;

	if (hasJsonDb && jsonBackupPath) {
		await fs.copyFile(dbPath, jsonBackupPath);
		await fs.rm(dbPath);
	}

	if (hasSqliteDb && sqliteBackupPath) {
		await fs.copyFile(sqliteDbPath, sqliteBackupPath);
		await fs.rm(sqliteDbPath);
	}
	if (hasSqliteWal) {
		await fs.rm(`${sqliteDbPath}-wal`);
	}
	if (hasSqliteShm) {
		await fs.rm(`${sqliteDbPath}-shm`);
	}

	await writeNextBackupSlot(nextSlot);

	return {
		backupPaths: {
			json: jsonBackupPath,
			sqlite: sqliteBackupPath
		},
		dbPath,
		sqliteDbPath,
		removed: true
	};
}
