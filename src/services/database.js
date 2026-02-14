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

function normalizeUserActivity(record) {
	if (record === null || typeof record !== 'object') {
		return null;
	}

	if (
		typeof record.id !== 'string' ||
		typeof record.user_id !== 'string' ||
		typeof record.datetime !== 'string' ||
		typeof record.message !== 'string'
	) {
		return null;
	}

	return {
		id: record.id,
		user_id: record.user_id,
		datetime: record.datetime,
		message: record.message
	};
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

	// Backward-compatible migration:
	// legacy key `institutions` -> canonical key `accounts`
	if (Array.isArray(normalized.institutions) && !Array.isArray(normalized.accounts)) {
		normalized.accounts = normalized.institutions;
		delete normalized.institutions;
		changed = true;
	}
	if (Object.hasOwn(normalized, 'institutions')) {
		delete normalized.institutions;
		changed = true;
	}

	if (!Array.isArray(normalized.accounts)) {
		normalized.accounts = [];
		changed = true;
	} else {
		const sanitizedAccounts = normalized.accounts
			.map(normalizeInstitution)
			.filter((institution) => institution !== null);
		if (sanitizedAccounts.length !== normalized.accounts.length) {
			changed = true;
		}
		normalized.accounts = sanitizedAccounts;
	}

	if (!Array.isArray(normalized.transactions)) {
		normalized.transactions = [];
		changed = true;
	}

	if (!Array.isArray(normalized.user_activity)) {
		normalized.user_activity = [];
		changed = true;
	} else {
		const sanitizedUserActivity = normalized.user_activity
			.map(normalizeUserActivity)
			.filter((activity) => activity !== null);
		if (sanitizedUserActivity.length !== normalized.user_activity.length) {
			changed = true;
		}
		normalized.user_activity = sanitizedUserActivity;
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
		accounts: [],
		transactions: [],
		user_activity: []
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
			accounts: normalized.accounts ?? [],
			transactions: normalized.transactions ?? [],
			userActivity: normalized.user_activity ?? []
		};
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
		return {firstRun: true, user: null, accounts: [], transactions: [], userActivity: []};
	}
}

export async function saveFirstUser(name, timezone) {
	await fs.mkdir(CONFIG_DIR, {recursive: true});
	const user = createRecord({name, timezone});
	const database = createDatabase(user);
	await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2), 'utf8');
	return user;
}

export async function addInstitutionForUser({userId, name, type = 'BANK'}) {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error('Institution name is required.');
	}
	if (!isValidInstitutionType(type)) {
		throw new Error(`Invalid account type: ${type}`);
	}

	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();

	const institution = {
		id: crypto.randomUUID(),
		user_id: userId,
		type,
		name: trimmedName,
		transaction_ids: [],
		created_at: now,
		updated_at: now
	};
	const activityMessage = institution.type === 'CREDIT_CARD' || institution.type === 'CREDIT'
		? 'New Credit Card Added'
		: 'New Deposit Account Added';
	const activityRecord = {
		id: crypto.randomUUID(),
		user_id: userId,
		datetime: now,
		message: activityMessage
	};

	normalized.accounts = [...(normalized.accounts ?? []), institution];
	normalized.user_activity = [...(normalized.user_activity ?? []), activityRecord];
	normalized.meta = {
		...normalized.meta,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return institution;
}

