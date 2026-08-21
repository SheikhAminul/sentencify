import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/*
 * French sentence-type detection.
 *
 * Mirrors the strategy used for English (see ../expressions/en.ts): `detectSentenceType` walks this
 * array top-to-bottom and the first match wins, so rules are ordered from "most certain" to "most
 * speculative":
 *
 *   1. terminal punctuation, when the writer has already told us the answer
 *   2. exclamative structures that reuse interrogative vocabulary ("quelle surprise", "que c'est
 *      beau", "comme il est tard") — checked first because "quel"/"que"/"comme" also open questions
 *   3. interrogative structures: est-ce que / qu'est-ce que, preposition + wh-word, subject-verb
 *      inversion, tag questions, alternative "ou" fragments, and colloquial wh-fronting without
 *      inversion (very common in transcribed spoken French: "pourquoi tu pars", "où tu vas")
 *   4. fixed exclamative formulas, interjections, wishes/hypotheticals, and short colloquial
 *      exclamatory reactions
 *   5. emphatic negation
 *   6. exclamative content: praise formulas, evaluative predicates, superlatives, degree emphasis,
 *      first-person reactions
 *   7. a declarative catch-all, which is also where imperatives land, since this library only
 *      reports three sentence types
 *
 * Everything here is written for the input this library actually receives: lowercase, largely
 * unpunctuated speech-to-text or streamed model output. Hyphens are kept regardless, because French
 * orthography uses them to mark subject-verb inversion ("a-t-il", "veux-tu") rather than as sentence
 * punctuation, and elision apostrophes ("c'est", "qu'est-ce", "n'est-ce pas") are matched through the
 * shared `APOS`/`A` constants so curly apostrophes from mobile keyboards still match.
 *
 * The trickiest French-specific pitfall is that inversion syntax is ambiguous with imperatives that
 * carry an attached reflexive/object pronoun: "levez-vous" (get up) and "avez-vous" (do you have) are
 * structurally identical. "vous"/"nous" are therefore only accepted as inverted subjects immediately
 * after a known auxiliary/modal, where a reflexive reading is rare, while ordinary verbs only invert
 * with the unambiguous set (il/elle/on/tu/je/ils/elles/ce, none of which is ever an object clitic).
 *
 * JS's `\w` (and therefore `\b`) is ASCII-only, so it silently fails to match at the edge of any
 * French word that starts or ends with an accented letter — "où", "étais", "résumé", "ça", "idée",
 * "sidérée", "là" all break a plain `\b`/`\w`-based pattern (a `\b` between two characters that are
 * *both* non-word per ASCII `\w`, e.g. an accented letter next to a space, never fires). `LETTER`
 * extends the alphabet to cover accented Latin letters and the œ/æ ligatures, and `BB`/`BA` are
 * Unicode-safe replacements for a leading/trailing `\b`, built as lookaround assertions instead of
 * relying on `\w`. Every vocabulary list below (interjections, evaluative adjectives/nouns, praise
 * nouns, etc.) contains entries that begin or end in an accented letter, so `BB`/`BA` — not `\b` — are
 * used at every boundary adjacent to one of these lists.
 */

const APOS = `'\u2019\u02BC\u00B4`
const A = `[${APOS}]`

/** Accented Latin letters + œ/æ, used to build Unicode-safe word boundaries (see file header). */
const LETTER = `A-Za-zÀ-ÖØ-öø-ÿŒœ`
/** Boundary before a word: the previous character (if any) is not a letter/digit. */
const BB = `(?<![${LETTER}0-9_])`
/** Boundary after a word: the next character (if any) is not a letter/digit. */
const BA = `(?![${LETTER}0-9_])`

const W = `[${LETTER}0-9_${APOS}-]+`
/** A run of letters/hyphens only — for freeform adjective/word capture where digits/apostrophes don't apply. */
const WORD = `[${LETTER}-]+`
/**
 * A run of letters/apostrophes with NO hyphen, so it stops short of an inversion hyphen
 * ("recommandez-vous") while still matching elided words ("aujourd'hui", "d'id\u00E9e"). Used where a token
 * must be checked for, and rejected on, an immediately following inversion hyphen.
 */
const WORD_NH = `[${LETTER}${APOS}]+`
const CLOSE = `["'\u2019\u201D\u00BB\u203A)\\]}\\s]*`

/* ------------------------------------------------------------------------------------------------
 * Verbs
 * ----------------------------------------------------------------------------------------------*/

