import detectSentenceType, { expressionsByLanguage } from './type-detection.js'

type SupportedLanguage = keyof typeof expressionsByLanguage

const fixPunctuationRules: Record<SupportedLanguage, Record<'declarative' | 'interrogative' | 'exclamatory', (s: string) => string>> = {
	en: {
		declarative: sentence => `${sentence}.`,
		interrogative: sentence => `${sentence}?`,
		exclamatory: sentence => `${sentence}!`
	},
	ja: {
		declarative: sentence => `${sentence}。`,
		interrogative: sentence => `${sentence}？`,
		exclamatory: sentence => `${sentence}！`
	},
	de: {
		declarative: sentence => `${sentence}.`,
		interrogative: sentence => `${sentence}?`,
		exclamatory: sentence => `${sentence}!`
	},
	es: {
		declarative: sentence => `${sentence}.`,
		interrogative: sentence => `¿${sentence}?`,
		exclamatory: sentence => `¡${sentence}!`
	},
	fr: {
		declarative: sentence => `${sentence}.`,
		interrogative: sentence => `${sentence} ?`,
		exclamatory: sentence => `${sentence} !`
	},
	pt: {
		declarative: sentence => `${sentence}.`,
		interrogative: sentence => `${sentence}?`,
		exclamatory: sentence => `${sentence}!`
	}
}

/**
 * Checks whether {@link correctSentence} has punctuation rules for the given language.
 * Matches on the first two characters, so locale variants like `'en-US'` or `'ja-JP'`
 * resolve the same as their base language code.
 *
 * @param language - A language code, e.g. `'en'`, `'en-US'`, `'fr'`.
 * @returns `true` if the language is supported, `false` otherwise.
 *
 * @example
 * isPunctuationAvailable('en') // true
 * isPunctuationAvailable('en-US') // true
 * isPunctuationAvailable('zh') // false
 */
const isPunctuationAvailable = (language: string): boolean => {
	return language.substring(0, 2) in expressionsByLanguage
}

const fixPunctuation = (sentence: string, language: SupportedLanguage = 'en'): string => {
	if (!language || !(language in expressionsByLanguage)) return sentence
	const type = detectSentenceType(sentence, language)
	return fixPunctuationRules[language][type](sentence)
}

const alreadyPunctuated = (sentence: string): boolean => {
	return /[.!?。？！¿¡]$/.test(sentence)
}

const fixCapitalization = (sentence: string): string => {
	return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/**
 * Capitalizes and punctuates a sentence in one call — the main entry point of this library.
 *
 * Behavior:
 * 1. Trims the input; returns `''` for empty/whitespace-only input.
 * 2. Capitalizes the first letter.
 * 3. If the sentence already ends with terminal punctuation (`.`, `!`, `?`, or the
 *    Japanese/Spanish equivalents), it's returned as-is — nothing is double-punctuated.
 * 4. Otherwise, detects the sentence type via {@link detectSentenceType} and appends the
 *    correct mark(s) for `language`, including language-specific forms such as Spanish's
 *    leading `¿`/`¡`.
 *
 * @param sentence - The raw sentence to correct.
 * @param language - Target language for punctuation rules. Defaults to `'en'`. If the
 *   language isn't supported, only capitalization is applied.
 * @returns The corrected sentence.
 *
 * @example
 * correctSentence('hello world') // 'Hello world.'
 * correctSentence('what is your name') // 'What is your name?'
 * correctSentence('this is amazing') // 'This is amazing!'
 * correctSentence('cuál es tu nombre', 'es') // '¿Cuál es tu nombre?'
 * correctSentence('already punctuated.') // 'Already punctuated.'
 */
const correctSentence = (sentence: string, language: SupportedLanguage = 'en'): string => {
	const cleanSentence = sentence?.trim()
	if (!cleanSentence) return cleanSentence ?? ''
	const capitalized = fixCapitalization(cleanSentence)
	if (alreadyPunctuated(capitalized)) return capitalized
	return fixPunctuation(capitalized, language)
}

export { correctSentence, isPunctuationAvailable }