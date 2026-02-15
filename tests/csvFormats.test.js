import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {previewTransactionsCsvImport} from '../src/services/database.js';

test('previewTransactionsCsvImport supports credit debit csv header', async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wealth-planner-csv-'));
	const csvPath = path.join(tmpDir, 'credit_debit.csv');
	const csv = [
		'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
		'01/19/2026,01/20/2026,5748,PAYMENT,Payment/Credit,,1959.85',
		"01/19/2026,01/21/2026,5748,WENDY'S #6644 MIDLAND,Dining,14.55,"
	].join('\n');
	await fs.writeFile(csvPath, csv, 'utf8');

	const out = await previewTransactionsCsvImport({
		userId: 'u1',
		institutionId: 'i1',
		csvPath
	});

	assert.equal(out.count, 2);
	const payment = out.transactions.find((item) => item.description_raw === 'PAYMENT');
	const charge = out.transactions.find((item) => item.description_raw.includes('WENDY'));
	assert.ok(payment);
	assert.ok(charge);
	assert.equal(payment.amount_cents, 195985);
	assert.equal(payment.direction, 'CREDIT');
	assert.equal(payment.posted_at, '2026-01-20');
	assert.equal(charge.amount_cents, -1455);
	assert.equal(charge.direction, 'DEBIT');
	assert.equal(charge.posted_at, '2026-01-21');
});

test('previewTransactionsCsvImport supports credit debit csv with ISO dates', async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wealth-planner-csv-'));
	const csvPath = path.join(tmpDir, 'credit_debit_iso.csv');
	const csv = [
		'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
		'2026-01-19,2026-01-20,5748,PAYMENT,Payment/Credit,,1959.85',
		'2026-01-19,2026-01-21,5748,METRO 804,Merchandise,66.36,'
	].join('\n');
	await fs.writeFile(csvPath, csv, 'utf8');

	const out = await previewTransactionsCsvImport({
		userId: 'u1',
		institutionId: 'i1',
		csvPath
	});

	assert.equal(out.count, 2);
	assert.equal(out.transactions[0].posted_at, '2026-01-20');
	assert.equal(out.transactions[1].posted_at, '2026-01-21');
});
