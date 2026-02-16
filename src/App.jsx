import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';

import {AddCreditAccountModal} from './components/AddCreditAccountModal.jsx';
import {AddInstitutionModal} from './components/AddInstitutionModal.jsx';
import {AddTransactionsModal} from './components/AddTransactionsModal.jsx';
import {EditTransactionCategoryModal} from './components/EditTransactionCategoryModal.jsx';
import {DEFAULT_TIMEZONE, TABS} from './constants.js';
import {BottomBar} from './components/BottomBar.jsx';
import {Dashboard, deriveDashboardTransactionView} from './components/Dashboard.jsx';
import {HomeActivityFeed} from './components/HomeActivityFeed.jsx';
import {HomeOverviewPanel} from './components/HomeOverviewPanel.jsx';
import {Tabs} from './components/Tabs.jsx';
import {buildSpendInsights} from './services/analytics/spendInsights.js';
import {
	addInstitutionForUser,
	importTransactionsToDatabase,
	loadOrInitDatabase,
	isValidTimezone,
	previewTransactionsCsvImport,
	saveFirstUser,
	saveUiState,
	updateTransactionCategoryInDatabase
} from './services/database.js';
import {categorizeTransactionsInBatches} from './services/ai/categorizeTransactions.js';
import {executeCommand, loadOrInitCommandRegistry} from './services/commands.js';
import {transactionRepository} from './services/data/index.js';
import {
	DEFAULT_INSTITUTION_FILTER_BY_TAB,
	getInstitutionIdsForTab,
	getInstitutionMatchText,
	normalizeInstitutionFilterByTab,
	parseSwitchQuery
} from './services/institutionSwitch.js';

function mapInstitutionToRow(institution) {
	const updatedAt = institution.updated_at ?? null;

	return {
		id: institution.id,
		userId: institution.user_id,
		type: institution.type,
		name: institution.name,
		balance: '--',
		updatedAt,
		lastUpdated: formatLastUpdated(updatedAt),
		accountMask: '...',
		aliases: institution.aliases && typeof institution.aliases === 'object'
			? institution.aliases
			: {}
	};
}

function formatLastUpdated(updatedAt) {
	if (!updatedAt) {
		return 'unknown';
	}

	const updatedMs = Date.parse(updatedAt);
	if (Number.isNaN(updatedMs)) {
		return 'unknown';
	}

	const diffSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
	if (diffSeconds < 60) {
		return 'just now';
	}
	if (diffSeconds < 3600) {
		return `${Math.floor(diffSeconds / 60)}m ago`;
	}
	if (diffSeconds < 86400) {
		return `${Math.floor(diffSeconds / 3600)}h ago`;
	}

	return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function summarizeActivityMessage(item) {
	const message = String(item?.message ?? '').replace(/\s+/g, ' ').trim();
	const type = String(item?.type ?? '').trim();
	const countFromMetadata = Number(item?.metadata?.transaction_count);
	if (type === 'CSV_IMPORT') {
		const count = Number.isFinite(countFromMetadata) ? countFromMetadata : null;
		if (count !== null) {
			return `Imported ${count} transactions`;
		}
		const match = message.match(/^Imported\s+(\d+)\s+transactions/i);
		if (match) {
			return `Imported ${match[1]} transactions`;
		}
		return 'Imported transactions';
	}
	return message || 'Activity update';
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
			balance: '',
			lastUpdated: '',
			accountMask: '',
			placeholderLabel,
			isPlaceholder: true
		}
	];
}

const TAB_COMMANDS = {
	Home: ['backup_db', 'clean_db'],
	Balances: ['add_deposit_account', 'upload_csv', 'switch', 'search', 'clear'],
	Credit: ['add_credit_account', 'upload_csv', 'switch', 'search', 'clear']
};
const RECENT_TRANSACTIONS_LIMIT = 20;
const ENABLE_SPEND_INSIGHTS = true;

function getCommandNameFromInput(rawInput) {
	const raw = String(rawInput ?? '').trim().replace(/^\/+/, '');
	if (!raw) {
		return '';
	}
	return raw.split(/\s+/, 1)[0] ?? '';
}

function parseCommandInput(rawInput) {
	const raw = String(rawInput ?? '').trim().replace(/^\/+/, '');
	if (!raw) {
		return {commandName: '', argsRaw: ''};
	}
	const firstWhitespace = raw.search(/\s/);
	if (firstWhitespace === -1) {
		return {commandName: raw, argsRaw: ''};
	}
	return {
		commandName: raw.slice(0, firstWhitespace).trim(),
		argsRaw: raw.slice(firstWhitespace + 1).trim()
	};
}

function parseSearchQuery(argsRaw) {
	const trimmed = String(argsRaw ?? '').trim();
	if (!trimmed) {
		return '';
	}
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
			return trimmed.slice(1, -1).trim();
		}
	}
	return trimmed;
}

function isSpaceKeypress(input, key) {
	if (key?.space === true || key?.name === 'space') {
		return true;
	}
	const text = String(input ?? '');
	if (!text) {
		return false;
	}
	return text.codePointAt(0) === 32;
}

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

