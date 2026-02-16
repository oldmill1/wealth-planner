import React from 'react';
import {Box, Text} from 'ink';

const COLUMNS = [
	{
		key: 'type',
		label: 'Type',
		minWidth: 13,
		formatter: (item) => item.type
	},
	{
		key: 'name',
		label: 'Name',
		minWidth: 10,
		formatter: (item) => item.name
	},
	{
		key: 'balance',
		label: 'Balance',
		minWidth: 10,
		formatter: (item) => item.balance
	},
	{
		key: 'lastUpdated',
		label: 'Updated',
		minWidth: 9,
		formatter: (item) => item.lastUpdated
	}
];

function pad(value, length) {
	const text = String(value ?? '');
	if (text.length >= length) {
		return text.slice(0, length - 1) + '…';
	}
	return text + ' '.repeat(length - text.length);
}

function computeColumnWidths(safeWidth) {
	const spacingWidth = COLUMNS.length - 1;
	const minimumContentWidth = COLUMNS.reduce((sum, column) => sum + column.minWidth, 0);
	const remainingWidth = Math.max(0, safeWidth - minimumContentWidth - spacingWidth);

	return COLUMNS.map((column) => (
		column.key === 'name'
			? column.minWidth + remainingWidth
			: column.minWidth
	));
}

function renderTableLine(item, columnWidths) {
	return COLUMNS.map((column, index) => (
		pad(column.formatter(item), columnWidths[index])
	)).join(' ');
}

function TableLine({item, columnWidths, baseColor, getColumnColor}) {
	return (
		<Box flexDirection="row">
			{COLUMNS.map((column, index) => {
				const text = pad(column.formatter(item), columnWidths[index]);
				const color = typeof getColumnColor === 'function'
					? getColumnColor(column.key, baseColor)
					: baseColor;
				return (
					<React.Fragment key={column.key}>
						<Text color={color}>{text}</Text>
						{index < COLUMNS.length - 1 && <Text color={baseColor}> </Text>}
					</React.Fragment>
				);
			})}
		</Box>
	);
}

function splitDisplayName(rawName) {
	const normalized = String(rawName ?? '').replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return {primary: '', secondary: ''};
	}

	let base = normalized;
	if (/ credit card$/i.test(base)) {
		base = base.replace(/ credit card$/i, '').trim();
	} else if (/ account$/i.test(base)) {
		base = base.replace(/ account$/i, '').trim();
	}

	const parts = base.split(' ').filter(Boolean);
	if (parts.length === 1) {
		return {primary: parts[0], secondary: ''};
	}

	const primary = parts[parts.length - 1];
	const secondary = parts.slice(0, -1).join(' ');
	return {primary, secondary};
}

function InstitutionRow({item, isSelected, leftPaneWidth}) {
	if (item.isPlaceholder) {
		return (
			<Box width="100%" paddingX={1} backgroundColor={isSelected ? '#24264a' : undefined}>
				<Text color={isSelected ? '#d4d6ff' : '#8f93bf'}>+ {item.placeholderLabel ?? 'Add First Deposit Account'}</Text>
			</Box>
		);
	}

	const safeWidth = Math.max(56, leftPaneWidth - 8);
	const columnWidths = computeColumnWidths(safeWidth);
	const {primary, secondary} = splitDisplayName(item.name);
	const lineOneItem = {...item, name: primary};
	const lineTwo = renderTableLine(
		{...item, type: '', name: secondary, balance: '', lastUpdated: ''},
		columnWidths
	);

	return (
		<Box width="100%" paddingX={1} flexDirection="column" backgroundColor={isSelected ? '#24264a' : undefined}>
			<TableLine
				item={lineOneItem}
				columnWidths={columnWidths}
				baseColor={isSelected ? '#d4d6ff' : '#8f93bf'}
				getColumnColor={(key, fallback) => (key === 'name' ? '#7A80AC' : fallback)}
			/>
			<Text color={isSelected ? '#b9bee8' : '#6f7396'}>{lineTwo}</Text>
		</Box>
	);
}

function accountRowHeight(item) {
	return item.isPlaceholder ? 1 : 2;
}

