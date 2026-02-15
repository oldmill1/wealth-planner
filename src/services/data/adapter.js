/**
 * @typedef {Object} DataAdapter
 * @property {() => Promise<object>} loadDatabase
 * @property {(nextDb: object) => Promise<void>} saveDatabase
 */

/**
 * Runtime guard for data adapters.
 * @param {unknown} adapter
 * @returns {asserts adapter is DataAdapter}
 */
export function assertDataAdapter(adapter) {
	if (!adapter || typeof adapter !== 'object') {
		throw new Error('Data adapter must be an object.');
	}
	if (typeof adapter.loadDatabase !== 'function') {
		throw new Error('Data adapter must implement loadDatabase().');
	}
	if (typeof adapter.saveDatabase !== 'function') {
		throw new Error('Data adapter must implement saveDatabase(nextDb).');
	}
}