const etreForms = `suis|es|est|sommes|êtes|sont|étais|était|étions|étiez|étaient|serai|seras|sera|serons|serez|seront|serais|serait|serions|seriez|seraient|soit|soyons|soyez|soient|fus|fut|fûmes|fûtes|furent`
const avoirForms = `ai|as|a|avons|avez|ont|avais|avait|avions|aviez|avaient|aurai|auras|aura|aurons|aurez|auront|aurais|aurait|aurions|auriez|auraient|aie|ait|ayons|ayez|aient`
const allerForms = `vais|vas|va|allons|allez|vont|irai|iras|ira|irons|irez|iront|irais|irait|irions|iriez|iraient`
const faireForms = `fais|fait|faisons|faites|font|ferai|feras|fera|ferons|ferez|feront|ferais|ferait|ferions|feriez|feraient`
const pouvoirForms = `peux|peut|pouvons|pouvez|peuvent|pourrai|pourras|pourra|pourrons|pourrez|pourront|pourrais|pourrait|pourrions|pourriez|pourraient`
const devoirForms = `dois|doit|devons|devez|doivent|devrai|devras|devra|devrons|devrez|devront|devrais|devrait|devrions|devriez|devraient`
const vouloirForms = `veux|veut|voulons|voulez|veulent|voudrai|voudras|voudra|voudrons|voudrez|voudront|voudrais|voudrait|voudrions|voudriez|voudraient`
const savoirForms = `sais|sait|savons|savez|savent|saurai|sauras|saura|saurons|saurez|sauront|saurais|saurait|saurions|sauriez|sauraient`
const falloirForms = `faut|fallait|faudra|faudrait`

/** Every finite auxiliary/modal form. Inversion of one of these is the backbone of question syntax. */
const auxiliaries = `${etreForms}|${avoirForms}|${allerForms}|${faireForms}|${pouvoirForms}|${devoirForms}|${vouloirForms}|${savoirForms}|${falloirForms}`

/* ------------------------------------------------------------------------------------------------
 * Pronouns and question words
 * ----------------------------------------------------------------------------------------------*/

const subjectPronouns = `je|tu|il|elle|on|nous|vous|ils|elles|ce|ça|cela`

/**
 * Pronouns safe to treat as an inverted subject after *any* verb: "aime-t-il", "veut-elle",
 * "chantent-ils". Deliberately excludes "vous"/"nous" — see the file-level note on why those are
 * restricted to auxiliaries only.
 */
const invertiblePronouns = `il|elle|on|tu|je|ils|elles|ce`

/** "vous"/"nous" are only accepted as inverted subjects right after a known auxiliary/modal. */
const invertiblePronounsAfterAux = `${invertiblePronouns}|vous|nous`

const whWords = `qui|que|quoi|quel(?:le)?s?|lequel|laquelle|lesquel(?:le)?s|duquel|auquel|desquel(?:le)?s|auxquel(?:le)?s|où|quand|comment|pourquoi|combien`

/* ------------------------------------------------------------------------------------------------
 * Sentence openings that should be skipped before testing structure
 * ----------------------------------------------------------------------------------------------*/

/** Fillers, greetings and connectives: "alors", "bon", "du coup", "genre". */
const discourseMarkers = [
	'alors', 'bon', 'bah', 'ben', 'donc', 'enfin', 'bref', `du\\s+coup`, `en\\s+fait`, 'genre', 'style', 'quoi', 'voilà',
	'voila', 'écoute', 'ecoute', 'écoutez', 'ecoutez', `au\\s+fait`, `d${A}ailleurs`, 'franchement', 'honnêtement',
	'sérieusement', 'et', 'mais', 'ou', 'or', 'puis', 'oui', 'non', 'ok', 'okay', `d${A}accord`, 'euh', 'attends',
	'dites', 'dis', 'tiens', 'hein'
].join('|')

/** Conjunctions opening a subordinate clause, after which the *main* clause decides the type. */
const subordinators = [
	'si', 'quand', 'lorsque', `alors\\s+que`, `tandis\\s+que`, `bien\\s+que`, 'quoique', 'puisque', 'comme',
	`parce\\s+que`, `même\\s+si`, `dès\\s+que`, `avant\\s+que`, `après\\s+que`, `pendant\\s+que`, `tant\\s+que`,
	`à\\s+condition\\s+que`, `à\\s+moins\\s+que`
].join('|')

/**
 * Optional lead-in that may be skipped before matching a structure. Two shapes are allowed: a run of
 * discourse markers, or one comma-terminated prefix (a subordinate clause or a short interjection /
 * vocative / adverbial). Used only where swallowing up to a comma is safe — never for the wh-subject
 * rules below, since those would otherwise misread a relative clause as a question (see the comments
 * on those rules).
 */
const lead = `(?:(?:${discourseMarkers})[\\s,]+)*`
const clausePrefix = `${lead}(?:(?:(?:${subordinators})${BA}[^,]{0,100}|[^\\s,]+(?:\\s+[^\\s,]+){0,3})\\s*,\\s*${lead})?`

