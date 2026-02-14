import dotenv from 'dotenv';

import {createAiProvider} from './providers/index.js';

dotenv.config({quiet: true});

const DEFAULT_PROVIDER = 'gemini';

function tryParseJson(value) {
	const text = String(value ?? '').trim();
	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch (_error) {
		return null;
	}
}

function normalizePrompt(prompt) {
	if (typeof prompt === 'string') {
		const trimmed = prompt.trim();
		if (!trimmed) {
			throw new Error('Prompt is required.');
		}
		return trimmed;
	}

	if (prompt && typeof prompt === 'object') {
		const query = String(prompt.query ?? '').trim();
		const data = prompt.json ?? prompt.data ?? null;
		if (!query && data === null) {
			throw new Error('Prompt object must include query or json/data.');
		}

		const parts = [];
		if (query) {
			parts.push(`Query:\n${query}`);
		}
		if (data !== null) {
			parts.push(`Data:\n${JSON.stringify(data, null, 2)}`);
		}
		return parts.join('\n\n');
	}

	throw new Error('Prompt must be a string or object.');
}

export async function askAi({
	prompt,
	provider = DEFAULT_PROVIDER,
	model,
	systemInstruction,
	responseJsonSchema,
	thinkingLevel = 'minimal',
	temperature = 0.1,
	maxOutputTokens
} = {}) {
	const normalizedPrompt = normalizePrompt(prompt);
	const providerApiKey = provider === 'gemini'
		? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
		: null;
	const client = createAiProvider({
		provider,
		apiKey: providerApiKey,
		model
	});

	const result = await client.generate({
		prompt: normalizedPrompt,
		systemInstruction,
		responseJsonSchema,
		thinkingLevel,
		temperature,
		maxOutputTokens
	});

	return {
		provider: client.name,
		model: result.model,
		answer: result.text,
		answerJson: tryParseJson(result.text),
		raw: result.raw
	};
}
