import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { correctSentence, detectSentenceType, expressionsByLanguage, isPunctuationAvailable } from '../src/index.js'

describe('expressionsByLanguage', () => {
	it('exposes exactly the five supported language rule sets', () => {
		assert.deepEqual(Object.keys(expressionsByLanguage).sort(), ['de', 'en', 'es', 'fr', 'ja'])
	})

	it('orders every rule set with a catch-all declarative rule last', () => {
		for (const [language, expressions] of Object.entries(expressionsByLanguage)) {
			assert.ok(expressions.length > 0, `${language} should have at least one rule`)
			const last = expressions[expressions.length - 1]
			assert.equal(last?.type, 'declarative', `${language}'s last rule should be the declarative catch-all`)
		}
	})
})

describe('isPunctuationAvailable', () => {
	it('returns true for every supported language code', () => {
		for (const language of Object.keys(expressionsByLanguage)) {
			assert.equal(isPunctuationAvailable(language), true)
		}
	})

	it('resolves locale variants to their base language', () => {
		assert.equal(isPunctuationAvailable('en-US'), true)
		assert.equal(isPunctuationAvailable('ja-JP'), true)
		assert.equal(isPunctuationAvailable('de-DE'), true)
		assert.equal(isPunctuationAvailable('es-MX'), true)
		assert.equal(isPunctuationAvailable('fr-CA'), true)
	})

	it('returns false for unsupported or malformed language codes', () => {
		assert.equal(isPunctuationAvailable('zh'), false)
		assert.equal(isPunctuationAvailable('xx'), false)
		assert.equal(isPunctuationAvailable(''), false)
		assert.equal(isPunctuationAvailable('e'), false)
	})
})

describe('detectSentenceType', () => {
	it('classifies English sentences', () => {
		assert.equal(detectSentenceType('what is your name', 'en'), 'interrogative')
		assert.equal(detectSentenceType('this is amazing', 'en'), 'exclamatory')
		assert.equal(detectSentenceType('the weather is nice', 'en'), 'declarative')
	})

	it('falls back to declarative when nothing matches', () => {
		assert.equal(detectSentenceType('xyz qwerty foobar', 'en'), 'declarative')
	})
})

describe('correctSentence — English', () => {
	it('capitalizes and punctuates declarative sentences', () => {
		assert.equal(correctSentence('hello world', 'en'), 'Hello world.')
	})

	it('capitalizes and punctuates interrogative sentences', () => {
		assert.equal(correctSentence('what is your name', 'en'), 'What is your name?')
		assert.equal(correctSentence('can you send me the report', 'en'), 'Can you send me the report?')
	})

	it('capitalizes and punctuates exclamatory sentences', () => {
		assert.equal(correctSentence('this is amazing', 'en'), 'This is amazing!')
	})

	it('defaults to English when no language is given', () => {
		assert.equal(correctSentence('hello world'), 'Hello world.')
		assert.equal(correctSentence('what is that'), 'What is that?')
	})

	it('leaves already-punctuated sentences untouched', () => {
		assert.equal(correctSentence('already punctuated.', 'en'), 'Already punctuated.')
		assert.equal(correctSentence('already has question?', 'en'), 'Already has question?')
		assert.equal(correctSentence('already has exclamation!', 'en'), 'Already has exclamation!')
	})

	it('only capitalizes for unsupported languages, without adding punctuation', () => {
		assert.equal(correctSentence('hello world', 'xx' as never), 'Hello world')
	})

	it('handles single-character input', () => {
		assert.equal(correctSentence('a', 'en'), 'A.')
	})

	it('returns an empty string for empty or whitespace-only input', () => {
		assert.equal(correctSentence('', 'en'), '')
		assert.equal(correctSentence('   ', 'en'), '')
	})

	it('returns an empty string for nullish input', () => {
		assert.equal(correctSentence(undefined as unknown as string), '')
		assert.equal(correctSentence(null as unknown as string), '')
	})

	it('trims surrounding whitespace', () => {
		assert.equal(correctSentence('  hello there  ', 'en'), 'Hello there.')
	})

	it('only capitalizes the first letter, leaving the rest of the casing alone', () => {
		assert.equal(correctSentence('HELLO WORLD', 'en'), 'HELLO WORLD.')
	})
})

