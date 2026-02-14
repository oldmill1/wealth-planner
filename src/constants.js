import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'wealth-planner');
export const DB_PATH = path.join(CONFIG_DIR, 'main.json');
export const COMMANDS_PATH = path.join(CONFIG_DIR, 'commands.json');

export const DEFAULT_TIMEZONE = 'America/New_York';
export const INSTITUTION_TYPES = new Set(['BANK', 'CREDIT_CARD']);
export const TABS = ['Home', 'Institutions', 'Credit'];
