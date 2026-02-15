import React from 'react';
import {Box, Text} from 'ink';

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

function formatAmount(amountCentsRaw) {
	const amountCents = Number(amountCentsRaw) || 0;
	const absolute = (Math.abs(amountCents) / 100).toFixed(2);
	const sign = amountCents < 0 ? '-' : '+';
	return `${sign}$${absolute}`;
}

export function EditTransactionCategoryModal({transaction, categoryInput, isSaving}) {
	if (!transaction) {
		return null;
	}

	const statusText = isSaving
		? 'Saving...'
		: 'Enter = Save category, Esc = Cancel';

	return (
		<Box width="100%" justifyContent="center" alignItems="center">
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="#b8c9dc"
				backgroundColor="#C6D6E9"
				paddingX={2}
				paddingY={1}
				width={76}
			>
				<Text color="#1e2f47">Edit Transaction Category</Text>
				<Text color="#32496b">Date: {formatPostedDateHuman(transaction.posted_at)}</Text>
				<Text color="#32496b">Amount: {formatAmount(transaction.amount_cents)}</Text>
				<Text color="#32496b">Current Category: {transaction.category_path || 'Uncategorized'}</Text>
				<Text color="#32496b">Category (x &gt; y &gt; z):</Text>
				<Text color="#2b3f5a">{categoryInput || '|'}</Text>
				<Box marginTop={1} flexDirection="row">
					<Text backgroundColor="#9cd9b8" color="#163828"> Save </Text>
					<Text color="#5a6f88"> </Text>
					<Text backgroundColor="#d4dce5" color="#2b3f5a"> Cancel </Text>
				</Box>
				<Text color="#4f6480">{statusText}</Text>
			</Box>
		</Box>
	);
}