function selectAccountRowsForHeight(accountRows, maxLines) {
	const selected = [];
	let usedLines = 0;

	for (const row of accountRows) {
		const nextHeight = accountRowHeight(row);
		if (selected.length > 0 && usedLines + nextHeight > maxLines) {
			break;
		}
		if (selected.length === 0 && nextHeight > maxLines) {
			selected.push(row);
			usedLines = nextHeight;
			break;
		}
		selected.push(row);
		usedLines += nextHeight;
	}

	return {rows: selected, usedLines};
}

export function deriveDashboardTransactionView({
	terminalHeight,
	accountRows,
	transactionRows,
	transactionPageIndex = 0,
	showSpendInsights = false,
	maximizeTransactions = false
}) {
	const safeAccountRows = Array.isArray(accountRows) ? accountRows : [];
	const safeTransactionRows = Array.isArray(transactionRows) ? transactionRows : [];
	const estimatedAvailableLines = Math.max(12, terminalHeight - 12);
	const spendInsightsLines = showSpendInsights && !maximizeTransactions ? 8 : 0;
	const fixedLeftPaneLines = maximizeTransactions ? 4 : 8 + spendInsightsLines;
	const minTransactionLines = 2;
	const accountLinesBudget = maximizeTransactions ? 0 : Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - minTransactionLines);
	const {usedLines: usedAccountLines} = maximizeTransactions
		? {usedLines: 0}
		: selectAccountRowsForHeight(safeAccountRows, accountLinesBudget);
	const transactionLinesBudget = Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - usedAccountLines);
	const hasOverflowTransactions = safeTransactionRows.length > transactionLinesBudget;
	const totalPages = Math.max(1, Math.ceil(safeTransactionRows.length / transactionLinesBudget));
	const safePageIndex = Math.max(0, Number(transactionPageIndex) || 0);
	const currentPageIndex = safePageIndex % totalPages;
	const sliceStart = currentPageIndex * transactionLinesBudget;
	const visibleTransactionRows = safeTransactionRows.slice(sliceStart, sliceStart + transactionLinesBudget);

	return {
		visibleTransactionRows,
		transactionLinesBudget,
		hasOverflowTransactions,
		totalPages,
		currentPageIndex
	};
}

function formatAmount(amountCents) {
	const absolute = (Math.abs(Number(amountCents) || 0) / 100).toFixed(2);
	const sign = Number(amountCents) < 0 ? '-' : '+';
	return `${sign}$${absolute}`;
}

function formatCurrency(amountCents) {
	return `$${(Math.abs(Number(amountCents) || 0) / 100).toFixed(2)}`;
}

function formatSignedCurrency(amountCents) {
	const safeValue = Number(amountCents) || 0;
	const prefix = safeValue > 0 ? '+' : safeValue < 0 ? '-' : '';
	return `${prefix}${formatCurrency(safeValue)}`;
}

function shortenCategoryPath(categoryPath, maxLength = 34) {
	const safePath = String(categoryPath ?? '').replace(/\s+/g, ' ').trim() || 'Uncategorized';
	if (safePath.length <= maxLength) {
		return safePath;
	}
	const segments = safePath.split('>').map((segment) => segment.trim()).filter(Boolean);
	if (segments.length > 1) {
		const tail = segments[segments.length - 1];
		if (tail.length <= maxLength - 4) {
			return `... ${tail}`.slice(0, maxLength);
		}
	}
	return safePath.slice(0, maxLength - 1) + '…';
}

function formatSpendSummaryLine({rankLabel, categoryPath, spendCents, pctOfSpend}) {
	return `${rankLabel} ${shortenCategoryPath(categoryPath)} ${formatCurrency(spendCents)} (${pctOfSpend.toFixed(1)}%)`;
}

function formatMonthLabel(monthKey) {
	if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
		return monthKey || '--';
	}
	return `${monthKey.slice(2, 4)}/${monthKey.slice(5, 7)}`;
}

