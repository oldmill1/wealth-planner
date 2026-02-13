import React from 'react';
import {Box, Text} from 'ink';

export function BottomBar({
	terminalWidth,
	commandMode,
	commandInput,
	suggestions,
	selectedSuggestionIndex,
	commandMessage,
	isRunningCommand
}) {
	const prompt = commandMode ? `/${commandInput || '|'}` : 'Press / for command mode';
	const suggestionText = commandMode ? (
		suggestions.length > 0 ? suggestions.map((item, index) => (
			<Text
				key={item}
				color={index === selectedSuggestionIndex ? '#152842' : '#2f4666'}
				backgroundColor={index === selectedSuggestionIndex ? '#AFC6DE' : undefined}
			>
				/{item}
				{index < suggestions.length - 1 ? '  ' : ''}
			</Text>
		)) : <Text color="#2f4666">No matching commands</Text>
	) : null;

	return (
		<Box width="100%" flexDirection="column" backgroundColor="#7C94AD">
			<Box width="100%" paddingX={2} flexDirection="row" justifyContent="space-between">
				<Text color={commandMode ? '#1e2f47' : '#2b3f5a'}>{prompt}</Text>
				<Box flexDirection="row">{suggestionText}</Box>
			</Box>
			<Box width="100%" paddingX={2}>
				{isRunningCommand && <Text color="#2b3f5a">Running command...</Text>}
				{!isRunningCommand && !!commandMessage && <Text color="#1f4f3f">{commandMessage}</Text>}
			</Box>
		</Box>
	);
}
