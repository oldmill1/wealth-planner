export const DEMO_INSTITUTIONS = [
	{
		id: 'inst_demo_bank_1',
		type: 'BANK',
		name: 'First National Bank Checking',
		status: 'CONNECTED',
		balance: '$12,480',
		lastUpdated: '2m ago',
		accountMask: '...9034'
	},
	{
		id: 'inst_demo_cc_1',
		type: 'CREDIT_CARD',
		name: 'Capital One MasterCard',
		status: 'NEEDS_ATTENTION',
		balance: '$1,204',
		lastUpdated: '45m ago',
		accountMask: '...5501'
	},
	{
		id: 'inst_demo_bank_2',
		type: 'BANK',
		name: 'Velocity Savings',
		status: 'CONNECTED',
		balance: '$44,920',
		lastUpdated: '1h ago',
		accountMask: '...1188'
	}
];

export const DEFAULT_COMMAND_REGISTRY = {
	version: 1,
	commands: {
		clean_db: {
			description: 'Backup then remove the local main database file.'
		},
		backup_db: {
			description: 'Create timestamped backups for local database files.'
		},
		add_deposit_account: {
			description: 'Create a new deposit account for the active user.'
		},
		add_credit_account: {
			description: 'Create a new credit account for the active user.'
		},
			upload_csv: {
				description: 'Import transactions from a CSV file into an account.'
			},
			switch: {
				description: 'Switch transaction view to one institution or back to all.'
			},
			search: {
				description: 'Search transactions in the current tab by category path.'
			},
		clear: {
			description: 'Clear the active transaction search filter.'
		}
	}
};
