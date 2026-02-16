import fs from 'node:fs/promises';
import path from 'node:path';

import {cleanDb} from '../../lib/clean-db.js';
import {COMMANDS_PATH, CONFIG_DIR, DB_PATH, SQLITE_DB_PATH} from '../constants.js';
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

	if (
		normalized.commands.add_institutions &&
		typeof normalized.commands.add_institutions === 'object' &&
		(!normalized.commands.add_deposit_account || typeof normalized.commands.add_deposit_account !== 'object')
	) {
		normalized.commands.add_deposit_account = {...normalized.commands.add_institutions};
		changed = true;
	}

	if (
		normalized.commands.add_transactions &&
		typeof normalized.commands.add_transactions === 'object' &&
		(!normalized.commands.upload_csv || typeof normalized.commands.upload_csv !== 'object')
	) {
		normalized.commands.upload_csv = {...normalized.commands.add_transactions};
		changed = true;
	}

	if (!normalized.commands.clean_db || typeof normalized.commands.clean_db !== 'object') {
		normalized.commands.clean_db = {...DEFAULT_COMMAND_REGISTRY.commands.clean_db};
		changed = true;
	}
	if (!normalized.commands.backup_db || typeof normalized.commands.backup_db !== 'object') {
		normalized.commands.backup_db = {...DEFAULT_COMMAND_REGISTRY.commands.backup_db};
		changed = true;
	}

	if (!normalized.commands.add_deposit_account || typeof normalized.commands.add_deposit_account !== 'object') {
		normalized.commands.add_deposit_account = {...DEFAULT_COMMAND_REGISTRY.commands.add_deposit_account};
		changed = true;
	}

	if (!normalized.commands.add_credit_account || typeof normalized.commands.add_credit_account !== 'object') {
		normalized.commands.add_credit_account = {...DEFAULT_COMMAND_REGISTRY.commands.add_credit_account};
		changed = true;
	}

	if (!normalized.commands.upload_csv || typeof normalized.commands.upload_csv !== 'object') {
		normalized.commands.upload_csv = {...DEFAULT_COMMAND_REGISTRY.commands.upload_csv};
		changed = true;
	}

	if (!normalized.commands.switch || typeof normalized.commands.switch !== 'object') {
		normalized.commands.switch = {...DEFAULT_COMMAND_REGISTRY.commands.switch};
		changed = true;
	}

	if (!normalized.commands.search || typeof normalized.commands.search !== 'object') {
		normalized.commands.search = {...DEFAULT_COMMAND_REGISTRY.commands.search};
		changed = true;
	}

	if (!normalized.commands.clear || typeof normalized.commands.clear !== 'object') {
		normalized.commands.clear = {...DEFAULT_COMMAND_REGISTRY.commands.clear};
		changed = true;
	}

	if (Object.hasOwn(normalized.commands, 'add_institutions')) {
		delete normalized.commands.add_institutions;
		changed = true;
	}

	if (Object.hasOwn(normalized.commands, 'add_transactions')) {
		delete normalized.commands.add_transactions;
		changed = true;
	}

	return {normalized, changed};
}

async function fileExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

function makeBackupFileName(sourcePath, timestamp) {
	const baseName = path.basename(sourcePath);
	return `${baseName}.${timestamp}.bak`;
}

async function backupDatabaseFiles() {
	const backupsDir = path.join(CONFIG_DIR, 'backups');
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const sourceFiles = [
		DB_PATH,
		SQLITE_DB_PATH,
		`${SQLITE_DB_PATH}-wal`,
		`${SQLITE_DB_PATH}-shm`
	];
	const presentFiles = [];
	for (const sourcePath of sourceFiles) {
		if (await fileExists(sourcePath)) {
			presentFiles.push(sourcePath);
		}
	}
	if (presentFiles.length === 0) {
		return {created: [], backupsDir};
	}

	await fs.mkdir(backupsDir, {recursive: true});
	const created = [];
	for (const sourcePath of presentFiles) {
		const destinationPath = path.join(backupsDir, makeBackupFileName(sourcePath, timestamp));
		await fs.copyFile(sourcePath, destinationPath);
		created.push(destinationPath);
	}
	return {created, backupsDir};
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
			return `No database found at ${result.dbPath} or ${result.sqliteDbPath}.`;
		}
		const backups = [
			result.backupPaths?.json ? `JSON: ${result.backupPaths.json}` : null,
			result.backupPaths?.sqlite ? `SQLite: ${result.backupPaths.sqlite}` : null
		].filter(Boolean).join(' | ');
		return backups
			? `Databases removed. Backups: ${backups}`
			: 'Databases removed.';
	}
	if (commandName === 'backup_db') {
		const backupResult = await backupDatabaseFiles();
		if (backupResult.created.length === 0) {
			return `No database files found to back up in ${CONFIG_DIR}.`;
		}
		return `Backup complete (${backupResult.created.length} file${backupResult.created.length === 1 ? '' : 's'}) in ${backupResult.backupsDir}.`;
	}
	throw new Error(`Unknown command: /${commandName}`);
}
