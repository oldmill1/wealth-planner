import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {DB_PATH, CONFIG_DIR, INSTITUTION_TYPES} from '../constants.js';
import {createSqliteAdapter} from './data/adapters/sqliteAdapter.js';

const DEFAULT_CATEGORY_ID = 'uncategorized';
const DEFAULT_CATEGORY_PATH = 'Uncategorized';
const DEFAULT_CATEGORY = {
	id: DEFAULT_CATEGORY_ID,
	name: DEFAULT_CATEGORY_PATH,
	parent_id: null
};
const sqliteAdapter = createSqliteAdapter();

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
	const aliases = record?.aliases;
	const switchTokens = aliases?.switch_tokens;
	const hasValidAliases = (
		aliases === undefined ||
		(
			aliases !== null &&
			typeof aliases === 'object' &&
			(aliases.nickname === undefined || typeof aliases.nickname === 'string') &&
			(aliases.last4 === undefined || typeof aliases.last4 === 'string') &&
			(
				switchTokens === undefined ||
				(Array.isArray(switchTokens) && switchTokens.every((token) => typeof token === 'string'))
			)
		)
	);

	return (
		record !== null &&
		typeof record === 'object' &&
		typeof record.id === 'string' &&
		isValidInstitutionType(record.type) &&
		typeof record.name === 'string' &&
		typeof record.user_id === 'string' &&
		typeof record.created_at === 'string' &&
		typeof record.updated_at === 'string' &&
		hasValidAliases
	);
}

function normalizeInstitutionAliases(rawAliases) {
	if (rawAliases === null || rawAliases === undefined) {
		return {};
	}
	if (typeof rawAliases !== 'object') {
		return {};
	}

	const nickname = String(rawAliases.nickname ?? '').trim();
	const last4 = String(rawAliases.last4 ?? '').trim();
	const switchTokens = Array.isArray(rawAliases.switch_tokens)
		? rawAliases.switch_tokens
			.map((token) => String(token ?? '').trim())
			.filter(Boolean)
		: [];

	return {
		...(nickname ? {nickname} : {}),
		...(last4 ? {last4} : {}),
		...(switchTokens.length > 0 ? {switch_tokens: switchTokens} : {})
	};
}

function normalizeInstitution(record) {
	if (record === null || typeof record !== 'object') {
		return null;
	}

	const normalized = {
		...record
	};
	if (Object.hasOwn(normalized, 'transaction_ids')) {
		delete normalized.transaction_ids;
	}
	normalized.aliases = normalizeInstitutionAliases(normalized.aliases);

	return isValidInstitution(normalized) ? normalized : null;
}

function normalizeInstitutionFilterByTab(rawValue) {
	const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
	const balances = String(source.Balances ?? 'all').trim() || 'all';
	const credit = String(source.Credit ?? 'all').trim() || 'all';
	return {
		Balances: balances,
		Credit: credit
	};
}