/* ------------------------------------------------------------------------------------------------
 * Evaluative vocabulary — the raw material of exclamations
 * ----------------------------------------------------------------------------------------------*/

export const intensifiers = [
	'absolument', 'extrêmement', 'incroyablement', 'remarquablement', 'exceptionnellement', 'très', 'totalement',
	'complètement', 'entièrement', 'simplement', 'vraiment', 'parfaitement', 'définitivement', 'certainement',
	'étonnamment', 'tellement', 'si', 'véritablement', 'littéralement', 'franchement', 'sincèrement', 'super', 'trop',
	'carrément', 'méga', 'hyper', 'ultra', 'archi', 'vachement', 'grave', 'sacrément', 'drôlement', 'follement',
	'terriblement', 'affreusement', 'horriblement'
].join('|')

/** The subset strong enough to make *any* following adjective an exclamation. */
const emphaticIntensifiers = [
	'absolument', 'extrêmement', 'incroyablement', 'remarquablement', 'exceptionnellement', 'totalement', 'complètement',
	'entièrement', 'parfaitement', 'définitivement', 'tellement', 'véritablement', 'littéralement', 'super', 'trop',
	'carrément', 'méga', 'hyper', 'ultra', 'archi', 'vachement', 'grave', 'sacrément', 'follement', 'terriblement',
	'affreusement', 'horriblement', 'vraiment', 'réellement', 'franchement', 'sérieusement'
].join('|')

/** Adjectives carrying an evaluation strong enough to read as an exclamation unaided. */
export const emotionalExpressions = [
	// admiration / joy
	'incroyable', 'spectaculaire', 'extraordinaire', 'fantastique', 'merveilleux', 'merveilleuse', 'parfait', 'parfaite',
	'brillant', 'brillante', 'remarquable', 'fabuleux', 'fabuleuse', 'phénoménal', 'phénoménale', 'magnifique',
	'superbe', 'impressionnant', 'impressionnante', 'fascinant', 'fascinante', 'étonnant', 'étonnante', 'génial',
	'géniale', 'formidable', 'excellent', 'excellente', 'sublime', 'divin', 'divine', 'grandiose', 'majestueux',
	'majestueuse', 'éblouissant', 'éblouissante', 'exceptionnel', 'exceptionnelle', 'admirable', 'inoubliable',
	'irrésistible', 'sensationnel', 'sensationnelle', 'mémorable', 'exquis', 'exquise', 'délicieux', 'délicieuse',
	'savoureux', 'savoureuse', 'charmant', 'charmante', 'adorable', 'ravissant', 'ravissante', 'mignon', 'mignonne',
	'chouette', 'top', 'canon', 'stylé', 'stylée', 'cool',
	// dismay / anger / fear
	'terrible', 'horrible', 'affreux', 'affreuse', 'épouvantable', 'atroce', 'abominable', 'monstrueux', 'monstrueuse',
	'dégoûtant', 'dégoûtante', 'répugnant', 'répugnante', 'ignoble', 'infect', 'infecte', 'lamentable', 'pitoyable',
	'minable', 'nul', 'nulle', 'pourri', 'pourrie', 'moche', 'catastrophique', 'désastreux', 'désastreuse',
	'dévastateur', 'dévastatrice', 'tragique', 'accablant', 'accablante', 'déchirant', 'déchirante', 'bouleversant',
	'bouleversante', 'traumatisant', 'traumatisante', 'choquant', 'choquante', 'scandaleux', 'scandaleuse',
	'inadmissible', 'inacceptable', 'impardonnable', 'ridicule', 'absurde', 'grotesque', 'insupportable', 'intolérable',
	'exaspérant', 'exaspérante', 'énervant', 'énervante', 'agaçant', 'agaçante', 'frustrant', 'frustrante', 'décevant',
	'décevante', 'navrant', 'navrante', 'consternant', 'consternante', 'effrayant', 'effrayante', 'terrifiant',
	'terrifiante', 'horrifiant', 'horrifiante', 'angoissant', 'angoissante', 'inquiétant', 'inquiétante', 'glaçant',
	'glaçante', 'perturbant', 'perturbante', 'honteux', 'honteuse', 'grossier', 'grossière', 'malheureux', 'malheureuse',
	'misérable', 'ennuyeux', 'ennuyeuse',
	// strong emotional states
	'furieux', 'furieuse', 'ravi', 'ravie', 'enchanté', 'enchantée', 'bouleversé', 'bouleversée', 'effondré',
	'effondrée', 'anéanti', 'anéantie', 'sidéré', 'sidérée', 'stupéfait', 'stupéfaite', 'abasourdi', 'abasourdie',
	// informal
	'dingue', 'ouf', 'énorme', 'space', 'hallucinant', 'hallucinante'
].join('|')

