import test from 'node:test';
import assert from 'node:assert/strict';

import {
	getInstitutionIdsForTab,
	getInstitutionMatchText,
	parseSwitchQuery
} from '../src/services/institutionSwitch.js';

test('parseSwitchQuery supports quoted and unquoted input', () => {
	assert.equal(parseSwitchQuery(' "2006" '), '2006');
	assert.equal(parseSwitchQuery('2006'), '2006');
	assert.equal(parseSwitchQuery(''), '');
});

test('getInstitutionMatchText includes name and alias fields', () => {
	const row = {
		name: 'American Express 2006 Credit Card',
		aliases: {
			nickname: 'Amex',
			last4: '2006',
			switch_tokens: ['travel', 'card']
		}
	};
	const text = getInstitutionMatchText(row);
	assert.match(text, /american express/i);
	assert.match(text, /amex/i);
	assert.match(text, /2006/i);
	assert.match(text, /travel/i);
});

test('getInstitutionIdsForTab scopes by tab and optional institution filter', () => {
	const rows = [
		{id: 'b1', type: 'BANK'},
		{id: 'b2', type: 'BANK'},
		{id: 'c1', type: 'CREDIT'}
	];
	assert.deepEqual(getInstitutionIdsForTab(rows, 'Balances', 'all'), ['b1', 'b2']);
	assert.deepEqual(getInstitutionIdsForTab(rows, 'Balances', 'b2'), ['b2']);
	assert.deepEqual(getInstitutionIdsForTab(rows, 'Credit', 'all'), ['c1']);
	assert.deepEqual(getInstitutionIdsForTab(rows, 'Credit', 'missing'), []);
});
