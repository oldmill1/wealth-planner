import fs from 'node:fs/promises';

import {DB_PATH, CONFIG_DIR, INSTITUTION_TYPES} from '../constants.js';

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

export function isValidInstitutionType(value) {
	return INSTITUTION_TYPES.has(value);
}

export function isValidInstitution(record) {
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
		institutions: []
	};
}

export async function loadOrInitDatabase() {
	try {
		await fs.access(DB_PATH);
		const raw = await fs.readFile(DB_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		const {normalized, changed} = normalizeDatabaseShape(parsed);
		if (changed) {
			await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
		}
		const firstUser = normalized.users?.[0] ?? null;
		return {
			firstRun: false,
			user: firstUser,
			institutions: normalized.institutions ?? []
		};
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
		return {firstRun: true, user: null, institutions: []};
	}
}

export async function saveFirstUser(name, timezone) {
	await fs.mkdir(CONFIG_DIR, {recursive: true});
	const user = createRecord({name, timezone});
	const database = createDatabase(user);
	await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2), 'utf8');
	return user;
}

export async function addInstitutionForUser({userId, name}) {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error('Institution name is required.');
	}

	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();

	const institution = {
		id: crypto.randomUUID(),
		user_id: userId,
		type: 'BANK',
		name: trimmedName,
		transaction_ids: [],
		created_at: now,
		updated_at: now
	};

	normalized.institutions = [...(normalized.institutions ?? []), institution];
	normalized.meta = {
		...normalized.meta,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return institution;
}

export function isValidTimezone(timezone) {
	try {
		new Intl.DateTimeFormat('en-US', {timeZone: timezone});
		return true;
	} catch (_error) {
		return false;
	}
}