function mergeCategories(existingCategories, incomingCategories) {
	const byId = new Map(
		(existingCategories ?? []).map((item) => [item.id, item])
	);
	for (const category of incomingCategories ?? []) {
		if (!category || typeof category !== 'object') {
			continue;
		}
		if (!byId.has(category.id)) {
			byId.set(category.id, category);
		}
	}
	return [...byId.values()];
}

function getDatePartsForTimezone(date, timezone) {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone || DEFAULT_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	const parts = formatter.formatToParts(date);
	const year = Number(parts.find((part) => part.type === 'year')?.value);
	const month = Number(parts.find((part) => part.type === 'month')?.value);
	const day = Number(parts.find((part) => part.type === 'day')?.value);
	return {year, month, day};
}

function datePartsToKey({year, month, day}) {
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDateKeyByDays(dateKey, daysDelta) {
	const [year, month, day] = String(dateKey).split('-').map((value) => Number(value));
	if (!year || !month || !day) {
		return dateKey;
	}
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() + daysDelta);
	return utcDate.toISOString().slice(0, 10);
}

function computeCashFlowSummary({transactions, timezone, days = 30}) {
	if (!Array.isArray(transactions) || transactions.length === 0) {
		const end = datePartsToKey(getDatePartsForTimezone(new Date(), timezone));
		const start = shiftDateKeyByDays(end, -(days - 1));
		return {
			startDate: start,
			endDate: end,
			inflowCents: 0,
			outflowCents: 0,
			netCents: 0,
			transactionCount: 0
		};
	}

	const endDate = datePartsToKey(getDatePartsForTimezone(new Date(), timezone));
	const startDate = shiftDateKeyByDays(endDate, -(days - 1));
	let inflowCents = 0;
	let outflowCents = 0;
	let transactionCount = 0;

	for (const transaction of transactions) {
		const postedAt = String(transaction?.posted_at ?? '').trim();
		if (!postedAt || postedAt < startDate || postedAt > endDate) {
			continue;
		}

		const amountCents = Number(transaction.amount_cents) || 0;
		if (amountCents > 0) {
			inflowCents += amountCents;
		} else if (amountCents < 0) {
			outflowCents += Math.abs(amountCents);
		}
		transactionCount += 1;
	}

	return {
		startDate,
		endDate,
		inflowCents,
		outflowCents,
		netCents: inflowCents - outflowCents,
		transactionCount
	};
}

