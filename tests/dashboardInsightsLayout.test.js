import test from 'node:test';
import assert from 'node:assert/strict';

import {deriveDashboardTransactionView} from '../src/components/Dashboard.jsx';

function makeTransactions(count) {
	return Array.from({length: count}, (_, index) => ({
		id: `tx_${index}`,
		posted_at: '2026-02-01',
		amount_cents: -100,
		category_path: 'Test'
	}));
}

test('deriveDashboardTransactionView reserves lines when spend insights are enabled', () => {
	const withoutInsights = deriveDashboardTransactionView({
		terminalHeight: 30,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(50),
		transactionPageIndex: 0,
		showSpendInsights: false
	});
	const withInsights = deriveDashboardTransactionView({
		terminalHeight: 30,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(50),
		transactionPageIndex: 0,
		showSpendInsights: true
	});

	assert.ok(withoutInsights.transactionLinesBudget > withInsights.transactionLinesBudget);
	assert.ok(withInsights.visibleTransactionRows.length < withoutInsights.visibleTransactionRows.length);
});

test('deriveDashboardTransactionView keeps at least one transaction line with insights on tight terminal', () => {
	const view = deriveDashboardTransactionView({
		terminalHeight: 14,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(5),
		transactionPageIndex: 0,
		showSpendInsights: true
	});

	assert.equal(view.transactionLinesBudget, 1);
	assert.equal(view.visibleTransactionRows.length, 1);
});

test('deriveDashboardTransactionView keeps remainder page bounded to budget', () => {
	const view = deriveDashboardTransactionView({
		terminalHeight: 24,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(40),
		transactionPageIndex: 3,
		showSpendInsights: true
	});

	assert.ok(view.hasOverflowTransactions);
	assert.equal(view.visibleTransactionRows.length, view.transactionLinesBudget);
	assert.ok(view.currentPageIndex >= 0);
	assert.equal(view.totalPages, Math.ceil(40 / view.transactionLinesBudget));
});

test('deriveDashboardTransactionView exposes middle pages', () => {
	const page0 = deriveDashboardTransactionView({
		terminalHeight: 24,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(20),
		transactionPageIndex: 0,
		showSpendInsights: true
	});
	const page1 = deriveDashboardTransactionView({
		terminalHeight: 24,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(20),
		transactionPageIndex: 1,
		showSpendInsights: true
	});

	const expectedFirstIndexPage1 = page0.transactionLinesBudget;
	assert.equal(page1.visibleTransactionRows[0]?.id, `tx_${expectedFirstIndexPage1}`);
	assert.notEqual(page0.visibleTransactionRows[0]?.id, page1.visibleTransactionRows[0]?.id);
});
