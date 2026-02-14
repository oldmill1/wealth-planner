import {askAi} from './index.js';

const DEFAULT_CATEGORY_ID = 'uncategorized';
const DEFAULT_CATEGORY_PATH = 'Uncategorized';
const DEFAULT_BATCH_SIZE = 100;
const CONFIDENCE_THRESHOLD = 0.7;

function slugifySegment(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeCategoryPath(rawPath) {
	const normalized = String(rawPath ?? '').trim();
	if (!normalized) {
		return [];
	}

	return normalized
		.split('>')
		.map((segment) => String(segment ?? '').replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function toCategoryId(pathSegments) {
	const slugSegments = pathSegments
		.map(slugifySegment)
		.filter(Boolean);
	if (slugSegments.length === 0) {
		return DEFAULT_CATEGORY_ID;
	}
	return slugSegments.join('.');
}

function seedCategoriesById(existingCategories) {
	const byId = new Map();
	byId.set(DEFAULT_CATEGORY_ID, {
		id: DEFAULT_CATEGORY_ID,
		name: 'Uncategorized',
		parent_id: null
	});

	for (const item of existingCategories ?? []) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const id = String(item.id ?? '').trim().toLowerCase();
		const name = String(item.name ?? '').trim();
		const parentId = item.parent_id == null ? null : String(item.parent_id).trim().toLowerCase();
		if (!id || !name) {
			continue;
		}
		byId.set(id, {id, name, parent_id: parentId || null});
	}

	return byId;
}

function chunkArray(items, size) {
	const chunks = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function buildCategoryReferenceList(existingCategories) {
	return Array.from(existingCategories ?? []).map((item) => ({
		id: item.id,
		name: item.name,
		parent_id: item.parent_id
	}));
}

function buildAiBatchPayload(batch) {
	return batch.map((transaction) => ({
		transaction_id: transaction.id,
		description_raw: transaction.description_raw,
		amount_cents: transaction.amount_cents,
		posted_at: transaction.posted_at
	}));
}

function getAssignmentsFromAnswer(answerJson) {
	if (!answerJson || typeof answerJson !== 'object') {
		return [];
	}
	if (!Array.isArray(answerJson.assignments)) {
		return [];
	}
	return answerJson.assignments;
}

function upsertPathCategories(categoriesById, pathSegments) {
	if (pathSegments.length === 0) {
		return DEFAULT_CATEGORY_PATH;
	}

	let parentId = null;
	let lastId = DEFAULT_CATEGORY_ID;
	const partialPath = [];
	for (const rawName of pathSegments) {
		partialPath.push(rawName);
		const id = toCategoryId(partialPath);
		const name = rawName;
		if (!categoriesById.has(id)) {
			categoriesById.set(id, {id, name, parent_id: parentId});
		}
		lastId = id;
		parentId = id;
	}

	return pathSegments.join(' > ');
}

export async function categorizeTransactionsInBatches({
	transactions,
	existingCategories = [],
	batchSize = DEFAULT_BATCH_SIZE
}) {
	const safeTransactions = Array.isArray(transactions) ? transactions : [];
	if (safeTransactions.length === 0) {
		return {
			transactions: [],
			categories: buildCategoryReferenceList(seedCategoriesById(existingCategories).values()),
			summary: {
				total: 0,
				categorized: 0,
				uncategorized: 0,
				batchCount: 0
			}
		};
	}

	const categoriesById = seedCategoriesById(existingCategories);
	const batches = chunkArray(safeTransactions, Math.max(1, batchSize));
	let categorizedCount = 0;

	for (const batch of batches) {
		const response = await askAi({
			prompt: {
				query:
					'Assign each transaction to a category path using the format "X > Y > Z". ' +
					'Reuse existing categories when they clearly match; otherwise propose a new path. ' +
					'If confidence is below 0.70, use "Uncategorized". Return all transaction IDs.',
				json: {
					transactions: buildAiBatchPayload(batch),
					existing_categories: buildCategoryReferenceList(categoriesById.values())
				}
			},
			systemInstruction:
				'You are a transaction categorization engine. ' +
				'Use the provided transaction fields to infer spend type. ' +
				'You may create new hierarchical category paths. ' +
				'Return one assignment per transaction ID. ' +
				'When uncertain, choose "Uncategorized".',
			responseJsonSchema: {
				type: 'object',
				properties: {
					assignments: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								transaction_id: {type: 'string'},
								category_path: {type: 'string'},
								confidence: {type: 'number', minimum: 0, maximum: 1}
							},
							required: ['transaction_id', 'category_path', 'confidence']
						}
					}
				},
				required: ['assignments']
			},
			thinkingLevel: 'minimal',
			temperature: 0.1
		});

		const assignmentByTransactionId = new Map(
			getAssignmentsFromAnswer(response.answerJson).map((assignment) => [
				String(assignment.transaction_id ?? ''),
				assignment
			])
		);

		for (const transaction of batch) {
			const assignment = assignmentByTransactionId.get(transaction.id);
			const confidence = Number(assignment?.confidence ?? 0);
			const pathSegments = normalizeCategoryPath(assignment?.category_path);
			const isUncategorizedPath = pathSegments.length === 1 &&
				pathSegments[0].toLowerCase() === 'uncategorized';

			if (!assignment || confidence < CONFIDENCE_THRESHOLD || pathSegments.length === 0 || isUncategorizedPath) {
				transaction.category_path = DEFAULT_CATEGORY_PATH;
				continue;
			}

			transaction.category_path = upsertPathCategories(categoriesById, pathSegments);
			categorizedCount += 1;
		}
	}

	return {
		transactions: safeTransactions,
		categories: buildCategoryReferenceList(categoriesById.values()),
		summary: {
			total: safeTransactions.length,
			categorized: categorizedCount,
			uncategorized: safeTransactions.length - categorizedCount,
			batchCount: batches.length
		}
	};
}
