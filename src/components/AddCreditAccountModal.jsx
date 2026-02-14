import React from 'react';
import {Box, Text} from 'ink';

export function AddCreditAccountModal({institutionInput, lastFourInput, step, isSaving}) {
	const isInstitutionStep = step === 'institution';
	const primaryLabel = isInstitutionStep ? 'Next' : 'Create';
	const statusText = isSaving
		? 'Creating...'
		: isInstitutionStep
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
				width={64}
			>
				<Text color="#1e2f47">Add Credit Account</Text>
				{isInstitutionStep ? (
					<>
						<Text color="#32496b">Name of Institution (eg American Express)</Text>
						<Text color="#2b3f5a">{institutionInput || '|'}</Text>
					</>
				) : (
					<>
						<Text color="#32496b">Last 4 Digits/Nickname (eg 4242)</Text>
						<Text color="#2b3f5a">{lastFourInput || '|'}</Text>
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
