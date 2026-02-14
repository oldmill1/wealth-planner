import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const configDir = path.join(os.homedir(), '.config', 'wealth-planner');
export const dbPath = path.join(configDir, 'main.json');
export const backupsDir = path.join(configDir, 'backups');
const backupSlots = 5;
const nextSlotPath = path.join(backupsDir, '.next_backup_slot');

function backupPathForSlot(slot) {
	return path.join(backupsDir, `main.json.bak.${slot}`);
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
			await fs.access(backupPathForSlot(slot));
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

	try {
		await fs.access(dbPath);
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return {
				backupPath: null,
				dbPath,
				removed: false
			};
		}
		throw error;
	}

	await fs.mkdir(backupsDir, {recursive: true});
	const slot = await readNextBackupSlot();
	const backupPath = backupPathForSlot(slot);
	const nextSlot = slot >= backupSlots ? 1 : slot + 1;

	await fs.copyFile(dbPath, backupPath);
	await fs.rm(dbPath);
	await writeNextBackupSlot(nextSlot);

	return {
		backupPath,
		dbPath,
		removed: true
	};
}
