import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'wealth-planner');
const DB_PATH = path.join(CONFIG_DIR, 'main.json');
const DEFAULT_TIMEZONE = 'America/New_York';
const INSTITUTION_TYPES = new Set(['BANK', 'CREDIT_CARD']);

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

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
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
		if (key.ctrl && input === 'c' || key.escape) {
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

		return [
			React.createElement(Text, {key: 'title', color: 'blueBright'}, 'Wealth Planner'),
			React.createElement(Text, {key: 'hello', color: 'greenBright'}, `Hello, ${user?.name ?? 'there'}`),
			React.createElement(
				Text,
				{key: 'tz', color: 'blue', dimColor: true},
				`Timezone: ${user?.timezone ?? DEFAULT_TIMEZONE}`
			),
			React.createElement(Text, {key: 'hint', color: 'blue', dimColor: true}, 'Press q to quit')
		];
	}, [bootState, errorMessage, nameInput, timezoneInput, user]);

	return React.createElement(
		Box,
		{
			width: terminalWidth,
			height: terminalHeight,
			flexDirection: 'column',
			justifyContent: 'center',
			alignItems: 'center'
		},
		...content
	);
}

render(React.createElement(App));
