export const DEFAULT_INSTITUTION_FILTER_BY_TAB = {Balances: 'all', Credit: 'all'};

export function parseSwitchQuery(argsRaw) {
	const trimmed = String(argsRaw ?? '').trim();
	if (!trimmed) {
		return '';
	}
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
			return trimmed.slice(1, -1).trim();
		}
	}
	return trimmed;
}

export function normalizeInstitutionFilterByTab(rawValue) {
	const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
	const balances = String(source.Balances ?? 'all').trim() || 'all';
	const credit = String(source.Credit ?? 'all').trim() || 'all';
	return {
		Balances: balances,
		Credit: credit
	};
}

function normalizeSwitchTokens(rawTokens) {
	if (!Array.isArray(rawTokens)) {
		return [];
	}
	return rawTokens
		.map((token) => String(token ?? '').trim().toLowerCase())
		.filter(Boolean);
}

export function getInstitutionMatchText(row) {
	const aliases = row?.aliases && typeof row.aliases === 'object' ? row.aliases : {};
	const parts = [
		String(row?.name ?? '').trim(),
		String(aliases.nickname ?? '').trim(),
		String(aliases.last4 ?? '').trim(),
		...normalizeSwitchTokens(aliases.switch_tokens)
	].filter(Boolean);
	return parts.join(' ').toLowerCase();
}

export function getInstitutionIdsForTab(currentUserRows, tab, institutionFilter = 'all') {
	const filterValue = String(institutionFilter ?? 'all').trim() || 'all';
	if (tab === 'Balances') {
		const scoped = currentUserRows.filter((row) => row.type === 'BANK');
		if (filterValue !== 'all') {
			return scoped.filter((row) => row.id === filterValue).map((row) => row.id);
		}
		return scoped.map((row) => row.id);
	}
	if (tab === 'Credit') {
		const scoped = currentUserRows.filter((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD');
		if (filterValue !== 'all') {
			return scoped.filter((row) => row.id === filterValue).map((row) => row.id);
		}
		return scoped.map((row) => row.id);
	}
	return [];
}
