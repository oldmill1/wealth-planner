import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import {cleanDb} from './lib/clean-db.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'wealth-planner');
const DB_PATH = path.join(CONFIG_DIR, 'main.json');
const COMMANDS_PATH = path.join(CONFIG_DIR, 'commands.json');
const DEFAULT_TIMEZONE = 'America/New_York';
const INSTITUTION_TYPES = new Set(['BANK', 'CREDIT_CARD']);
const TABS = ['Home', 'Institutions'];
const DEMO_INSTITUTIONS = [
	{
		id: 'inst_demo_bank_1',
		type: 'BANK',
		name: 'First National Bank Checking',
		status: 'CONNECTED',
		balance: '$12,480',
		lastUpdated: '2m ago',
		accountMask: '...9034'
	},
	{
		id: 'inst_demo_cc_1',
		type: 'CREDIT_CARD',
		name: 'Capital One MasterCard',
		status: 'NEEDS_ATTENTION',
		balance: '$1,204',
		lastUpdated: '45m ago',
		accountMask: '...5501'
	},
	{
		id: 'inst_demo_bank_2',
		type: 'BANK',
		name: 'Velocity Savings',
		status: 'CONNECTED',
		balance: '$44,920',
		lastUpdated: '1h ago',
		accountMask: '...1188'
	}
];
const DEFAULT_COMMAND_REGISTRY = {
	version: 1,
	commands: {
		clean_db: {
			description: 'Backup then remove the local main database file.'
		}
	}
};

function createRecord({name, timezone}) {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name,
		timezone,
		created_at: now,
		updated_at: now
	};
}

function isValidInstitutionType(value) {
	return INSTITUTION_TYPES.has(value);
}

function isValidInstitution(record) {
	return (
		record !== null &&
		typeof record === 'object' &&
		typeof record.id === 'string' &&
		isValidInstitutionType(record.type) &&
		typeof record.name === 'string' &&
		typeof record.user_id === 'string' &&
		typeof record.created_at === 'string' &&
		typeof record.updated_at === 'string' &&
		Array.isArray(record.transaction_ids) &&
		record.transaction_ids.every((id) => typeof id === 'string')
	);
}

function normalizeInstitution(record) {
	if (record === null || typeof record !== 'object') {
		return null;
	}

	const transactionIds = Array.isArray(record.transaction_ids)
		? record.transaction_ids.filter((id) => typeof id === 'string')
		: [];

	const normalized = {
		...record,
		transaction_ids: transactionIds
	};

	return isValidInstitution(normalized) ? normalized : null;
}

function normalizeDatabaseShape(parsed) {
	let changed = false;
	const normalized = parsed && typeof parsed === 'object' ? {...parsed} : {};
	const now = new Date().toISOString();

	if (!normalized.meta || typeof normalized.meta !== 'object') {
		normalized.meta = {
			version: 1,
			created_at: now,
			updated_at: now
		};
		changed = true;
	}

	if (!Array.isArray(normalized.users)) {
		normalized.users = [];
		changed = true;
	}

	if (!Array.isArray(normalized.institutions)) {
		normalized.institutions = [];
		changed = true;
	} else {
		const sanitizedInstitutions = normalized.institutions
			.map(normalizeInstitution)
			.filter((institution) => institution !== null);
		if (sanitizedInstitutions.length !== normalized.institutions.length) {
			changed = true;
		}
		normalized.institutions = sanitizedInstitutions;
	}

	if (changed) {
		normalized.meta = {
			...normalized.meta,
			updated_at: now
		};
	}

	return {normalized, changed};
}

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

	return {normalized, changed};
}

function createDatabase(user) {
	const now = new Date().toISOString();
	return {
		meta: {
			version: 1,
			created_at: now,
			updated_at: now
		},
		users: [user],
		// Contract: institutions stores BANK/CREDIT_CARD records tied to a user UUID.
		institutions: []
	};
}