function buildSpendInsightLines(spendInsights) {
	if (!spendInsights || spendInsights.totals?.txCount === 0) {
		return [
			{key: 'empty', text: ' No spend data in last 3 months', color: '#6f7396'}
		];
	}

	const top = spendInsights.topCategories ?? [];
	const trend = spendInsights.monthTrend ?? [];
	const previousMonth = trend[trend.length - 2] ?? null;
	const currentMonth = trend[trend.length - 1] ?? null;
	const recurringTotal = (spendInsights.recurring ?? [])
		.reduce((sum, item) => sum + (Number(item?.totalSpendCents) || 0), 0);
	const duplicateRows = Number(spendInsights.duplicates?.rowCount) || 0;
	const duplicateGroups = Number(spendInsights.duplicates?.signatureCount) || 0;
	const duplicateImpact = Number(spendInsights.duplicates?.spendImpactCents) || 0;
	const monthDelta = (currentMonth?.spendCents ?? 0) - (previousMonth?.spendCents ?? 0);
	const momText = previousMonth && currentMonth
		? ` MoM: ${formatMonthLabel(previousMonth.month)} ${formatCurrency(previousMonth.spendCents)} -> ${formatMonthLabel(currentMonth.month)} ${formatCurrency(currentMonth.spendCents)} (${formatSignedCurrency(monthDelta)})`
		: ' MoM: insufficient history';
	const lines = [];

	if (top[0]) {
		lines.push({
			key: 'top_1',
			text: ` ${formatSpendSummaryLine({
				rankLabel: 'Top:',
				categoryPath: top[0].categoryPath,
				spendCents: top[0].spendCents,
				pctOfSpend: Number(top[0].pctOfSpend) || 0
			})}`,
			color: '#93b6ff'
		});
	}
	if (top[1]) {
		lines.push({
			key: 'top_2',
			text: ` ${formatSpendSummaryLine({
				rankLabel: '2nd:',
				categoryPath: top[1].categoryPath,
				spendCents: top[1].spendCents,
				pctOfSpend: Number(top[1].pctOfSpend) || 0
			})}`,
			color: '#88abd6'
		});
	}
	if (top[2]) {
		lines.push({
			key: 'top_3',
			text: ` ${formatSpendSummaryLine({
				rankLabel: '3rd:',
				categoryPath: top[2].categoryPath,
				spendCents: top[2].spendCents,
				pctOfSpend: Number(top[2].pctOfSpend) || 0
			})}`,
			color: '#7e9cc2'
		});
	}

	lines.push({key: 'mom', text: momText, color: '#86a2d9'});
	lines.push({
		key: 'recurring',
		text: ` Recurring: ${formatCurrency(recurringTotal)} (top ${Math.min(3, (spendInsights.recurring ?? []).length)} merchants)`,
		color: '#84c3aa'
	});
	lines.push({
		key: 'dupes',
		text: ` Dupes: ${duplicateRows} rows in ${duplicateGroups} groups (~${formatCurrency(duplicateImpact)})`,
		color: duplicateRows > 0 ? '#d7b37a' : '#6f7396'
	});

	return lines;
}

function clampLine(text, maxWidth) {
	const safeText = String(text ?? '');
	const safeWidth = Math.max(12, Number(maxWidth) || 12);
	if (safeText.length <= safeWidth) {
		return safeText;
	}
	return safeText.slice(0, safeWidth - 1) + '…';
}

function formatDateShort(isoDate) {
	if (!isoDate) {
		return '--';
	}
	const parsed = new Date(`${isoDate}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) {
		return String(isoDate);
	}
	return parsed.toLocaleDateString('en-US', {
		month: '2-digit',
		day: '2-digit'
	});
}

function formatPostedDateHuman(postedAtRaw) {
	const postedAt = String(postedAtRaw ?? '').trim();
	const parsed = new Date(`${postedAt}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) {
		return postedAt || 'Unknown';
	}
	return parsed.toLocaleDateString('en-US', {
		month: '2-digit',
		day: '2-digit',
		year: '2-digit'
	});
}

function formatTransactionLine(item, width) {
	const postedAt = formatPostedDateHuman(item.posted_at);
	const amount = formatAmount(item.amount_cents);
	const categoryPath = String(item.category_path ?? '').replace(/\s+/g, ' ').trim() || 'Uncategorized';
	const amountWidth = 10;
	const dateWidth = 12;
	const descWidth = Math.max(8, width - dateWidth - amountWidth - 2);
	return `${pad(postedAt, dateWidth)} ${pad(categoryPath, descWidth)} ${pad(amount, amountWidth)}`;
}

