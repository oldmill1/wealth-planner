import React from 'react';
import {Box, Text} from 'ink';

function StatCard({title, value, accent = '#8aa0c7', subtitle = ''}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="#2d345d"
			backgroundColor="#171b2d"
			paddingX={2}
			paddingY={1}
			width={26}
		>
			<Text color="#7f88ba">{title}</Text>
			<Text color={accent}>{value}</Text>
			<Text color="#626b9b">{subtitle || ' '}</Text>
		</Box>
	);
}

export function HomeOverviewPanel({
	userName,
	totalAccounts,
	depositAccounts,
	creditAccounts,
	totalTransactions,
	lastActivity
}) {
	return (
		<Box width={84} flexDirection="column" borderStyle="round" borderColor="#303864" backgroundColor="#12162a" paddingX={2} paddingY={1}>
			<Text color="#c5c8ff">Overview</Text>
			<Text color="#7f88ba">Welcome back, {userName || 'there'}</Text>
			<Text color="#27305a">{"-".repeat(78)}</Text>
			<Box flexDirection="row">
				<StatCard title="Connected Accounts" value={String(totalAccounts)} accent="#c5c8ff" subtitle="Across all workspaces" />
				<Box width={1} />
				<StatCard title="Deposit Accounts" value={String(depositAccounts)} accent="#86b7ff" subtitle="BANK kind" />
				<Box width={1} />
				<StatCard title="Credit Accounts" value={String(creditAccounts)} accent="#58d7a3" subtitle="CREDIT kind" />
			</Box>
			<Box marginTop={1} flexDirection="row">
				<StatCard title="Transactions" value={String(totalTransactions)} accent="#d1b27a" subtitle="Imported rows" />
				<Box width={1} />
				<StatCard title="Latest Activity" value={lastActivity} accent="#9ca4d8" subtitle="Most recent account update" />
			</Box>
		</Box>
	);
}