async function loadOrInitDatabase() {
	try {
		await fs.access(DB_PATH);
		const raw = await fs.readFile(DB_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		const {normalized, changed} = normalizeDatabaseShape(parsed);
		if (changed) {
			await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
		}
		const firstUser = normalized.users?.[0] ?? null;
		return {firstRun: false, user: firstUser};
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
		return {firstRun: true, user: null};
	}
}

async function loadOrInitCommandRegistry() {
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

async function saveFirstUser(name, timezone) {
	await fs.mkdir(CONFIG_DIR, {recursive: true});
	const user = createRecord({name, timezone});
	const database = createDatabase(user);
	await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2), 'utf8');
	return user;
}

function isValidTimezone(timezone) {
	try {
		new Intl.DateTimeFormat('en-US', {timeZone: timezone});
		return true;
	} catch (_error) {
		return false;
	}
}

async function executeCommand(commandName) {
	if (commandName === 'clean_db') {
		const result = await cleanDb();
		if (!result.removed) {
			return `No database found at ${result.dbPath}.`;
		}
		return `Database removed. Backup: ${result.backupPath}`;
	}
	throw new Error(`Unknown command: /${commandName}`);
}

function renderTabLabel(label, isActive) {
	if (isActive) {
		return React.createElement(Text, {backgroundColor: '#2a2b52', color: '#d4d6ff'}, `  ${label}  `);
	}
	return React.createElement(Text, {color: '#777898'}, label);
}

function renderTabs(terminalWidth, currentTab) {
	const divider = '-'.repeat(Math.max(24, terminalWidth - 2));
	return React.createElement(
		Box,
		{
			width: '100%',
			flexDirection: 'column'
		},
		React.createElement(
			Box,
			{
				width: '100%',
				paddingX: 2,
				paddingY: 0,
				flexDirection: 'row',
				alignItems: 'center'
			},
			React.createElement(Text, {color: '#3b3f70'}, '|  '),
			renderTabLabel('Home', currentTab === 'Home'),
			React.createElement(Text, {color: '#3b3f70'}, '  |  '),
			renderTabLabel('Institutions', currentTab === 'Institutions'),
			React.createElement(Text, {color: '#3b3f70'}, '  |')
		),
		React.createElement(
			Box,
			{
				width: '100%',
				paddingX: 2
			},
			React.createElement(Text, {color: '#2b2d47'}, divider)
		)
	);
}

function pad(value, length) {
	if (value.length >= length) {
		return value.slice(0, length - 1) + '…';
	}
	return value + ' '.repeat(length - value.length);
}

function renderInstitutionRow(item, isSelected, leftPaneWidth) {
	const safeWidth = Math.max(56, leftPaneWidth - 8);
	const typeCol = 13;
	const statusCol = 10;
	const balanceCol = 10;
	const updatedCol = 9;
	const nameCol = Math.max(10, safeWidth - typeCol - statusCol - balanceCol - updatedCol - 9);
	const line = `${pad(item.type, typeCol)} ${pad(item.name, nameCol)} ${pad(item.status, statusCol)} ${pad(item.balance, balanceCol)} ${pad(item.lastUpdated, updatedCol)}`;

	return React.createElement(
		Box,
		{
			key: item.id,
			width: '100%',
			paddingX: 1,
			backgroundColor: isSelected ? '#24264a' : undefined
		},
		React.createElement(Text, {color: isSelected ? '#d4d6ff' : '#8f93bf'}, line)
	);
}

