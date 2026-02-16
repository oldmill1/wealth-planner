import test from 'node:test';
import assert from 'node:assert/strict';

import {buildSpendInsights} from '../src/services/analytics/spendInsights.js';

const baseTransactions = [
	{
		id: 't1',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2025-12-10',
		description_raw: 'A',
		amount_cents: -1000,
		category_path: 'Food',
		direction: 'DEBIT'
	},
	{
		id: 't2',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-01-10',
		description_raw: 'A',
		amount_cents: -1500,
		category_path: 'Food',
		direction: 'DEBIT'
	},
	{
		id: 't3',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-02-10',
		description_raw: 'A',
		amount_cents: -1800,
		category_path: 'Food',
		direction: 'DEBIT'
	},
	{
		id: 't4',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-02-11',
		description_raw: 'Payment',
		amount_cents: 2200,
		category_path: 'Transfers',
		direction: 'CREDIT'
	},
	{
		id: 't5',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2025-11-15',
		description_raw: 'old window',
		amount_cents: -9999,
		category_path: 'Ignore',
		direction: 'DEBIT'
	},
	{
		id: 't6',
		user_id: 'u1',
		institution_id: 'cc2',
		posted_at: '2026-02-12',
		description_raw: 'Other account',
		amount_cents: -1200,
		category_path: 'Travel',
		direction: 'DEBIT'
	},
	{
		id: 't7',
		user_id: 'u2',
		institution_id: 'cc1',
		posted_at: '2026-02-12',
		description_raw: 'Other user',
		amount_cents: -1200,
		category_path: 'Travel',
		direction: 'DEBIT'
	},
	{
		id: 't8',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-02-15',
		description_raw: 'A',
		amount_cents: -1800,
		category_path: 'Food',
		direction: 'DEBIT'
	},
	{
		id: 't9',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-02-15',
		description_raw: 'A',
		amount_cents: -1800,
		category_path: 'Food',
		direction: 'DEBIT'
	},
	{
		id: 't10',
		user_id: 'u1',
		institution_id: 'cc1',
		posted_at: '2026-02-16',
		description_raw: '',
		amount_cents: -400,
		category_path: '',
		direction: 'DEBIT'
	}
];

test('buildSpendInsights computes 3-month rolling window anchored to latest transaction month', () => {
	const insights = buildSpendInsights({
		transactions: baseTransactions,
		userId: 'u1',
		institutionIds: ['cc1'],
		now: new Date('2026-02-20T00:00:00.000Z')
	});

	assert.deepEqual(insights.window, {
		startMonth: '2025-12',
		endMonth: '2026-02',
		months: 3
	});
	assert.equal(insights.totals.txCount, 7);
	assert.equal(insights.totals.spendCents, 8300);
	assert.equal(insights.totals.paymentCents, 2200);
	assert.equal(insights.totals.netCents, -6100);
	assert.deepEqual(
		insights.monthTrend.map((item) => item.month),
		['2025-12', '2026-01', '2026-02']
	);
});

test('buildSpendInsights ranks categories and applies uncategorized fallback', () => {
	const insights = buildSpendInsights({
		transactions: baseTransactions,
		userId: 'u1',
		institutionIds: ['cc1']
	});

	assert.equal(insights.topCategories[0].categoryPath, 'Food');
	assert.equal(insights.topCategories[0].spendCents, 7900);
	assert.equal(insights.topCategories[0].txCount, 5);
	assert.equal(insights.topCategories[1].categoryPath, 'Uncategorized');
	assert.equal(insights.topCategories[1].spendCents, 400);
	assert.equal(insights.topCategories[1].txCount, 1);
});

test('buildSpendInsights detects recurring merchants in window', () => {
	const insights = buildSpendInsights({
		transactions: baseTransactions,
		userId: 'u1',
		institutionIds: ['cc1']
	});

	const recurringA = insights.recurring.find((item) => item.merchant === 'A');
	assert.ok(recurringA);
	assert.equal(recurringA.monthsSeen, 3);
	assert.equal(recurringA.totalSpendCents, 7900);
	assert.equal(recurringA.avgMonthlySpendCents, 2633);
});

test('buildSpendInsights reports duplicate signatures and spend impact', () => {
	const insights = buildSpendInsights({
		transactions: baseTransactions,
		userId: 'u1',
		institutionIds: ['cc1']
	});

	assert.equal(insights.duplicates.signatureCount, 1);
	assert.equal(insights.duplicates.rowCount, 2);
	assert.equal(insights.duplicates.spendImpactCents, 3600);
});

test('buildSpendInsights returns empty shape when scope is missing', () => {
	const insights = buildSpendInsights({
		transactions: baseTransactions,
		userId: 'u1',
		institutionIds: []
	});

	assert.equal(insights.totals.txCount, 0);
	assert.deepEqual(insights.topCategories, []);
	assert.deepEqual(insights.monthTrend, []);
	assert.deepEqual(insights.recurring, []);
	assert.deepEqual(insights.duplicates, {
		signatureCount: 0,
		rowCount: 0,
		spendImpactCents: 0
	});
});

