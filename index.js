import React from 'react';
import {
	Box,
	Text,
	render,
	useApp,
	useInput,
	useStdout
} from 'ink';

function App() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.ctrl && input === 'c') {
			exit();
		}
	});

	return React.createElement(
		Box,
		{
			width: terminalWidth,
			height: terminalHeight,
			flexDirection: 'column',
			justifyContent: 'center',
			alignItems: 'center'
		},
		React.createElement(Text, {color: 'blueBright'}, 'Wealth Planner'),
		React.createElement(Text, {color: 'greenBright'}, 'Welcome. Plan with calm, clear steps.'),
		React.createElement(Text, {color: 'blue', dimColor: true}, 'Press q to quit')
	);
}

render(React.createElement(App));
