import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';

import {AddCreditAccountModal} from './components/AddCreditAccountModal.jsx';
import {AddInstitutionModal} from './components/AddInstitutionModal.jsx';
import {AddTransactionsModal} from './components/AddTransactionsModal.jsx';
import {DEFAULT_TIMEZONE, TABS} from './constants.js';
import {BottomBar} from './components/BottomBar.jsx';
import {Dashboard} from './components/Dashboard.jsx';
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
		userId: institution.user_id,
		type: institution.type,
		name: institution.name,
		status: 'CONNECTED',
		balance: '--',
		lastUpdated: 'just now',
		accountMask: '...'
	};
}

function withEmptyInstitutionRow(rows, placeholderLabel = 'Add First Deposit Account', placeholderId = 'add_first_institution') {
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
	Balances: ['add_deposit_account', 'upload_csv'],
	Credit: ['add_credit_account', 'upload_csv']
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
	const [accountRows, setAccountRows] = useState([]);
	const [isAddInstitutionModalOpen, setIsAddInstitutionModalOpen] = useState(false);
	const [addInstitutionNameInput, setAddInstitutionNameInput] = useState('');
	const [addInstitutionTypeInput, setAddInstitutionTypeInput] = useState('');
	const [addInstitutionStep, setAddInstitutionStep] = useState('name');
	const [isCreatingInstitution, setIsCreatingInstitution] = useState(false);
	const [isAddCreditAccountModalOpen, setIsAddCreditAccountModalOpen] = useState(false);
	const [creditInstitutionNameInput, setCreditInstitutionNameInput] = useState('');
	const [creditLastFourInput, setCreditLastFourInput] = useState('');
	const [creditAccountStep, setCreditAccountStep] = useState('institution');
	const [isCreatingCreditAccount, setIsCreatingCreditAccount] = useState(false);
	const [isAddTransactionsModalOpen, setIsAddTransactionsModalOpen] = useState(false);
	const [transactionInstitutionIndex, setTransactionInstitutionIndex] = useState(0);
	const [transactionCsvPathInput, setTransactionCsvPathInput] = useState('~/Downloads/SIMPLII.csv');
	const [transactionImportStep, setTransactionImportStep] = useState('form');
	const [transactionPreview, setTransactionPreview] = useState(null);
	const [isImportingTransactions, setIsImportingTransactions] = useState(false);
	const uploadTargetTypes = useMemo(() => {
		if (currentTab === 'Balances') {
			return new Set(['BANK']);
		}
		if (currentTab === 'Credit') {
			return new Set(['CREDIT', 'CREDIT_CARD']);
		}
		return null;
	}, [currentTab]);
	const transactionInstitutionRows = useMemo(() => {
		if (!uploadTargetTypes) {
			return [];
		}
		return accountRows.filter((row) => uploadTargetTypes.has(row.type));
	}, [accountRows, uploadTargetTypes]);
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
		setTransactionInstitutionIndex((prev) => {
			if (transactionInstitutionRows.length === 0) {
				return 0;
			}
			return Math.min(prev, transactionInstitutionRows.length - 1);
		});
	}, [transactionInstitutionRows.length]);

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
				setAccountRows((bios.accounts ?? bios.institutions ?? []).map(mapInstitutionToRow));
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
				setAddInstitutionTypeInput('');
				setAddInstitutionStep('name');
				setCommandMessage('Add deposit account cancelled.');
				return;
			}

			if (key.return) {
				const trimmedName = addInstitutionNameInput.trim();
				const trimmedType = addInstitutionTypeInput.trim();
				if (addInstitutionStep === 'name') {
					if (!trimmedName) {
						setCommandMessage('Institution name is required.');
						return;
					}
					setAddInstitutionStep('type');
					return;
				}

				if (!trimmedType) {
					setCommandMessage('Account type is required.');
					return;
				}

				if (!user?.id) {
					setCommandMessage('No active user loaded.');
					setIsAddInstitutionModalOpen(false);
					setAddInstitutionNameInput('');
					setAddInstitutionTypeInput('');
					setAddInstitutionStep('name');
					return;
				}

				setIsCreatingInstitution(true);
				const composedName = `${trimmedName} ${trimmedType} Account`;
				addInstitutionForUser({userId: user.id, name: composedName})
					.then((institution) => {
						setAccountRows((prev) => [...prev, mapInstitutionToRow(institution)]);
						setCommandMessage(`Institution "${institution.name}" created.`);
						setIsAddInstitutionModalOpen(false);
						setAddInstitutionNameInput('');
						setAddInstitutionTypeInput('');
						setAddInstitutionStep('name');
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
				if (addInstitutionStep === 'name') {
					setAddInstitutionNameInput((prev) => prev.slice(0, -1));
				} else {
					setAddInstitutionTypeInput((prev) => prev.slice(0, -1));
				}
				return;
			}

			if (!key.ctrl && !key.meta && input && input !== '\t') {
				if (addInstitutionStep === 'name') {
					setAddInstitutionNameInput((prev) => prev + input);
				} else {
					setAddInstitutionTypeInput((prev) => prev + input);
				}
			}
			return;
		}

		if (isAddCreditAccountModalOpen) {
			if (key.escape) {
				setIsAddCreditAccountModalOpen(false);
				setCreditInstitutionNameInput('');
				setCreditLastFourInput('');
				setCreditAccountStep('institution');
				setCommandMessage('Add credit account cancelled.');
				return;
			}

			if (key.return) {
				const trimmedInstitutionName = creditInstitutionNameInput.trim();
				const trimmedLastFour = creditLastFourInput.trim();
				if (creditAccountStep === 'institution') {
					if (!trimmedInstitutionName) {
						setCommandMessage('Institution name is required.');
						return;
					}
					setCreditAccountStep('last_four');
					return;
				}

				if (!/^\d{4}$/.test(trimmedLastFour)) {
					setCommandMessage('Last 4 must be exactly 4 digits.');
					return;
				}

				if (!user?.id) {
					setCommandMessage('No active user loaded.');
					setIsAddCreditAccountModalOpen(false);
					setCreditInstitutionNameInput('');
					setCreditLastFourInput('');
					setCreditAccountStep('institution');
					return;
				}

				setIsCreatingCreditAccount(true);
				const composedName = `${trimmedInstitutionName} ${trimmedLastFour} Credit Card`;
				addInstitutionForUser({userId: user.id, name: composedName, type: 'CREDIT'})
					.then((account) => {
						setAccountRows((prev) => [...prev, mapInstitutionToRow(account)]);
						setCommandMessage(`Credit account "${account.name}" created.`);
						setIsAddCreditAccountModalOpen(false);
						setCreditInstitutionNameInput('');
						setCreditLastFourInput('');
						setCreditAccountStep('institution');
					})
					.catch((error) => {
						setCommandMessage(`Failed to create credit account: ${error.message}`);
					})
					.finally(() => {
						setIsCreatingCreditAccount(false);
					});
				return;
			}

			if (key.backspace || key.delete) {
				if (creditAccountStep === 'institution') {
					setCreditInstitutionNameInput((prev) => prev.slice(0, -1));
				} else {
					setCreditLastFourInput((prev) => prev.slice(0, -1));
				}
				return;
			}

			if (!key.ctrl && !key.meta && input && input !== '\t') {
				if (creditAccountStep === 'institution') {
					setCreditInstitutionNameInput((prev) => prev + input);
				} else {
					setCreditLastFourInput((prev) => prev + input);
				}
			}
			return;
		}

		if (isAddTransactionsModalOpen) {
			const hasInstitutions = transactionInstitutionRows.length > 0;

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
						(prev - 1 + transactionInstitutionRows.length) % transactionInstitutionRows.length
					));
					return;
				}

				if (key.rightArrow && hasInstitutions) {
					setTransactionInstitutionIndex((prev) => (
						(prev + 1) % transactionInstitutionRows.length
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
					setCommandMessage('Create a matching account first.');
					return;
				}

				if (transactionImportStep === 'form') {
					setIsImportingTransactions(true);
					const selectedInstitution = transactionInstitutionRows[transactionInstitutionIndex];
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
					const selectedInstitution = transactionInstitutionRows[transactionInstitutionIndex];
					importTransactionsToDatabase({
						institutionId: selectedInstitution.id,
						transactions: transactionPreview.transactions
					})
						.then((count) => {
							setCommandMessage(`Imported ${count} transactions.`);
							setAccountRows((prev) => prev.map((item) => (
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

				if (commandToRun === 'add_deposit_account') {
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
					setCommandMessage('');
					setIsAddInstitutionModalOpen(true);
					setAddInstitutionNameInput('');
					setAddInstitutionTypeInput('');
					setAddInstitutionStep('name');
					return;
				}

				if (commandToRun === 'add_credit_account') {
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
					setCommandMessage('');
					setIsAddCreditAccountModalOpen(true);
					setCreditInstitutionNameInput('');
					setCreditLastFourInput('');
					setCreditAccountStep('institution');
					return;
				}

				if (commandToRun === 'upload_csv') {
					if (!uploadTargetTypes) {
						setCommandMessage('CSV upload is available only on Balances or Credit.');
						return;
					}
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
							setAccountRows([]);
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
						setAccountRows([]);
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
		const currentUserRows = accountRows.filter((row) => row.userId === user?.id);
		const hasBalances = currentUserRows.some((row) => row.type === 'BANK');
		const hasCredits = currentUserRows.some((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD');

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

		if (bootState === 'ready' && currentTab === 'Balances') {
			const institutionOnlyRows = currentUserRows.filter((row) => row.type === 'BANK');
			const tableRows = withEmptyInstitutionRow(
				institutionOnlyRows,
				'Add First Deposit Account',
				'add_first_institution'
			);

			return (
				<>
					<Text color="#c5c8ff">Balances Workspace</Text>
					<Text color="#777898">Loaded from local database</Text>
					<Text color="#777898"> </Text>
					<Box width="100%" flexDirection="column">
						<Dashboard
							terminalWidth={terminalWidth}
							accountRows={tableRows}
							searchLabel="institution:all"
							summaryLabel="Balances"
							hasBalances={hasBalances}
							hasCredits={hasCredits}
						/>
					</Box>
					<Text color="#777898">Press q to quit</Text>
				</>
			);
		}

		if (bootState === 'ready' && currentTab === 'Credit') {
			const creditCardRows = currentUserRows.filter((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD');
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
						<Dashboard
							terminalWidth={terminalWidth}
							accountRows={tableRows}
							searchLabel="credit_card:all"
							summaryLabel="Credit Cards"
							hasBalances={hasBalances}
							hasCredits={hasCredits}
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
	}, [bootState, currentTab, errorMessage, accountRows, nameInput, terminalWidth, timezoneInput, user]);

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
				justifyContent={currentTab === 'Balances' || currentTab === 'Credit' ? 'flex-start' : 'center'}
				alignItems={currentTab === 'Balances' || currentTab === 'Credit' ? 'stretch' : 'center'}
			>
				{content}
				{isAddInstitutionModalOpen && (
					<AddInstitutionModal
						nameInput={addInstitutionNameInput}
						typeInput={addInstitutionTypeInput}
						step={addInstitutionStep}
						isSaving={isCreatingInstitution}
					/>
				)}
				{isAddCreditAccountModalOpen && (
					<AddCreditAccountModal
						institutionInput={creditInstitutionNameInput}
						lastFourInput={creditLastFourInput}
						step={creditAccountStep}
						isSaving={isCreatingCreditAccount}
					/>
				)}
				{isAddTransactionsModalOpen && (
					<AddTransactionsModal
						institutions={transactionInstitutionRows}
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
