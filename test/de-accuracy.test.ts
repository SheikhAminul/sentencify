import { strict as assert } from 'assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectSentenceType } from '../src/index.js'

type SentenceType = 'declarative' | 'interrogative' | 'exclamatory'
type Fixture = [sentence: string, expected: SentenceType]

const sentenceTypes: SentenceType[] = ['declarative', 'interrogative', 'exclamatory']

const fixturesPath = join(dirname(fileURLToPath(import.meta.url)), '../../test/de.json')
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[]

/** Minimum accuracy the current de.ts rule set must keep clearing, so a rule-ordering regression fails loudly instead of silently. */
const minAccuracyPerType = 55
const minOverallAccuracy = 70

describe('detectSentenceType — accuracy against test/de.json', () => {
	it('classifies real-world German sentences and reports accuracy by type', () => {
		const statsByType = new Map<SentenceType, { total: number; correct: number }>(sentenceTypes.map(type => [type, { total: 0, correct: 0 }]))
		const failures: { Sentence: string; Expected: SentenceType; Detected: SentenceType }[] = []

		for (const [sentence, expected] of fixtures) {
			const normalizedSentence = sentence.toLowerCase().replace(/[.?!]$/, '')
			const detected = detectSentenceType(normalizedSentence, 'de')
			const typeStats = statsByType.get(expected)
			assert.ok(typeStats, `Unknown sentence type "${expected}" in test/de.json fixture for: ${sentence}`)
			typeStats.total++
			if (detected === expected) typeStats.correct++
			else failures.push({ Sentence: sentence, Expected: expected, Detected: detected })
		}

		const totalCount = fixtures.length
		const totalCorrect = [...statsByType.values()].reduce((sum, typeStats) => sum + typeStats.correct, 0)
		const toRow = (total: number, correct: number) => ({
			Total: total,
			Success: correct,
			Fail: total - correct,
			'Accuracy %': total ? ((correct / total) * 100).toFixed(2) : '0.00'
		})

		const accuracyByType = sentenceTypes.map(type => {
			const typeStats = statsByType.get(type)
			assert.ok(typeStats)
			const accuracy = typeStats.total ? (typeStats.correct / typeStats.total) * 100 : 100
			return { type, total: typeStats.total, correct: typeStats.correct, accuracy }
		})

		const table: Record<string, ReturnType<typeof toRow>> = {}
		for (const { type, total, correct } of accuracyByType) table[type] = toRow(total, correct)
		table.overall = toRow(totalCount, totalCorrect)

		console.log('\ndetectSentenceType accuracy — test/de.json')
		console.table(table)

		if (failures.length) {
			console.log(`\n${failures.length} misclassified sentence(s):`)
			console.table(failures)
		}

		for (const { type, accuracy } of accuracyByType)
			assert.ok(accuracy >= minAccuracyPerType, `${type} accuracy dropped to ${accuracy.toFixed(2)}% (expected >= ${minAccuracyPerType}%)`)

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
Before generating the data, research all relevant scenarios, subtypes, exceptions, and special cases of German declarative, interrogative, and exclamatory sentences.

**CRITICAL CLASSIFICATION RULE**
- Every sentence MUST belong clearly and exclusively to exactly ONE of these three types.
- NEVER include a sentence that could reasonably be classified as more than one type.
- NEVER include interrogative/declarative overlap, interrogative/exclamatory overlap, or declarative/exclamatory overlap.
- Avoid rhetorical, sarcastic, ironic, emotional, ambiguous, or context-dependent sentences when they could cause classification uncertainty.
- Do NOT use punctuation or wording that can reasonably signal another sentence type.
- When there is any doubt about a sentence's classification, EXCLUDE it and generate a different one.

**DOMAIN**
Natural German sentences from realistic human conversations.

**CONSTRAINTS**
- German only.
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
Before generating the data, research all relevant scenarios, subtypes, exceptions, and special cases of German declarative, interrogative, and exclamatory sentences.
**CRITICAL CLASSIFICATION RULE**
- Every sentence MUST belong clearly and exclusively to exactly ONE of these three types.
- NEVER include a sentence that could reasonably be classified as more than one type.
- NEVER include interrogative/declarative overlap, interrogative/exclamatory overlap, or declarative/exclamatory overlap.
- Avoid rhetorical, sarcastic, ironic, emotional, ambiguous, or context-dependent sentences when they could cause classification uncertainty.
- Do NOT use punctuation or wording that can reasonably signal another sentence type.
- When there is any doubt about a sentence's classification, EXCLUDE it and generate a different one.

**DOMAIN**
Natural German messages people send to AI chatbots (coding, writing, debugging, learning, planning, reactions, casual chat, frustration, praise).

**CONSTRAINTS**
- German only.
- Exactly 200 unambiguous declarative, 200 unambiguous interrogative, and 200 unambiguous exclamatory sentences.
- Ensure broad coverage of all relevant subtypes while maintaining completely unambiguous classification.
*/