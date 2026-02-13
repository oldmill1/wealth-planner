import React from 'react';
import {
	Box,
	Text,
	render,
	useApp,
	useInput,
	useStdout
} from 'ink';

const asciiTitle = String.raw`
 _       __          ____  __       ____  __                           
| |     / /__  ____ / / /_/ /_     / __ \/ /___ _____  ____  ___  _____
| | /| / / _ \/ __  / __/ __ \   / /_/ / / __ '/ __ \/ __ \/ _ \/ ___/
| |/ |/ /  __/ /_/ / /_/ / / /  / ____/ / /_/ / / / / / / /  __/ /    
|__/|__/\___/\__,_/\__/_/ /_/  /_/   /_/\__,_/_/ /_/_/ /_/\___/_/     
`;

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
		React.createElement(Text, {color: 'cyan'}, asciiTitle),
		React.createElement(Text, {color: 'whiteBright'}, 'Welcome to Wealth Planner'),
		React.createElement(Text, {dimColor: true}, 'Press q to quit')
	);
}

render(React.createElement(App));
