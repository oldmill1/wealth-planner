import fs from 'node:fs/promises';

import {cleanDb} from '../../lib/clean-db.js';
import {COMMANDS_PATH, CONFIG_DIR} from '../constants.js';
import {DEFAULT_COMMAND_REGISTRY} from '../data/demo.js';

function normalizeCommandRegistryShape(parsed) {
	let changed = false;
	const normalized = parsed && typeof parsed === 'object' ? {...parsed} : {};

	if (typeof normalized.version !== 'number') {
		normalized.version = DEFAULT_COMMAND_REGISTRY.version;
		changed = true;
	}

	if (!normalized.commands || typeof normalized.commands !== 'object') {
		normalized.commands = {...DEFAULT_COMMAND_REGISTRY.commands};
		changed = true;
	}

	if (!normalized.commands.clean_db || typeof normalized.commands.clean_db !== 'object') {
		normalized.commands.clean_db = {...DEFAULT_COMMAND_REGISTRY.commands.clean_db};
		changed = true;
	}

	if (!normalized.commands.add_institutions || typeof normalized.commands.add_institutions !== 'object') {
		normalized.commands.add_institutions = {...DEFAULT_COMMAND_REGISTRY.commands.add_institutions};
		changed = true;
	}

	if (!normalized.commands.add_transactions || typeof normalized.commands.add_transactions !== 'object') {
		normalized.commands.add_transactions = {...DEFAULT_COMMAND_REGISTRY.commands.add_transactions};
		changed = true;
	}

	return {normalized, changed};
}

export async function loadOrInitCommandRegistry() {
	await fs.mkdir(CONFIG_DIR, {recursive: true});

	try {
		const raw = await fs.readFile(COMMANDS_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		const {normalized, changed} = normalizeCommandRegistryShape(parsed);
		if (changed) {
			await fs.writeFile(COMMANDS_PATH, JSON.stringify(normalized, null, 2), 'utf8');
		}
		return normalized.commands;
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
		await fs.writeFile(COMMANDS_PATH, JSON.stringify(DEFAULT_COMMAND_REGISTRY, null, 2), 'utf8');
		return DEFAULT_COMMAND_REGISTRY.commands;
	}
}

export async function executeCommand(commandName) {
	if (commandName === 'clean_db') {
		const result = await cleanDb();
		if (!result.removed) {
			return `No database found at ${result.dbPath}.`;
		}
		return `Database removed. Backup: ${result.backupPath}`;
	}
	throw new Error(`Unknown command: /${commandName}`);
}
