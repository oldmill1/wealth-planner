import test from 'node:test';
import assert from 'node:assert/strict';

import {buildTabTransactionState} from '../src/App.jsx';

const baseRows = [
	{id: 'bank_1', userId: 'u1', type: 'BANK', name: 'Simplii', balance: '--', lastUpdated: 'now'},
	{id: 'bank_2', userId: 'u1', type: 'BANK', name: 'Tangerine', balance: '--', lastUpdated: 'now'},
	{id: 'cc_1', userId: 'u1', type: 'CREDIT', name: 'Amex 2006', balance: '--', lastUpdated: 'now'}
];

const tx = [
	{id: 't1', user_id: 'u1', institution_id: 'bank_1', posted_at: '2026-02-01', amount_cents: -100, category_path: 'Food'},
	{id: 't2', user_id: 'u1', institution_id: 'bank_2', posted_at: '2026-02-02', amount_cents: -200, category_path: 'Food'},
	{id: 't3', user_id: 'u1', institution_id: 'cc_1', posted_at: '2026-02-03', amount_cents: -300, category_path: 'Travel'}
];

test('buildTabTransactionState returns all tab institutions when filter is all', () => {
	const state = buildTabTransactionState({
		currentTab: 'Balances',
		accountRows: baseRows,
		transactions: tx,
		activeTransactionFilter: null,
		userId: 'u1',
		userTimezone: 'America/New_York',
		institutionFilterByTab: {Balances: 'all', Credit: 'all'}
	});
	assert.equal(state.tableRows.length, 2);
	assert.equal(state.displayTransactions.length, 2);
});

test('buildTabTransactionState scopes to one institution when filter is set', () => {
	const state = buildTabTransactionState({
		currentTab: 'Balances',
		accountRows: baseRows,
		transactions: tx,
		activeTransactionFilter: null,
		userId: 'u1',
		userTimezone: 'America/New_York',
		institutionFilterByTab: {Balances: 'bank_2', Credit: 'all'}
	});
	assert.equal(state.tableRows.length, 1);
	assert.equal(state.tableRows[0].id, 'bank_2');
	assert.equal(state.displayTransactions.length, 1);
	assert.equal(state.displayTransactions[0].institution_id, 'bank_2');
});
