import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const configDir = path.join(os.homedir(), '.config', 'wealth-planner');
const dbPath = path.join(configDir, 'main.json');
const backupsDir = path.join(configDir, 'backups');

async function cleanDb() {
	await fs.mkdir(configDir, {recursive: true});

	try {
		await fs.access(dbPath);
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			console.log(`No database found at ${dbPath}. Nothing to clean.`);
			return;
		}
		throw error;
	}

	await fs.mkdir(backupsDir, {recursive: true});
	const timestamp = new Date().toISOString().replaceAll(':', '-');
	const backupPath = path.join(backupsDir, `main.${timestamp}.json`);

	await fs.copyFile(dbPath, backupPath);
	await fs.rm(dbPath);

	console.log(`Backup created: ${backupPath}`);
	console.log(`Database removed: ${dbPath}`);
}

cleanDb().catch((error) => {
	console.error(`clean_db failed: ${error.message}`);
	process.exitCode = 1;
});
