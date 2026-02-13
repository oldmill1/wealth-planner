import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';

import {AddInstitutionModal} from './components/AddInstitutionModal.jsx';
import {DEFAULT_TIMEZONE, TABS} from './constants.js';
import {BottomBar} from './components/BottomBar.jsx';
import {InstitutionsDashboard} from './components/InstitutionsDashboard.jsx';
import {Tabs} from './components/Tabs.jsx';
import {
	addInstitutionForUser,
	loadOrInitDatabase,
	isValidTimezone,
	saveFirstUser
} from './services/database.js';
import {executeCommand, loadOrInitCommandRegistry} from './services/commands.js';

function mapInstitutionToRow(institution) {
	return {
		id: institution.id,
		type: institution.type,
		name: institution.name,
		status: 'CONNECTED',
		balance: '--',
		lastUpdated: 'just now',
		accountMask: '...'
	};
}

function withEmptyInstitutionRow(rows) {
	if (rows.length > 0) {
		return rows;
	}

	return [
		{
			id: 'add_first_institution',
			type: 'ACTION',
			name: 'Add First Institution',
			status: '',
			balance: '',
			lastUpdated: '',
			accountMask: '',
			isPlaceholder: true
		}
	];
}

const TAB_COMMANDS = {
	Home: ['clean_db'],
	Institutions: ['add_institutions']
};

function fuzzyMatch(query, value) {
	if (!query) {
		return true;
	}

	const q = query.toLowerCase();
	const v = value.toLowerCase();
	let qi = 0;

	for (let vi = 0; vi < v.length && qi < q.length; vi += 1) {
		if (v[vi] === q[qi]) {
			qi += 1;
		}
	}

	return qi === q.length;
}

