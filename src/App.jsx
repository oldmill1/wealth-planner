import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';

import {AddInstitutionModal} from './components/AddInstitutionModal.jsx';
import {AddTransactionsModal} from './components/AddTransactionsModal.jsx';
import {DEFAULT_TIMEZONE, TABS} from './constants.js';
import {BottomBar} from './components/BottomBar.jsx';
import {InstitutionsDashboard} from './components/InstitutionsDashboard.jsx';
import {Tabs} from './components/Tabs.jsx';
import {
	addInstitutionForUser,
	importTransactionsToDatabase,
	loadOrInitDatabase,
	isValidTimezone,
	previewTransactionsCsvImport,
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

function withEmptyInstitutionRow(rows, placeholderLabel = 'Add First Institution', placeholderId = 'add_first_institution') {
	if (rows.length > 0) {
		return rows;
	}

	return [
		{
			id: placeholderId,
			type: 'ACTION',
			name: placeholderLabel,
			status: '',
			balance: '',
			lastUpdated: '',
			accountMask: '',
			placeholderLabel,
			isPlaceholder: true
		}
	];
}

const TAB_COMMANDS = {
	Home: ['clean_db'],
	Institutions: ['add_institutions', 'add_transactions'],
	Credit: []
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
	const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
	const [commandMessage, setCommandMessage] = useState('');
	const [isRunningCommand, setIsRunningCommand] = useState(false);
	const [currentTab, setCurrentTab] = useState('Home');
	const [institutionRows, setInstitutionRows] = useState([]);
	const [isAddInstitutionModalOpen, setIsAddInstitutionModalOpen] = useState(false);
	const [addInstitutionNameInput, setAddInstitutionNameInput] = useState('');
	const [isCreatingInstitution, setIsCreatingInstitution] = useState(false);
	const [isAddTransactionsModalOpen, setIsAddTransactionsModalOpen] = useState(false);
	const [transactionInstitutionIndex, setTransactionInstitutionIndex] = useState(0);
	const [transactionCsvPathInput, setTransactionCsvPathInput] = useState('~/Downloads/SIMPLII.csv');
	const [transactionImportStep, setTransactionImportStep] = useState('form');
	const [transactionPreview, setTransactionPreview] = useState(null);
	const [isImportingTransactions, setIsImportingTransactions] = useState(false);
	const availableCommands = useMemo(() => {
		const tabCommands = TAB_COMMANDS[currentTab] ?? [];
		return tabCommands.filter((command) => Object.hasOwn(commands, command));
	}, [commands, currentTab]);
	const commandSuggestions = useMemo(() => {
		const normalized = commandInput.trim().replace(/^\/+/, '');
		return availableCommands.filter((command) => fuzzyMatch(normalized, command));
	}, [availableCommands, commandInput]);
	const selectedSuggestion = commandSuggestions[selectedSuggestionIndex] ?? commandSuggestions[0] ?? null;

	useEffect(() => {
		setSelectedSuggestionIndex(0);
	}, [commandInput, commandSuggestions.length, currentTab]);

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

		if (isAddTransactionsModalOpen) {
			const hasInstitutions = institutionRows.length > 0;

			if (key.escape) {
				setIsAddTransactionsModalOpen(false);
				setTransactionImportStep('form');
				setTransactionPreview(null);
				setCommandMessage('Add transactions cancelled.');
				return;
			}

			if (transactionImportStep === 'form') {
				if (key.leftArrow && hasInstitutions) {
					setTransactionInstitutionIndex((prev) => (
						(prev - 1 + institutionRows.length) % institutionRows.length
					));
					return;
				}

				if (key.rightArrow && hasInstitutions) {
					setTransactionInstitutionIndex((prev) => (
						(prev + 1) % institutionRows.length
					));
					return;
				}
			}

			if (key.return) {
				if (!user?.id) {
					setCommandMessage('No active user loaded.');
					return;
				}
				if (!hasInstitutions) {
					setCommandMessage('Create an institution first.');
					return;
				}

				if (transactionImportStep === 'form') {
					setIsImportingTransactions(true);
					const selectedInstitution = institutionRows[transactionInstitutionIndex];
					previewTransactionsCsvImport({
						userId: user.id,
						institutionId: selectedInstitution.id,
						csvPath: transactionCsvPathInput
					})
						.then((preview) => {
							setTransactionPreview(preview);
							setTransactionImportStep('preview');
						})
						.catch((error) => {
							setCommandMessage(`Preview failed: ${error.message}`);
						})
						.finally(() => {
							setIsImportingTransactions(false);
						});
					return;
				}

				if (transactionImportStep === 'preview') {
					if (!transactionPreview) {
						setCommandMessage('No preview available.');
						return;
					}

					setIsImportingTransactions(true);
					const selectedInstitution = institutionRows[transactionInstitutionIndex];
					importTransactionsToDatabase({
						institutionId: selectedInstitution.id,
						transactions: transactionPreview.transactions
					})
						.then((count) => {
							setCommandMessage(`Imported ${count} transactions.`);
							setInstitutionRows((prev) => prev.map((item) => (
								item.id === selectedInstitution.id
									? {...item, lastUpdated: 'just now'}
									: item
							)));
							setIsAddTransactionsModalOpen(false);
							setTransactionImportStep('form');
							setTransactionPreview(null);
						})
						.catch((error) => {
							setCommandMessage(`Import failed: ${error.message}`);
						})
						.finally(() => {
							setIsImportingTransactions(false);
						});
				}
				return;
			}

			if (transactionImportStep === 'form') {
				if (key.backspace || key.delete) {
					setTransactionCsvPathInput((prev) => prev.slice(0, -1));
					return;
				}

				if (!key.ctrl && !key.meta && input && input !== '\t') {
					setTransactionCsvPathInput((prev) => prev + input);
				}
			}
			return;
		}

		if (commandMode) {
			if (key.escape) {
				setCommandMode(false);
				setCommandInput('');
				setSelectedSuggestionIndex(0);
				setCommandMessage('');
				return;
			}

			if (key.tab || input === '\t') {
				if (commandSuggestions.length > 0) {
					setSelectedSuggestionIndex((prev) => (prev + 1) % commandSuggestions.length);
				}
				return;
			}

			if (key.return) {
				const normalizedCommand = commandInput.trim().replace(/^\/+/, '');
				if (!normalizedCommand) {
					if (selectedSuggestion) {
						setCommandInput(selectedSuggestion);
					}
				}

				let commandToRun = null;
				if (availableCommands.includes(normalizedCommand)) {
					commandToRun = normalizedCommand;
				} else if (selectedSuggestion) {
					commandToRun = selectedSuggestion;
				}

				if (!commandToRun) {
					setCommandMessage(`No command match for "/${normalizedCommand}" in ${currentTab}.`);
					return;
				}

				if (commandToRun === 'add_institutions') {
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
					setCommandMessage('');
					setIsAddInstitutionModalOpen(true);
					setAddInstitutionNameInput('');
					return;
				}

				if (commandToRun === 'add_transactions') {
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
					setCommandMessage('');
					setTransactionInstitutionIndex(0);
					setTransactionImportStep('form');
					setTransactionPreview(null);
					setIsAddTransactionsModalOpen(true);
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
						setSelectedSuggestionIndex(0);
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
			setSelectedSuggestionIndex(0);
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
			const institutionOnlyRows = institutionRows.filter((row) => row.type === 'BANK');
			const tableRows = withEmptyInstitutionRow(
				institutionOnlyRows,
				'Add First Institution',
				'add_first_institution'
			);

			return (
				<>
					<Text color="#c5c8ff">Institutions Workspace</Text>
					<Text color="#777898">Loaded from local database</Text>
					<Text color="#777898"> </Text>
					<Box width="100%" flexDirection="column">
						<InstitutionsDashboard
							terminalWidth={terminalWidth}
							institutionRows={tableRows}
							searchLabel="institution:all"
							summaryLabel="Institutions"
						/>
					</Box>
					<Text color="#777898">Press q to quit</Text>
				</>
			);
		}

		if (bootState === 'ready' && currentTab === 'Credit') {
			const creditCardRows = institutionRows.filter((row) => row.type === 'CREDIT_CARD');
			const tableRows = withEmptyInstitutionRow(
				creditCardRows,
				'Add First Credit Card',
				'add_first_credit_card'
			);

			return (
				<>
					<Text color="#c5c8ff">Credit Workspace</Text>
					<Text color="#777898">Loaded from local database</Text>
					<Text color="#777898"> </Text>
					<Box width="100%" flexDirection="column">
						<InstitutionsDashboard
							terminalWidth={terminalWidth}
							institutionRows={tableRows}
							searchLabel="credit_card:all"
							summaryLabel="Credit Cards"
						/>
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
				justifyContent={currentTab === 'Institutions' || currentTab === 'Credit' ? 'flex-start' : 'center'}
				alignItems={currentTab === 'Institutions' || currentTab === 'Credit' ? 'stretch' : 'center'}
			>
				{content}
				{isAddInstitutionModalOpen && (
					<AddInstitutionModal
						nameInput={addInstitutionNameInput}
						isSaving={isCreatingInstitution}
					/>
				)}
				{isAddTransactionsModalOpen && (
					<AddTransactionsModal
						institutions={institutionRows}
						selectedInstitutionIndex={transactionInstitutionIndex}
						csvPathInput={transactionCsvPathInput}
						step={transactionImportStep}
						preview={transactionPreview}
						isBusy={isImportingTransactions}
					/>
				)}
			</Box>
			<BottomBar
				terminalWidth={terminalWidth}
				commandMode={commandMode}
				commandInput={commandInput}
				suggestions={commandSuggestions}
				selectedSuggestionIndex={selectedSuggestionIndex}
				commandMessage={commandMessage}
				isRunningCommand={isRunningCommand}
			/>
		</Box>
	);
}
