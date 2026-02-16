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
		showRemainingTransactions: false,
		showSpendInsights: false
	});
	const withInsights = deriveDashboardTransactionView({
		terminalHeight: 30,
		accountRows: [{id: 'a1', isPlaceholder: true}],
		transactionRows: makeTransactions(50),
		showRemainingTransactions: false,
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
		showRemainingTransactions: false,
		showSpendInsights: true
	});

	assert.equal(view.transactionLinesBudget, 1);
	assert.equal(view.visibleTransactionRows.length, 1);
});

