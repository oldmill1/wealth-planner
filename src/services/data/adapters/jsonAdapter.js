import fs from 'node:fs/promises';

import {CONFIG_DIR, DB_PATH} from '../../../constants.js';

export function createJsonAdapter() {
	return {
		async loadDatabase() {
			const raw = await fs.readFile(DB_PATH, 'utf8');
			return JSON.parse(raw);
		},
		async saveDatabase(nextDb) {
			await fs.mkdir(CONFIG_DIR, {recursive: true});
			await fs.writeFile(DB_PATH, JSON.stringify(nextDb, null, 2), 'utf8');
		}
	};
}
