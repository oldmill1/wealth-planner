import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

	if (!Array.isArray(normalized.transactions)) {
		normalized.transactions = [];
		changed = true;
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
		institutions: [],
		transactions: []
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
			institutions: normalized.institutions ?? [],
			transactions: normalized.transactions ?? []
		};
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
		return {firstRun: true, user: null, institutions: [], transactions: []};
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

function parseCsvLine(line) {
	const values = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		const next = line[i + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				current += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === ',' && !inQuotes) {
			values.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	values.push(current.trim());
	return values;
}

function resolveCsvPath(inputPath) {
	const trimmed = inputPath.trim();
	if (!trimmed) {
		throw new Error('CSV path is required.');
	}

	if (trimmed.startsWith('~/')) {
		return path.join(os.homedir(), trimmed.slice(2));
	}

	if (path.isAbsolute(trimmed)) {
		return trimmed;
	}

	return path.resolve(process.cwd(), trimmed);
}

function parseUsDateToIso(dateString) {
	const [mm, dd, yyyy] = dateString.split('/');
	if (!mm || !dd || !yyyy) {
		throw new Error(`Invalid date format: ${dateString}`);
	}
	return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function toCents(value) {
	return Math.round(Number.parseFloat(value) * 100);
}

function buildTransactionsFromCsvRows({rows, userId, institutionId, sourceFileName}) {
	const now = new Date().toISOString();
	const transactions = [];

	for (const row of rows) {
		const [dateRaw, detailsRaw, fundsOutRaw, fundsInRaw] = row;
		const details = (detailsRaw ?? '').trim();
		const fundsOut = (fundsOutRaw ?? '').trim();
		const fundsIn = (fundsInRaw ?? '').trim();
		const hasOut = fundsOut.length > 0;
		const hasIn = fundsIn.length > 0;

		if (!hasOut && !hasIn) {
			continue;
		}

		const amountCents = hasIn ? toCents(fundsIn) : -toCents(fundsOut);
		const direction = hasIn ? 'CREDIT' : 'DEBIT';
		const categoryHint = details.split(/\s+/).find(Boolean) ?? 'UNKNOWN';

		transactions.push({
			id: crypto.randomUUID(),
			user_id: userId,
			institution_id: institutionId,
			posted_at: parseUsDateToIso(dateRaw.trim()),
			description_raw: details,
			amount_cents: amountCents,
			currency: 'CAD',
			direction,
			category_hint: categoryHint,
			source: {
				type: 'csv',
				file_name: sourceFileName
			},
			created_at: now,
			updated_at: now
		});
	}

	return transactions;
}

export async function previewTransactionsCsvImport({userId, institutionId, csvPath}) {
	const resolvedPath = resolveCsvPath(csvPath);
	const csvContent = await fs.readFile(resolvedPath, 'utf8');
	const lines = csvContent
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);

	if (lines.length <= 1) {
		throw new Error('CSV has no transaction rows.');
	}

	const header = parseCsvLine(lines[0]).map((entry) => entry.toLowerCase().replace(/\s+/g, ' ').trim());
	const hasExpectedHeader = header.length >= 4 &&
		header[0] === 'date' &&
		header[1] === 'transaction details' &&
		header[2] === 'funds out' &&
		header[3] === 'funds in';
	if (!hasExpectedHeader) {
		throw new Error('Unexpected CSV header. Expected: Date, Transaction Details, Funds Out, Funds In');
	}

	const dataRows = lines.slice(1).map(parseCsvLine);
	const transactions = buildTransactionsFromCsvRows({
		rows: dataRows,
		userId,
		institutionId,
		sourceFileName: path.basename(resolvedPath)
	});

	if (transactions.length === 0) {
		throw new Error('No importable transactions found in CSV.');
	}

	const postedDates = transactions.map((item) => item.posted_at).sort();

	return {
		resolvedPath,
		transactions,
		count: transactions.length,
		dateFrom: postedDates[0],
		dateTo: postedDates[postedDates.length - 1]
	};
}

export async function importTransactionsToDatabase({institutionId, transactions}) {
	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();
	const institution = normalized.institutions.find((item) => item.id === institutionId);

	if (!institution) {
		throw new Error('Institution not found.');
	}

	normalized.transactions = [...(normalized.transactions ?? []), ...transactions];
	institution.transaction_ids = [
		...(institution.transaction_ids ?? []),
		...transactions.map((item) => item.id)
	];
	institution.updated_at = now;
	normalized.meta = {
		...normalized.meta,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return transactions.length;
}

export function isValidTimezone(timezone) {
	try {
		new Intl.DateTimeFormat('en-US', {timeZone: timezone});
		return true;
	} catch (_error) {
		return false;
	}
}