describe('correctSentence — Spanish', () => {
	it('wraps interrogative sentences in ¿ … ?', () => {
		assert.equal(correctSentence('cuál es tu nombre', 'es'), '¿Cuál es tu nombre?')
		assert.equal(correctSentence('dónde vives', 'es'), '¿Dónde vives?')
	})

	it('wraps exclamatory sentences in ¡ … !', () => {
		assert.equal(correctSentence('excelente trabajo', 'es'), '¡Excelente trabajo!')
		assert.equal(correctSentence('qué alegría', 'es'), '¡Qué alegría!')
	})

	it('punctuates declarative sentences with a plain period', () => {
		assert.equal(correctSentence('el clima es agradable', 'es'), 'El clima es agradable.')
	})

	it('leaves already-punctuated sentences untouched', () => {
		assert.equal(correctSentence('¿Ya está listo?', 'es'), '¿Ya está listo?')
		assert.equal(correctSentence('¡Qué bien!', 'es'), '¡Qué bien!')
	})
})

describe('correctSentence — French', () => {
	it('adds a space before the question mark', () => {
		assert.equal(correctSentence('comment vas-tu', 'fr'), 'Comment vas-tu ?')
		assert.equal(correctSentence("qu'est-ce que tu fais", 'fr'), "Qu'est-ce que tu fais ?")
	})

	it('adds a space before the exclamation mark', () => {
		assert.equal(correctSentence('quelle horreur', 'fr'), 'Quelle horreur !')
	})

	it('punctuates declarative sentences with a plain period', () => {
		assert.equal(correctSentence('le temps est agréable', 'fr'), 'Le temps est agréable.')
	})

	it('leaves already-punctuated sentences untouched', () => {
		assert.equal(correctSentence('Déjà ponctué.', 'fr'), 'Déjà ponctué.')
	})
})

describe('correctSentence — German', () => {
	it('punctuates interrogative sentences', () => {
		assert.equal(correctSentence('kannst du mir helfen', 'de'), 'Kannst du mir helfen?')
		assert.equal(correctSentence('bist du müde', 'de'), 'Bist du müde?')
	})

	it('punctuates exclamatory sentences', () => {
		assert.equal(correctSentence('toll, das hast du gut gemacht', 'de'), 'Toll, das hast du gut gemacht!')
	})

	it('punctuates declarative sentences', () => {
		assert.equal(correctSentence('die sonne scheint', 'de'), 'Die sonne scheint.')
	})

	it('leaves already-punctuated sentences untouched', () => {
		assert.equal(correctSentence('Bereits fertig.', 'de'), 'Bereits fertig.')
	})
})

describe('correctSentence — Japanese', () => {
	it('punctuates declarative sentences with 。', () => {
		assert.equal(correctSentence('これはいいです', 'ja'), 'これはいいです。')
	})

	it('punctuates interrogative sentences with ？', () => {
		assert.equal(correctSentence('これはいいですか', 'ja'), 'これはいいですか？')
	})

	it('punctuates exclamatory sentences with ！', () => {
		assert.equal(correctSentence('すごい', 'ja'), 'すごい！')
	})

	it('leaves already-punctuated sentences untouched', () => {
		assert.equal(correctSentence('すでに完了です。', 'ja'), 'すでに完了です。')
	})
})

describe('correctSentence — idempotency', () => {
	const cases: [string, keyof typeof expressionsByLanguage][] = [
		['hello world', 'en'],
		['what is your name', 'en'],
		['this is amazing', 'en'],
		['cuál es tu nombre', 'es'],
		['excelente trabajo', 'es'],
		['comment vas-tu', 'fr'],
		['quelle horreur', 'fr'],
		['kannst du mir helfen', 'de'],
		['toll, das hast du gut gemacht', 'de'],
		['これはいいです', 'ja'],
		['すごい', 'ja']
	]

	for (const [sentence, language] of cases) {
		it(`running twice on "${sentence}" (${language}) is a no-op the second time`, () => {
			const once = correctSentence(sentence, language)
			const twice = correctSentence(once, language)
			assert.equal(once, twice)
		})
	}
})