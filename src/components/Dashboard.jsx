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
	showRemainingTransactions = false
}) {
	const safeAccountRows = Array.isArray(accountRows) ? accountRows : [];
	const safeTransactionRows = Array.isArray(transactionRows) ? transactionRows : [];
	const estimatedAvailableLines = Math.max(12, terminalHeight - 12);
	const fixedLeftPaneLines = 8;
	const minTransactionLines = 2;
	const accountLinesBudget = Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - minTransactionLines);
	const {usedLines: usedAccountLines} = selectAccountRowsForHeight(safeAccountRows, accountLinesBudget);
	const transactionLinesBudget = Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - usedAccountLines);
	const hasOverflowTransactions = safeTransactionRows.length > transactionLinesBudget;
	const showingRemainder = showRemainingTransactions && hasOverflowTransactions;
	const visibleTransactionRows = showingRemainder
		? safeTransactionRows.slice(transactionLinesBudget)
		: safeTransactionRows.slice(0, transactionLinesBudget);

	return {
		visibleTransactionRows,
		transactionLinesBudget,
		hasOverflowTransactions,
		showingRemainder
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
	showRemainingTransactions = false,
	isTransactionFocusMode = false,
	focusedTransactionIndex = 0,
	searchLabel = 'institution:all',
	summaryLabel = 'Institutions',
	hasBalances = false,
	hasCredits = false,
	cashFlow30d = null
}) {
	const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * 0.62));
		const shouldRenderRightPane = Boolean(cashFlow30d);
		const rightPaneWidth = shouldRenderRightPane
			? Math.max(28, terminalWidth - leftPaneWidth - 6)
			: 0;
		const checklistWidth = Math.max(24, rightPaneWidth - 2);
	const safeTableWidth = Math.max(56, leftPaneWidth - 8);
	const estimatedAvailableLines = Math.max(12, terminalHeight - 12);
	const fixedLeftPaneLines = 8;
	const minTransactionLines = 2;
	const accountLinesBudget = Math.max(1, estimatedAvailableLines - fixedLeftPaneLines - minTransactionLines);
	const {rows: visibleAccountRows} = selectAccountRowsForHeight(accountRows, accountLinesBudget);
	const {
		visibleTransactionRows: derivedVisibleTransactionRows,
		hasOverflowTransactions,
		showingRemainder
	} = deriveDashboardTransactionView({
		terminalHeight,
		accountRows,
		transactionRows,
		showRemainingTransactions
	});
	const visibleTransactionRows = Array.isArray(visibleTransactionRowsProp)
		? visibleTransactionRowsProp
		: derivedVisibleTransactionRows;
	const tableHeader = renderTableLine(
		Object.fromEntries(COLUMNS.map((column) => [column.key, column.label])),
		computeColumnWidths(safeTableWidth)
	);

	return (
		<Box width="100%" paddingX={1} paddingY={1} flexDirection="row">
			<Box width={leftPaneWidth} flexDirection="column" paddingX={1}>
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
				{hasOverflowTransactions && !showingRemainder && (
					<Text color="#6f7396"> Press space for more results</Text>
				)}
					{hasOverflowTransactions && showingRemainder && (
						<Text color="#6f7396"> No more results in this set</Text>
					)}
					<Text color="#6b74a8"> Filter: {searchLabel}</Text>
					<Text color="#6b74a8"> Source: ~/.config/wealth-planner/main.json</Text>
				</Box>
				{shouldRenderRightPane && (
					<>
						<Box width={1}>
							<Text color="#2f325a">│</Text>
						</Box>
						<Box width={rightPaneWidth} flexDirection="column" paddingX={1}>
						<Box
							width={checklistWidth}
							flexDirection="column"
							borderStyle="round"
						borderColor="#33406f"
						backgroundColor="#151a30"
						paddingX={2}
						paddingY={1}
					>
						<Text color="#8f98c8">Cash Flow</Text>
						<Text color="#27305a">{'-'.repeat(Math.max(14, checklistWidth - 6))}</Text>
						<Text color="#7f89be">
							{formatDateShort(cashFlow30d.startDate)} - {formatDateShort(cashFlow30d.endDate)}
						</Text>
						<Text color="#9ad4b6">In:  {formatCurrency(cashFlow30d.inflowCents)}</Text>
						<Text color="#b6bddf">Out: {formatCurrency(cashFlow30d.outflowCents)}</Text>
							<Text color={cashFlow30d.netCents >= 0 ? '#7ce0b0' : '#e39090'}>
								Net: {cashFlow30d.netCents >= 0 ? '+' : '-'}{formatCurrency(cashFlow30d.netCents)}
							</Text>
						</Box>
						</Box>
					</>
				)}
			</Box>
		);
	}