function normalizeUiState(rawUiState) {
	const source = rawUiState && typeof rawUiState === 'object' ? rawUiState : {};
	return {
		institution_filter_by_tab: normalizeInstitutionFilterByTab(source.institution_filter_by_tab)
	};
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

function normalizeCategory(record) {
	if (record === null || typeof record !== 'object') {
		return null;
	}

	const id = String(record.id ?? '').trim().toLowerCase();
	const name = String(record.name ?? '').trim();
	const parentIdRaw = record.parent_id;
	const parentId = parentIdRaw === null || parentIdRaw === undefined
		? null
		: String(parentIdRaw).trim().toLowerCase();

	if (!id || !name) {
		return null;
	}

	return {
		id,
		name,
		parent_id: parentId || null
	};
}

function slugifySegment(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizePathSegments(rawPath) {
	return String(rawPath ?? '')
		.split('>')
		.map((segment) => String(segment ?? '').replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function toTitleCaseSegment(value) {
	return String(value ?? '')
		.replace(/[-_]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(' ');
}

function categoryIdToPath(categoryId, categoryById = new Map()) {
	const normalizedId = String(categoryId ?? '').trim().toLowerCase();
	if (!normalizedId) {
		return DEFAULT_CATEGORY_PATH;
	}
	if (categoryById.has(normalizedId)) {
		const names = [];
		let cursor = normalizedId;
		const visited = new Set();
		while (cursor && categoryById.has(cursor) && !visited.has(cursor)) {
			visited.add(cursor);
			const node = categoryById.get(cursor);
			names.unshift(node.name);
			cursor = node.parent_id ?? null;
		}
		if (names.length > 0) {
			return names.join(' > ');
		}
	}

	const segments = normalizedId.split('.').map(toTitleCaseSegment).filter(Boolean);
	return segments.length > 0 ? segments.join(' > ') : DEFAULT_CATEGORY_PATH;
}

function normalizeCategoryPath(rawPath) {
	const segments = normalizePathSegments(rawPath);
	return segments.length > 0 ? segments.join(' > ') : DEFAULT_CATEGORY_PATH;
}

function pathSegmentsToId(pathSegments) {
	const slugs = pathSegments.map(slugifySegment).filter(Boolean);
	return slugs.length > 0 ? slugs.join('.') : DEFAULT_CATEGORY_ID;
}

function deriveCategoriesFromTransactions(transactions) {
	const byId = new Map();
	byId.set(DEFAULT_CATEGORY_ID, DEFAULT_CATEGORY);

	for (const transaction of transactions ?? []) {
		const segments = normalizePathSegments(transaction?.category_path);
		if (segments.length === 0) {
			continue;
		}

		let parentId = null;
		const partialSegments = [];
		for (const segment of segments) {
			partialSegments.push(segment);
			const id = pathSegmentsToId(partialSegments);
			if (!byId.has(id)) {
				byId.set(id, {
					id,
					name: segment,
					parent_id: parentId
				});
			}
			parentId = id;
		}
	}

	return [...byId.values()];
}

function normalizeTransaction(record, categoryById = new Map()) {
	if (record === null || typeof record !== 'object') {
		return null;
	}

	const normalized = {
		...record
	};
	const categoryPath = String(normalized.category_path ?? '').trim();
	const legacyCategory = String(normalized.category ?? '').trim();
	const legacyCategoryId = String(normalized.category_id ?? '').trim().toLowerCase();
	normalized.category_path = normalizeCategoryPath(
		categoryPath || legacyCategory || categoryIdToPath(legacyCategoryId, categoryById)
	);
	if (Object.hasOwn(normalized, 'category')) {
		delete normalized.category;
	}
	if (Object.hasOwn(normalized, 'category_id')) {
		delete normalized.category_id;
	}
	if (Object.hasOwn(normalized, 'category_hint')) {
		delete normalized.category_hint;
	}

	return normalized;
}

function normalizeDatabaseShape(parsed) {
	let changed = false;
	const normalized = parsed && typeof parsed === 'object' ? {...parsed} : {};
	const now = new Date().toISOString();

	if (!normalized.meta || typeof normalized.meta !== 'object') {
		normalized.meta = {
			version: 1,
			created_at: now,
			updated_at: now,
			ui_state: normalizeUiState({})
		};
		changed = true;
	} else {
		const normalizedUiState = normalizeUiState(normalized.meta.ui_state);
		if (JSON.stringify(normalizedUiState) !== JSON.stringify(normalized.meta.ui_state ?? {})) {
			normalized.meta.ui_state = normalizedUiState;
			changed = true;
		}
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

	const sanitizedCategories = Array.isArray(normalized.categories)
		? normalized.categories.map(normalizeCategory).filter((category) => category !== null)
		: [DEFAULT_CATEGORY];
	const hasDefaultCategory = sanitizedCategories.some((category) => category.id === DEFAULT_CATEGORY_ID);
	const categoriesSeed = hasDefaultCategory
		? sanitizedCategories
		: [DEFAULT_CATEGORY, ...sanitizedCategories];
	const categoriesById = new Map(categoriesSeed.map((category) => [category.id, category]));

	if (Array.isArray(normalized.transactions)) {
		delete normalized.transactions;
		changed = true;
	}
	if (!Array.isArray(normalized.categories)) {
		normalized.categories = [];
		changed = true;
	} else {
		const sanitizedCategoryRows = normalized.categories
			.map(normalizeCategory)
			.filter((category) => category !== null);
		if (sanitizedCategoryRows.length !== normalized.categories.length) {
			changed = true;
		}
		normalized.categories = sanitizedCategoryRows;
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
			updated_at: now,
			ui_state: normalizeUiState({})
		},
		users: [user],
		accounts: [],
		categories: [],
		user_activity: []
	};
}

function syncAccountsToSqlite(accounts) {
	return sqliteAdapter.replaceAccounts(accounts ?? []);
}

export async function loadOrInitDatabase() {
	await sqliteAdapter.ensureReady();
	try {
		await fs.access(DB_PATH);
		const raw = await fs.readFile(DB_PATH, 'utf8');
		const parsed = JSON.parse(raw);
			const {normalized, changed} = normalizeDatabaseShape(parsed);
			if (changed) {
				await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
			}
			const accountSyncResult = syncAccountsToSqlite(normalized.accounts ?? []);
			const sqliteData = await sqliteAdapter.loadDatabase();
			const firstUser = normalized.users?.[0] ?? null;
			return {
				firstRun: false,
				user: firstUser,
				accounts: normalized.accounts ?? [],
				categories: sqliteData.categories ?? [DEFAULT_CATEGORY],
				transactions: sqliteData.transactions ?? [],
				userActivity: normalized.user_activity ?? [],
				uiState: normalizeUiState(normalized.meta?.ui_state),
				warnings: {
					skippedTransactions: Number(accountSyncResult?.skippedTransactions) || 0
				}
			};
	} catch (error) {
		if (error && error.code !== 'ENOENT') {
			throw error;
		}
			return {
				firstRun: true,
				user: null,
				accounts: [],
				categories: [DEFAULT_CATEGORY],
				transactions: [],
				userActivity: [],
				uiState: normalizeUiState({}),
				warnings: {skippedTransactions: 0}
			};
		}
}

export async function saveFirstUser(name, timezone) {
	await fs.mkdir(CONFIG_DIR, {recursive: true});
	await sqliteAdapter.ensureReady();
	const user = createRecord({name, timezone});
	const database = createDatabase(user);
	await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2), 'utf8');
	syncAccountsToSqlite([]);
	return user;
}

export async function addInstitutionForUser({userId, name, type = 'BANK', aliases = {}}) {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error('Institution name is required.');
	}
	if (!isValidInstitutionType(type)) {
		throw new Error(`Invalid account type: ${type}`);
	}
	const normalizedAliases = normalizeInstitutionAliases(aliases);
	if ((type === 'CREDIT' || type === 'CREDIT_CARD') && !String(normalizedAliases.last4 ?? '').trim()) {
		throw new Error('Credit accounts require aliases.last4.');
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
		aliases: normalizedAliases,
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
	syncAccountsToSqlite(normalized.accounts);
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

function parseCsvDateToIso(dateString) {
	const trimmed = String(dateString ?? '').trim();
	if (!trimmed) {
		throw new Error(`Invalid date format: ${dateString}`);
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return trimmed;
	}
	return parseUsDateToIso(trimmed);
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

function isCreditDebitCsvHeader(header) {
	return header.length >= 7 &&
		header[0] === 'transaction date' &&
		header[1] === 'posted date' &&
		header[2] === 'card no.' &&
		header[3] === 'description' &&
		header[4] === 'category' &&
		header[5] === 'debit' &&
		header[6] === 'credit';
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
		transactions.push({
			id: crypto.randomUUID(),
			user_id: userId,
			institution_id: institutionId,
			posted_at: parseUsDateToIso(dateRaw.trim()),
			description_raw: details,
			amount_cents: amountCents,
			category_path: DEFAULT_CATEGORY_PATH,
			currency: 'CAD',
			direction,
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
		transactions.push({
			id: crypto.randomUUID(),
			user_id: userId,
			institution_id: institutionId,
			posted_at: parseMonthNameDateToIso((dateRaw ?? '').trim()),
			description_raw: description,
			amount_cents: amountCents,
			category_path: DEFAULT_CATEGORY_PATH,
			currency: 'CAD',
			direction,
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

function buildTransactionsFromCreditDebitCsvRows({rows, userId, institutionId, sourceFileName}) {
	const now = new Date().toISOString();
	const transactions = [];

	for (const row of rows) {
		const [
			transactionDateRaw,
			postedDateRaw,
			_cardNoRaw,
			descriptionRaw,
			_categoryRaw,
			debitRaw,
			creditRaw
		] = row;
		const description = String(descriptionRaw ?? '').trim();
		const debitText = String(debitRaw ?? '').trim();
		const creditText = String(creditRaw ?? '').trim();
		const hasDebit = debitText.length > 0;
		const hasCredit = creditText.length > 0;

		if (!description || (!hasDebit && !hasCredit)) {
			continue;
		}

		const postedDateText = String(postedDateRaw ?? '').trim();
		const transactionDateText = String(transactionDateRaw ?? '').trim();
		const postedAt = postedDateText || transactionDateText;
		if (!postedAt) {
			continue;
		}

		let amountCents = 0;
		let direction = 'DEBIT';
		if (hasDebit && !hasCredit) {
			amountCents = -Math.abs(toCents(debitText));
			direction = 'DEBIT';
		} else if (hasCredit && !hasDebit) {
			amountCents = Math.abs(toCents(creditText));
			direction = 'CREDIT';
		} else {
			const debitCents = Math.abs(toCents(debitText));
			const creditCents = Math.abs(toCents(creditText));
			if (debitCents >= creditCents) {
				amountCents = -debitCents;
				direction = 'DEBIT';
			} else {
				amountCents = creditCents;
				direction = 'CREDIT';
			}
		}
		if (amountCents === 0) {
			continue;
		}

		transactions.push({
			id: crypto.randomUUID(),
			user_id: userId,
			institution_id: institutionId,
			posted_at: parseCsvDateToIso(postedAt),
			description_raw: description,
			amount_cents: amountCents,
			category_path: DEFAULT_CATEGORY_PATH,
			currency: 'CAD',
			direction,
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
	} else if (isCreditDebitCsvHeader(header)) {
		transactions = buildTransactionsFromCreditDebitCsvRows({
			rows: dataRows,
			userId,
			institutionId,
			sourceFileName: path.basename(resolvedPath)
		});
	} else {
		throw new Error(
			'Unexpected CSV header. Supported formats: ' +
			'Date, Transaction Details, Funds Out, Funds In ' +
			'or Date, Date Processed, Description, Amount ' +
			'or Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit'
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

export async function importTransactionsToDatabase({institutionId, transactions, categories = []}) {
	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();
	const institution = normalized.accounts.find((item) => item.id === institutionId);

	if (!institution) {
		throw new Error('Institution not found.');
	}
	const accountSyncResult = syncAccountsToSqlite(normalized.accounts);
	if (Number(accountSyncResult?.skippedTransactions) > 0) {
		// Keep the warning available for callers while still allowing import.
		// The app can surface this as needed.
	}
	const sqliteAccount = sqliteAdapter.getAllAccounts().find((item) => item.id === institutionId);
	if (!sqliteAccount) {
		throw new Error('Institution not found in SQLite store.');
	}

	const sqliteCategories = sqliteAdapter.getAllCategories();
	const existingCategoryById = new Map(
		[
			...(sqliteCategories ?? []),
			...(categories ?? [])
		]
			.map(normalizeCategory)
			.filter((category) => category !== null)
			.map((category) => [category.id, category])
	);
	if (!existingCategoryById.has(DEFAULT_CATEGORY_ID)) {
		existingCategoryById.set(DEFAULT_CATEGORY_ID, DEFAULT_CATEGORY);
	}

	const normalizedIncomingTransactions = (transactions ?? [])
		.map((transaction) => {
			const normalizedTransaction = normalizeTransaction(transaction, existingCategoryById);
			if (!normalizedTransaction) {
				return null;
			}
			if (normalizedTransaction.user_id && normalizedTransaction.user_id !== institution.user_id) {
				throw new Error('Transaction user does not match selected institution user.');
			}
			return {
				...normalizedTransaction,
				user_id: institution.user_id,
				institution_id: institutionId
			};
		})
		.filter((transaction) => transaction !== null);

	const sqliteWriteResult = sqliteAdapter.runInTransaction((ctx) => {
		ctx.insertTransactions(normalizedIncomingTransactions);
		const allTransactions = ctx.getAllTransactions();
		const rebuiltCategories = deriveCategoriesFromTransactions(allTransactions);
		ctx.replaceCategories(rebuiltCategories);
		return {
			categories: rebuiltCategories
		};
	});

	institution.updated_at = now;
	normalized.meta = {
		...normalized.meta,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return {
		count: normalizedIncomingTransactions.length,
		categories: sqliteWriteResult.categories ?? [],
		institutionName: institution.name
	};
}

export async function saveUiState({institutionFilterByTab}) {
	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();
	const nextUiState = normalizeUiState({
		...(normalized.meta?.ui_state ?? {}),
		institution_filter_by_tab: normalizeInstitutionFilterByTab(institutionFilterByTab)
	});

	normalized.meta = {
		...normalized.meta,
		ui_state: nextUiState,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return nextUiState;
}

export async function updateTransactionCategoryInDatabase({transactionId, categoryPath}) {
	const trimmedTransactionId = String(transactionId ?? '').trim();
	if (!trimmedTransactionId) {
		throw new Error('Transaction id is required.');
	}

	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	const {normalized} = normalizeDatabaseShape(parsed);
	const now = new Date().toISOString();
	const normalizedCategoryPath = normalizeCategoryPath(categoryPath);
	const sqliteWriteResult = sqliteAdapter.runInTransaction((ctx) => {
		const existing = ctx.getTransactionById(trimmedTransactionId);
		if (!existing) {
			throw new Error('Transaction not found.');
		}
		ctx.updateTransactionCategory(trimmedTransactionId, normalizedCategoryPath, now);
		const allTransactions = ctx.getAllTransactions();
		const rebuiltCategories = deriveCategoriesFromTransactions(allTransactions);
		ctx.replaceCategories(rebuiltCategories);
		const updatedTransaction = ctx.getTransactionById(trimmedTransactionId);
		if (!updatedTransaction) {
			throw new Error('Failed to load updated transaction.');
		}
		return {
			transaction: updatedTransaction,
			categories: rebuiltCategories
		};
	});

	normalized.meta = {
		...normalized.meta,
		updated_at: now
	};

	await fs.writeFile(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8');
	return {
		transaction: sqliteWriteResult.transaction,
		categories: sqliteWriteResult.categories ?? []
	};
}

export function isValidTimezone(timezone) {
	try {
		new Intl.DateTimeFormat('en-US', {timeZone: timezone});
		return true;
	} catch (_error) {
		return false;
	}
}
