import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import Database from 'better-sqlite3';

import {
	addInstitutionForUser,
	importTransactionsToDatabase,
	loadOrInitDatabase,
	saveFirstUser,
	saveUiState
} from '../src/services/database.js';
import {CONFIG_DIR, DB_PATH, SQLITE_DB_PATH} from '../src/constants.js';
import {resetSqliteAdapterForTests} from '../src/services/data/adapters/sqliteAdapter.js';

async function resetConfigDir() {
	resetSqliteAdapterForTests();
	await fs.rm(CONFIG_DIR, {recursive: true, force: true});
	await fs.mkdir(CONFIG_DIR, {recursive: true});
}

test('import assigns selected institution_id and rejects user mismatch', {concurrency: false}, async () => {
	let step = 'reset';
	await resetConfigDir();
	try {
		step = 'saveFirstUser';
		const user = await saveFirstUser('Tester', 'America/New_York');
		step = 'add bank';
		const bank = await addInstitutionForUser({
			userId: user.id,
			name: 'Simplii Chequing Account',
			type: 'BANK',
			aliases: {nickname: 'Chequing'}
		});
		step = 'add credit';
		await addInstitutionForUser({
			userId: user.id,
			name: 'Amex 2006 Credit Card',
			type: 'CREDIT',
			aliases: {last4: '2006'}
		});

		step = 'import good';
		const importResult = await importTransactionsToDatabase({
			institutionId: bank.id,
			transactions: [
				{
					id: 'tx_import_1',
					user_id: user.id,
					institution_id: 'wrong_id',
					posted_at: '2026-02-01',
					description_raw: 'Coffee',
					amount_cents: -500,
					category_path: 'Food',
					currency: 'CAD',
					direction: 'DEBIT',
					created_at: '2026-02-01T00:00:00.000Z',
					updated_at: '2026-02-01T00:00:00.000Z'
				}
			]
		});
		assert.equal(importResult.count, 1);
		assert.equal(importResult.institutionName, bank.name);

		step = 'load';
		const loaded = await loadOrInitDatabase();
		const saved = loaded.transactions.find((item) => item.id === 'tx_import_1');
		assert.ok(saved);
		assert.equal(saved.institution_id, bank.id);

		step = 'import bad';
		await assert.rejects(
			() => importTransactionsToDatabase({
				institutionId: bank.id,
				transactions: [
					{
						id: 'tx_import_bad',
						user_id: 'different_user',
						institution_id: bank.id,
						posted_at: '2026-02-02',
						description_raw: 'Bad',
						amount_cents: -100,
						category_path: 'Other',
						currency: 'CAD',
						direction: 'DEBIT',
						created_at: '2026-02-02T00:00:00.000Z',
						updated_at: '2026-02-02T00:00:00.000Z'
					}
				]
			}),
			/does not match selected institution user/i
		);
	} catch (error) {
		error.message = `${step}: ${error.message}`;
		throw error;
	}
});

test('loadOrInitDatabase migrates orphan transactions and returns skip warning', {concurrency: false}, async () => {
	await resetConfigDir();
	const now = '2026-02-01T00:00:00.000Z';
	const userId = 'user_migrate_1';
	const accountId = 'acc_valid_1';

	const seedJson = {
		meta: {version: 1, created_at: now, updated_at: now},
		users: [{id: userId, name: 'Tester', timezone: 'America/New_York', created_at: now, updated_at: now}],
		accounts: [{
			id: accountId,
			user_id: userId,
			type: 'BANK',
			name: 'Valid Bank',
			aliases: {nickname: 'Main'},
			created_at: now,
			updated_at: now
		}],
		categories: [],
		user_activity: []
	};
	await fs.writeFile(DB_PATH, JSON.stringify(seedJson, null, 2), 'utf8');

	const db = new Database(SQLITE_DB_PATH);
	db.exec(`
		CREATE TABLE transactions (
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
		CREATE TABLE categories (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT
		);
	`);
	const insert = db.prepare(`
		INSERT INTO transactions (
			id, user_id, institution_id, posted_at, description_raw, amount_cents, category_path, currency, direction, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	insert.run('tx_keep', userId, accountId, '2026-02-01', 'keep', -100, 'Food', 'CAD', 'DEBIT', now, now);
	insert.run('tx_drop', userId, 'missing_account', '2026-02-01', 'drop', -100, 'Food', 'CAD', 'DEBIT', now, now);
	db.close();

	const loaded = await loadOrInitDatabase();
	assert.equal(loaded.warnings.skippedTransactions, 1);
	assert.equal(loaded.transactions.some((item) => item.id === 'tx_keep'), true);
	assert.equal(loaded.transactions.some((item) => item.id === 'tx_drop'), false);
});

test('saveUiState persists institution filter per tab', {concurrency: false}, async () => {
	await resetConfigDir();
	await saveFirstUser('Tester', 'America/New_York');
	const nextUiState = await saveUiState({
		institutionFilterByTab: {Balances: 'acc_bal_1', Credit: 'all'}
	});
	assert.equal(nextUiState.institution_filter_by_tab.Balances, 'acc_bal_1');
	assert.equal(nextUiState.institution_filter_by_tab.Credit, 'all');

	const raw = await fs.readFile(DB_PATH, 'utf8');
	const parsed = JSON.parse(raw);
	assert.equal(parsed.meta.ui_state.institution_filter_by_tab.Balances, 'acc_bal_1');
});
