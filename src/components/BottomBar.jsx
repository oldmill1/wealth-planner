import React from 'react';
import {Box, Text} from 'ink';

export function BottomBar({
	terminalWidth,
	commandMode,
	commandInput,
	suggestions,
	commandMessage,
	isRunningCommand
}) {
	const prompt = commandMode ? `/${commandInput || '|'}` : 'Press / for command mode';
	const suggestionText = commandMode
		? (suggestions.length > 0 ? suggestions.map((item) => `/${item}`).join('  ') : 'No matching commands')
		: '';

	return (
		<Box width="100%" flexDirection="column" backgroundColor="#7C94AD">
			<Box width="100%" paddingX={2} flexDirection="row" justifyContent="space-between">
				<Text color={commandMode ? '#1e2f47' : '#2b3f5a'}>{prompt}</Text>
				<Text color="#2f4666">{suggestionText}</Text>
			</Box>
			<Box width="100%" paddingX={2}>
				{isRunningCommand && <Text color="#2b3f5a">Running command...</Text>}
				{!isRunningCommand && !!commandMessage && <Text color="#1f4f3f">{commandMessage}</Text>}
			</Box>
		</Box>
	);
}
