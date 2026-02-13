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
	const divider = '─'.repeat(Math.max(24, terminalWidth - 4));
	const prompt = commandMode ? `/${commandInput || '|'}` : 'Press / for command mode';
	const suggestionText = commandMode
		? (suggestions.length > 0 ? suggestions.map((item) => `/${item}`).join('  ') : 'No matching commands')
		: '';

	return (
		<Box width="100%" flexDirection="column">
			<Box width="100%" paddingX={2}>
				<Text color="#2b2d47">{divider}</Text>
			</Box>
			<Box width="100%" paddingX={2} flexDirection="row" justifyContent="space-between">
				<Text color={commandMode ? '#d4d6ff' : '#9aa0df'}>{prompt}</Text>
				<Text color="#6f74a8">{suggestionText}</Text>
			</Box>
			<Box width="100%" paddingX={2}>
				{isRunningCommand && <Text color="#9aa0df">Running command...</Text>}
				{!isRunningCommand && !!commandMessage && <Text color="#58d7a3">{commandMessage}</Text>}
			</Box>
		</Box>
	);
}
