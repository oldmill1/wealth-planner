import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

function defaultConfigDir() {
	return path.join(os.homedir(), '.config', 'wealth-planner');
}

function testConfigDir() {
	return path.join(os.tmpdir(), 'wealth-planner-test-config');
}

async function importConstantsFresh(cacheBust) {
	return import(`../src/constants.js?${cacheBust}-${Date.now()}-${Math.random()}`);
}

test('config dir does not switch to test mode for --test-* flags without --test', async () => {
	const previousArgv = [...process.argv];
	const previousEnv = process.env.WEALTH_PLANNER_CONFIG_DIR;

	try {
		delete process.env.WEALTH_PLANNER_CONFIG_DIR;
		process.argv = ['node', 'src/index.jsx', '--watch', '--test-concurrency=0'];

		const constants = await importConstantsFresh('non-test-flags');
		assert.equal(constants.CONFIG_DIR, defaultConfigDir());
	} finally {
		process.argv = previousArgv;
		if (previousEnv === undefined) {
			delete process.env.WEALTH_PLANNER_CONFIG_DIR;
		} else {
			process.env.WEALTH_PLANNER_CONFIG_DIR = previousEnv;
		}
	}
});

test('config dir switches to test mode only with explicit --test flag', async () => {
	const previousArgv = [...process.argv];
	const previousEnv = process.env.WEALTH_PLANNER_CONFIG_DIR;

	try {
		delete process.env.WEALTH_PLANNER_CONFIG_DIR;
		process.argv = ['node', '--test', 'tests/configIsolation.test.js'];

		const constants = await importConstantsFresh('explicit-test-flag');
		assert.equal(constants.CONFIG_DIR, testConfigDir());
	} finally {
		process.argv = previousArgv;
		if (previousEnv === undefined) {
			delete process.env.WEALTH_PLANNER_CONFIG_DIR;
		} else {
			process.env.WEALTH_PLANNER_CONFIG_DIR = previousEnv;
		}
	}
});
