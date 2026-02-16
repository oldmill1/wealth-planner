const WINDOW_MONTHS = 3;
const MAX_TOP_CATEGORIES = 5;
const MAX_RECURRING_MERCHANTS = 3;

function normalizeMonthKey(value) {
	const key = String(value ?? '').trim().slice(0, 7);
	return /^\d{4}-\d{2}$/.test(key) ? key : '';
}

function shiftMonth(monthKey, deltaMonths) {
	const [yearRaw, monthRaw] = monthKey.split('-');
	const year = Number(yearRaw);
	const month = Number(monthRaw);
	if (!year || !month) {
		return monthKey;
	}

	const totalMonths = (year * 12) + (month - 1) + Number(deltaMonths || 0);
	const nextYear = Math.floor(totalMonths / 12);
	const nextMonth = (totalMonths % 12) + 1;
	return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

function toMonthFromNow(now = new Date()) {
	const date = now instanceof Date ? now : new Date(now);
	if (Number.isNaN(date.getTime())) {
		return normalizeMonthKey(new Date().toISOString());
	}
	return normalizeMonthKey(date.toISOString());
}

function toSafeAmountCents(value) {
	return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getCategoryPath(transaction) {
	const raw = String(transaction?.category_path ?? '').replace(/\s+/g, ' ').trim();
	return raw || 'Uncategorized';
}

function getDescription(transaction) {
	const raw = String(transaction?.description_raw ?? '').replace(/\s+/g, ' ').trim();
	return raw || '(no description)';
}

export function buildSpendInsights({
	transactions = [],
	userId,
	institutionIds = [],
	now = new Date()
}) {
	const institutionIdSet = new Set((institutionIds ?? []).filter(Boolean));
	if (!userId || institutionIdSet.size === 0) {
		const emptyMonth = toMonthFromNow(now);
		return {
			window: {
				startMonth: shiftMonth(emptyMonth, -(WINDOW_MONTHS - 1)),
				endMonth: emptyMonth,
				months: WINDOW_MONTHS
			},
			totals: {spendCents: 0, paymentCents: 0, netCents: 0, txCount: 0},
			topCategories: [],
			monthTrend: [],
			recurring: [],
			duplicates: {signatureCount: 0, rowCount: 0, spendImpactCents: 0}
		};
	}

	const scopedTransactions = (transactions ?? []).filter((item) => (
		item?.user_id === userId && institutionIdSet.has(item?.institution_id)
	));
	const latestMonth = scopedTransactions
		.map((item) => normalizeMonthKey(item?.posted_at))
		.filter(Boolean)
		.sort()
		.at(-1) || toMonthFromNow(now);
	const endMonth = latestMonth;
	const startMonth = shiftMonth(endMonth, -(WINDOW_MONTHS - 1));
	const windowTransactions = scopedTransactions.filter((item) => {
		const month = normalizeMonthKey(item?.posted_at);
		return month && month >= startMonth && month <= endMonth;
	});

	let spendCents = 0;
	let paymentCents = 0;
	let netCents = 0;
	const categorySummary = new Map();
	const monthSummary = new Map();
	const merchantMonthSpend = new Map();
	const duplicateSignatures = new Map();

	for (const transaction of windowTransactions) {
		const amountCents = toSafeAmountCents(transaction?.amount_cents);
		const direction = String(transaction?.direction ?? '').trim().toUpperCase();
		const month = normalizeMonthKey(transaction?.posted_at);
		const isDebit = direction === 'DEBIT';
		const isCredit = direction === 'CREDIT';
		const absAmountCents = Math.abs(amountCents);

		netCents += amountCents;

		if (isDebit) {
			spendCents += absAmountCents;
			const categoryPath = getCategoryPath(transaction);
			const existingCategory = categorySummary.get(categoryPath) ?? {spendCents: 0, txCount: 0};
			existingCategory.spendCents += absAmountCents;
			existingCategory.txCount += 1;
			categorySummary.set(categoryPath, existingCategory);

			const merchant = getDescription(transaction);
			if (month) {
				const monthSpend = merchantMonthSpend.get(merchant) ?? new Map();
				monthSpend.set(month, (monthSpend.get(month) ?? 0) + absAmountCents);
				merchantMonthSpend.set(merchant, monthSpend);
			}
		}
		if (isCredit) {
			paymentCents += absAmountCents;
		}
		if (month) {
			const existingMonth = monthSummary.get(month) ?? {
				spendCents: 0,
				paymentCents: 0,
				netCents: 0
			};
			if (isDebit) {
				existingMonth.spendCents += absAmountCents;
			} else if (isCredit) {
				existingMonth.paymentCents += absAmountCents;
			}
			existingMonth.netCents += amountCents;
			monthSummary.set(month, existingMonth);
		}

		const signature = `${String(transaction?.posted_at ?? '').trim()}|${getDescription(transaction)}|${amountCents}`;
		const signatureCount = duplicateSignatures.get(signature) ?? 0;
		duplicateSignatures.set(signature, signatureCount + 1);
	}

	const topCategories = [...categorySummary.entries()]
		.map(([categoryPath, item]) => ({
			categoryPath,
			spendCents: item.spendCents,
			pctOfSpend: spendCents > 0 ? Number(((item.spendCents / spendCents) * 100).toFixed(1)) : 0,
			txCount: item.txCount
		}))
		.sort((a, b) => b.spendCents - a.spendCents || b.txCount - a.txCount)
		.slice(0, MAX_TOP_CATEGORIES);

	const months = [startMonth, shiftMonth(startMonth, 1), endMonth];
	const monthTrend = months.map((month) => {
		const item = monthSummary.get(month) ?? {
			spendCents: 0,
			paymentCents: 0,
			netCents: 0
		};
		return {
			month,
			spendCents: item.spendCents,
			paymentCents: item.paymentCents,
			netCents: item.netCents
		};
	});

	const recurring = [...merchantMonthSpend.entries()]
		.map(([merchant, monthSpend]) => {
			const monthsSeen = monthSpend.size;
			const totalSpendCents = [...monthSpend.values()].reduce((sum, value) => sum + value, 0);
			const avgMonthlySpendCents = monthsSeen > 0
				? Math.round(totalSpendCents / monthsSeen)
				: 0;
			return {
				merchant,
				monthsSeen,
				avgMonthlySpendCents,
				totalSpendCents
			};
		})
		.filter((item) => item.monthsSeen >= 2 && item.totalSpendCents > 0)
		.sort((a, b) => b.totalSpendCents - a.totalSpendCents)
		.slice(0, MAX_RECURRING_MERCHANTS);

	let signatureCount = 0;
	let rowCount = 0;
	let spendImpactCents = 0;
	for (const [signature, count] of duplicateSignatures.entries()) {
		if (count <= 1) {
			continue;
		}
		signatureCount += 1;
		rowCount += count;
		const amountRaw = signature.split('|').at(-1);
		const amountCents = toSafeAmountCents(amountRaw);
		if (amountCents < 0) {
			spendImpactCents += Math.abs(amountCents) * count;
		}
	}

	return {
		window: {
			startMonth,
			endMonth,
			months: WINDOW_MONTHS
		},
		totals: {
			spendCents,
			paymentCents,
			netCents,
			txCount: windowTransactions.length
		},
		topCategories,
		monthTrend,
		recurring,
		duplicates: {
			signatureCount,
			rowCount,
			spendImpactCents
		}
	};
}

