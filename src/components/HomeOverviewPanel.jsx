import React from 'react';
import {Box, Text} from 'ink';

function buildMeter(value, max, width = 12) {
	const safeMax = Math.max(1, Number(max) || 1);
	const safeValue = Math.max(0, Math.min(safeMax, Number(value) || 0));
	const filled = Math.round((safeValue / safeMax) * width);
	return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
}

function StatCard({title, value, accent = '#8aa0c7', subtitle = '', tone = '#171b2d', meter = null}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="#33406f"
			backgroundColor={tone}
			paddingX={2}
			paddingY={1}
			width={26}
		>
			<Text color="#8f98c8">{title}</Text>
			<Text color={accent}>{value}</Text>
			{meter && <Text color="#5f6a9f">{meter}</Text>}
			<Text color="#6973a7">{subtitle || ' '}</Text>
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
	const activityTone = lastActivity === 'none' ? '#20253f' : '#1a2640';

	return (
		<Box width={84} flexDirection="column" borderStyle="round" borderColor="#3a4779" backgroundColor="#12162a" paddingX={2} paddingY={1}>
			<Text backgroundColor="#1d2a4d" color="#d4dcff">  HOME OVERVIEW  </Text>
			<Text color="#90a0d4">Welcome back, {userName || 'there'}</Text>
			<Text color="#2f3a67">{"=".repeat(78)}</Text>
			<Box flexDirection="row">
				<StatCard
					title="Connected Accounts"
					value={String(totalAccounts)}
					accent="#d4dcff"
					tone="#171d33"
					meter={buildMeter(totalAccounts, Math.max(4, totalAccounts))}
					subtitle="Across all workspaces"
				/>
				<Box width={1} />
				<StatCard
					title="Deposit Accounts"
					value={String(depositAccounts)}
					accent="#86b7ff"
					tone="#16233a"
					meter={buildMeter(depositAccounts, Math.max(1, totalAccounts))}
					subtitle="BANK kind"
				/>
				<Box width={1} />
				<StatCard
					title="Credit Accounts"
					value={String(creditAccounts)}
					accent="#58d7a3"
					tone="#152b2a"
					meter={buildMeter(creditAccounts, Math.max(1, totalAccounts))}
					subtitle="CREDIT kind"
				/>
			</Box>
			<Box marginTop={1} flexDirection="row">
				<StatCard
					title="Transactions"
					value={String(totalTransactions)}
					accent="#d7b37a"
					tone="#2a1f1d"
					meter={buildMeter(totalTransactions, Math.max(5, totalTransactions))}
					subtitle="Imported rows"
				/>
				<Box width={1} />
				<StatCard
					title="Latest Activity"
					value={lastActivity}
					accent="#9ca4d8"
					tone={activityTone}
					subtitle="Most recent account update"
				/>
			</Box>
			<Text color="#2f3a67">{"=".repeat(78)}</Text>
			<Box flexDirection="row">
				<Text backgroundColor="#1f2f56" color="#9db5e9">  Accounts Healthy  </Text>
				<Box width={1} />
				<Text backgroundColor="#213a35" color="#80d5b4">  Import Ready  </Text>
				<Box width={1} />
				<Text backgroundColor="#3a2e20" color="#d9c09a">  Local DB  </Text>
			</Box>
		</Box>
	);
}
