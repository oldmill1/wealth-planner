import fs from 'node:fs';
import Database from 'better-sqlite3';

import {CONFIG_DIR, SQLITE_DB_PATH} from '../../../constants.js';

const DEFAULT_CATEGORY = {
	id: 'uncategorized',
	name: 'Uncategorized',
	parent_id: null
};

let dbInstance = null;

function removeSqliteFiles() {
	for (const suffix of ['', '-wal', '-shm']) {
		try {
			fs.rmSync(`${SQLITE_DB_PATH}${suffix}`, {force: true});
		} catch (_error) {
			// ignore cleanup failures during retry path
		}
	}
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

function ensureSchema(db) {
	db.exec(`
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
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS categories (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT,
			FOREIGN KEY(parent_id) REFERENCES categories(id)
		);

		CREATE INDEX IF NOT EXISTS idx_transactions_user_institution_posted
			ON transactions(user_id, institution_id, posted_at DESC);

		CREATE INDEX IF NOT EXISTS idx_transactions_user_posted
			ON transactions(user_id, posted_at DESC);

		CREATE INDEX IF NOT EXISTS idx_transactions_category_path
			ON transactions(category_path);

		CREATE INDEX IF NOT EXISTS idx_categories_parent_id
			ON categories(parent_id);
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
		db.pragma('foreign_keys = ON');
		ensureSchema(db);
		return db;
	};

	try {
		dbInstance = openAndInit();
		return dbInstance;
	} catch (error) {
		removeSqliteFiles();
		dbInstance = openAndInit();
		return dbInstance;
	}
}

function getTransactionContext(db) {
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
	const getByIdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
	const getAllTransactionsStmt = db.prepare('SELECT * FROM transactions ORDER BY posted_at DESC, created_at DESC');
	const getAllCategoriesStmt = db.prepare('SELECT id, name, parent_id FROM categories ORDER BY id ASC');
	const clearCategoriesStmt = db.prepare('DELETE FROM categories');
	const insertCategoryStmt = db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)');

	return {
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
			const row = getByIdStmt.get(transactionId);
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
