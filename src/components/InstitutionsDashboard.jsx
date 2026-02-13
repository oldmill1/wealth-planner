import React from 'react';
import {Box, Text} from 'ink';

function pad(value, length) {
	if (value.length >= length) {
		return value.slice(0, length - 1) + '…';
	}
	return value + ' '.repeat(length - value.length);
}

function InstitutionRow({item, isSelected, leftPaneWidth}) {
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

export function InstitutionsDashboard({terminalWidth, institutionRows}) {
	const selected = institutionRows[0] ?? null;
	const leftPaneWidth = Math.max(56, Math.floor(terminalWidth * 0.62));
	const rightPaneWidth = Math.max(28, terminalWidth - leftPaneWidth - 6);

	if (institutionRows.length === 0) {
		return (
			<Box width="100%" paddingX={2} paddingY={1} flexDirection="column">
				<Text color="#c5c8ff">Institutions</Text>
				<Text color="#777898">No institutions found (mock state).</Text>
			</Box>
		);
	}

	return (
		<Box width="100%" paddingX={1} paddingY={1} flexDirection="row">
			<Box width={leftPaneWidth} flexDirection="column" paddingX={1}>
				<Text color="#7d83c8"> [Search] institution:all status:any user:current</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Box width="100%" paddingX={1}>
					<Text color="#aeb2df">Type          Name                         Status           Balance    Updated</Text>
				</Box>
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				{institutionRows.map((item, index) => (
					<InstitutionRow key={item.id} item={item} isSelected={index === 0} leftPaneWidth={leftPaneWidth} />
				))}
				<Text color="#2f325a">{'-'.repeat(Math.max(30, leftPaneWidth - 4))}</Text>
				<Text color="#777898"> Demo UI only. Replace with real institutions data source.</Text>
			</Box>
			<Box width={1}>
				<Text color="#2f325a">│</Text>
			</Box>
			<Box width={rightPaneWidth} flexDirection="column" paddingX={1}>
				<Text color="#aeb2df">Selected Institution: {selected?.name ?? '-'}</Text>
				<Text color="#8f93bf">Account: {selected?.accountMask ?? '-'}</Text>
				<Text color="#8f93bf">Type: {selected?.type ?? '-'}  Status: {selected?.status ?? '-'}</Text>
				<Text color="#8f93bf">Balance: {selected?.balance ?? '-'}  Updated: {selected?.lastUpdated ?? '-'}</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(18, rightPaneWidth - 2))}</Text>
				<Text color="#58d7a3">• Sync healthy</Text>
				<Text color="#58d7a3">• Credentials valid</Text>
				<Text color="#8f93bf">• 0 pending alerts</Text>
				<Text color="#2f325a">{'-'.repeat(Math.max(18, rightPaneWidth - 2))}</Text>
				<Text color="#777898">Actions (mock): Refresh | Rename | Disconnect</Text>
			</Box>
		</Box>
	);
}
