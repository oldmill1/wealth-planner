import {cleanDb} from '../lib/clean-db.js';

async function runCleanDb() {
	const result = await cleanDb();
	if (!result.removed) {
		console.log(`No databases found at ${result.dbPath} and ${result.sqliteDbPath}. Nothing to clean.`);
		return;
	}
	console.log(`Database removed: ${result.dbPath}`);
	console.log(`Database removed: ${result.sqliteDbPath}`);
}

runCleanDb().catch((error) => {
	console.error(`clean_db failed: ${error.message}`);
	process.exitCode = 1;
});