function renderInstitutionsDashboard(terminalWidth, institutionRows) {
	const selected = institutionRows[0] ?? null;
	const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * 0.62));
	const rightPaneWidth = Math.max(28, terminalWidth - leftPaneWidth - 6);

	if (institutionRows.length === 0) {
		return React.createElement(
			Box,
			{
				width: '100%',
				paddingX: 2,
				paddingY: 1,
				flexDirection: 'column'
			},
			React.createElement(Text, {color: '#c5c8ff'}, 'Institutions'),
			React.createElement(Text, {color: '#777898'}, 'No institutions found (mock state).')
		);
	}

	return React.createElement(
		Box,
		{
			width: '100%',
			paddingX: 1,
			paddingY: 1,
			flexDirection: 'row'
		},
		React.createElement(
			Box,
			{
				width: leftPaneWidth,
				flexDirection: 'column',
				paddingX: 1
			},
			React.createElement(Text, {color: '#7d83c8'}, ' [Search] institution:all status:any user:current'),
			React.createElement(Text, {color: '#2f325a'}, '-'.repeat(Math.max(30, leftPaneWidth - 4))),
			React.createElement(
				Box,
				{
					width: '100%',
					paddingX: 1
				},
				React.createElement(Text, {color: '#aeb2df'}, 'Type          Name                         Status     Balance    Updated')
			),
			React.createElement(Text, {color: '#2f325a'}, '-'.repeat(Math.max(30, leftPaneWidth - 4))),
			...institutionRows.map((item, index) => renderInstitutionRow(item, index === 0, leftPaneWidth)),
			React.createElement(Text, {color: '#2f325a'}, '-'.repeat(Math.max(30, leftPaneWidth - 4))),
			React.createElement(Text, {color: '#777898'}, ' Demo UI only. Replace with real institutions data source.')
		),
		React.createElement(
			Box,
			{
				width: 1
			},
			React.createElement(Text, {color: '#2f325a'}, '│')
		),
		React.createElement(
			Box,
			{
				width: rightPaneWidth,
				flexDirection: 'column',
				paddingX: 1
			},
			React.createElement(Text, {color: '#aeb2df'}, `Selected Institution: ${selected?.name ?? '-'}`),
			React.createElement(Text, {color: '#8f93bf'}, `Account: ${selected?.accountMask ?? '-'}`),
			React.createElement(Text, {color: '#8f93bf'}, `Type: ${selected?.type ?? '-'}  Status: ${selected?.status ?? '-'}`),
			React.createElement(Text, {color: '#8f93bf'}, `Balance: ${selected?.balance ?? '-'}  Updated: ${selected?.lastUpdated ?? '-'}`),
			React.createElement(Text, {color: '#2f325a'}, '-'.repeat(Math.max(18, rightPaneWidth - 2))),
			React.createElement(Text, {color: '#58d7a3'}, '• Sync healthy'),
			React.createElement(Text, {color: '#58d7a3'}, '• Credentials valid'),
			React.createElement(Text, {color: '#8f93bf'}, '• 0 pending alerts'),
			React.createElement(Text, {color: '#2f325a'}, '-'.repeat(Math.max(18, rightPaneWidth - 2))),
			React.createElement(Text, {color: '#777898'}, 'Actions (mock): Refresh | Rename | Disconnect')
		)
	);
}

