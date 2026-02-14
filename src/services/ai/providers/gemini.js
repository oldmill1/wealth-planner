import {GoogleGenAI} from '@google/genai';

const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

function normalizeThinkingLevel(value) {
	const allowed = new Set(['minimal', 'low', 'medium', 'high']);
	const normalized = String(value ?? '').trim().toLowerCase();
	return allowed.has(normalized) ? normalized : 'minimal';
}

export function createGeminiProvider({apiKey, defaultModel = DEFAULT_GEMINI_MODEL}) {
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is required.');
	}

	const client = new GoogleGenAI({apiKey});

	return {
		name: 'gemini',
		defaultModel,
		async generate({
			prompt,
			model = defaultModel,
			systemInstruction,
			responseJsonSchema,
			responseMimeType,
			thinkingLevel = 'minimal',
			temperature = 0.1,
			maxOutputTokens
		}) {
			const config = {
				temperature,
				thinkingConfig: {
					thinkingLevel: normalizeThinkingLevel(thinkingLevel)
				}
			};

			if (systemInstruction) {
				config.systemInstruction = systemInstruction;
			}
			if (responseJsonSchema) {
				config.responseMimeType = responseMimeType || 'application/json';
				config.responseJsonSchema = responseJsonSchema;
			}
			if (typeof maxOutputTokens === 'number') {
				config.maxOutputTokens = maxOutputTokens;
			}

			const response = await client.models.generateContent({
				model,
				contents: prompt,
				config
			});

			return {
				model,
				text: response?.text ?? '',
				raw: response
			};
		}
	};
}

