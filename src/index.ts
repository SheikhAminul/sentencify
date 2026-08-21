/**
 * sentencify — detects sentence type and auto-corrects capitalization/punctuation
 * across multiple languages. Start with {@link correctSentence} for the common case.
 */
export { correctSentence, isPunctuationAvailable } from './auto-symbols.js'
export { default as detectSentenceType } from './type-detection.js'
export { expressionsByLanguage } from './type-detection.js'
export type { SentenceTypeDetectExpressionSets } from './type-detection.js'