function App() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	const [bootState, setBootState] = useState('booting');
	const [errorMessage, setErrorMessage] = useState('');
	const [nameInput, setNameInput] = useState('');
	const [timezoneInput, setTimezoneInput] = useState(DEFAULT_TIMEZONE);
	const [user, setUser] = useState(null);
	const [commands, setCommands] = useState({});
	const [commandMode, setCommandMode] = useState(false);
	const [commandInput, setCommandInput] = useState('');
	const [commandMessage, setCommandMessage] = useState('');
	const [isRunningCommand, setIsRunningCommand] = useState(false);
	const [currentTab, setCurrentTab] = useState('Home');
	const [institutionRows] = useState(DEMO_INSTITUTIONS);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const loadedCommands = await loadOrInitCommandRegistry();
				if (!mounted) {
					return;
				}
				setCommands(loadedCommands);

				const bios = await loadOrInitDatabase();
				if (!mounted) {
					return;
				}
				if (bios.firstRun || !bios.user) {
					setBootState('wizard_name');
					return;
				}
				setUser(bios.user);
				setBootState('ready');
			} catch (error) {
				if (!mounted) {
					return;
				}
				setErrorMessage(error.message || 'Failed during BIOS startup.');
				setBootState('error');
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			exit();
			return;
		}

		if (commandMode) {
			if (key.escape) {
				setCommandMode(false);
				setCommandInput('');
				setCommandMessage('');
				return;
			}

			if (key.return) {
				const normalizedCommand = commandInput.trim().replace(/^\/+/, '');
				if (!normalizedCommand) {
					setCommandMessage('Enter a command. Example: /clean_db');
					return;
				}
				if (!Object.hasOwn(commands, normalizedCommand)) {
					setCommandMessage(`Unknown command: /${normalizedCommand}`);
					return;
				}

				setIsRunningCommand(true);
				executeCommand(normalizedCommand)
					.then((message) => {
						setCommandMessage(message);
						if (normalizedCommand === 'clean_db') {
							setUser(null);
							setNameInput('');
							setTimezoneInput(DEFAULT_TIMEZONE);
							setBootState('wizard_name');
						}
					})
					.catch((error) => {
						setCommandMessage(`Command failed: ${error.message}`);
					})
					.finally(() => {
						setIsRunningCommand(false);
						setCommandMode(false);
						setCommandInput('');
					});
				return;
			}

			if (key.backspace || key.delete) {
				setCommandInput((prev) => prev.slice(0, -1));
				return;
			}

			if (!key.ctrl && !key.meta && input) {
				setCommandInput((prev) => prev + input);
			}
			return;
		}

		if (input === '/') {
			setCommandMode(true);
			setCommandInput('');
			return;
		}

		if (key.tab) {
			setCurrentTab((prev) => {
				const currentIndex = TABS.indexOf(prev);
				const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % TABS.length;
				return TABS[nextIndex];
			});
			return;
		}

		if (key.escape) {
			exit();
			return;
		}

		if (bootState === 'ready') {
			if (input === 'q') {
				exit();
			}
			return;
		}

		if (bootState === 'wizard_name') {
			if (key.return) {
				const nextName = nameInput.trim();
				if (!nextName) {
					setErrorMessage('Name is required.');
					return;
				}
				setErrorMessage('');
				setBootState('wizard_timezone');
				return;
			}
			if (key.backspace || key.delete) {
				setNameInput((prev) => prev.slice(0, -1));
				return;
			}
			if (!key.ctrl && !key.meta && input) {
				setNameInput((prev) => prev + input);
			}
			return;
		}

		if (bootState === 'wizard_timezone') {
			if (key.return) {
				const trimmedName = nameInput.trim();
				const trimmedTimezone = timezoneInput.trim() || DEFAULT_TIMEZONE;
				if (!isValidTimezone(trimmedTimezone)) {
					setErrorMessage('Invalid timezone. Example: America/New_York');
					return;
				}
				setErrorMessage('');
				setBootState('saving');
				saveFirstUser(trimmedName, trimmedTimezone)
					.then((savedUser) => {
						setUser(savedUser);
						setBootState('ready');
					})
					.catch((error) => {
						setErrorMessage(error.message || 'Failed to save user.');
						setBootState('error');
					});
				return;
			}
			if (key.backspace || key.delete) {
				setTimezoneInput((prev) => prev.slice(0, -1));
				return;
			}
			if (!key.ctrl && !key.meta && input) {
				setTimezoneInput((prev) => prev + input);
			}
		}
	});

	const content = useMemo(() => {
		if (bootState === 'booting') {
			return [
				React.createElement(Text, {key: 'title', color: 'blueBright'}, 'Wealth Planner BIOS'),
				React.createElement(Text, {key: 'line', color: 'greenBright'}, 'Checking local database...')
			];
		}

		if (bootState === 'wizard_name') {
			return [
				React.createElement(Text, {key: 'title', color: 'blueBright'}, 'First Run Setup'),
				React.createElement(Text, {key: 'name', color: 'greenBright'}, `Name: ${nameInput || '|'}`),
				React.createElement(Text, {key: 'hint', color: 'blue', dimColor: true}, 'Press Enter to continue')
			];
		}

		if (bootState === 'wizard_timezone') {
			return [
				React.createElement(Text, {key: 'title', color: 'blueBright'}, 'First Run Setup'),
				React.createElement(Text, {key: 'timezone', color: 'greenBright'}, `Timezone: ${timezoneInput || '|'}`),
				React.createElement(Text, {key: 'hint', color: 'blue', dimColor: true}, 'Default: America/New_York')
			];
		}

		if (bootState === 'saving') {
			return [
				React.createElement(Text, {key: 'title', color: 'blueBright'}, 'Finalizing setup...'),
				React.createElement(Text, {key: 'line', color: 'greenBright'}, 'Writing user profile to disk')
			];
		}

		if (bootState === 'error') {
			return [
				React.createElement(Text, {key: 'title', color: 'redBright'}, 'Startup Error'),
				React.createElement(Text, {key: 'error', color: 'red'}, errorMessage || 'Unknown error'),
				React.createElement(Text, {key: 'hint', color: 'blue', dimColor: true}, 'Press Esc to quit')
			];
		}

		if (bootState === 'ready' && currentTab === 'Institutions') {
			return [
				React.createElement(Text, {key: 'title', color: '#c5c8ff'}, 'Institutions Workspace'),
				React.createElement(Text, {key: 'sub', color: '#777898'}, 'Mock layout for future real data wiring'),
				React.createElement(Text, {key: 'spacer', color: '#777898'}, ''),
				React.createElement(
					Box,
					{key: 'panel', width: '100%', flexDirection: 'column'},
					renderInstitutionsDashboard(terminalWidth, institutionRows)
				),
				React.createElement(Text, {key: 'hint', color: '#777898'}, 'Press q to quit')
			];
		}

		return [
			React.createElement(Text, {key: 'title', color: 'blueBright'}, 'Wealth Planner'),
			React.createElement(Text, {key: 'hello', color: '#777898'}, `Hello, ${user?.name ?? 'there'}`),
			React.createElement(
				Text,
				{key: 'tz', color: '#777898'},
				`Timezone: ${user?.timezone ?? DEFAULT_TIMEZONE}`
			),
			React.createElement(Text, {key: 'hint', color: '#777898'}, 'Press / for command mode'),
			React.createElement(Text, {key: 'hint2', color: '#777898'}, 'Press q to quit')
		];
	}, [bootState, currentTab, errorMessage, institutionRows, nameInput, terminalWidth, timezoneInput, user]);

	const fullContent = [...content];

	if (commandMode) {
		fullContent.push(
			React.createElement(Text, {key: 'cmd', color: 'greenBright'}, `/${commandInput || '|'}`),
			React.createElement(
				Text,
				{key: 'cmdhint', color: 'blue', dimColor: true},
				'Command mode: press Enter to run, Esc to cancel'
			)
		);
	}

	if (isRunningCommand) {
		fullContent.push(React.createElement(Text, {key: 'running', color: 'blueBright'}, 'Running command...'));
	} else if (commandMessage) {
		fullContent.push(React.createElement(Text, {key: 'result', color: 'greenBright'}, commandMessage));
	}

	return React.createElement(
		Box,
		{
			width: terminalWidth,
			height: terminalHeight,
			flexDirection: 'column',
			backgroundColor: '#161723'
		},
		renderTabs(terminalWidth, currentTab),
		React.createElement(
			Box,
			{
				width: '100%',
				flexGrow: 1,
				flexDirection: 'column',
				justifyContent: currentTab === 'Institutions' ? 'flex-start' : 'center',
				alignItems: currentTab === 'Institutions' ? 'stretch' : 'center'
			},
			...fullContent
		)
	);
}

render(React.createElement(App));
