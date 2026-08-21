import { de } from './expressions/de.js'
import { en } from './expressions/en.js'
import { es } from './expressions/es.js'
import { fr } from './expressions/fr.js'
import { ja } from './expressions/ja.js'
import { pt } from './expressions/pt.js'

/**
 * Note that the input sentences are always lowercase, trimmed do not contain any punctuation marks.
 * The order of these expressions is critical because the function evaluates them in sequence. Once a rule matches, the rest are ignored for that sentence.
 * Therefore, verify the ordering of the expression so that the correct expression is not accidentally skipped.
 * Also ensure that the regular expressions do not conflict or duplicate each other, and that they are properly sorted.
 * For the regular expressions, combine/group common patterns to avoid repetitive structures and redundant parts.
 * Make sure `SentenceTypeDetectExpressionSets` has all the expressions to cover all possible sentence types and special cases, etc.
 */
interface SentenceTypeDetectExpression {
	expression: RegExp
	type: 'exclamatory' | 'interrogative' | 'declarative'
}

export type SentenceTypeDetectExpressionSets = SentenceTypeDetectExpression[]

/** Sentence-type detection rule sets, keyed by supported language code. */
export const expressionsByLanguage = { en, ja, de, es, fr, pt }

/**
 * Classifies a sentence as `'declarative'`, `'interrogative'`, or `'exclamatory'` by testing
 * it against the ordered rule set for the given language (see {@link expressionsByLanguage}).
 * The first matching rule wins; if nothing matches, the sentence is treated as declarative.
 *
 * @param sentence - The sentence to classify. Rules are written for lowercase, unpunctuated
 *   input (how {@link correctSentence} calls this internally), but any string is accepted.
 * @param language - One of the supported language keys: `'en' | 'ja' | 'de' | 'es' | 'fr'`.
 * @returns `'declarative' | 'interrogative' | 'exclamatory'`
 *
 * @example
 * detectSentenceType('what is your name', 'en') // 'interrogative'
 * detectSentenceType('this is amazing', 'en') // 'exclamatory'
 * detectSentenceType('the weather is nice', 'en') // 'declarative'
 */
const detectSentenceType = (sentence: string, language: keyof typeof expressionsByLanguage): 'exclamatory' | 'interrogative' | 'declarative' => {
	const expressions = expressionsByLanguage[language]
	for (const { expression, type } of expressions) {
		if (expression.test(sentence)) return type
	}
	return 'declarative'
}

export default detectSentenceType