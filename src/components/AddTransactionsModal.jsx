import React from 'react';
import {Box, Text} from 'ink';

export function AddTransactionsModal({
	institutions,
	selectedInstitutionIndex,
	csvPathInput,
	step,
	preview,
	isBusy
}) {
	const selectedInstitution = institutions[selectedInstitutionIndex] ?? null;

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
				<Text color="#1e2f47">Add Transactions</Text>
				<Text color="#32496b">Institution: {selectedInstitution?.name ?? 'None available'}</Text>
				<Text color="#4f6480">Use ←/→ to change institution</Text>
				<Text color="#32496b">CSV path:</Text>
				<Text color="#2b3f5a">{csvPathInput || '|'}</Text>

					{step === 'preview' && preview && (
						<>
							<Text color="#4f6480"> </Text>
							<Text color="#1e2f47">Preview</Text>
							<Text color="#32496b">Import into: {selectedInstitution?.name ?? 'None available'}</Text>
							<Text color="#32496b">File: {preview.resolvedPath}</Text>
						<Text color="#32496b">Rows: {preview.count}</Text>
						<Text color="#32496b">Range: {preview.dateFrom} to {preview.dateTo}</Text>
						{preview.categorization && (
							<>
								<Text color="#32496b">
									Categorized: {preview.categorization.categorized}/{preview.categorization.total}
								</Text>
								<Text color="#32496b">
									Defaulted: {preview.categorization.uncategorized}
								</Text>
							</>
						)}
					</>
				)}
				{step === 'categorizing' && preview && (
					<>
						<Text color="#4f6480"> </Text>
						<Text color="#1e2f47">Categorizing with AI...</Text>
						<Text color="#32496b">File: {preview.resolvedPath}</Text>
						<Text color="#32496b">Rows: {preview.count}</Text>
					</>
				)}

				<Box marginTop={1} flexDirection="row">
					<Text backgroundColor="#9cd9b8" color="#163828"> Create </Text>
					<Text color="#5a6f88"> </Text>
					<Text backgroundColor="#d4dce5" color="#2b3f5a"> Cancel </Text>
				</Box>
				<Text color="#4f6480">
					{isBusy
						? 'Working...'
						: step === 'preview'
							? 'Enter = Confirm import, Esc = Cancel'
							: step === 'categorizing'
								? 'AI is assigning categories. Esc = Cancel'
							: 'Enter = Preview import, Esc = Cancel'}
				</Text>
			</Box>
		</Box>
	);
}
