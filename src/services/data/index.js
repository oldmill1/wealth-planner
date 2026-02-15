import {createJsonAdapter} from './adapters/jsonAdapter.js';
import {createTransactionRepository} from './transactionRepository.js';

export const dataAdapter = createJsonAdapter();
export const transactionRepository = createTransactionRepository({adapter: dataAdapter});