/** Everyday adjectives that read as exclamations only when intensified: "vraiment bon", "trop bien". */
const mildAdjectives = [
	'bon', 'bonne', 'beau', 'belle', 'bien', 'joli', 'jolie', 'sympa', 'gentil', 'gentille', 'facile', 'difficile',
	'dur', 'dure', 'rapide', 'lent', 'lente', 'grand', 'grande', 'petit', 'petite', 'cher', 'chère', 'utile', 'pratique',
	'important', 'importante', 'sérieux', 'sérieuse', 'intéressant', 'intéressante', 'drôle', 'marrant', 'marrante',
	'triste', 'fatigant', 'fatigante', 'compliqué', 'compliquée', 'simple', 'propre', 'sale', 'chaud', 'chaude',
	'froid', 'froide', 'calme', 'bizarre', 'étrange', 'curieux', 'curieuse', 'tard', 'tôt', 'jeune', 'vieux', 'vieille',
	'plein', 'pleine', 'vide', 'juste', 'faux', 'fausse'
].join('|')

/** Nouns that are an evaluation in themselves: "quelle catastrophe", "c'est un miracle". */
const emotionalNouns = [
	'chose', 'histoire', 'journée', 'moment', 'situation', 'vie', 'monde', 'temps', 'idée', 'chance', 'malheur',
	'bonheur', 'surprise', 'nouvelle', 'aventure', 'spectacle', 'vue', 'scène', 'événement', 'catastrophe', 'désastre',
	'miracle', 'réussite', 'talent', 'génie', 'beauté', 'horreur', 'tristesse', 'joie', 'plaisir', 'dommage', 'gâchis',
	'occasion', 'opportunité', 'perspective', 'avenir', 'passé', 'présent', 'souvenir', 'expérience', 'cauchemar',
	'rêve', 'honneur', 'fierté', 'bénédiction', 'malédiction', 'pitié', 'merveille'
].join('|')

/** Nouns that turn a bare evaluative adjective into a full exclamation: "bon travail", "belle idée". */
const praiseNouns = `travail|boulot|idée|question|point|geste|effort|initiative|réponse|résultat|choix|coup|jeu|match|plan|essai|discours|présentation|analyse|résumé|conseil|astuce|nouvelle|job`

/** Interjections that mark the whole utterance as an exclamation on sight. */
const interjections = [
	'zut', 'hélas', 'bravo', 'hourra', 'wow', 'ouah', 'waouh', 'beurk', 'youpi', 'ouf', 'mince', 'flûte', 'aïe', 'aie',
	'oh', 'ah', 'eh', 'hé', 'euh', 'bah', 'ben', 'tiens', 'pardi', 'mazette', 'fichtre', 'bigre', 'peste', 'diantre',
	'morbleu', 'parbleu', 'sapristi', `mon\\s+dieu`, 'seigneur', `bon\\s+sang`, 'sacrebleu', `nom\\s+d${A}une\\s+pipe`,
	`nom\\s+d${A}un\\s+chien`, `nom\\s+de\\s+dieu`, `bonté\\s+divine`, `juste\\s+ciel`, 'miséricorde', 'ciel', 'diable',
	'crénom', `pour\\s+l${A}amour\\s+de\\s+dieu`, `bon\\s+dieu`, `doux\\s+jésus`, 'putain', 'merde', 'bordel',
	`la\\s+vache`, 'purée', 'punaise', `sans\\s+blague`, `sans\\s+déconner`, `pas\\s+possible`, 'incroyable',
	`c${A}est\\s+pas\\s+vrai`, `c${A}est\\s+pas\\s+possible`, `n${A}importe\\s+quoi`, 'halte', 'courage', 'super', 'génial'
].join('|')

/** Fixed exclamative formulas that no structural rule would otherwise catch. */
const exclamativeFormulas = [
	'félicitations', 'bravo', `bon\\s+courage`, `bonne\\s+chance`, `joyeux\\s+anniversaire`, `bon\\s+anniversaire`,
	`joyeuses\\s+fêtes`, `bonne\\s+année`, `joyeux\\s+noël`, 'bienvenue', `bon\\s+rétablissement`, `repose\\s+en\\s+paix`,
	`bon\\s+voyage`, `à\\s+tes\\s+souhaits`, `à\\s+vos\\s+souhaits`, 'santé', 'tchin', `quel\\s+dommage`, 'dommage',
	`bien\\s+joué`, `beau\\s+travail`, 'chapeau', 'respect', `on\\s+a\\s+réussi`, `on\\s+y\\s+est\\s+arrivés?`,
	`je\\s+le\\s+savais`, `je\\s+l${A}avais\\s+dit`, `c${A}est\\s+pas\\s+trop\\s+tôt`, `à\\s+la\\s+tienne`, `tant\\s+mieux`,
	`bon\\s+débarras`, `tant\\s+pis`
].join('|')

