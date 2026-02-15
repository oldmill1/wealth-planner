import {assertDataAdapter} from './adapter.js';

function toSearchTokens(value) {
	return String(value ?? '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function compareByPostedAtDesc(a, b) {
	return String(b?.posted_at ?? '').localeCompare(String(a?.posted_at ?? ''));
}

function compareByPostedAtAsc(a, b) {
	return String(a?.posted_at ?? '').localeCompare(String(b?.posted_at ?? ''));
}

function sortTransactions(rows, sort = 'posted_at_desc') {
	const safeRows = Array.isArray(rows) ? [...rows] : [];
	if (sort === 'posted_at_asc') {
		return safeRows.sort(compareByPostedAtAsc);
	}
	return safeRows.sort(compareByPostedAtDesc);
}

function filterByScope(rows, {userId, institutionIds}) {
	if (!userId || !Array.isArray(rows) || rows.length === 0) {
		return [];
	}
	const institutionIdSet = new Set((institutionIds ?? []).filter(Boolean));
	if (institutionIdSet.size === 0) {
		return [];
	}

	return rows.filter((item) => (
		item?.user_id === userId && institutionIdSet.has(item?.institution_id)
	));
}

function matchesCategoryTokens(categoryPath, queryTokens) {
	if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
		return true;
	}

	const categoryTokens = toSearchTokens(categoryPath);
	if (categoryTokens.length === 0) {
		return false;
	}

	return queryTokens.every((queryToken) => (
		categoryTokens.some((categoryToken) => categoryToken.includes(queryToken))
	));
}

export function createTransactionRepository({adapter}) {
	assertDataAdapter(adapter);

	return {
		async loadTransactionsFromStore() {
			const db = await adapter.loadDatabase();
			return Array.isArray(db?.transactions) ? db.transactions : [];
		},

		findTransactionsByUserAndInstitutions({
			userId,
			institutionIds,
			sort = 'posted_at_desc',
			transactions
		}) {
			const scoped = filterByScope(transactions ?? [], {userId, institutionIds});
			return sortTransactions(scoped, sort);
		},

		findTransactionsByCategorySearch({
			userId,
			institutionIds,
			query,
			limit,
			sort = 'posted_at_desc',
			transactions
		}) {
			const scoped = filterByScope(transactions ?? [], {userId, institutionIds});
			const queryTokens = toSearchTokens(query);
			const filtered = scoped.filter((item) => matchesCategoryTokens(item?.category_path, queryTokens));
			const sorted = sortTransactions(filtered, sort);
			const safeLimit = Number(limit);
			if (Number.isInteger(safeLimit) && safeLimit > 0) {
				return sorted.slice(0, safeLimit);
			}
			return sorted;
		}
	};
}
