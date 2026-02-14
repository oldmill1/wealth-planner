# Wealth Planner

Simple Textual demo that displays an animated "Hello, World" in the terminal.

## Gemini setup

1. Add `.env` in the project root:

```bash
GEMINI_API_KEY=your_key_here
```

2. Use the provider-agnostic AI service:

```js
import {askAi} from './src/services/ai/index.js';

const result = await askAi({
  prompt: {
    query: 'Suggest a category for this transaction',
    json: {description_raw: 'AMZN MKTP CA', amount_cents: -1468}
  }
});

console.log(result.answer);
```

`askAi` returns `{ provider, model, answer, answerJson, raw }`.

## Run

```bash
python -m pip install -e .
hello-tui
```