/** Short urgent commands, conventionally exclamations rather than neutral instructions. */
const urgentCommands = `attention|gare\\s+à|au\\s+secours|à\\s+l${A}aide|arrête|arrêtez|stop|dépêche-toi|dépêchez-vous|vite|silence|tais-toi|taisez-vous|du\\s+calme|calme-toi|calmez-vous|recule|reculez|sauve\\s+qui\\s+peut|pousse-toi|poussez-vous`

/** Wishes and hypotheticals: markedly exclamative even without a "!" in casual writing. */
const wishesAndHypotheticals = `si\\s+(?:seulement|jamais)|pourvu\\s+que|dieu\\s+fasse\\s+que|(?:et\\s+)?dire\\s+que|quand\\s+(?:je|on)\\s+pense\\s+que`

/** Short colloquial reactions that are exclamatory on their own: "grave", "trop bien", "de ouf". */
const colloquialExclamatoryReactions = `grave|carrément|sérieux|trop|méga|hyper|ultra|archi|de\\s+ouf|de\\s+dingue|de\\s+malade|de\\s+fou`

/* ------------------------------------------------------------------------------------------------
 * Reusable predicate fragments
 * ----------------------------------------------------------------------------------------------*/

/** Copulas and other linking verbs that introduce a predicate adjective. */
const copulas = `(?:${etreForms}|devient|devenu|devenue|semble|semblait|paraît|paraissait|reste|restait|a\\s+été|était\\s+devenu)`

/** Subject a "reaction" verb may follow: "j'adore", "on déteste", "tu kiffes". */
const reactionSubject = `(?:j${A}|je\\s+|tu\\s+|il\\s+|elle\\s+|on\\s+|nous\\s+|vous\\s+|ils\\s+|elles\\s+)`

/** Zero or more degree modifiers. */
const padding = `(?:(?:${intensifiers})\\s+)*`

