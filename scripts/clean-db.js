import {cleanDb} from '../lib/clean-db.js';

async function runCleanDb() {
	const result = await cleanDb();
	if (!result.removed) {
		console.log(`No database found at ${result.dbPath}. Nothing to clean.`);
		return;
	}
	console.log(`Backup created: ${result.backupPath}`);
	console.log(`Database removed: ${result.dbPath}`);
}

runCleanDb().catch((error) => {
	console.error(`clean_db failed: ${error.message}`);
	process.exitCode = 1;
});