function parseCsvRows(csvContent) {
	const rows = [];
	let row = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < csvContent.length; i += 1) {
		const char = csvContent[i];
		const next = csvContent[i + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				current += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if ((char === '\n' || char === '\r') && !inQuotes) {
			if (char === '\r' && next === '\n') {
				i += 1;
			}

			row.push(current.trim());
			current = '';
			if (row.some((value) => value.length > 0)) {
				rows.push(row);
			}
			row = [];
			continue;
		}

		if (char === ',' && !inQuotes) {
			row.push(current.trim());
			current = '';
			continue;
		}

		current += char;
	}

	row.push(current.trim());
	if (row.some((value) => value.length > 0)) {
		rows.push(row);
	}

	return rows;
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

const MONTH_BY_NAME = {
	jan: '01',
	feb: '02',
	mar: '03',
	apr: '04',
	may: '05',
	jun: '06',
	jul: '07',
	aug: '08',
	sep: '09',
	oct: '10',
	nov: '11',
	dec: '12'
};

function parseMonthNameDateToIso(dateString) {
	const match = String(dateString ?? '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
	if (!match) {
		throw new Error(`Invalid date format: ${dateString}`);
	}

	const [, dayRaw, monthRaw, yearRaw] = match;
	const month = MONTH_BY_NAME[monthRaw.slice(0, 3).toLowerCase()];
	if (!month) {
		throw new Error(`Invalid month in date: ${dateString}`);
	}

	return `${yearRaw}-${month}-${dayRaw.padStart(2, '0')}`;
}

function toCents(value) {
	const raw = String(value ?? '').trim();
	if (!raw) {
		return 0;
	}

	const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')');
	const unwrapped = isParenthesizedNegative ? raw.slice(1, -1) : raw;
	const normalized = unwrapped.replaceAll(',', '').replaceAll('$', '').replace(/\s+/g, '');
	const parsed = Number.parseFloat(normalized);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid amount: ${value}`);
	}

	const cents = Math.round(parsed * 100);
	return isParenthesizedNegative ? -Math.abs(cents) : cents;
}

function deriveCategoryHint(description) {
	const firstToken = String(description ?? '').trim().split(/\s+/).find(Boolean) ?? '';
	const cleaned = firstToken.replace(/[^A-Za-z0-9]/g, '');
	if (!cleaned) {
		return 'UNKNOWN';
	}
	return cleaned.toUpperCase();
}

function normalizeCsvHeader(row) {
	return row.map((entry, index) => {
		const normalized = entry.toLowerCase().replace(/\s+/g, ' ').trim();
		return index === 0 ? normalized.replace(/^\ufeff/, '') : normalized;
	});
}

function isDepositCsvHeader(header) {
	return header.length >= 4 &&
		header[0] === 'date' &&
		header[1] === 'transaction details' &&
		header[2] === 'funds out' &&
		header[3] === 'funds in';
}

function isAmexCsvHeader(header) {
	return header.length >= 4 &&
		header[0] === 'date' &&
		header[1] === 'date processed' &&
		header[2] === 'description' &&
		header[3] === 'amount';
}

function buildTransactionsFromDepositCsvRows({rows, userId, institutionId, sourceFileName}) {
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

		const amountCents = hasIn ? toCents(fundsIn) : -Math.abs(toCents(fundsOut));
		const direction = hasIn ? 'CREDIT' : 'DEBIT';
		const categoryHint = deriveCategoryHint(details);

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

function buildTransactionsFromAmexCsvRows({rows, userId, institutionId, sourceFileName}) {
	const now = new Date().toISOString();
	const transactions = [];

	for (const row of rows) {
		const [dateRaw, _dateProcessedRaw, descriptionRaw, amountRaw] = row;
		const description = (descriptionRaw ?? '').trim();
		const amountText = (amountRaw ?? '').trim();
		if (!description || !amountText) {
			continue;
		}

		const rawAmountCents = toCents(amountText);
		if (rawAmountCents === 0) {
			continue;
		}

		// AMEX exports positive values for charges and negative values for payments/refunds.
		const direction = rawAmountCents > 0 ? 'DEBIT' : 'CREDIT';
		const amountCents = rawAmountCents > 0 ? -Math.abs(rawAmountCents) : Math.abs(rawAmountCents);
		const categoryHint = deriveCategoryHint(description);

		transactions.push({
			id: crypto.randomUUID(),
			user_id: userId,
			institution_id: institutionId,
			posted_at: parseMonthNameDateToIso((dateRaw ?? '').trim()),
			description_raw: description,
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
	const rows = parseCsvRows(csvContent);

	if (rows.length <= 1) {
		throw new Error('CSV has no transaction rows.');
	}

	const header = normalizeCsvHeader(rows[0]);
	const dataRows = rows.slice(1);
	let transactions = [];

	if (isDepositCsvHeader(header)) {
		transactions = buildTransactionsFromDepositCsvRows({
			rows: dataRows,
			userId,
			institutionId,
			sourceFileName: path.basename(resolvedPath)
		});
	} else if (isAmexCsvHeader(header)) {
		transactions = buildTransactionsFromAmexCsvRows({
			rows: dataRows,
			userId,
			institutionId,
			sourceFileName: path.basename(resolvedPath)
		});
	} else {
		throw new Error(
			'Unexpected CSV header. Supported formats: ' +
			'Date, Transaction Details, Funds Out, Funds In ' +
			'or Date, Date Processed, Description, Amount'
		);
	}

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
	const institution = normalized.accounts.find((item) => item.id === institutionId);

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
