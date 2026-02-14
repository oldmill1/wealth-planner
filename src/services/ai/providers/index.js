import {createGeminiProvider} from './gemini.js';

export function createAiProvider({provider = 'gemini', apiKey, model} = {}) {
	if (provider === 'gemini') {
		return createGeminiProvider({apiKey, defaultModel: model});
	}

	throw new Error(`Unsupported AI provider: ${provider}`);
}