export const fr: SentenceTypeDetectExpressionSets = [
	/* ============================================================================================
	 * 1. Explicit terminal punctuation — if the writer marked the sentence, believe them.
	 * ==========================================================================================*/
	{
		expression: new RegExp(`[!\u203C\u2049\u203D]${CLOSE}$`),
		type: 'exclamatory'
	},
	{
		expression: new RegExp(`[?\uFF1F]${CLOSE}$`),
		type: 'interrogative'
	},
	{
		expression: new RegExp(`[.\u2026]${CLOSE}$`),
		type: 'declarative'
	},

	/* ============================================================================================
	 * 2. Exclamative syntax that reuses interrogative vocabulary, checked before the wh-rules:
	 *    "quelle horreur" is not a question about a horror, "que c'est beau" is not asking anything.
	 * ==========================================================================================*/
	{
		// "quelle surprise", "quel incroyable talent", "quelles belles photos", "quel dommage".
		expression: new RegExp(`^${clausePrefix}quel(?:le)?s?\\s+${padding}(?:${mildAdjectives}\\s+)?(?:${emotionalExpressions}|${emotionalNouns})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// General bare exclamative "quel(le)(s)? + short noun phrase" that isn't built on the evaluative
		// vocabulary above: "quel sourire chaleureux", "quel bijou magnifique", "quelle matinée
		// paisible". A real interrogative "quel" always surfaces a copula/auxiliary or an inverted
		// verb-pronoun close to the wh-word ("quel est ton nom", "quelle heure est-il", "quel plat
		// recommandez-vous", "quel jour vous convient"), so each word of the phrase is rejected when it
		// is itself an auxiliary/subject-pronoun or is immediately followed by an inversion hyphen (the
		// hyphen-free WORD_NH keeps that check working instead of swallowing "recommandez-vous" whole);
		// what remains must end the clause outright, or hand off to an infinitive/relative continuation
		// ("quel honneur de recevoir ce prix", "quel plaisir simple que ce café du matin").
		expression: new RegExp(`^${clausePrefix}quel(?:le)?s?${BA}\\s+(?!(?:${auxiliaries}|${subjectPronouns})${BA})${WORD_NH}${BA}(?!-)(?:\\s+(?!(?:${auxiliaries}|${subjectPronouns})${BA})${WORD_NH}${BA}(?!-)){0,2}(?:\\s*(?:,|$)|\\s+(?:de|que)\\s+${W})`, 'i'),
		type: 'exclamatory'
	},
	{
		// "que c'est beau", "comme c'était gentil", "qu'il fait beau aujourd'hui", "ce que c'est
		// triste" — the dummy-subject "c'est"/"il est" construction makes any following complement an
		// exclamation, so the complement itself is not vocabulary-restricted; it only has to close the
		// clause (end of string or comma).
		expression: new RegExp(`^${clausePrefix}(?:qu${A}|que|comme|ce\\s+que)\\s+(?:c${A}(?:est|était)|cela\\s+(?:est|était)|il\\s+(?:est|était)|elle\\s+(?:est|était)|ça\\s+(?:a\\s+été|est|était))\\s+${padding}${W}${BA}(?=\\s*(?:,|$))`, 'i'),
		type: 'exclamatory'
	},
	{
		// "comme le temps passe vite", "comme cette plage est déserte", "comme elle danse
		// gracieusement", "que ce jardin sent bon le printemps", "que cette victoire est douce" —
		// exclamative "comme"/"que" directly in front of an article/possessive + noun subject, with no
		// "c'est" middleman. This subject shape (as opposed to a bare pronoun subject, handled
		// separately below) never fronts a colloquial question in French, so the closing word is not
		// vocabulary-restricted, only anchored to the end of the clause.
		expression: new RegExp(`^${clausePrefix}(?:comme|que)\\s+(?:le|la\\s?|les|ce|cette|cet|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\\s+${WORD}\\s+(?:${W}\\s+){0,4}${padding}${W}${BA}(?=\\s*(?:,|$))`, 'i'),
		type: 'exclamatory'
	},
	{
		// "comme il est tard", "comme elle danse gracieusement" — exclamative "comme" in front of a
		// bare subject pronoun. Safe to leave vocabulary-unrestricted like the rule above: unlike
		// "que", "comme" never fronts a colloquial question of this shape.
		expression: new RegExp(`^${clausePrefix}comme\\s+(?:${subjectPronouns})\\s+(?:${W}\\s+){0,4}${padding}${W}${BA}(?=\\s*(?:,|$))`, 'i'),
		type: 'exclamatory'
	},
	{
		// "que tu es belle", "que ce garçon est poli" — exclamative "que" in front of a bare subject
		// pronoun requires an explicit copula right after it, unlike "comme" above: colloquial
		// wh-fronted questions share the exact same "que + pronoun + verb + complement" shape ("que
		// vous pensez de ce projet", "que tu veux manger"), and only the presence of a copula
		// ("est"/"était"/...) rather than an ordinary verb tells them apart.
		expression: new RegExp(`^${clausePrefix}que\\s+(?:${subjectPronouns})\\s+(?:${W}\\s+){0,2}(?:${copulas})\\s+${padding}${W}${BA}(?=\\s*(?:,|$))`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qu'est-ce que c'est délicieux", "qu'est-ce que cette robe est jolie", "qu'est-ce qu'il fait
		// chaud" — the colloquial "qu'est-ce que" intensifier reads as an exclamation, not a question,
		// whenever the subject is followed directly by a copula (or the "il fait" weather idiom) and
		// the clause ends right there. Ordinary "qu'est-ce que" questions ask about an object and keep
		// going past the verb ("qu'est-ce que tu as mangé ce matin", "qu'est-ce qui est écrit sur le
		// panneau"), so requiring the clause to end immediately after the complement keeps those safe.
		// The leading "qu'"/"que" is required (not optional, unlike the plain interrogative rule below):
		// it is what turns a plain yes/no question ("est-ce que ce siège est libre") into the doubled-up
		// colloquial intensifier ("qu'est-ce que c'est délicieux").
		expression: new RegExp(`^${lead}(?:que|qu${A})est-ce\\s+(?:que|qu${A})\\s*(?:c${A}(?:est|était)|(?:${subjectPronouns}|(?:le|la\\s?|les|ce|cette|cet|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\\s+${WORD})\\s+(?:${copulas}|fait|faisait))\\s+${padding}${W}${BA}(?=\\s*(?:,|$))`, 'i'),
		type: 'exclamatory'
	},
	{
		// "une telle beauté", "un tel courage", "de telles surprises" — this emphatic determiner is
		// exclamatory on its own regardless of the predicate that follows: "une telle beauté laisse
		// tout le monde sans voix", "un tel calme malgré la tempête, quel exploit".
		expression: new RegExp(`^${lead}(?:un\\s+tel|une\\s+telle|de\\s+tels|de\\s+telles)\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "tant de monde", "tellement de bruit" — this emphatic quantifier is exclamatory on its own
		// regardless of what follows: "tant de monde attendait déjà à l'ouverture", "tellement de
		// monde à ce concert ce soir".
		expression: new RegExp(`^${lead}(?:tant|tellement)\\s+de\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "vive les mariés", "vive la France" — a fixed exclamative formula for any following noun.
		expression: new RegExp(`^${lead}vive(?:nt)?\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Inverted exclamative "si + adjective, ..." ("so ADJ, ..."): "si impressionnant, ce feu
		// d'artifice au-dessus du fleuve", "si chaleureux, cet accueil dans ce petit village". Distinct
		// from conditional "si", which always has a verb between "si" and the comma; a single word
		// followed immediately by a comma never does.
		expression: new RegExp(`^${lead}si\\s+${padding}${WORD}\\s*,`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 3. Interrogative syntax.
	 * ==========================================================================================*/
	{
		// "est-ce que", "qu'est-ce que", "qu'est-ce qui", "est-ce à qui appartient ce sac".
		expression: new RegExp(`^${clausePrefix}(?:que|qu${A})?est-ce\\s+(?:que|qu${A}|qui|dont|à\\s+qui|de\\s+qui|pour\\s+qui|avec\\s+qui|par\\s+qui|sur\\s+qui|auquel|duquel)${BA}`, 'i'),
		type: 'interrogative'
	},
	{
		// Pied-piped preposition + wh-word: "à quelle heure pars-tu", "de quoi parles-tu",
		// "avec qui tu sors", "depuis quand tu sais ça". No comma-swallowing lead-in here — a relative
		// clause can open the same way ("mon collègue, avec qui je travaille, ...").
		expression: new RegExp(`^${lead}(?:à|de|avec|sans|pour|par|sur|sous|vers|depuis|jusqu${A}à|jusqu${A}au|chez|entre|selon)\\s+(?:${whWords})${BA}`, 'i'),
		type: 'interrogative'
	},
	{
		// Subject-verb inversion after a known auxiliary/modal, where "vous"/"nous" are safe:
		// "est-il", "sommes-nous", "peux-tu", "a-t-il", "voulez-vous", "faut-il".
		expression: new RegExp(`${BB}(?:${auxiliaries})(?:-t)?-(?:${invertiblePronounsAfterAux})${BA}`, 'i'),
		type: 'interrogative'
	},
	{
		// Inversion after any other verb, restricted to the unambiguous pronoun set (see file-level
		// note): "aime-t-il", "veut-elle", "chantent-ils", "sait-on", "pense-t-on".
		expression: new RegExp(`${BB}${W}(?:-t)?-(?:${invertiblePronouns})${BA}`, 'i'),
		type: 'interrogative'
	},
	{
		// Distinctive tag questions that are never anything but a tag: "il fait beau, n'est-ce pas",
		// "c'est cool hein", "c'est vrai pas vrai".
		expression: new RegExp(`[,\\s]+(?:n${A}est-ce\\s+pas|hein|pas\\s+vrai)\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Ambiguous tag words, safe only right after a comma: "tu viens, non", "ça marche, d'accord",
		// "c'est fait, c'est ça".
		expression: new RegExp(`,\\s*(?:non|d${A}accord|c${A}est\\s+ça|ok|okay)\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Alternative-choice fragments offered as a whole utterance: "thé ou café", "maintenant ou
		// plus tard", "on y va ou pas".
		expression: new RegExp(`^${lead}${W}(?:\\s+${W}){0,3}\\s+ou\\s+(?!bien${BA})${W}(?:\\s+${W}){0,3}\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Colloquial wh-fronted questions with no inversion — by far the commonest question shape in
		// spoken/transcribed French: "pourquoi tu pars", "où tu vas", "comment ça marche",
		// "qui a fait ça", "combien ça coûte", "quel est ton nom". No comma-swallowing lead-in: it
		// would misread a relative clause ("mon frère, qui est très sympa, arrive demain") as a
		// question. The second branch covers the elided "qu'" + pronoun spelling of "que" ("qu'ils
		// préparent pour la fête", "qu'elle a dit exactement"), which has no boundary/space after the
		// apostrophe for the first branch to anchor on.
		expression: new RegExp(`^${lead}(?:(?:${whWords})${BA}(?:\\s+${W}){1,8}|qu${A}(?:il|ils|elle|elles|on|ça|cela)${BA}(?:\\s+${W}){0,7})\\s*$`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 4. Fixed exclamative formulas, interjections, wishes, and short colloquial reactions.
	 * ==========================================================================================*/
	{
		expression: new RegExp(`^${lead}(?:${interjections})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		expression: new RegExp(`^${lead}(?:${exclamativeFormulas})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		expression: new RegExp(`^${lead}(?:${urgentCommands})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		expression: new RegExp(`^${lead}(?:${wishesAndHypotheticals})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "grave !", "trop bien", "carrément", "de ouf" — kept short so ordinary uses of "trop"/"de"
		// as everyday adverbs/prepositions in longer sentences don't get swept in.
		expression: new RegExp(`^${lead}(?:${colloquialExclamatoryReactions})${BA}(?:\\s+${W}){0,3}\\s*$`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 5. Emphatic negation.
	 * ==========================================================================================*/
	{
		// "jamais de la vie", "plus jamais", "pas question", "hors de question", "rien à faire".
		expression: new RegExp(`^${lead}(?:jamais\\s+de\\s+la\\s+vie|plus\\s+jamais|au\\s+grand\\s+jamais|pas\\s+(?:question|possible|pensable)|(?:certainement|absolument|sûrement)\\s+pas|pas\\s+(?:du\\s+tout|le\\s+moins\\s+du\\s+monde)|rien\\s+à\\s+faire|hors\\s+de\\s+question)${BA}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 6. Exclamative content: praise formulas, evaluative predicates, superlatives, degree emphasis,
	 *    first-person reactions.
	 *
	 *    NOTE: every boundary in this section sits next to a vocabulary list (emotionalExpressions,
	 *    emotionalNouns, praiseNouns, mildAdjectives, copulas...) that contains entries starting or
	 *    ending in an accented letter (idée, résumé, compliquée, sidérée, était, arrivé, là...), so
	 *    BB/BA are used throughout instead of the ASCII-only `\b` — see the file-level note.
	 * ==========================================================================================*/
	{
		// "bon travail", "belle idée", "beau boulot", "excellente question".
		expression: new RegExp(`^${lead}${padding}(?:${mildAdjectives}|${emotionalExpressions})\\s+(?:${praiseNouns})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// A bare noun phrase built on an emotional adjective, with no verb of its own, standing as the
		// whole (rest of the) utterance: "un arc-en-ciel magnifique", "une victoire éclatante" —
		// typically preceded by an imperative/vocative lead-in that clausePrefix already swallows
		// ("regardez, un arc-en-ciel magnifique").
		expression: new RegExp(`^${clausePrefix}(?:un|une|des)\\s+${padding}(?:${WORD}\\s+){0,3}(?:${emotionalExpressions})${BA}(?:\\s+${WORD}){0,2}\\s*$`, 'i'),
		type: 'exclamatory'
	},
	{
		// Evaluative predicate: "c'est incroyable", "le service était affreux", "ça a l'air génial".
		expression: new RegExp(`${BB}(?:${copulas})\\s+${padding}(?:${emotionalExpressions})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// The same shape with an everyday adjective, counted only when strongly intensified:
		// "c'est vraiment bon", "c'était trop bien", "c'est carrément énorme".
		expression: new RegExp(`${BB}(?:${copulas})\\s+${padding}(?:${emphaticIntensifiers})\\s+${padding}(?:${mildAdjectives}|${WORD})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Evaluative noun predicate: "c'est un désastre", "c'était une catastrophe totale",
		// "c'est une super idée".
		expression: new RegExp(`${BB}(?:${copulas})\\s+(?:un|une|le|la|les)\\s+${padding}(?:${emotionalExpressions}\\s+)?(?:${emotionalNouns})${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// First-person reactions: "j'adore ça", "on déteste cette idée", "je n'en reviens pas",
		// "j'y crois pas".
		expression: new RegExp(`${BB}${reactionSubject}(?:adore|adorent|adores|adorons|adorez|ai\\s+adoré|as\\s+adoré|a\\s+adoré|avons\\s+adoré|avez\\s+adoré|ont\\s+adoré|déteste|détestes|détestons|détestez|détestent|kiffe|kiffes|kiffons|kiffez|kiffent|n${A}en\\s+(?:reviens|revient|revenons|revenez|reviennent)\\s+pas|y\\s+crois\\s+pas|n${A}y\\s+crois\\s+pas)${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Superlatives with a scope phrase: "le meilleur repas de ma vie", "la pire journée jamais",
		// "le plus beau jour de tous les temps".
		expression: new RegExp(`${BB}(?:le|la|les)\\s+(?:meilleur|meilleure|meilleurs|meilleures|pire|pires|plus\\s+${WORD})${BA}[^,]{0,60}?${BB}(?:de\\s+(?:ma|ta|sa|notre|votre|leur)\\s+vie|jamais|de\\s+tous\\s+les\\s+temps|possible|imaginable|de\\s+l${A}année|du\\s+monde)${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Degree emphasis: "tellement mieux", "beaucoup trop lent", "encore plus dur", "trop bon".
		expression: new RegExp(`${BB}(?:tellement|beaucoup\\s+trop|bien\\s+trop|encore\\s+plus|encore\\s+mieux|trop)\\s+(?:${mildAdjectives}|mieux|pire|dur|difficile|facile)${BA}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Relief at a long-awaited result: "enfin ça marche", "enfin c'est fini", "enfin arrivé".
		expression: new RegExp(`${BB}(?:enfin|enfin\\s+bref)${BA}(?:\\s+${W}){0,4}\\s*${BB}(?:marche|fonctionne|réussi|résolu|fini|terminé|arrivé|là|prêt)${BA}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 7. Anything left over is a statement (this also covers imperatives, which this library
	 *    reports as declarative).
	 * ==========================================================================================*/
	{
		expression: /.+/,
		type: 'declarative'
	}
]