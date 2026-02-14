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
		key: 'status',
		label: 'Status',
		minWidth: 16,
		formatter: (item) => item.status
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
	const line = renderTableLine(item, columnWidths);

	return (
		<Box width="100%" paddingX={1} backgroundColor={isSelected ? '#24264a' : undefined}>
			<Text color={isSelected ? '#d4d6ff' : '#8f93bf'}>{line}</Text>
		</Box>
	);
}

export function Dashboard({
	terminalWidth,
	accountRows,
	searchLabel = 'institution:all',
	summaryLabel = 'Institutions',
	hasBalances = false,
	hasCredits = false
}) {
	const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * 0.62));
	const rightPaneWidth = Math.max(28, terminalWidth - leftPaneWidth - 6);
	const checklistWidth = Math.max(24, rightPaneWidth - 2);
	const tableHeader = renderTableLine(
		Object.fromEntries(COLUMNS.map((column) => [column.key, column.label])),
		computeColumnWidths(Math.max(56, leftPaneWidth - 8))
	);

	return (
		<Box width="100%" paddingX={1} paddingY={1} flexDirection="row">
			<Box width={leftPaneWidth} flexDirection="column" paddingX={1}>
				<Text color="#7d83c8"> [Search] {searchLabel} status:any user:current</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Box width="100%" paddingX={1}>
					<Text color="#aeb2df">{tableHeader}</Text>
				</Box>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				{accountRows.map((item, index) => (
					<InstitutionRow key={item.id} item={item} isSelected={index === 0} leftPaneWidth={leftPaneWidth} />
				))}
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Text color="#777898"> Source: ~/.config/wealth-planner/main.json</Text>
			</Box>
			<Box width={1}>
				<Text color="#2f325a">│</Text>
			</Box>
			<Box width={rightPaneWidth} flexDirection="column" paddingX={1}>
				<Box
					width={checklistWidth}
					flexDirection="column"
					borderStyle="round"
					borderColor="#2f325a"
					paddingX={2}
					paddingY={1}
				>
					<Text color="#aeb2df">
						<Text color={hasBalances ? '#58d7a3' : '#6f7396'}>● </Text>
						<Text color={hasBalances ? '#c5c8ff' : '#8f93bf'}>Add Deposit Account</Text>
					</Text>
					<Text color={hasBalances ? '#8f93bf' : '#6f7396'}>  Eg your chequing account</Text>
					<Text color="#2f325a">{'-'.repeat(Math.max(14, checklistWidth - 6))}</Text>
					<Text color="#aeb2df">
						<Text color={hasCredits ? '#58d7a3' : '#6f7396'}>● </Text>
						<Text color={hasCredits ? '#c5c8ff' : '#8f93bf'}>Add Credit Account</Text>
					</Text>
					<Text color={hasCredits ? '#8f93bf' : '#6f7396'}>  Eg your American Express card</Text>
				</Box>
			</Box>
		</Box>
	);
}
