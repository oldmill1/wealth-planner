import React from 'react';
import {Box, Text} from 'ink';

function pad(value, length) {
	const text = String(value ?? '');
	if (text.length >= length) {
		return text.slice(0, length - 1) + '…';
	}
	return text + ' '.repeat(length - text.length);
}

function InstitutionRow({item, isSelected, leftPaneWidth}) {
	if (item.isPlaceholder) {
		return (
			<Box width="100%" paddingX={1} backgroundColor={isSelected ? '#24264a' : undefined}>
				<Text color={isSelected ? '#d4d6ff' : '#8f93bf'}>+ {item.placeholderLabel ?? 'Add First Institution'}</Text>
			</Box>
		);
	}

	const safeWidth = Math.max(56, leftPaneWidth - 8);
	const typeCol = 13;
	const statusCol = 16;
	const balanceCol = 10;
	const updatedCol = 9;
	const nameCol = Math.max(10, safeWidth - typeCol - statusCol - balanceCol - updatedCol - 9);
	const line = `${pad(item.type, typeCol)} ${pad(item.name, nameCol)} ${pad(item.status, statusCol)} ${pad(item.balance, balanceCol)} ${pad(item.lastUpdated, updatedCol)}`;

	return (
		<Box width="100%" paddingX={1} backgroundColor={isSelected ? '#24264a' : undefined}>
			<Text color={isSelected ? '#d4d6ff' : '#8f93bf'}>{line}</Text>
		</Box>
	);
}

export function InstitutionsDashboard({
	terminalWidth,
	institutionRows,
	searchLabel = 'institution:all',
	summaryLabel = 'Institutions'
}) {
	const realInstitutionCount = institutionRows.filter((item) => !item.isPlaceholder).length;
	const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * 0.62));
	const rightPaneWidth = Math.max(28, terminalWidth - leftPaneWidth - 6);

	return (
		<Box width="100%" paddingX={1} paddingY={1} flexDirection="row">
			<Box width={leftPaneWidth} flexDirection="column" paddingX={1}>
				<Text color="#7d83c8"> [Search] {searchLabel} status:any user:current</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Box width="100%" paddingX={1}>
					<Text color="#aeb2df">Type          Name                         Status           Balance    Updated</Text>
				</Box>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				{institutionRows.map((item, index) => (
					<InstitutionRow key={item.id} item={item} isSelected={index === 0} leftPaneWidth={leftPaneWidth} />
				))}
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Text color="#777898"> Source: ~/.config/wealth-planner/main.json</Text>
			</Box>
			<Box width={1}>
				<Text color="#2f325a">│</Text>
			</Box>
			<Box width={rightPaneWidth} flexDirection="column" paddingX={1}>
				<Text color="#c5c8ff">{summaryLabel}: {realInstitutionCount}</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(18, rightPaneWidth - 2))}</Text>
				<Text color="#aeb2df">
					by <Text color="#d4d6ff">@wealth-planner</Text> • 1y ago • <Text color="#161723" backgroundColor="#58d7a3"> NEW </Text> none
				</Text>
			</Box>
		</Box>
	);
}
