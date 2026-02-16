import os from 'node:os';
import path from 'node:path';

function isNodeTestProcess() {
	return process.argv.some((arg) => arg === '--test');
}

function resolveConfigDir() {
	const envOverride = String(process.env.WEALTH_PLANNER_CONFIG_DIR ?? '').trim();
	if (envOverride) {
		return envOverride;
	}
	if (isNodeTestProcess()) {
		return path.join(os.tmpdir(), 'wealth-planner-test-config');
	}
	return path.join(os.homedir(), '.config', 'wealth-planner');
}

export const CONFIG_DIR = resolveConfigDir();
export const DB_PATH = path.join(CONFIG_DIR, 'main.json');
export const SQLITE_DB_PATH = path.join(CONFIG_DIR, 'main.db');
export const COMMANDS_PATH = path.join(CONFIG_DIR, 'commands.json');

export const DEFAULT_TIMEZONE = 'America/New_York';
export const INSTITUTION_TYPES = new Set(['BANK', 'CREDIT', 'CREDIT_CARD']);
export const TABS = ['Home', 'Balances', 'Credit'];
