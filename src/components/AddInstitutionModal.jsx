import React from 'react';
import {Box, Text} from 'ink';

export function AddInstitutionModal({nameInput, typeInput, step, isSaving}) {
	const isNameStep = step === 'name';
	const primaryLabel = isNameStep ? 'Next' : 'Create';
	const statusText = isSaving
		? 'Creating...'
		: isNameStep
			? 'Enter = Next, Esc = Cancel'
			: 'Enter = Create, Esc = Cancel';

	return (
		<Box width="100%" justifyContent="center" alignItems="center" marginTop={1}>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="#b8c9dc"
				backgroundColor="#C6D6E9"
				paddingX={2}
				paddingY={1}
				width={56}
			>
				<Text color="#1e2f47">Add Deposit Account</Text>
				{isNameStep ? (
					<>
						<Text color="#32496b">Name of Institution (eg Simplii)</Text>
						<Text color="#2b3f5a">{nameInput || '|'}</Text>
					</>
				) : (
					<>
						<Text color="#32496b">Type of account (eg Chequing)</Text>
						<Text color="#2b3f5a">{typeInput || '|'}</Text>
					</>
				)}
				<Box marginTop={1} flexDirection="row">
					<Text backgroundColor="#9cd9b8" color="#163828"> {primaryLabel} </Text>
					<Text color="#5a6f88"> </Text>
					<Text backgroundColor="#d4dce5" color="#2b3f5a"> Cancel </Text>
				</Box>
				<Text color="#4f6480">{statusText}</Text>
			</Box>
		</Box>
	);
}
