# sentencify

**Detect sentence type and auto-fix punctuation and capitalization** — for English, Japanese, German, Spanish, and French. Zero dependencies, fully typed, ESM-only, under 40&nbsp;KB unpacked.

[![npm version](https://img.shields.io/npm/v/sentencify.svg)](https://www.npmjs.com/package/sentencify)
[![npm downloads](https://img.shields.io/npm/dm/sentencify.svg)](https://www.npmjs.com/package/sentencify)
[![license: MIT](https://img.shields.io/npm/l/sentencify.svg)](./LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](./dist/index.d.ts)

```ts
import { correctSentence } from 'sentencify'

correctSentence('hello world')                // → 'Hello world.'
correctSentence('what is your name')          // → 'What is your name?'
correctSentence('cuál es tu nombre', 'es')    // → '¿Cuál es tu nombre?'
correctSentence('comment vas-tu', 'fr')       // → 'Comment vas-tu ?'
correctSentence('kannst du mir helfen', 'de') // → 'Kannst du mir helfen?'
correctSentence('すごい', 'ja')                 // → 'すごい！'
```

One function call turns raw, lowercase, unpunctuated text into a properly capitalized, correctly punctuated sentence — without an LLM call, a model download, or a network round-trip.

## Why sentencify

Text coming out of speech-to-text pipelines, chat inputs, streamed LLM tokens, and quick user-entry forms is often missing capitalization and terminal punctuation. Asking a language model to fix that is slow and expensive for something this mechanical. `sentencify` does it synchronously, in plain JavaScript, using a rule-based sentence-type classifier — so it's a natural finishing pass to run **after** an LLM completion, a speech-to-text transcript, or any user-generated text, before it's rendered or stored.

- 🧠 **Detects sentence type** — classifies text as `declarative`, `interrogative`, or `exclamatory`.
- ✍️ **Auto-corrects sentences** — capitalizes the first letter and appends the right punctuation mark(s) for the detected type.
- 🌍 **Multilingual punctuation rules** — English, Japanese, German, Spanish (`¿…?` / `¡…!`), and French (with the pre-punctuation space French typography requires).
- 🪶 **Zero runtime dependencies** — pure regex-based logic, nothing to download or initialize.
- 📦 **ESM-only, tree-shakeable, side-effect free** — `"sideEffects": false` in `package.json`.
- 🔒 **Fully typed** — written in TypeScript, ships hand-written JSDoc on every export so hovers and AI coding assistants get real documentation, not just signatures.
- 🧪 **Idempotent** — already-punctuated sentences are returned untouched; running it twice is always safe.

## Installation

```bash
npm install sentencify
```

```bash
pnpm add sentencify
# or
yarn add sentencify
# or
bun add sentencify
```

Requires Node.js 20+ (or any modern bundler/runtime that supports ESM).

## Quick start

```ts
import { correctSentence, detectSentenceType, isPunctuationAvailable } from 'sentencify'

// The all-in-one helper: capitalize + punctuate
correctSentence('hello world')       // 'Hello world.'
correctSentence('what is your name') // 'What is your name?'
correctSentence('this is amazing')   // 'This is amazing!'

// Already-punctuated input passes through unchanged — safe to call repeatedly
correctSentence('Already punctuated.') // 'Already punctuated.'

// Just want the classification, no rewriting?
detectSentenceType('this is amazing', 'en') // 'exclamatory'

// Check language support before you call it
isPunctuationAvailable('es')    // true
isPunctuationAvailable('en-US') // true — locale variants like 'en-US' resolve to 'en'
isPunctuationAvailable('zh')    // false — not supported yet
```

### A realistic use case: cleaning up LLM/voice output

```ts
import { correctSentence } from 'sentencify'

const rawTranscript = 'can you send me the report' // from speech-to-text, no punctuation
const clean = correctSentence(rawTranscript, 'en')
// → 'Can you send me the report?'
```

## API reference

### `correctSentence(sentence, language?)`

The main entry point. Capitalizes the first letter and appends the correct terminal punctuation for the detected sentence type, in one call.

| Parameter  | Type                              | Default | Description |
|------------|------------------------------------|---------|-------------|
| `sentence` | `string`                          | —       | The raw sentence to correct. |
| `language` | `'en' \| 'ja' \| 'de' \| 'es' \| 'fr'` | `'en'`  | Target language for punctuation rules. |

**Returns:** `string` — the corrected sentence, or `''` for empty/whitespace-only input.

Behavior:
1. Trims the input.
2. Capitalizes the first letter.
3. If the sentence already ends with terminal punctuation (`.`, `!`, `?`, or the Japanese/Spanish equivalents `。？！¿¡`), it's returned as-is — never double-punctuated.
4. Otherwise, classifies the sentence with `detectSentenceType` and appends the right mark(s) for `language` — including language-specific forms like Spanish's leading `¿`/`¡` or French's pre-punctuation space (`Vraiment ?`).
5. If `language` isn't one of the supported codes, only capitalization is applied.

### `detectSentenceType(sentence, language)`

Classifies a sentence without rewriting it. Useful if you want the label alone — for routing, analytics, or building your own formatting rules on top.

| Parameter  | Type                              | Description |
|------------|------------------------------------|-------------|
| `sentence` | `string`                          | The sentence to classify. Rules are tuned for lowercase, unpunctuated input (how `correctSentence` calls it internally), but any string works. |
| `language` | `'en' \| 'ja' \| 'de' \| 'es' \| 'fr'` | Which rule set to test against. |

**Returns:** `'declarative' | 'interrogative' | 'exclamatory'`

### `isPunctuationAvailable(language)`

Checks whether punctuation rules exist for a language code before calling `correctSentence` or `detectSentenceType`.

| Parameter  | Type     | Description |
|------------|----------|-------------|
| `language` | `string` | Any language code, e.g. `'en'`, `'en-US'`, `'fr'`. Matched on its first two characters, so locale variants resolve to the base language. |

**Returns:** `boolean`

### `expressionsByLanguage`

The raw, ordered rule sets (`RegExp` + sentence type) used internally, keyed by language code (`en`, `ja`, `de`, `es`, `fr`). Exported for advanced use cases — e.g. building a custom classifier, debugging why a sentence was classified a certain way, or contributing new rules.

### Types

```ts
type SentenceTypeDetectExpressionSets = {
	expression: RegExp
	type: 'exclamatory' | 'interrogative' | 'declarative'
}[]
```

## Supported languages

| Language | Code | Declarative | Interrogative | Exclamatory |
|----------|:----:|:------------|:---------------|:-------------|
| English  | `en` | `Hello world.` | `What is your name?` | `This is amazing!` |
| Japanese | `ja` | `これはいいです。` | `これはいいですか？` | `すごい！` |
| German   | `de` | `Die sonne scheint.` | `Kannst du mir helfen?` | `Das ist toll!` |
| Spanish  | `es` | `El clima es agradable.` | `¿Cuál es tu nombre?` | `¡Excelente trabajo!` |
| French   | `fr` | `Le temps est agréable.` | `Comment vas-tu ?` | `C'est incroyable !` |

Don't see your language? [Open an issue](https://github.com/SheikhAminul/sentencify/issues) or contribute a rule set — see [Contributing](#contributing).

## How it works

`sentencify` doesn't call a model. Each language has an **ordered list** of regular expressions mapped to a sentence type. `detectSentenceType` walks the list for the given language and returns the type of the first rule that matches; if nothing matches, the sentence defaults to `declarative`. `correctSentence` layers capitalization and language-specific punctuation formatting on top of that classification.

This makes the library:
- **Deterministic** — the same input always produces the same output.
- **Fast** — no async calls, no model warm-up, safe to run per-keystroke or per-token.
- **Inspectable** — every rule set is a plain exported array (`expressionsByLanguage`), so you can read exactly why a sentence was classified a certain way.

## Common use cases

- **Post-processing LLM streaming output** that omits trailing punctuation.
- **Cleaning speech-to-text transcripts** before display or storage.
- **Normalizing chat/support-ticket input** for consistent formatting.
- **Auto-formatting form fields** (comments, reviews, short answers) as users type.
- **Lightweight, on-device text QA** where calling an LLM per sentence would be overkill.

## FAQ

**Does sentencify use AI or call any external API?**
No. It's fully rule-based (regex pattern matching) and runs synchronously, offline, with zero network calls or dependencies.

**Is it safe to run on text that's already punctuated?**
Yes. `correctSentence` checks for existing terminal punctuation first and returns the sentence unchanged if it's already there — calling it repeatedly is idempotent.

**What happens if I pass an unsupported language code?**
`correctSentence` still capitalizes the first letter but skips punctuation. Use `isPunctuationAvailable(language)` to check support up front.

**Does it work with locale codes like `en-US` or `ja-JP`?**
Yes — both `correctSentence`/`detectSentenceType` and `isPunctuationAvailable` match on the first two characters of the language code.

**Is this a full grammar checker?**
No. It's a focused, single-purpose tool: sentence-type detection plus capitalization/punctuation correction. It doesn't fix spelling, grammar, or word choice.

**Can I use the rule sets to build my own classifier?**
Yes — `expressionsByLanguage` is a public export. Each entry is `{ expression: RegExp, type: 'declarative' | 'interrogative' | 'exclamatory' }`, evaluated in order.

## Contributing

Issues and pull requests are welcome, especially:
- New language support.
- Edge cases where sentence-type detection or punctuation is wrong.

```bash
npm install
npm run lint         # eslint src
npm run test         # compiles and runs test/index.test.ts
npm run build        # tsup → dist/
npm run verify:package  # lint + test + build
```

When editing a language rule set in `src/expressions/*.ts`, remember: **rule order matters**. Rules are evaluated top-to-bottom and the first match wins, so a new pattern must be placed carefully relative to existing ones (see the comment at the top of `src/type-detection.ts`).

## License

[MIT](./LICENSE) © [Sheikh Aminul Islam](https://github.com/SheikhAminul)
