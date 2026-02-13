import React from 'react';
import {Box, Text} from 'ink';

function TabLabel({label, isActive}) {
	if (isActive) {
		return <Text backgroundColor="#2a2b52" color="#d4d6ff">  {label}  </Text>;
	}
	return <Text color="#777898">{label}</Text>;
}

export function Tabs({terminalWidth, currentTab}) {
	const divider = '-'.repeat(Math.max(24, terminalWidth - 4));

	return (
		<Box width="100%" flexDirection="column">
			<Box width="100%" paddingX={2} flexDirection="row" alignItems="center">
				<Text color="#3b3f70">|  </Text>
				<TabLabel label="Home" isActive={currentTab === 'Home'} />
				<Text color="#3b3f70">  |  </Text>
				<TabLabel label="Institutions" isActive={currentTab === 'Institutions'} />
				<Text color="#3b3f70">  |</Text>
			</Box>
			<Box width="100%" paddingX={2}>
				<Text color="#2b2d47">{divider}</Text>
			</Box>
		</Box>
	);
}
