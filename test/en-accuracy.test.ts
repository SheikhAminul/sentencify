import { strict as assert } from 'assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectSentenceType } from '../src/index.js'

type SentenceType = 'declarative' | 'interrogative' | 'exclamatory'
type Fixture = [sentence: string, expected: SentenceType]

const sentenceTypes: SentenceType[] = ['declarative', 'interrogative', 'exclamatory']

const fixturesPath = join(dirname(fileURLToPath(import.meta.url)), '../../test/en.json')
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[]

/** Minimum accuracy the current en.ts rule set must keep clearing, so a rule-ordering regression fails loudly instead of silently. */
const minAccuracyPerType = 75
const minOverallAccuracy = 75

describe('detectSentenceType — accuracy against test/en.json', () => {
	it('classifies real-world English sentences and reports accuracy by type', () => {
		const stats = new Map<SentenceType, { total: number; correct: number }>(sentenceTypes.map(type => [type, { total: 0, correct: 0 }]))
		const failures: { sentence: string; expected: SentenceType; actual: SentenceType }[] = []

		for (const [sentence, expected] of fixtures) {
			const actual = detectSentenceType(sentence.toLowerCase().replace(/[.!?]$/, ''), 'en')
			const bucket = stats.get(expected)
			assert.ok(bucket, `Unknown sentence type "${expected}" in test/en.json fixture for: ${sentence}`)
			bucket.total++
			if (actual === expected) bucket.correct++
			else failures.push({ sentence, expected, actual })
		}

		const totalCount = fixtures.length
		const totalCorrect = [...stats.values()].reduce((sum, s) => sum + s.correct, 0)
		const toRow = (total: number, correct: number) => ({
			Total: total,
			Success: correct,
			Fail: total - correct,
			'Accuracy %': total ? ((correct / total) * 100).toFixed(2) : '0.00'
		})

		const table: Record<string, ReturnType<typeof toRow>> = {}
		for (const type of sentenceTypes) {
			const s = stats.get(type)
			assert.ok(s)
			table[type] = toRow(s.total, s.correct)
		}
		table.overall = toRow(totalCount, totalCorrect)

		console.log('\ndetectSentenceType accuracy — test/en.json')
		console.table(table)

		if (failures.length) {
			console.log(`\n${failures.length} misclassified sentence(s):`)
			console.table(failures)
		}

		for (const type of sentenceTypes) {
			const s = stats.get(type)
			assert.ok(s)
			const accuracy = s.total ? (s.correct / s.total) * 100 : 100
			assert.ok(accuracy >= minAccuracyPerType, `${type} accuracy dropped to ${accuracy.toFixed(2)}% (expected >= ${minAccuracyPerType}%)`)
		}

		const overallAccuracy = (totalCorrect / totalCount) * 100
		assert.ok(overallAccuracy >= minOverallAccuracy, `Overall accuracy dropped to ${overallAccuracy.toFixed(2)}% (expected >= ${minOverallAccuracy}%)`)
	})
})

/* PROMPTS TO GENERATE TEST DATA */

/*
Generate test data for a JavaScript library that classifies each input sentence as `"declarative"`, `"interrogative"`, or `"exclamatory"`.

**OUTPUT**
- Output ONLY one flat, valid JSON array. No prose, markdown, comments, trailing commas, or omissions.
- Each item must be `[sentence, type]`.
- Exactly 600 unique entries: 200 of each type.
- Randomly shuffle all entries. Do not group or cycle by type.
- No duplicates or near-duplicates.
- Complete all 600 entries; never stop early or summarize.
**RESEARCH**
Before generating the data, research all relevant scenarios, subtypes, exceptions, and special cases of English declarative, interrogative, and exclamatory sentences.

**CRITICAL CLASSIFICATION RULE**
- Every sentence MUST belong clearly and exclusively to exactly ONE of these three types.
- NEVER include a sentence that could reasonably be classified as more than one type.
- NEVER include interrogative/declarative overlap, interrogative/exclamatory overlap, or declarative/exclamatory overlap.
- Avoid rhetorical, sarcastic, ironic, emotional, ambiguous, or context-dependent sentences when they could cause classification uncertainty.
- Do NOT use punctuation or wording that can reasonably signal another sentence type.
- When there is any doubt about a sentence's classification, EXCLUDE it and generate a different one.

**DOMAIN**
Natural English sentences from realistic human conversations.

**CONSTRAINTS**
- English only.
- Exactly 200 unambiguous declarative, 200 unambiguous interrogative, and 200 unambiguous exclamatory sentences.
- Ensure broad coverage of all relevant subtypes while maintaining completely unambiguous classification.
*/

/*
Generate test data for a JavaScript library that classifies each input sentence as `"declarative"`, `"interrogative"`, or `"exclamatory"`.

**OUTPUT**
- Output ONLY one flat, valid JSON array. No prose, markdown, comments, trailing commas, or omissions.
- Each item must be `[sentence, type]`.
- Exactly 600 unique entries: 200 of each type.
- Randomly shuffle all entries. Do not group or cycle by type.
- No duplicates or near-duplicates.
- Complete all 600 entries; never stop early or summarize.

**RESEARCH**
Before generating the data, research all relevant scenarios, subtypes, exceptions, and special cases of English declarative, interrogative, and exclamatory sentences.
**CRITICAL CLASSIFICATION RULE**
- Every sentence MUST belong clearly and exclusively to exactly ONE of these three types.
- NEVER include a sentence that could reasonably be classified as more than one type.
- NEVER include interrogative/declarative overlap, interrogative/exclamatory overlap, or declarative/exclamatory overlap.
- Avoid rhetorical, sarcastic, ironic, emotional, ambiguous, or context-dependent sentences when they could cause classification uncertainty.
- Do NOT use punctuation or wording that can reasonably signal another sentence type.
- When there is any doubt about a sentence's classification, EXCLUDE it and generate a different one.

**DOMAIN**
Natural English messages people send to AI chatbots (coding, writing, debugging, learning, planning, reactions, casual chat, frustration, praise).

**CONSTRAINTS**
- English only.
- Exactly 200 unambiguous declarative, 200 unambiguous interrogative, and 200 unambiguous exclamatory sentences.
- Ensure broad coverage of all relevant subtypes while maintaining completely unambiguous classification.
*/