export function Dashboard({
	terminalWidth,
	terminalHeight,
	accountRows,
	transactionRows = [],
	visibleTransactionRows: visibleTransactionRowsProp = null,
	transactionsSectionTitle = 'RECENT TRANSACTIONS',
	transactionPageIndex = 0,
	isTransactionFocusMode = false,
	focusedTransactionIndex = 0,
	searchLabel = 'institution:all',
	summaryLabel = 'Institutions',
	cashFlow30d = null,
	leftPaneRatio = 0.62,
	spendInsights = null,
	showSpendInsights = false,
	maximizeTransactions = false
}) {
		const normalizedLeftPaneRatio = Number.isFinite(Number(leftPaneRatio))
			? Math.min(1, Math.max(0.5, Number(leftPaneRatio)))
			: 0.62;
		const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * normalizedLeftPaneRatio));
		const safeTableWidth = Math.max(56, leftPaneWidth - 8);
	const estimatedAvailableLines = Math.max(12, terminalHeight - 12);
	const spendInsightsLines = showSpendInsights && !maximizeTransactions ? 8 : 0;
	const fixedLeftPaneLines = maximizeTransactions ? 4 : 8 + spendInsightsLines;
	const minTransactionLines = 2;
	const accountLinesBudget = maximizeTransactions ? 0 : Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - minTransactionLines);
	const {rows: visibleAccountRows} = maximizeTransactions
		? {rows: []}
		: selectAccountRowsForHeight(accountRows, accountLinesBudget);
	const {
		visibleTransactionRows: derivedVisibleTransactionRows,
		hasOverflowTransactions,
		totalPages,
		currentPageIndex
	} = deriveDashboardTransactionView({
		terminalHeight,
		accountRows,
		transactionRows,
		transactionPageIndex,
		showSpendInsights,
		maximizeTransactions
	});
	const visibleTransactionRows = Array.isArray(visibleTransactionRowsProp)
		? visibleTransactionRowsProp
		: derivedVisibleTransactionRows;
	const spendInsightLines = showSpendInsights && !maximizeTransactions ? buildSpendInsightLines(spendInsights) : [];
	const spendInsightTextWidth = Math.max(24, leftPaneWidth - 6);
	const tableHeader = renderTableLine(
		Object.fromEntries(COLUMNS.map((column) => [column.key, column.label])),
		computeColumnWidths(safeTableWidth)
	);

	return (
		<Box width="100%" paddingX={1} flexDirection="row">
			<Box width={leftPaneWidth} flexDirection="column" paddingX={1}>
				{!maximizeTransactions && (
					<>
						<Text color="#d4dcff">My {summaryLabel}</Text>
						<Text color="#2f3a67">{'='.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
						<Box width="100%" paddingX={1}>
							<Text color="#aeb2df">{tableHeader}</Text>
						</Box>
						<Text color="#2f3a67">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
						{visibleAccountRows.map((item, index) => (
							<InstitutionRow key={item.id} item={item} isSelected={index === 0} leftPaneWidth={leftPaneWidth} />
						))}
						<Text color="#2f3a67">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
						{showSpendInsights && (
							<>
								<Text backgroundColor="#2f2848" color="#d8c8ff">  BLEED SNAPSHOT (3M)  </Text>
								<Text color="#2f3a67">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
								{spendInsightLines.map((line) => (
									<Text key={line.key} color={line.color}>{clampLine(line.text, spendInsightTextWidth)}</Text>
								))}
								<Text color="#2f3a67">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
							</>
						)}
					</>
				)}
				<Text backgroundColor="#1f2f56" color="#9db5e9">  {transactionsSectionTitle}  </Text>
				<Text color="#2f3a67">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				{visibleTransactionRows.length === 0 && (
					<Text color="#6f7396"> No transactions yet</Text>
				)}
				{visibleTransactionRows.map((item, index) => {
					const isFocused = isTransactionFocusMode && index === focusedTransactionIndex;
					return (
						<Text
							key={item.id}
							color={isFocused ? '#dce6ff' : '#95a0d1'}
							backgroundColor={isFocused ? '#2c3a66' : undefined}
						>
							{` ${formatTransactionLine(item, Math.max(30, leftPaneWidth - 6))}`}
						</Text>
					);
				})}
					{hasOverflowTransactions && (
						<Text color="#6f7396">{` Press space for more results (page ${currentPageIndex + 1}/${totalPages})`}</Text>
					)}
					<Text color="#6b74a8"> Filter: {searchLabel}</Text>
					<Text color="#6b74a8"> Source: ~/.config/wealth-planner/main.db</Text>
				</Box>
			</Box>
		);
	}