export function App() {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	const [bootState, setBootState] = useState('booting');
	const [errorMessage, setErrorMessage] = useState('');
	const [nameInput, setNameInput] = useState('');
	const [timezoneInput, setTimezoneInput] = useState(DEFAULT_TIMEZONE);
	const [user, setUser] = useState(null);
	const [commands, setCommands] = useState({});
	const [commandMode, setCommandMode] = useState(false);
	const [commandInput, setCommandInput] = useState('');
	const [commandMessage, setCommandMessage] = useState('');
	const [isRunningCommand, setIsRunningCommand] = useState(false);
	const [currentTab, setCurrentTab] = useState('Home');
	const [institutionRows, setInstitutionRows] = useState([]);
	const [isAddInstitutionModalOpen, setIsAddInstitutionModalOpen] = useState(false);
	const [addInstitutionNameInput, setAddInstitutionNameInput] = useState('');
	const [isCreatingInstitution, setIsCreatingInstitution] = useState(false);
	const availableCommands = useMemo(() => {
		const tabCommands = TAB_COMMANDS[currentTab] ?? [];
		return tabCommands.filter((command) => Object.hasOwn(commands, command));
	}, [commands, currentTab]);
	const commandSuggestions = useMemo(() => {
		const normalized = commandInput.trim().replace(/^\/+/, '');
		return availableCommands.filter((command) => fuzzyMatch(normalized, command));
	}, [availableCommands, commandInput]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const loadedCommands = await loadOrInitCommandRegistry();
				if (!mounted) {
					return;
				}
				setCommands(loadedCommands);

				const bios = await loadOrInitDatabase();
				if (!mounted) {
					return;
				}
				if (bios.firstRun || !bios.user) {
					setBootState('wizard_name');
					return;
				}
				setUser(bios.user);
				setInstitutionRows((bios.institutions ?? []).map(mapInstitutionToRow));
				setBootState('ready');
			} catch (error) {
				if (!mounted) {
					return;
				}
				setErrorMessage(error.message || 'Failed during BIOS startup.');
				setBootState('error');
			}
		})();

		return () => {
			mounted = false;
		};
	}, []);

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			exit();
			return;
		}

		if (isAddInstitutionModalOpen) {
			if (key.escape) {
				setIsAddInstitutionModalOpen(false);
				setAddInstitutionNameInput('');
				setCommandMessage('Add institution cancelled.');
				return;
			}

			if (key.return) {
				const trimmedName = addInstitutionNameInput.trim();
				if (!trimmedName) {
					setCommandMessage('Institution name is required.');
					return;
				}
				if (!user?.id) {
					setCommandMessage('No active user loaded.');
					setIsAddInstitutionModalOpen(false);
					setAddInstitutionNameInput('');
					return;
				}

				setIsCreatingInstitution(true);
				addInstitutionForUser({userId: user.id, name: trimmedName})
					.then((institution) => {
						setInstitutionRows((prev) => [...prev, mapInstitutionToRow(institution)]);
						setCommandMessage(`Institution "${institution.name}" created.`);
						setIsAddInstitutionModalOpen(false);
						setAddInstitutionNameInput('');
					})
					.catch((error) => {
						setCommandMessage(`Failed to create institution: ${error.message}`);
					})
					.finally(() => {
						setIsCreatingInstitution(false);
					});
				return;
			}

			if (key.backspace || key.delete) {
				setAddInstitutionNameInput((prev) => prev.slice(0, -1));
				return;
			}

			if (!key.ctrl && !key.meta && input && input !== '\t') {
				setAddInstitutionNameInput((prev) => prev + input);
			}
			return;
		}

		if (commandMode) {
			if (key.escape) {
				setCommandMode(false);
				setCommandInput('');
				setCommandMessage('');
				return;
			}

			if (key.return) {
				const normalizedCommand = commandInput.trim().replace(/^\/+/, '');
				if (!normalizedCommand) {
					setCommandMessage('Enter a command.');
					return;
				}

				let commandToRun = null;
				if (availableCommands.includes(normalizedCommand)) {
					commandToRun = normalizedCommand;
				} else if (commandSuggestions.length === 1) {
					commandToRun = commandSuggestions[0];
				}

				if (!commandToRun) {
					setCommandMessage(`No command match for "/${normalizedCommand}" in ${currentTab}.`);
					return;
				}

				if (commandToRun === 'add_institutions') {
					setCommandMode(false);
					setCommandInput('');
					setCommandMessage('');
					setIsAddInstitutionModalOpen(true);
					setAddInstitutionNameInput('');
					return;
				}

				setIsRunningCommand(true);
				executeCommand(commandToRun)
					.then((message) => {
						setCommandMessage(message);
						if (commandToRun === 'clean_db') {
							setUser(null);
							setInstitutionRows([]);
							setNameInput('');
							setTimezoneInput(DEFAULT_TIMEZONE);
							setBootState('wizard_name');
						}
					})
					.catch((error) => {
						setCommandMessage(`Command failed: ${error.message}`);
					})
					.finally(() => {
						setIsRunningCommand(false);
						setCommandMode(false);
						setCommandInput('');
					});
				return;
			}

			if (key.backspace || key.delete) {
				setCommandInput((prev) => prev.slice(0, -1));
				return;
			}

			if (!key.ctrl && !key.meta && input !== '\t') {
				setCommandInput((prev) => prev + input);
			}
			return;
		}

		if (input === '/') {
			setCommandMode(true);
			setCommandInput('');
			setCommandMessage('');
			return;
		}

		if (key.tab || input === '\t') {
			setCurrentTab((prev) => {
				const currentIndex = TABS.indexOf(prev);
				const nextIndex = currentIndex === -1
					? 0
					: (currentIndex + 1) % TABS.length;
				return TABS[nextIndex];
			});
			return;
		}

		if (key.escape) {
			exit();
			return;
		}

		if (bootState === 'ready') {
			if (input === 'q') {
				exit();
			}
			return;
		}

		if (bootState === 'wizard_name') {
			if (key.return) {
				const nextName = nameInput.trim();
				if (!nextName) {
					setErrorMessage('Name is required.');
					return;
				}
				setErrorMessage('');
				setBootState('wizard_timezone');
				return;
			}
			if (key.backspace || key.delete) {
				setNameInput((prev) => prev.slice(0, -1));
				return;
			}
			if (!key.ctrl && !key.meta && input) {
				setNameInput((prev) => prev + input);
			}
			return;
		}

		if (bootState === 'wizard_timezone') {
			if (key.return) {
				const trimmedName = nameInput.trim();
				const trimmedTimezone = timezoneInput.trim() || DEFAULT_TIMEZONE;
				if (!isValidTimezone(trimmedTimezone)) {
					setErrorMessage('Invalid timezone. Example: America/New_York');
					return;
				}
				setErrorMessage('');
				setBootState('saving');
				saveFirstUser(trimmedName, trimmedTimezone)
					.then((savedUser) => {
						setUser(savedUser);
						setInstitutionRows([]);
						setBootState('ready');
					})
					.catch((error) => {
						setErrorMessage(error.message || 'Failed to save user.');
						setBootState('error');
					});
				return;
			}
			if (key.backspace || key.delete) {
				setTimezoneInput((prev) => prev.slice(0, -1));
				return;
			}
			if (!key.ctrl && !key.meta && input) {
				setTimezoneInput((prev) => prev + input);
			}
		}
	});

	const content = useMemo(() => {
		if (bootState === 'booting') {
			return (
				<>
					<Text color="blueBright">Wealth Planner BIOS</Text>
					<Text color="greenBright">Checking local database...</Text>
				</>
			);
		}

		if (bootState === 'wizard_name') {
			return (
				<>
					<Text color="blueBright">First Run Setup</Text>
					<Text color="greenBright">Name: {nameInput || '|'}</Text>
					<Text color="blue" dimColor>Press Enter to continue</Text>
				</>
			);
		}

		if (bootState === 'wizard_timezone') {
			return (
				<>
					<Text color="blueBright">First Run Setup</Text>
					<Text color="greenBright">Timezone: {timezoneInput || '|'}</Text>
					<Text color="blue" dimColor>Default: America/New_York</Text>
				</>
			);
		}

		if (bootState === 'saving') {
			return (
				<>
					<Text color="blueBright">Finalizing setup...</Text>
					<Text color="greenBright">Writing user profile to disk</Text>
				</>
			);
		}

		if (bootState === 'error') {
			return (
				<>
					<Text color="redBright">Startup Error</Text>
					<Text color="red">{errorMessage || 'Unknown error'}</Text>
					<Text color="blue" dimColor>Press Esc to quit</Text>
				</>
			);
		}

		if (bootState === 'ready' && currentTab === 'Institutions') {
			const tableRows = withEmptyInstitutionRow(institutionRows);

			return (
				<>
					<Text color="#c5c8ff">Institutions Workspace</Text>
					<Text color="#777898">Loaded from local database</Text>
					<Text color="#777898"> </Text>
					<Box width="100%" flexDirection="column">
						<InstitutionsDashboard terminalWidth={terminalWidth} institutionRows={tableRows} />
					</Box>
					<Text color="#777898">Press q to quit</Text>
				</>
			);
		}

		return (
			<>
				<Text color="blueBright">Wealth Planner</Text>
				<Text color="#777898">Hello, {user?.name ?? 'there'}</Text>
				<Text color="#777898">Timezone: {user?.timezone ?? DEFAULT_TIMEZONE}</Text>
				<Text color="#777898">Press q to quit</Text>
			</>
		);
	}, [bootState, currentTab, errorMessage, institutionRows, nameInput, terminalWidth, timezoneInput, user]);

	return (
		<Box
			width={terminalWidth}
			height={terminalHeight}
			flexDirection="column"
			backgroundColor="#161723"
		>
			<Tabs terminalWidth={terminalWidth} currentTab={currentTab} />
			<Box
				width="100%"
				flexGrow={1}
				flexDirection="column"
				justifyContent={currentTab === 'Institutions' ? 'flex-start' : 'center'}
				alignItems={currentTab === 'Institutions' ? 'stretch' : 'center'}
			>
				{content}
				{isAddInstitutionModalOpen && (
					<AddInstitutionModal
						nameInput={addInstitutionNameInput}
						isSaving={isCreatingInstitution}
					/>
				)}
			</Box>
			<BottomBar
				terminalWidth={terminalWidth}
				commandMode={commandMode}
				commandInput={commandInput}
				suggestions={commandSuggestions}
				commandMessage={commandMessage}
				isRunningCommand={isRunningCommand}
			/>
		</Box>
	);
}
