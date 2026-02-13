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
		add_institutions: {
			description: 'Create a new institution for the active user.'
		},
		add_transactions: {
			description: 'Import transactions from a CSV file into an institution.'
		}
	}
};
