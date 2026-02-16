import fs from 'node:fs';
import Database from 'better-sqlite3';

import {CONFIG_DIR, SQLITE_DB_PATH} from '../../../constants.js';

const DEFAULT_CATEGORY = {
	id: 'uncategorized',
	name: 'Uncategorized',
	parent_id: null
};

let dbInstance = null;

export function resetSqliteAdapterForTests() {
	if (dbInstance) {
		try {
			dbInstance.close();
		} catch (_error) {
			// ignore close failures in tests
		}
	}
	dbInstance = null;
}

function mapTransactionRow(row) {
	const sourceType = row.source_type ? String(row.source_type) : '';
	const sourceFileName = row.source_file_name ? String(row.source_file_name) : '';
	const source = sourceType
		? {
			type: sourceType,
			...(sourceFileName ? {file_name: sourceFileName} : {})
		}
		: undefined;

	return {
		id: row.id,
		user_id: row.user_id,
		institution_id: row.institution_id,
		posted_at: row.posted_at,
		description_raw: row.description_raw,
		amount_cents: row.amount_cents,
		category_path: row.category_path,
		currency: row.currency,
		direction: row.direction,
		...(source ? {source} : {}),
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

function mapCategoryRow(row) {
	return {
		id: row.id,
		name: row.name,
		parent_id: row.parent_id ?? null
	};
}

function mapAccountRow(row) {
	const nickname = row.nickname ? String(row.nickname).trim() : '';
	const last4 = row.last4 ? String(row.last4).trim() : '';
	const switchTokens = row.switch_tokens
		? String(row.switch_tokens)
			.split(',')
			.map((token) => token.trim())
			.filter(Boolean)
		: [];

	return {
		id: row.id,
		user_id: row.user_id,
		type: row.type,
		name: row.name,
		created_at: row.created_at,
		updated_at: row.updated_at,
		aliases: {
			...(nickname ? {nickname} : {}),
			...(last4 ? {last4} : {}),
			...(switchTokens.length > 0 ? {switch_tokens: switchTokens} : {})
		}
	};
}

function mapUserRow(row) {
	return {
		id: row.id,
		name: row.name,
		timezone: row.timezone,
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

function mapUiStateRow(row) {
	return {
		institution_filter_by_tab: {
			Balances: String(row?.institution_filter_balances ?? 'all').trim() || 'all',
			Credit: String(row?.institution_filter_credit ?? 'all').trim() || 'all'
		}
	};
}

function parseMetadataJson(raw) {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(String(raw));
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch (_error) {
		return null;
	}
}

function mapUserActivityRow(row) {
	const type = row.type ? String(row.type).trim() : '';
	const metadata = parseMetadataJson(row.metadata_json);
	return {
		id: row.id,
		user_id: row.user_id,
		datetime: row.datetime,
		message: row.message,
		...(type ? {type} : {}),
		...(metadata ? {metadata} : {})
	};
}

function normalizeAccountForSql(account) {
	const aliases = account?.aliases && typeof account.aliases === 'object'
		? account.aliases
		: {};
	const nickname = String(aliases.nickname ?? '').trim();
	const last4 = String(aliases.last4 ?? '').trim();
	const switchTokens = Array.isArray(aliases.switch_tokens)
		? aliases.switch_tokens
			.map((token) => String(token ?? '').trim())
			.filter(Boolean)
		: [];
	return {
		id: account?.id,
		user_id: account?.user_id,
		type: account?.type,
		name: account?.name,
		created_at: account?.created_at,
		updated_at: account?.updated_at,
		nickname: nickname || null,
		last4: last4 || null,
		switch_tokens: switchTokens.length > 0 ? switchTokens.join(',') : null
	};
}

function ensureSchema(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			timezone TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS app_meta (
			key TEXT PRIMARY KEY,
			value_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS ui_state (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			institution_filter_balances TEXT NOT NULL DEFAULT 'all',
			institution_filter_credit TEXT NOT NULL DEFAULT 'all',
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS accounts (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			nickname TEXT,
			last4 TEXT,
			switch_tokens TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
		);

		CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			institution_id TEXT NOT NULL,
			posted_at TEXT NOT NULL,
			description_raw TEXT NOT NULL,
			amount_cents INTEGER NOT NULL,
			category_path TEXT NOT NULL,
			currency TEXT NOT NULL,
			direction TEXT NOT NULL,
			source_type TEXT,
			source_file_name TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
			FOREIGN KEY(institution_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
		);

		CREATE TABLE IF NOT EXISTS categories (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT,
			FOREIGN KEY(parent_id) REFERENCES categories(id)
		);

		CREATE TABLE IF NOT EXISTS user_activity (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			datetime TEXT NOT NULL,
			message TEXT NOT NULL,
			type TEXT,
			metadata_json TEXT,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_accounts_user_type_name
			ON accounts(user_id, type, name);

		CREATE INDEX IF NOT EXISTS idx_transactions_user_institution_posted
			ON transactions(user_id, institution_id, posted_at DESC);

		CREATE INDEX IF NOT EXISTS idx_transactions_user_posted
			ON transactions(user_id, posted_at DESC);

		CREATE INDEX IF NOT EXISTS idx_transactions_category_path
			ON transactions(category_path);

		CREATE INDEX IF NOT EXISTS idx_categories_parent_id
			ON categories(parent_id);

		CREATE INDEX IF NOT EXISTS idx_user_activity_user_datetime
			ON user_activity(user_id, datetime DESC);
	`);

	const defaultCategoryCount = db.prepare('SELECT COUNT(1) AS count FROM categories WHERE id = ?').get(DEFAULT_CATEGORY.id)?.count ?? 0;
	if (defaultCategoryCount === 0) {
		db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)').run(
			DEFAULT_CATEGORY.id,
			DEFAULT_CATEGORY.name,
			DEFAULT_CATEGORY.parent_id
		);
	}
}

function getDb() {
	if (dbInstance) {
		return dbInstance;
	}

	fs.mkdirSync(CONFIG_DIR, {recursive: true});
	const openAndInit = () => {
		const db = new Database(SQLITE_DB_PATH);
		try {
			db.pragma('journal_mode = WAL');
		} catch (_error) {
			// Fallback to default journal mode if WAL is unavailable on the host filesystem.
		}
		db.pragma('busy_timeout = 5000');
		db.pragma('foreign_keys = ON');
		ensureSchema(db);
		return db;
	};

	try {
		dbInstance = openAndInit();
		return dbInstance;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to open SQLite database at ${SQLITE_DB_PATH}: ${reason}. ` +
			'Close other database tools that might replace or lock this file and restart the app.'
		);
	}
}

function getTransactionContext(db) {
	const replaceAccountsStmt = db.prepare(`
		INSERT INTO accounts (
			id,
			user_id,
			type,
			name,
			nickname,
			last4,
			switch_tokens,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			user_id = excluded.user_id,
			type = excluded.type,
			name = excluded.name,
			nickname = excluded.nickname,
			last4 = excluded.last4,
			switch_tokens = excluded.switch_tokens,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at
	`);
	const getAllAccountsStmt = db.prepare(`
		SELECT
			id,
			user_id,
			type,
			name,
			nickname,
			last4,
			switch_tokens,
			created_at,
			updated_at
		FROM accounts
		ORDER BY updated_at DESC
	`);
	const insertTransactionStmt = db.prepare(`
		INSERT OR REPLACE INTO transactions (
			id,
			user_id,
			institution_id,
			posted_at,
			description_raw,
			amount_cents,
			category_path,
			currency,
			direction,
			source_type,
			source_file_name,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const updateCategoryStmt = db.prepare(`
		UPDATE transactions
		SET category_path = ?, updated_at = ?
		WHERE id = ?
	`);
	const getTransactionByIdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
	const getAllTransactionsStmt = db.prepare('SELECT * FROM transactions ORDER BY posted_at DESC, created_at DESC');
	const getAllCategoriesStmt = db.prepare('SELECT id, name, parent_id FROM categories ORDER BY id ASC');
	const clearCategoriesStmt = db.prepare('DELETE FROM categories');
	const insertCategoryStmt = db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)');

	const upsertUserStmt = db.prepare(`
		INSERT INTO users (id, name, timezone, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			timezone = excluded.timezone,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at
	`);
	const getFirstUserStmt = db.prepare(`
		SELECT id, name, timezone, created_at, updated_at
		FROM users
		ORDER BY created_at ASC
		LIMIT 1
	`);
	const getUiStateStmt = db.prepare(`
		SELECT id, institution_filter_balances, institution_filter_credit, updated_at
		FROM ui_state
		WHERE id = 1
	`);
	const upsertUiStateStmt = db.prepare(`
		INSERT INTO ui_state (id, institution_filter_balances, institution_filter_credit, updated_at)
		VALUES (1, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			institution_filter_balances = excluded.institution_filter_balances,
			institution_filter_credit = excluded.institution_filter_credit,
			updated_at = excluded.updated_at
	`);
	const insertUserActivityStmt = db.prepare(`
		INSERT OR REPLACE INTO user_activity (
			id,
			user_id,
			datetime,
			message,
			type,
			metadata_json
		)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	const getUserActivityByUserIdStmt = db.prepare(`
		SELECT id, user_id, datetime, message, type, metadata_json
		FROM user_activity
		WHERE user_id = ?
		ORDER BY datetime DESC
	`);

	return {
		upsertFirstUser(user) {
			upsertUserStmt.run(user.id, user.name, user.timezone, user.created_at, user.updated_at);
		},
		getFirstUser() {
			const row = getFirstUserStmt.get();
			return row ? mapUserRow(row) : null;
		},
		getUiState() {
			const row = getUiStateStmt.get();
			return row ? mapUiStateRow(row) : null;
		},
		upsertUiState(uiState) {
			const balances = String(uiState?.institution_filter_by_tab?.Balances ?? 'all').trim() || 'all';
			const credit = String(uiState?.institution_filter_by_tab?.Credit ?? 'all').trim() || 'all';
			const updatedAt = String(uiState?.updated_at ?? '').trim() || new Date().toISOString();
			upsertUiStateStmt.run(balances, credit, updatedAt);
		},
		insertUserActivity(records) {
			for (const record of records ?? []) {
				if (!record?.id || !record?.user_id || !record?.datetime || !record?.message) {
					continue;
				}
				insertUserActivityStmt.run(
					record.id,
					record.user_id,
					record.datetime,
					record.message,
					record.type ? String(record.type) : null,
					record.metadata && typeof record.metadata === 'object'
						? JSON.stringify(record.metadata)
						: null
				);
			}
		},
		getUserActivityByUserId(userId) {
			return getUserActivityByUserIdStmt.all(userId).map(mapUserActivityRow);
		},
		replaceAccounts(accounts) {
			for (const rawAccount of accounts ?? []) {
				const account = normalizeAccountForSql(rawAccount);
				if (
					typeof account.id !== 'string' ||
					typeof account.user_id !== 'string' ||
					typeof account.type !== 'string' ||
					typeof account.name !== 'string' ||
					typeof account.created_at !== 'string' ||
					typeof account.updated_at !== 'string'
				) {
					continue;
				}
				replaceAccountsStmt.run(
					account.id,
					account.user_id,
					account.type,
					account.name,
					account.nickname,
					account.last4,
					account.switch_tokens,
					account.created_at,
					account.updated_at
				);
			}
		},
		getAllAccounts() {
			return getAllAccountsStmt.all().map(mapAccountRow);
		},
		insertTransactions(transactions) {
			for (const transaction of transactions ?? []) {
				const source = transaction?.source && typeof transaction.source === 'object' ? transaction.source : null;
				insertTransactionStmt.run(
					transaction.id,
					transaction.user_id,
					transaction.institution_id,
					transaction.posted_at,
					transaction.description_raw,
					Number(transaction.amount_cents) || 0,
					transaction.category_path,
					transaction.currency || 'CAD',
					transaction.direction || 'DEBIT',
					source?.type ?? null,
					source?.file_name ?? null,
					transaction.created_at,
					transaction.updated_at
				);
			}
		},
		updateTransactionCategory(transactionId, categoryPath, updatedAt) {
			updateCategoryStmt.run(categoryPath, updatedAt, transactionId);
		},
		getTransactionById(transactionId) {
			const row = getTransactionByIdStmt.get(transactionId);
			return row ? mapTransactionRow(row) : null;
		},
		getAllTransactions() {
			return getAllTransactionsStmt.all().map(mapTransactionRow);
		},
		replaceCategories(categories) {
			clearCategoriesStmt.run();
			for (const category of categories ?? []) {
				insertCategoryStmt.run(category.id, category.name, category.parent_id ?? null);
			}
		},
		getAllCategories() {
			return getAllCategoriesStmt.all().map(mapCategoryRow);
		}
	};
}

export function createSqliteAdapter() {
	return {
		async ensureReady() {
			getDb();
		},
		async loadDatabase() {
			const db = getDb();
			const ctx = getTransactionContext(db);
			return {
				accounts: ctx.getAllAccounts(),
				transactions: ctx.getAllTransactions(),
				categories: ctx.getAllCategories()
			};
		},
		async saveDatabase(_nextDb) {
			throw new Error('saveDatabase is not supported by sqlite adapter.');
		},
		getAllTransactions() {
			const db = getDb();
			return getTransactionContext(db).getAllTransactions();
		},
		getAllCategories() {
			const db = getDb();
			return getTransactionContext(db).getAllCategories();
		},
		replaceAccounts(accounts) {
			const db = getDb();
			return getTransactionContext(db).replaceAccounts(accounts);
		},
		getAllAccounts() {
			const db = getDb();
			return getTransactionContext(db).getAllAccounts();
		},
		getFirstUser() {
			const db = getDb();
			return getTransactionContext(db).getFirstUser();
		},
		upsertFirstUser(user) {
			const db = getDb();
			return getTransactionContext(db).upsertFirstUser(user);
		},
		getUiState() {
			const db = getDb();
			return getTransactionContext(db).getUiState();
		},
		upsertUiState(uiState) {
			const db = getDb();
			return getTransactionContext(db).upsertUiState(uiState);
		},
		insertUserActivity(records) {
			const db = getDb();
			return getTransactionContext(db).insertUserActivity(records);
		},
		getUserActivityByUserId(userId) {
			const db = getDb();
			return getTransactionContext(db).getUserActivityByUserId(userId);
		},
		runInTransaction(work) {
			const db = getDb();
			const transaction = db.transaction(() => {
				const ctx = getTransactionContext(db);
				return work(ctx);
			});
			return transaction();
		}
	};
}
