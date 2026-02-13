import React from 'react';
import {Box, Text} from 'ink';

export function AddInstitutionModal({nameInput, isSaving}) {
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
				<Text color="#1e2f47">Add Institution</Text>
				<Text color="#32496b">Name of Institution (eg Simplii)</Text>
				<Text color="#2b3f5a">{nameInput || '|'}</Text>
				<Box marginTop={1} flexDirection="row">
					<Text backgroundColor="#9cd9b8" color="#163828"> Create </Text>
					<Text color="#5a6f88"> </Text>
					<Text backgroundColor="#d4dce5" color="#2b3f5a"> Cancel </Text>
				</Box>
				<Text color="#4f6480">{isSaving ? 'Creating...' : 'Enter = Create, Esc = Cancel'}</Text>
			</Box>
		</Box>
	);
}
