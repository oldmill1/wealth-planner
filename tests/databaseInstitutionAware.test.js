import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
	addInstitutionForUser,
	importTransactionsToDatabase,
	loadOrInitDatabase,
	saveFirstUser,
	saveUiState
} from '../src/services/database.js';
import {CONFIG_DIR, SQLITE_DB_PATH} from '../src/constants.js';
import {resetSqliteAdapterForTests} from '../src/services/data/adapters/sqliteAdapter.js';

async function resetConfigDir() {
	resetSqliteAdapterForTests();
	await fs.rm(CONFIG_DIR, {recursive: true, force: true});
	await fs.mkdir(CONFIG_DIR, {recursive: true});
}

test('loadOrInitDatabase returns firstRun when no SQLite user exists', {concurrency: false}, async () => {
	await resetConfigDir();
	const loaded = await loadOrInitDatabase();
	assert.equal(loaded.firstRun, true);
	assert.equal(loaded.user, null);
	assert.equal(Array.isArray(loaded.transactions), true);
	assert.equal(Array.isArray(loaded.categories), true);
	assert.equal(Array.isArray(loaded.accounts), true);
	assert.equal(Array.isArray(loaded.userActivity), true);
	assert.equal(loaded.uiState.institution_filter_by_tab.Balances, 'all');
	assert.equal(loaded.uiState.institution_filter_by_tab.Credit, 'all');
});

test('import assigns selected institution_id and rejects user mismatch', {concurrency: false}, async () => {
	await resetConfigDir();
	const user = await saveFirstUser('Tester', 'America/New_York');
	const bank = await addInstitutionForUser({
		userId: user.id,
		name: 'Simplii Chequing Account',
		type: 'BANK',
		aliases: {nickname: 'Chequing'}
	});
	await addInstitutionForUser({
		userId: user.id,
		name: 'Amex 2006 Credit Card',
		type: 'CREDIT',
		aliases: {last4: '2006'}
	});

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
	assert.ok(importResult.activity);
	assert.equal(importResult.activity.type, 'CSV_IMPORT');
	assert.equal(importResult.activity.metadata.institution_id, bank.id);
	assert.equal(importResult.activity.metadata.institution_name, bank.name);

	const loaded = await loadOrInitDatabase();
	const saved = loaded.transactions.find((item) => item.id === 'tx_import_1');
	assert.ok(saved);
	assert.equal(saved.institution_id, bank.id);
	const csvImportActivity = loaded.userActivity.find((item) => item.type === 'CSV_IMPORT');
	assert.ok(csvImportActivity);
	assert.equal(csvImportActivity.metadata.institution_id, bank.id);

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
});

test('saveUiState persists institution filter in SQLite only', {concurrency: false}, async () => {
	await resetConfigDir();
	await saveFirstUser('Tester', 'America/New_York');
	const nextUiState = await saveUiState({
		institutionFilterByTab: {Balances: 'acc_bal_1', Credit: 'all'}
	});
	assert.equal(nextUiState.institution_filter_by_tab.Balances, 'acc_bal_1');
	assert.equal(nextUiState.institution_filter_by_tab.Credit, 'all');

	const loaded = await loadOrInitDatabase();
	assert.equal(loaded.uiState.institution_filter_by_tab.Balances, 'acc_bal_1');
	assert.equal(loaded.uiState.institution_filter_by_tab.Credit, 'all');
});

test('restart preserves transactions deterministically', {concurrency: false}, async () => {
	await resetConfigDir();
	const user = await saveFirstUser('Tester', 'America/New_York');
	const card = await addInstitutionForUser({
		userId: user.id,
		name: 'Capital One 5748 Credit Card',
		type: 'CREDIT',
		aliases: {last4: '5748'}
	});

	await importTransactionsToDatabase({
		institutionId: card.id,
		transactions: [
			{
				id: 'tx_restart_1',
				user_id: user.id,
				institution_id: card.id,
				posted_at: '2026-02-06',
				description_raw: 'APPLE FAIRVIEW',
				amount_cents: -180687,
				category_path: 'Shopping > Electronics > Apple',
				currency: 'CAD',
				direction: 'DEBIT',
				created_at: '2026-02-06T00:00:00.000Z',
				updated_at: '2026-02-06T00:00:00.000Z'
			}
		]
	});

	const before = await loadOrInitDatabase();
	assert.equal(before.transactions.length, 1);
	assert.equal(before.transactions[0].id, 'tx_restart_1');

	// Simulate process restart by fully resetting sqlite adapter singleton.
	resetSqliteAdapterForTests();

	const after = await loadOrInitDatabase();
	assert.equal(after.firstRun, false);
	assert.equal(after.transactions.length, 1);
	assert.equal(after.transactions[0].id, 'tx_restart_1');
	assert.equal(after.accounts.length >= 1, true);
	assert.equal(after.user?.id, user.id);

	const dbStat = await fs.stat(SQLITE_DB_PATH);
	assert.equal(dbStat.isFile(), true);
	assert.ok(dbStat.size > 0);
});
