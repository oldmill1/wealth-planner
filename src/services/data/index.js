import {createSqliteAdapter} from './adapters/sqliteAdapter.js';
import {createTransactionRepository} from './transactionRepository.js';

export const dataAdapter = createSqliteAdapter();
export const transactionRepository = createTransactionRepository({adapter: dataAdapter});