export function buildTabTransactionState({
	currentTab,
	accountRows,
	transactions,
	activeTransactionFilter,
	userId,
	userTimezone,
	institutionFilterByTab
}) {
	const currentUserRows = accountRows.filter((row) => row.userId === userId);

	if (currentTab === 'Balances') {
		const allInstitutionRows = currentUserRows.filter((row) => row.type === 'BANK');
		const requestedFilter = String(institutionFilterByTab?.Balances ?? 'all').trim() || 'all';
		const hasRequested = requestedFilter === 'all' || allInstitutionRows.some((row) => row.id === requestedFilter);
		const effectiveFilter = hasRequested ? requestedFilter : 'all';
		const institutionRows = effectiveFilter === 'all'
			? allInstitutionRows
			: allInstitutionRows.filter((row) => row.id === effectiveFilter);
		const institutionIds = institutionRows.map((row) => row.id);
		const allTransactions = transactionRepository.findTransactionsByUserAndInstitutions({
			userId,
			institutionIds,
			sort: 'posted_at_desc',
			transactions
		});
		const recentTransactions = allTransactions.slice(0, RECENT_TRANSACTIONS_LIMIT);
		const displayTransactions = activeTransactionFilter?.type === 'category_search'
			? transactionRepository.findTransactionsByCategorySearch({
				userId,
				institutionIds,
				query: activeTransactionFilter.query,
				sort: 'posted_at_desc',
				transactions
			})
			: recentTransactions;

		return {
			tableRows: withEmptyInstitutionRow(
				institutionRows,
				'Add First Deposit Account',
				'add_first_institution'
			),
			displayTransactions,
			transactionsSectionTitle: activeTransactionFilter?.type === 'category_search'
				? activeTransactionFilter.header
				: 'RECENT TRANSACTIONS',
				cashFlow30d: computeCashFlowSummary({
					transactions: allTransactions,
					timezone: userTimezone,
					days: 30
				}),
				searchLabel: `institution:${effectiveFilter === 'all' ? 'all' : (institutionRows[0]?.name ?? effectiveFilter)}`,
				summaryLabel: 'Balances',
				filter: {
					tab: 'Balances',
					requested: requestedFilter,
					effective: effectiveFilter,
					isValid: hasRequested
				}
			};
	}

	if (currentTab === 'Credit') {
		const allInstitutionRows = currentUserRows.filter((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD');
		const requestedFilter = String(institutionFilterByTab?.Credit ?? 'all').trim() || 'all';
		const hasRequested = requestedFilter === 'all' || allInstitutionRows.some((row) => row.id === requestedFilter);
		const effectiveFilter = hasRequested ? requestedFilter : 'all';
		const institutionRows = effectiveFilter === 'all'
			? allInstitutionRows
			: allInstitutionRows.filter((row) => row.id === effectiveFilter);
		const institutionIds = institutionRows.map((row) => row.id);
		const allTransactions = transactionRepository.findTransactionsByUserAndInstitutions({
			userId,
			institutionIds,
			sort: 'posted_at_desc',
			transactions
		});
		const recentTransactions = allTransactions.slice(0, RECENT_TRANSACTIONS_LIMIT);
		const displayTransactions = activeTransactionFilter?.type === 'category_search'
			? transactionRepository.findTransactionsByCategorySearch({
				userId,
				institutionIds,
				query: activeTransactionFilter.query,
				sort: 'posted_at_desc',
				transactions
			})
			: recentTransactions;

		return {
			tableRows: withEmptyInstitutionRow(
				institutionRows,
				'Add First Credit Card',
				'add_first_credit_card'
			),
			displayTransactions,
			transactionsSectionTitle: activeTransactionFilter?.type === 'category_search'
				? activeTransactionFilter.header
				: 'RECENT TRANSACTIONS',
				cashFlow30d: null,
				searchLabel: `credit_card:${effectiveFilter === 'all' ? 'all' : (institutionRows[0]?.name ?? effectiveFilter)}`,
				summaryLabel: 'Credit Cards',
				filter: {
					tab: 'Credit',
					requested: requestedFilter,
					effective: effectiveFilter,
					isValid: hasRequested
				}
			};
	}

	return null;
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
	const [activeTransactionFilter, setActiveTransactionFilter] = useState(null);
	const [transactionPageIndex, setTransactionPageIndex] = useState(0);
	const [isTransactionFocusMode, setIsTransactionFocusMode] = useState(false);
	const [focusedTransactionIndex, setFocusedTransactionIndex] = useState(0);
	const [isEditTransactionCategoryModalOpen, setIsEditTransactionCategoryModalOpen] = useState(false);
	const [editTransactionCategoryInput, setEditTransactionCategoryInput] = useState('');
	const [editingTransaction, setEditingTransaction] = useState(null);
	const [isSavingTransactionCategory, setIsSavingTransactionCategory] = useState(false);
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
	const [transactions, setTransactions] = useState([]);
	const [categories, setCategories] = useState([]);
	const [userActivities, setUserActivities] = useState([]);
	const [institutionFilterByTab, setInstitutionFilterByTab] = useState(DEFAULT_INSTITUTION_FILTER_BY_TAB);
	const transactionCategorizationRunRef = useRef(0);
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
	const commandNameInput = useMemo(
		() => getCommandNameFromInput(commandInput),
		[commandInput]
	);
	const commandSuggestions = useMemo(() => {
		return availableCommands.filter((command) => fuzzyMatch(commandNameInput, command));
	}, [availableCommands, commandNameInput]);
	const selectedSuggestion = commandSuggestions[selectedSuggestionIndex] ?? commandSuggestions[0] ?? null;
	const activeTabTransactionState = useMemo(() => (
		buildTabTransactionState({
			currentTab,
			accountRows,
			transactions,
			activeTransactionFilter,
			userId: user?.id,
			userTimezone: user?.timezone,
			institutionFilterByTab
		})
	), [currentTab, accountRows, transactions, activeTransactionFilter, user?.id, user?.timezone, institutionFilterByTab]);
	const homeCreditInstitutionIds = useMemo(() => (
		accountRows
			.filter((row) => row.userId === user?.id)
			.filter((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD')
			.map((row) => row.id)
	), [accountRows, user?.id]);
	const homeSpendInsights = useMemo(() => {
		if (!ENABLE_SPEND_INSIGHTS || !user?.id || homeCreditInstitutionIds.length === 0) {
			return null;
		}
		return buildSpendInsights({
			transactions,
			userId: user.id,
			institutionIds: homeCreditInstitutionIds
		});
	}, [transactions, user?.id, homeCreditInstitutionIds]);
	const creditSpendInsights = useMemo(() => {
		if (!ENABLE_SPEND_INSIGHTS || !user?.id || currentTab !== 'Credit' || !activeTabTransactionState) {
			return null;
		}
		const scopedInstitutionIds = (activeTabTransactionState.tableRows ?? [])
			.filter((row) => !row.isPlaceholder)
			.map((row) => row.id)
			.filter(Boolean);
		if (scopedInstitutionIds.length === 0) {
			return null;
		}
		return buildSpendInsights({
			transactions,
			userId: user.id,
			institutionIds: scopedInstitutionIds
		});
	}, [transactions, user?.id, currentTab, activeTabTransactionState]);
	const transactionFocusContext = useMemo(() => {
		if (!activeTabTransactionState || bootState !== 'ready') {
			return {
				visibleTransactionRows: [],
				hasFocusableTransactions: false,
				totalPages: 1,
				currentPageIndex: 0
			};
		}
		const view = deriveDashboardTransactionView({
			terminalHeight,
			accountRows: activeTabTransactionState.tableRows,
			transactionRows: activeTabTransactionState.displayTransactions,
			transactionPageIndex,
			showSpendInsights: Boolean(ENABLE_SPEND_INSIGHTS && currentTab === 'Credit')
		});
		return {
			visibleTransactionRows: view.visibleTransactionRows,
			hasFocusableTransactions: view.visibleTransactionRows.length > 0,
			totalPages: view.totalPages,
			currentPageIndex: view.currentPageIndex
		};
	}, [activeTabTransactionState, bootState, terminalHeight, transactionPageIndex, currentTab]);

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
		setTransactionPageIndex(0);
	}, [currentTab, activeTransactionFilter, transactions.length, terminalHeight, institutionFilterByTab]);

	useEffect(() => {
		setIsTransactionFocusMode(false);
		setFocusedTransactionIndex(0);
		setIsEditTransactionCategoryModalOpen(false);
		setEditTransactionCategoryInput('');
		setEditingTransaction(null);
		setIsSavingTransactionCategory(false);
	}, [currentTab]);

	useEffect(() => {
		if (!isTransactionFocusMode) {
			return;
		}
		const rows = transactionFocusContext.visibleTransactionRows;
		if (rows.length === 0) {
			setIsTransactionFocusMode(false);
			setFocusedTransactionIndex(0);
			return;
		}
		if (focusedTransactionIndex >= rows.length) {
			setFocusedTransactionIndex(0);
		}
	}, [isTransactionFocusMode, focusedTransactionIndex, transactionFocusContext.visibleTransactionRows]);

	useEffect(() => {
		if (!activeTabTransactionState?.filter) {
			return;
		}
		if (activeTabTransactionState.filter.isValid) {
			return;
		}
		const tab = activeTabTransactionState.filter.tab;
		setInstitutionFilterByTab((prev) => {
			const next = normalizeInstitutionFilterByTab(prev);
			if (next[tab] === 'all') {
				return next;
			}
			next[tab] = 'all';
			saveUiState({institutionFilterByTab: next}).catch(() => {});
			return next;
		});
		setCommandMessage(`Institution filter reset in ${tab} because that account is no longer available.`);
	}, [activeTabTransactionState]);

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
					setTransactions(bios.transactions ?? []);
					setCategories(bios.categories ?? []);
					setUserActivities(bios.userActivity ?? []);
					setInstitutionFilterByTab(normalizeInstitutionFilterByTab(bios.uiState?.institution_filter_by_tab));
					if (Number(bios.warnings?.skippedTransactions) > 0) {
						setCommandMessage(
							`Skipped ${bios.warnings.skippedTransactions} orphaned transactions during SQLite account migration.`
						);
					} else if (bios.warnings?.sqliteMissingImportedTransactions) {
						setCommandMessage(
							'Warning: imports exist in activity, but SQLite has 0 transactions. ' +
							'Close external DB tools and restart to reconnect the same DB file.'
						);
					}
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

		if (isEditTransactionCategoryModalOpen) {
			if (key.escape) {
				setIsEditTransactionCategoryModalOpen(false);
				setEditTransactionCategoryInput('');
				setEditingTransaction(null);
				setIsSavingTransactionCategory(false);
				return;
			}

			if (key.return) {
				const trimmedCategoryPath = editTransactionCategoryInput.trim();
				if (!trimmedCategoryPath) {
					setCommandMessage('Category is required.');
					return;
				}
				if (!editingTransaction?.id) {
					setCommandMessage('No transaction selected.');
					setIsEditTransactionCategoryModalOpen(false);
					setEditTransactionCategoryInput('');
					setEditingTransaction(null);
					return;
				}

				setIsSavingTransactionCategory(true);
				updateTransactionCategoryInDatabase({
					transactionId: editingTransaction.id,
					categoryPath: trimmedCategoryPath
				})
					.then((result) => {
						const updatedTransaction = result?.transaction ?? null;
						if (!updatedTransaction) {
							throw new Error('Updated transaction missing from response.');
						}
						setTransactions((prev) => prev.map((item) => (
							item.id === updatedTransaction.id ? updatedTransaction : item
						)));
						setCategories(result?.categories ?? []);
						setCommandMessage('Transaction category updated.');
						setIsEditTransactionCategoryModalOpen(false);
						setEditTransactionCategoryInput('');
						setEditingTransaction(null);
					})
					.catch((error) => {
						setCommandMessage(`Failed to update category: ${error.message}`);
					})
					.finally(() => {
						setIsSavingTransactionCategory(false);
					});
				return;
			}

			if (key.backspace || key.delete) {
				setEditTransactionCategoryInput((prev) => prev.slice(0, -1));
				return;
			}

			if (!key.ctrl && !key.meta && input && input !== '\t') {
				setEditTransactionCategoryInput((prev) => prev + input);
			}
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
					addInstitutionForUser({
						userId: user.id,
						name: composedName,
						type: 'BANK',
						aliases: {
							nickname: trimmedType,
							switch_tokens: [trimmedName, trimmedType]
						}
					})
						.then((institution) => {
							setAccountRows((prev) => [...prev, mapInstitutionToRow(institution)]);
							setCommandMessage(`Institution "${institution.name}" created.`);
						setIsAddInstitutionModalOpen(false);
						setAddInstitutionNameInput('');
						setAddInstitutionTypeInput('');
						setAddInstitutionStep('name');
						setUserActivities((prev) => [
							{
								id: crypto.randomUUID(),
								user_id: user.id,
								datetime: new Date().toISOString(),
								message: 'New Deposit Account Added'
							},
							...prev
						]);
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
					addInstitutionForUser({
						userId: user.id,
						name: composedName,
						type: 'CREDIT',
						aliases: {
							last4: trimmedLastFour,
							switch_tokens: [trimmedInstitutionName, trimmedLastFour]
						}
					})
						.then((account) => {
							setAccountRows((prev) => [...prev, mapInstitutionToRow(account)]);
						setCommandMessage(`Credit account "${account.name}" created.`);
						setIsAddCreditAccountModalOpen(false);
						setCreditInstitutionNameInput('');
						setCreditLastFourInput('');
						setCreditAccountStep('institution');
						setUserActivities((prev) => [
							{
								id: crypto.randomUUID(),
								user_id: user.id,
								datetime: new Date().toISOString(),
								message: 'New Credit Card Added'
							},
							...prev
						]);
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
				transactionCategorizationRunRef.current += 1;
				setIsAddTransactionsModalOpen(false);
				setTransactionImportStep('form');
				setTransactionPreview(null);
				setIsImportingTransactions(false);
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
					const runId = transactionCategorizationRunRef.current + 1;
					transactionCategorizationRunRef.current = runId;
					const selectedInstitution = transactionInstitutionRows[transactionInstitutionIndex];
					previewTransactionsCsvImport({
						userId: user.id,
						institutionId: selectedInstitution.id,
						csvPath: transactionCsvPathInput
					})
						.then(async (preview) => {
							if (runId !== transactionCategorizationRunRef.current) {
								return;
							}
							setTransactionPreview(preview);
							setTransactionImportStep('categorizing');

							const categorized = await categorizeTransactionsInBatches({
								transactions: preview.transactions.map((item) => ({...item})),
								existingCategories: categories,
								batchSize: 100
							});
							if (runId !== transactionCategorizationRunRef.current) {
								return;
							}

							setTransactionPreview({
								...preview,
								transactions: categorized.transactions,
								categories: categorized.categories,
								categorization: categorized.summary
							});
							setTransactionImportStep('preview');
							setCommandMessage(
								`Categorized ${categorized.summary.categorized}/${categorized.summary.total} transactions.`
							);
						})
						.catch((error) => {
							if (runId !== transactionCategorizationRunRef.current) {
								return;
							}
							setTransactionImportStep('form');
							setTransactionPreview(null);
							setCommandMessage(`Preview failed: ${error.message}`);
						})
						.finally(() => {
							if (runId === transactionCategorizationRunRef.current) {
								setIsImportingTransactions(false);
							}
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
							transactions: transactionPreview.transactions,
							categories: transactionPreview.categories ?? categories
						})
							.then((result) => {
								setCommandMessage(
									`Imported ${result.count} transactions into ${result.institutionName ?? selectedInstitution.name}.`
								);
							const nowIso = new Date().toISOString();
							setTransactions((prev) => [...prev, ...transactionPreview.transactions]);
							setCategories((prev) => mergeCategories(prev, result.categories ?? []));
							setUserActivities((prev) => (
								result.activity ? [result.activity, ...prev] : prev
							));
							setAccountRows((prev) => prev.map((item) => (
								item.id === selectedInstitution.id
									? {...item, updatedAt: nowIso, lastUpdated: formatLastUpdated(nowIso)}
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
				const {commandName, argsRaw} = parseCommandInput(commandInput);
				if (!commandName && selectedSuggestion) {
					setCommandInput(selectedSuggestion);
					return;
				}

				let commandToRun = null;
				if (availableCommands.includes(commandName)) {
					commandToRun = commandName;
				} else if (selectedSuggestion) {
					commandToRun = selectedSuggestion;
				}

				if (!commandToRun) {
					setCommandMessage(`No command match for "/${commandName}" in ${currentTab}.`);
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
					transactionCategorizationRunRef.current += 1;
					setTransactionImportStep('form');
					setTransactionPreview(null);
					setIsImportingTransactions(false);
					setIsAddTransactionsModalOpen(true);
					return;
				}

					if (commandToRun === 'search') {
						const query = parseSearchQuery(argsRaw);
					if (!query) {
						setCommandMessage('Please provide a search query. Example: /search "restaurants"');
						return;
					}

						const currentUserRows = accountRows.filter((row) => row.userId === user?.id);
						const institutionIds = getInstitutionIdsForTab(
							currentUserRows,
							currentTab,
							institutionFilterByTab[currentTab]
						);
						const matchedTransactions = transactionRepository.findTransactionsByCategorySearch({
						userId: user?.id,
						institutionIds,
						query,
						sort: 'posted_at_desc',
						transactions
					});
					setActiveTransactionFilter({
						type: 'category_search',
						query,
						header: 'SEARCH RESULTS'
					});
					setFocusedTransactionIndex(0);
					setCommandMessage(
						`Search results: ${matchedTransactions.length} transaction${matchedTransactions.length === 1 ? '' : 's'} for "${query}".`
					);
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
						return;
					}

					if (commandToRun === 'switch') {
						if (!(currentTab === 'Balances' || currentTab === 'Credit')) {
							setCommandMessage('Switch is available only on Balances or Credit.');
							return;
						}
						const query = parseSwitchQuery(argsRaw);
						if (!query) {
							setCommandMessage('Please provide an institution query. Example: /switch "2006" or /switch all');
							return;
						}
						const normalizedQuery = query.toLowerCase();
						const tabRows = accountRows.filter((row) => (
							row.userId === user?.id && (
								currentTab === 'Balances'
									? row.type === 'BANK'
									: (row.type === 'CREDIT' || row.type === 'CREDIT_CARD')
							)
						));
						if (normalizedQuery === 'all') {
							const next = {
								...normalizeInstitutionFilterByTab(institutionFilterByTab),
								[currentTab]: 'all'
							};
							setInstitutionFilterByTab(next);
							saveUiState({institutionFilterByTab: next}).catch((error) => {
								setCommandMessage(`Failed to persist switch filter: ${error.message}`);
							});
							setFocusedTransactionIndex(0);
							setIsTransactionFocusMode(false);
							setCommandMessage(`Switched ${currentTab} view to institution:all.`);
							setCommandMode(false);
							setCommandInput('');
							setSelectedSuggestionIndex(0);
							return;
						}

						const matches = tabRows.filter((row) => getInstitutionMatchText(row).includes(normalizedQuery));
						if (matches.length === 0) {
							setCommandMessage(`No institution matched "${query}".`);
							return;
						}
						if (matches.length > 1) {
							const list = matches.map((row) => row.name).join(', ');
							setCommandMessage(`Multiple institutions matched "${query}": ${list}. Refine /switch query.`);
							return;
						}

						const next = {
							...normalizeInstitutionFilterByTab(institutionFilterByTab),
							[currentTab]: matches[0].id
						};
						setInstitutionFilterByTab(next);
						saveUiState({institutionFilterByTab: next}).catch((error) => {
							setCommandMessage(`Failed to persist switch filter: ${error.message}`);
						});
						setFocusedTransactionIndex(0);
						setIsTransactionFocusMode(false);
						setCommandMessage(`Switched ${currentTab} view to ${matches[0].name}.`);
						setCommandMode(false);
						setCommandInput('');
						setSelectedSuggestionIndex(0);
						return;
					}

					if (commandToRun === 'clear') {
					if (!activeTransactionFilter) {
						setCommandMessage('No active search filter.');
					} else {
						setActiveTransactionFilter(null);
						setFocusedTransactionIndex(0);
						setCommandMessage('Search filter cleared.');
					}
					setCommandMode(false);
					setCommandInput('');
					setSelectedSuggestionIndex(0);
					return;
				}

				setIsRunningCommand(true);
				executeCommand(commandToRun)
					.then((message) => {
						setCommandMessage(message);
						if (commandToRun === 'clean_db') {
							setUser(null);
							setAccountRows([]);
							setTransactions([]);
							setCategories([]);
							setUserActivities([]);
							setInstitutionFilterByTab(DEFAULT_INSTITUTION_FILTER_BY_TAB);
							setActiveTransactionFilter(null);
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
				if ((currentTab === 'Balances' || currentTab === 'Credit') && key.return) {
					if (!transactionFocusContext.hasFocusableTransactions) {
						setCommandMessage('No transactions to select.');
						return;
					}
					if (!isTransactionFocusMode) {
						setIsTransactionFocusMode(true);
						setFocusedTransactionIndex(0);
					} else {
						const selectedTransaction = transactionFocusContext.visibleTransactionRows[focusedTransactionIndex] ?? null;
						if (!selectedTransaction) {
							setCommandMessage('No transaction selected.');
							return;
						}
						setEditingTransaction(selectedTransaction);
						setEditTransactionCategoryInput(selectedTransaction.category_path || 'Uncategorized');
						setIsEditTransactionCategoryModalOpen(true);
					}
					return;
				}

			if ((currentTab === 'Balances' || currentTab === 'Credit') && isTransactionFocusMode && key.escape) {
				setIsTransactionFocusMode(false);
				setFocusedTransactionIndex(0);
				return;
			}

			if ((currentTab === 'Balances' || currentTab === 'Credit') && isTransactionFocusMode && key.downArrow) {
				const rowCount = transactionFocusContext.visibleTransactionRows.length;
				if (rowCount <= 0) {
					setCommandMessage('No transactions to select.');
					return;
				}
				setFocusedTransactionIndex((prev) => (prev + 1) % rowCount);
				return;
			}

			if ((currentTab === 'Balances' || currentTab === 'Credit') && isTransactionFocusMode && String(input ?? '').toLowerCase() === 's') {
				const rowCount = transactionFocusContext.visibleTransactionRows.length;
				if (rowCount <= 0) {
					setCommandMessage('No transactions to select.');
					return;
				}
				setFocusedTransactionIndex((prev) => (prev + 1) % rowCount);
				return;
			}

			if ((currentTab === 'Balances' || currentTab === 'Credit') && isTransactionFocusMode && key.upArrow) {
				const rowCount = transactionFocusContext.visibleTransactionRows.length;
				if (rowCount <= 0) {
					setCommandMessage('No transactions to select.');
					return;
				}
				setFocusedTransactionIndex((prev) => (prev - 1 + rowCount) % rowCount);
				return;
			}

			if ((currentTab === 'Balances' || currentTab === 'Credit') && isTransactionFocusMode && String(input ?? '').toLowerCase() === 'w') {
				const rowCount = transactionFocusContext.visibleTransactionRows.length;
				if (rowCount <= 0) {
					setCommandMessage('No transactions to select.');
					return;
				}
				setFocusedTransactionIndex((prev) => (prev - 1 + rowCount) % rowCount);
				return;
			}

			if (isSpaceKeypress(input, key) && (currentTab === 'Balances' || currentTab === 'Credit')) {
				if (isTransactionFocusMode) {
					setFocusedTransactionIndex(0);
				}
				const totalPages = Number(transactionFocusContext.totalPages) || 1;
				setTransactionPageIndex((prev) => ((prev + 1) % Math.max(1, totalPages)));
				return;
			}
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
						setTransactions([]);
							setCategories([]);
							setUserActivities([]);
							setInstitutionFilterByTab(DEFAULT_INSTITUTION_FILTER_BY_TAB);
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
		const depositAccounts = currentUserRows.filter((row) => row.type === 'BANK').length;
		const creditAccounts = currentUserRows.filter((row) => row.type === 'CREDIT' || row.type === 'CREDIT_CARD').length;
		const totalAccounts = currentUserRows.length;
		const userTransactions = transactions.filter((item) => item.user_id === user?.id);
		const totalTransactions = userTransactions.length;
		const tabInstitutionIds = new Set(
			(activeTabTransactionState?.tableRows ?? [])
				.filter((row) => !row.isPlaceholder)
				.map((row) => row.id)
				.filter(Boolean)
		);
		const scopedActivities = userActivities
			.filter((item) => item.user_id === user?.id)
			.filter((item) => {
				if (currentTab !== 'Balances' && currentTab !== 'Credit') {
					return true;
				}
				const institutionId = String(item?.metadata?.institution_id ?? '').trim();
				return institutionId ? tabInstitutionIds.has(institutionId) : false;
			});
		const feedItems = scopedActivities
			.sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))
			.slice(0, 6)
			.map((item) => ({
				id: item.id,
				message: summarizeActivityMessage(item),
				relativeTime: formatLastUpdated(item.datetime)
			}));
		const homeTopCategory = homeSpendInsights?.topCategories?.[0] ?? null;
		const homeMonthTrend = homeSpendInsights?.monthTrend ?? [];
		const homeCurrentMonth = homeMonthTrend[homeMonthTrend.length - 1] ?? null;
		const homePreviousMonth = homeMonthTrend[homeMonthTrend.length - 2] ?? null;
		const homeRecurringTotal = (homeSpendInsights?.recurring ?? [])
			.reduce((sum, item) => sum + (Number(item?.totalSpendCents) || 0), 0);
		const homeInsightCard = {
			topCategoryPath: homeTopCategory?.categoryPath ?? '',
			topCategoryPct: Number(homeTopCategory?.pctOfSpend) || 0,
			currentMonthSpendCents: Number(homeCurrentMonth?.spendCents) || 0,
			previousMonthSpendCents: Number(homePreviousMonth?.spendCents) || 0,
			recurringTotalCents: homeRecurringTotal
		};

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
			const tableState = activeTabTransactionState;
			if (!tableState) {
				return null;
			}
			const availableWidth = Math.max(81, terminalWidth - 4);
			const panelGap = 1;
			let sidebarWidth = Math.max(24, Math.floor(availableWidth * 0.3));
			const maxSidebarWidth = Math.max(24, availableWidth - 56 - panelGap);
			if (sidebarWidth > maxSidebarWidth) {
				sidebarWidth = maxSidebarWidth;
			}
			const contentWidth = Math.max(56, availableWidth - sidebarWidth - panelGap);

			return (
				<>
					<Box width="100%" paddingX={2} flexDirection="row">
						<Box width={contentWidth}>
							<Dashboard
								terminalWidth={contentWidth}
								terminalHeight={terminalHeight}
								accountRows={tableState.tableRows}
								transactionRows={tableState.displayTransactions}
								visibleTransactionRows={transactionFocusContext.visibleTransactionRows}
								transactionsSectionTitle={tableState.transactionsSectionTitle}
								transactionPageIndex={transactionPageIndex}
								isTransactionFocusMode={isTransactionFocusMode}
								focusedTransactionIndex={focusedTransactionIndex}
								searchLabel={tableState.searchLabel}
								summaryLabel={tableState.summaryLabel}
								hasBalances={hasBalances}
								hasCredits={hasCredits}
								cashFlow30d={tableState.cashFlow30d}
								leftPaneRatio={1}
								showSpendInsights={false}
							/>
						</Box>
						<Box width={1} />
						<HomeActivityFeed activities={feedItems} width={sidebarWidth} />
					</Box>
				</>
			);
		}

		if (bootState === 'ready' && currentTab === 'Credit') {
			const tableState = activeTabTransactionState;
			if (!tableState) {
				return null;
			}
			const availableWidth = Math.max(81, terminalWidth - 4);
			const panelGap = 1;
			let sidebarWidth = Math.max(24, Math.floor(availableWidth * 0.3));
			const maxSidebarWidth = Math.max(24, availableWidth - 56 - panelGap);
			if (sidebarWidth > maxSidebarWidth) {
				sidebarWidth = maxSidebarWidth;
			}
			const contentWidth = Math.max(56, availableWidth - sidebarWidth - panelGap);

			return (
				<>
					<Box width="100%" paddingX={2} flexDirection="row">
						<Box width={contentWidth}>
							<Dashboard
								terminalWidth={contentWidth}
								terminalHeight={terminalHeight}
								accountRows={tableState.tableRows}
								transactionRows={tableState.displayTransactions}
								visibleTransactionRows={transactionFocusContext.visibleTransactionRows}
								transactionsSectionTitle={tableState.transactionsSectionTitle}
								transactionPageIndex={transactionPageIndex}
								isTransactionFocusMode={isTransactionFocusMode}
								focusedTransactionIndex={focusedTransactionIndex}
								searchLabel={tableState.searchLabel}
								summaryLabel={tableState.summaryLabel}
								hasBalances={hasBalances}
								hasCredits={hasCredits}
								leftPaneRatio={1}
								spendInsights={creditSpendInsights}
								showSpendInsights={Boolean(ENABLE_SPEND_INSIGHTS)}
							/>
						</Box>
						<Box width={1} />
						<HomeActivityFeed activities={feedItems} width={sidebarWidth} />
					</Box>
				</>
			);
		}

		return (
			<Box width="100%" paddingX={2} flexDirection="row" justifyContent="center">
				<HomeOverviewPanel
					userName={user?.name ?? 'there'}
					totalAccounts={totalAccounts}
					depositAccounts={depositAccounts}
					creditAccounts={creditAccounts}
					totalTransactions={totalTransactions}
					spendInsight={homeInsightCard}
				/>
				<Box width={1} />
				<HomeActivityFeed activities={feedItems} />
			</Box>
		);
	}, [
		activeTabTransactionState,
		bootState,
		currentTab,
		errorMessage,
		accountRows,
		focusedTransactionIndex,
		isTransactionFocusMode,
		nameInput,
		transactionPageIndex,
		terminalHeight,
		terminalWidth,
		timezoneInput,
		transactionFocusContext.visibleTransactionRows,
		transactions,
		user,
		userActivities,
		homeSpendInsights,
		creditSpendInsights
	]);

	const selectedFocusedTransaction = isTransactionFocusMode
		? transactionFocusContext.visibleTransactionRows[focusedTransactionIndex] ?? null
		: null;
	const uiStatusMessage = isTransactionFocusMode
		? (
			selectedFocusedTransaction
				? `Selected: ${String(selectedFocusedTransaction.description_raw ?? '').trim() || '(no description)'}`
				: 'No transactions to select.'
		)
		: commandMessage;
	const isOverlayModalOpen = (
		isEditTransactionCategoryModalOpen ||
		isAddInstitutionModalOpen ||
		isAddCreditAccountModalOpen ||
		isAddTransactionsModalOpen
	);

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
				{!isOverlayModalOpen && content}
				{isOverlayModalOpen && (
					<Box width="100%" flexGrow={1} justifyContent="center" alignItems="center">
						{isEditTransactionCategoryModalOpen && (
							<EditTransactionCategoryModal
								transaction={editingTransaction}
								categoryInput={editTransactionCategoryInput}
								isSaving={isSavingTransactionCategory}
							/>
						)}
						{!isEditTransactionCategoryModalOpen && isAddInstitutionModalOpen && (
							<AddInstitutionModal
								nameInput={addInstitutionNameInput}
								typeInput={addInstitutionTypeInput}
								step={addInstitutionStep}
								isSaving={isCreatingInstitution}
							/>
						)}
						{!isEditTransactionCategoryModalOpen && !isAddInstitutionModalOpen && isAddCreditAccountModalOpen && (
							<AddCreditAccountModal
								institutionInput={creditInstitutionNameInput}
								lastFourInput={creditLastFourInput}
								step={creditAccountStep}
								isSaving={isCreatingCreditAccount}
							/>
						)}
						{!isEditTransactionCategoryModalOpen && !isAddInstitutionModalOpen && !isAddCreditAccountModalOpen && isAddTransactionsModalOpen && (
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
				)}
			</Box>
			<BottomBar
				terminalWidth={terminalWidth}
				commandMode={commandMode}
				commandInput={commandInput}
				suggestions={commandSuggestions}
				selectedSuggestionIndex={selectedSuggestionIndex}
				commandMessage={uiStatusMessage}
				isRunningCommand={isRunningCommand}
			/>
		</Box>
	);
}
