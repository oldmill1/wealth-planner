import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const configDir = path.join(os.homedir(), '.config', 'wealth-planner');
export const dbPath = path.join(configDir, 'main.json');
export const backupsDir = path.join(configDir, 'backups');

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
	const timestamp = new Date().toISOString().replaceAll(':', '-');
	const backupPath = path.join(backupsDir, `main.${timestamp}.json`);

	await fs.copyFile(dbPath, backupPath);
	await fs.rm(dbPath);

	return {
		backupPath,
		dbPath,
		removed: true
	};
}
