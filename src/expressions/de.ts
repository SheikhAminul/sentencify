// de.ts
import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/**
 * German sentence-type detection.
 *
 * Input contract (see ../type-detection.ts): sentences arrive lowercase, trimmed and
 * **without punctuation**, so "?" and "!" carry no information. Everything is therefore
 * derived from the two things German really encodes:
 *
 *   1. the position of the finite verb
 *      - V2  ("ich gehe heute", "heute gehe ich")  -> statement
 *      - V1  ("gehst du heute")                    -> yes/no question, imperative or wish
 *      - verb-final ("wie schön du bist")          -> subordinate clause or exclamative
 *   2. a closed set of function words: w-words, modal particles (doch/nur/aber/
 *      vielleicht/ja), subordinating conjunctions, interjections.
 *
 * Because the first matching rule wins, the ordering below is the actual algorithm:
 *
 *    1. tag questions          – a statement turned into a question by a final tag
 *    2. fixed elliptical questions ("wie bitte", "und du")
 *    3. frozen w-phrases       – "wie gesagt", "wie auch immer": neither question nor cry
 *    4. w-exclamatives         – before w-questions ("wie schön du bist")
 *    5. w-questions
 *    6. polite modal requests  – before the "bitte" imperative rule
 *    7. V1 exclamatives + Konjunktiv wishes – before V1 questions ("ist das aber schön")
 *    8. elliptical idioms      – "macht nichts", "kommt darauf an", "sieht gut aus"
 *    9. imperatives            – also V1, but never questions
 *   10. interjections, greetings, emotive openers
 *   11. emphatic statements    – V2 word order but exclamatory force
 *   12. V1 yes/no questions    – lexicon driven
 *   13. subordinating conjunctions -> declarative, before the generic V1 fallback
 *   14. generic V1 fallback    – verbs outside the lexicon ("regnet es", "funktioniert das")
 *   15. declarative default
 *
 * Known limits (unsolvable without punctuation / prosody): declarative-order questions
 * ("du kommst morgen?") read as statements, and V1 conditionals ("hätte ich zeit, käme
 * ich") read as yes/no questions.
 */

/* ------------------------------------------------------------------ helpers */

/** Wraps alternatives in a non-capturing group. */
const any = (...alternatives: string[]): string => `(?:${alternatives.join('|')})`

/**
 * End-of-word guard used instead of `\b`. JavaScript's word boundary is ASCII based,
 * so `weiß\b` or `groß\b` can never match; this lookahead works for umlauts and ß.
 */
const EOW = '(?![a-zäöüß])'

/** Compiles a rule source string; all rules are case-insensitive. */
const rx = (source: string): RegExp => new RegExp(source, 'i')

/* --------------------------------------------------------------- pronouns */

const SUBJECT_PRONOUN = any('ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man')
const OBJECT_PRONOUN = any('mich', 'dich', 'sich', 'uns', 'euch', 'ihn', 'ihm', 'ihnen', 'mir', 'dir')
const INDEFINITE_PRONOUN = any('jemand', 'niemand', 'alles', 'nichts', 'etwas', 'jeder', 'keiner', 'einer', 'irgendwer', 'irgendwas')

/* ------------------------------------------------------------ determiners */

const ARTICLE = any('der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines')
const POSSESSIVE = '(?:mein|dein|sein|ihr|unser|euer|eur)(?:e|em|en|er|es)?'
const DEMONSTRATIVE = '(?:dies|jen|jed|manch|solch|beid|selb|welch)(?:e|em|en|er|es)'
const QUANTIFIER = '(?:all|viel|wenig|einig|ander|mehrer|sämtlich)(?:e|em|en|er|es)'
const DETERMINER = any(ARTICLE, POSSESSIVE, DEMONSTRATIVE, QUANTIFIER, 'dies', 'alle', 'beide')

/** Anything that can follow a fronted finite verb as its subject. */
const SUBJECT = any(SUBJECT_PRONOUN, INDEFINITE_PRONOUN, DETERMINER)

/* ------------------------------------------------------------------ verbs */

/**
 * Finite forms that are *not* homographs of the infinitive. Only these may be used to
 * detect a verb in final position, otherwise "was soll ich machen" (infinitive at the
 * end) would look like a verb-final exclamative.
 */
const FINITE_VERB = any(
	// sein / haben / werden
	'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart', 'wäre', 'wärst', 'wären', 'wärt', 'sei', 'seist', 'seien',
	'habe', 'hast', 'hat', 'habt', 'hatte', 'hattest', 'hatten', 'hattet', 'hätte', 'hättest', 'hätten', 'hättet',
	'werde', 'wirst', 'wird', 'werdet', 'wurde', 'wurdest', 'wurden', 'wurdet', 'würde', 'würdest', 'würden', 'würdet',
	// modal verbs + wissen
	'kann', 'kannst', 'könnt', 'konnte', 'konntest', 'konnten', 'konntet', 'könnte', 'könntest', 'könnten', 'könntet',
	'muss', 'musst', 'müsst', 'musste', 'musstest', 'mussten', 'musstet', 'müsste', 'müsstest', 'müssten', 'müsstet',
	'soll', 'sollst', 'sollt', 'sollte', 'solltest', 'sollten', 'solltet',
	'will', 'willst', 'wollt', 'wollte', 'wolltest', 'wollten', 'wolltet',
	'darf', 'darfst', 'dürft', 'durfte', 'durftest', 'durften', 'durftet', 'dürfte', 'dürftest', 'dürften', 'dürftet',
	'mag', 'magst', 'mögt', 'mochte', 'mochtest', 'mochten', 'mochtet', 'möchte', 'möchtest', 'möchten', 'möchtet',
	'weiß', 'weißt', 'wisst', 'wusste', 'wusstest', 'wussten', 'wusstet', 'wüsste', 'wüsstest', 'wüssten',
	// high frequency full verbs (present, preterite, Konjunktiv II)
	'gehe', 'gehst', 'geht', 'ging', 'gingst', 'gingen', 'gingt', 'ginge',
	'komme', 'kommst', 'kommt', 'kam', 'kamst', 'kamen', 'kamt', 'käme',
	'mache', 'machst', 'macht', 'machte', 'machtest', 'machten', 'machtet',
	'tue', 'tust', 'tut', 'tat', 'tatst', 'taten', 'tatet', 'täte',
	'sage', 'sagst', 'sagt', 'sagte', 'sagtest', 'sagten', 'sagtet',
	'sehe', 'siehst', 'sieht', 'seht', 'sah', 'sahst', 'sahen', 'saht', 'sähe',
	'gebe', 'gibst', 'gibt', 'gebt', 'gab', 'gabst', 'gaben', 'gabt', 'gäbe',
	'nehme', 'nimmst', 'nimmt', 'nehmt', 'nahm', 'nahmst', 'nahmen', 'nahmt', 'nähme',
	'finde', 'findest', 'findet', 'fand', 'fandst', 'fanden', 'fandet', 'fände',
	'denke', 'denkst', 'denkt', 'dachte', 'dachtest', 'dachten', 'dachtet', 'dächte',
	'glaube', 'glaubst', 'glaubt', 'glaubte', 'glaubten',
	'meine', 'meinst', 'meint', 'meinte', 'meinten',
	'heiße', 'heißt', 'hieß', 'hießen',
	'bleibe', 'bleibst', 'bleibt', 'blieb', 'bliebst', 'blieben', 'bliebt',
	'lasse', 'lässt', 'lasst', 'ließ', 'ließen', 'ließe',
	'fahre', 'fährst', 'fährt', 'fahrt', 'fuhr', 'fuhren',
	'laufe', 'läufst', 'läuft', 'lief', 'liefen',
	'spreche', 'sprichst', 'spricht', 'sprecht', 'sprach', 'sprachen',
	'arbeite', 'arbeitest', 'arbeitet', 'arbeitete', 'arbeiteten',
	'brauche', 'brauchst', 'braucht', 'brauchte', 'brauchten',
	'stehe', 'stehst', 'steht', 'stand', 'standen',
	'liege', 'liegst', 'liegt', 'lag', 'lagen',
	'sitze', 'sitzt', 'saß', 'saßen',
	'esse', 'isst', 'esst', 'aß', 'aßen',
	'trinke', 'trinkst', 'trinkt', 'trank', 'tranken',
	'schlafe', 'schläfst', 'schläft', 'schlief', 'schliefen',
	'lese', 'liest', 'lest', 'las', 'lasen',
	'schreibe', 'schreibst', 'schreibt', 'schrieb', 'schrieben',
	'höre', 'hörst', 'hört', 'hörte', 'hörten',
	'helfe', 'hilfst', 'hilft', 'helft', 'half', 'halfen',
	'bringe', 'bringst', 'bringt', 'brachte', 'brachten',
	'kenne', 'kennst', 'kennt', 'kannte', 'kannten',
	'verstehe', 'verstehst', 'versteht', 'verstand',
	'liebe', 'liebst', 'liebt', 'liebte', 'liebten',
	'spiele', 'spielst', 'spielt', 'spielte', 'spielten',
	'lerne', 'lernst', 'lernt', 'lernte', 'lernten',
	'wohne', 'wohnst', 'wohnt', 'wohnte', 'wohnten',
	'kaufe', 'kaufst', 'kauft', 'kaufte', 'kauften',
	'suche', 'suchst', 'sucht', 'suchte', 'suchten',
	'frage', 'fragst', 'fragt', 'fragte', 'fragten',
	'warte', 'wartest', 'wartet', 'wartete', 'warteten',
	'zeige', 'zeigst', 'zeigt', 'zeigte', 'zeigten',
	'gefällt', 'gefiel', 'gefielen', 'kostet', 'kostete', 'dauert', 'dauerte',
	'klappt', 'klappte', 'stimmt', 'stimmte', 'schmeckt', 'schmeckte', 'reicht', 'fehlt', 'gilt', 'passt', 'passte', 'lohnt',
	"gibt'?s", "geht'?s", "macht'?s", "steht'?s"
)

/**
 * Forms identical to the infinitive (1st/3rd person plural). They are usable in
 * verb-first position ("haben wir noch zeit") but never as evidence for a verb-final
 * clause. "sein" is deliberately excluded: sentence-initially it is a possessive
 * ("sein auto ist kaputt"), never a finite verb.
 */
const PLURAL_VERB = any(
	'haben', 'werden', 'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen', 'wissen',
	'gehen', 'kommen', 'machen', 'tun', 'sagen', 'sehen', 'geben', 'nehmen', 'finden', 'denken',
	'glauben', 'meinen', 'heißen', 'bleiben', 'lassen', 'fahren', 'laufen', 'sprechen', 'arbeiten',
	'brauchen', 'stehen', 'liegen', 'sitzen', 'essen', 'trinken', 'schlafen', 'lesen', 'schreiben',
	'hören', 'helfen', 'bringen', 'kennen', 'verstehen', 'lieben', 'spielen', 'lernen', 'wohnen',
	'kaufen', 'suchen', 'fragen', 'warten', 'zeigen', 'holen', 'öffnen', 'schließen', 'bezahlen',
	'gefallen', 'gehören', 'passieren', 'funktionieren', 'dauern', 'kosten', 'stimmen', 'klappen'
)

/** Every form that may legitimately open a verb-first (V1) clause. */
const VERB = any(FINITE_VERB, PLURAL_VERB)

/* -------------------------------------------------------------- imperatives */

/** du-imperatives: bare stems and -e stems of the verbs people actually command with. */
const IMPERATIVE_SG = any(
	'sei', 'hab', 'werd', 'werde', 'bleib', 'bleibe', 'komm', 'komme', 'geh', 'gehe', 'lauf', 'renn', 'steh', 'setz', 'setze',
	'leg', 'lege', 'stell', 'stelle', 'dreh', 'zieh', 'schieb', 'nimm', 'gib', 'hol', 'hole', 'bring', 'bringe', 'mach', 'mache',
	'tu', 'tue', 'sag', 'sage', 'sprich', 'red', 'rede', 'frag', 'frage', 'antworte', 'hör', 'höre', 'schau', 'schaue', 'sieh',
	'guck', 'pass', 'warte', 'wart', 'halt', 'halte', 'lass', 'lasse', 'öffne', 'schließ', 'schließe', 'iss', 'trink', 'trinke',
	'schlaf', 'schlafe', 'fahr', 'fahre', 'flieg', 'steig', 'schreib', 'schreibe', 'lies', 'denk', 'denke', 'überleg', 'überlege',
	'vergiss', 'erinnere', 'hilf', 'ruf', 'rufe', 'melde', 'zeig', 'zeige', 'erklär', 'erkläre', 'erzähl', 'erzähle', 'versuch',
	'versuche', 'probier', 'probiere', 'beeil', 'entschuldige', 'verzeih', 'glaub', 'glaube', 'vertrau', 'kümmere', 'achte',
	'beachte', 'folg', 'folge', 'hau', 'verschwinde', 'benimm', 'beruhige', 'atme', 'genieß', 'genieße', 'träum', 'träume',
	'spiel', 'spiele', 'lern', 'lerne', 'üb', 'übe', 'putz', 'räum', 'pack', 'kauf', 'kaufe', 'such', 'suche', 'wähle', 'klick',
	'drück', 'freu', 'trau', 'denk', 'merk', 'merke', 'schreib', 'lauf'
)

/** ihr-imperatives (identical to 2nd person plural, disambiguated by the tail below). */
const IMPERATIVE_PL = any(
	'seid', 'habt', 'werdet', 'kommt', 'geht', 'macht', 'tut', 'sagt', 'sprecht', 'redet', 'fragt', 'antwortet', 'hört',
	'schaut', 'seht', 'guckt', 'passt', 'wartet', 'bleibt', 'haltet', 'lasst', 'öffnet', 'schließt', 'esst', 'trinkt',
	'schlaft', 'fahrt', 'lauft', 'rennt', 'steigt', 'zieht', 'schreibt', 'lest', 'denkt', 'vergesst', 'helft', 'ruft',
	'zeigt', 'erklärt', 'erzählt', 'versucht', 'probiert', 'beeilt', 'entschuldigt', 'verzeiht', 'glaubt', 'achtet',
	'beachtet', 'folgt', 'haut', 'verschwindet', 'beruhigt', 'atmet', 'genießt', 'träumt', 'spielt', 'lernt', 'übt',
	'putzt', 'räumt', 'packt', 'kauft', 'sucht', 'wählt', 'klickt', 'drückt', 'setzt', 'stellt', 'legt', 'dreht',
	'nehmt', 'gebt', 'holt', 'bringt', 'steht'
)

/**
 * Particles, directional adverbs and separable prefixes that typically follow an
 * imperative ("kommt her", "hört auf", "setzt euch"). Object pronouns are deliberately
 * absent so that elliptical statements like "geht mir gut" are not swallowed.
 */
const IMPERATIVE_TAIL = any(
	'bitte', 'doch', 'mal', 'schon', 'endlich', 'sofort', 'jetzt', 'nicht', 'nie', 'niemals', 'her', 'hin', 'hierher', 'hier',
	'weg', 'raus', 'rein', 'hoch', 'runter', 'rauf', 'weiter', 'zurück', 'los', 'auf', 'zu', 'an', 'ab', 'aus', 'mit', 'nach',
	'vorbei', 'schnell', 'langsam', 'leise', 'ruhig', 'still', 'vorsichtig', 'brav', 'genau', 'kurz', 'euch', 'uns', 'dran',
	'drauf', 'damit', 'davon', 'zusammen', 'lieber', 'acht', 'platz', 'vorsicht', 'gut', 'artig', 'ehrlich', 'einfach'
)

const IMPERATIVE_OBJECT = `(?:\\s+${any('das', 'es', 'die', 'der', 'den', 'dem', 'mir', 'mich', 'dir', 'dich', 'uns', 'euch', 'ihm', 'ihn', 'ihnen')})?`

/**
 * Adverbs that may take the slot right after a fronted finite verb when the subject is
 * postponed ("kommt heute noch jemand", "ist hier noch frei").
 */
const QUESTION_ADVERB = any(
	'hier', 'da', 'dort', 'noch', 'schon', 'jetzt', 'heute', 'morgen', 'gestern', 'bald', 'wirklich', 'eigentlich',
	'denn', 'etwa', 'vielleicht', 'nicht', 'nie', 'immer', 'oft', 'genug', 'irgendwo', 'irgendwie', 'zufällig',
	'wohl', 'überhaupt', 'ernsthaft', 'wenigstens', 'auch', 'nochmal', 'gerade', 'trotzdem'
)

/* --------------------------------------------------------------- w-phrases */

/** Interrogative words. Longer alternatives come first so prefixes cannot win. */
const W_WORD = any(
	'weshalb', 'weswegen', 'wieso', 'warum', 'wann',
	'wohin', 'woher', 'wobei', 'wodurch', 'wofür', 'wogegen', 'womit', 'wonach', 'worauf', 'woran', 'woraus', 'worin',
	'worüber', 'worum', 'worunter', 'wovon', 'wovor', 'wozu',
	'wessen', 'welch(?:e|em|en|er|es)?', 'wieviel(?:e)?', 'inwiefern', 'inwieweit',
	'wer', 'wen', 'wem', 'was', 'wie', 'wo'
)

/** Prepositional w-phrases: "mit wem", "seit wann", "aus welchem grund". */
const PREPOSITIONAL_W = `${any('ab', 'an', 'auf', 'aus', 'bei', 'bis', 'durch', 'für', 'gegen', 'hinter', 'in', 'mit', 'nach', 'neben', 'ohne', 'seit', 'über', 'um', 'unter', 'von', 'vor', 'zu', 'zwischen')}\\s+${any('wem', 'wen', 'wann', 'wo', 'welch(?:e|em|en|er|es)?')}`

/** Optional conversational lead-in before a question: "na", "sag mal", "und", ... */
const LEAD = `(?:${any('also', 'na', 'nun', 'und', 'aber', 'ach', 'ah', 'hey', 'he', 'hallo', 'sag mal', 'sagen sie mal', 'sag', 'entschuldigung', 'entschuldige', 'verzeihung', 'übrigens', 'mal ehrlich', 'ehrlich', 'nochmal', 'okay', 'ok', 'tja', 'hm', 'hmm', 'moment')}\\s+){0,2}`

/* -------------------------------------------------------- emotive vocabulary */

/** Adjectives/nouns with built-in exclamatory force. */
const EMOTIVE = any(
	'wahnsinn', 'wahnsinnig', 'unglaublich', 'unfassbar', 'unbeschreiblich', 'unvorstellbar', 'toll', 'super', 'geil', 'krass',
	'klasse', 'spitze', 'genial', 'fantastisch', 'phantastisch', 'herrlich', 'wunderbar', 'wunderschön', 'großartig', 'grandios',
	'sensationell', 'spektakulär', 'traumhaft', 'hammer', 'mega', 'irre', 'verrückt', 'erstaunlich', 'beeindruckend',
	'überwältigend', 'atemberaubend', 'umwerfend', 'fabelhaft', 'hervorragend', 'ausgezeichnet', 'perfekt', 'einmalig',
	'unvergesslich', 'bezaubernd', 'entzückend', 'schrecklich', 'furchtbar', 'fürchterlich', 'entsetzlich', 'grauenhaft',
	'grässlich', 'katastrophal', 'schlimm', 'ekelhaft', 'widerlich', 'abartig', 'lächerlich', 'peinlich', 'ärgerlich', 'nervig',
	'blöd', 'doof', 'dumm', 'schade', 'gemein', 'unerträglich', 'unmöglich', 'hässlich', 'riesig', 'gigantisch', 'süß',
	'niedlich', 'schön', 'cool', 'stark', 'prima', 'bombastisch'
)

/** Interjections, greetings, curses and one-word emotional reactions. */
const INTERJECTION = any(
	// classic interjections
	'ach', 'ah', 'aha', 'au', 'autsch', 'aua', 'bah', 'boah', 'boa', 'donnerwetter', 'ei', 'ey', 'hach', 'heda', 'herrje',
	'herrjemine', 'himmel', 'hui', 'hurra', 'igitt', 'juchu', 'juhu', 'mensch', 'mannomann', 'nanu', 'oha', 'oh', 'ohje', 'oje',
	'olala', 'pfui', 'puh', 'pah', 'tja', 'uff', 'ui', 'ups', 'huch', 'wow', 'na', 'nein', 'nö', 'nee', 'doch', 'jawohl',
	'bravo', 'prost', 'hilfe', 'achtung', 'vorsicht', 'los', 'komm schon', 'hoppla', 'zack', 'schwupps',
	// greetings and social formulas
	'hallo', 'hi', 'hey', 'moin', 'servus', 'grüß gott', 'grüß dich', 'guten morgen', 'guten tag', 'guten abend', 'gute nacht',
	'gute reise', 'gute besserung', 'guten appetit', 'mahlzeit', 'tschüss', 'tschüs', 'ciao', 'auf wiedersehen', 'bis dann',
	'bis später', 'bis bald', 'willkommen', 'herzlich willkommen', 'danke', 'dankeschön', 'vielen dank', 'tausend dank',
	'herzlichen glückwunsch', 'glückwunsch', 'gratuliere', 'alles gute', 'viel glück', 'viel erfolg', 'viel spaß',
	// curses and vulgar emphasis
	'verdammt', 'verflixt', 'verflucht', 'mist', 'scheiße', 'gottverdammt', 'zum teufel', 'zur hölle', 'meine fresse',
	'meine güte', 'ach du meine güte', 'ach du lieber', 'du liebe zeit', 'um gottes willen', 'um himmels willen',
	'heiliger strohsack', 'herrschaftszeiten', 'potzblitz', 'allmächtiger', 'menschenskind', 'sapperlot', 'sapperment',
	// short emphatic reactions
	'na klar', 'na endlich', 'na also', 'na und ob', 'und ob', 'aber hallo', 'aber sicher', 'aber klar', 'aber natürlich',
	'endlich', 'gott sei dank', 'gottseidank', 'dem himmel sei dank', 'zum glück', 'was für ein glück', 'was für ein pech',
	'auf keinen fall', 'nie im leben', 'keine chance', 'von wegen', 'ach was', 'papperlapapp', 'quatsch', 'blödsinn', 'unsinn',
	'nix da', 'kein problem', 'kein ding', 'alles klar', 'so ein mist', 'so ein pech', 'so ein unsinn', 'so ein quatsch',
	'nicht zu fassen', 'kaum zu glauben', 'ich fasse es nicht', 'wer hätte das gedacht', 'jetzt reicht es', 'jetzt reicht\'s',
	'das gibt es doch nicht', 'das gibt\'s doch nicht', 'das darf doch nicht wahr sein', 'das kann doch nicht wahr sein'
)

/* ---------------------------------------------------------------- exports */

export const de: SentenceTypeDetectExpressionSets = [
	{
		// 1. Tag questions: a statement plus a question tag ("das ist gut nicht wahr",
		// "wir treffen uns um acht oder", "du kommst doch gell"). Anchored at the end so
		// that a mere "nicht" or "oder" inside the sentence changes nothing.
		expression: rx(`^.+\\s${any(
			'nicht wahr', 'oder nicht', 'oder etwa nicht', 'oder etwa doch', 'oder doch', 'oder was', 'oder wie', 'oder',
			"stimmt'?s", 'gell', 'gelle', 'gelt', 'woll', 'wa', 'ne', 'nä',
			'hab ich recht', 'habe ich recht', 'meinst du nicht', 'meinen sie nicht', 'findest du nicht',
			'finden sie nicht', 'denkst du nicht', 'denken sie nicht', 'glaubst du nicht', 'glauben sie nicht',
			'was meinst du', 'was meinen sie', 'was denkst du', 'was sagst du', 'was hältst du davon', 'was halten sie davon'
		)}$`),
		type: 'interrogative'
	},
	{
		// 2. Fixed elliptical questions and echo questions ("wie bitte", "und du",
		// "was jetzt", "im ernst").
		expression: rx(`^${any(
			'wie bitte', 'wie meinen sie', 'wie meinst du', 'was bitte', 'bitte was', 'wie sagten sie', 'wie war das',
			'und (?:du|sie|ihr)', 'und dann', 'und jetzt', 'und nun', 'und weiter', 'na und', 'und sonst',
			'was nun', 'was jetzt', 'was dann', 'was sonst', 'was noch', 'wer sonst', 'wo denn', 'warum nicht',
			'im ernst', 'ernsthaft', 'echt jetzt', 'wirklich', 'ach ja', 'oder', 'ach so'
		)}$`),
		type: 'interrogative'
	},
	{
		// 3. Frozen w-phrases that are discourse markers rather than questions or
		// exclamations ("wie gesagt", "wie auch immer", "was weiß ich"). They have to be
		// taken out before any w-rule can claim them.
		expression: rx(`^${any(
			'wie gesagt', 'wie schon gesagt', 'wie gehabt', 'wie üblich', 'wie immer', 'wie erwartet', 'wie auch immer',
			'wie dem auch sei', 'wie du willst', 'wie du meinst', 'wie sie wollen', 'wie sie meinen', 'wie du weißt',
			'wie man weiß', 'wie es scheint', 'wie es aussieht', 'was auch immer', 'wer auch immer', 'wo auch immer',
			'wann auch immer', 'was weiß ich', 'wer weiß', 'was solls', "was soll'?s", 'was für sich spricht'
		)}${EOW}`),
		type: 'declarative'
	},
	{
		// 4a. W-exclamatives with the finite verb in final position: "wie schön du bist",
		// "was für ein tag das war", "was du alles weißt". Only "wie/was/welch" qualify;
		// "wer/wann/wo/warum" plus verb-final is an embedded question, not an exclamation.
		expression: rx(`^${any('was für', 'welch(?:e|em|en|er|es)?', 'was', 'wie')}\\s.+\\s${FINITE_VERB}$`),
		type: 'exclamatory'
	},
	{
		// 4b. Verbless "was für ein / welch ein / solch ein / so ein" exclamations
		// ("was für ein glück", "so ein mist"). If a subject pronoun appears the phrase is
		// an ordinary question instead ("was für ein auto fährst du"), so it is excluded.
		expression: rx(`^${any('was für', 'welch(?:e|em|en|er|es)?', 'solch(?:e|em|en|er|es)?', 'so')}\\s+${any('ein', 'eine', 'einen', 'einem', 'einer')}${EOW}(?!.*\\s${SUBJECT_PRONOUN}${EOW})`),
		type: 'exclamatory'
	},
	{
		// 4c. "wie" + adjective/adverb, either standing alone ("wie schön", "wie schade")
		// or followed by the subject, which forces the verb to the end ("wie schnell die
		// zeit vergeht"). Degree words and "wie geht's" are excluded – those are questions.
		expression: rx(`^wie\\s+(?!${VERB}${EOW})(?!${any('denn', 'bitte', 'so', 'gehts', "geht'?s", "wär'?s", "ist'?s", "kommt'?s", "läuft'?s", "klappt'?s", "macht'?s")}${EOW})[a-zäöüß]+${EOW}(?:$|\\s+${any(DETERMINER, SUBJECT_PRONOUN)}${EOW})`),
		type: 'exclamatory'
	},
	{
		// 4d. "was" followed by a subject that is not a verb pushes the verb to the end,
		// which is exclamative rather than interrogative ("was der sich traut", "was ihr
		// euch dabei denkt"). "was macht der mann" keeps its verb in second position.
		expression: rx(`^was\\s+(?!${VERB}${EOW})${any(SUBJECT_PRONOUN, 'der', 'die', 'das', 'den', 'dem')}${EOW}\\s`),
		type: 'exclamatory'
	},
	{
		// 5. W-questions, optionally preceded by a short conversational lead-in
		// ("na wie geht es dir", "sag mal wo warst du", "mit wem sprichst du").
		expression: rx(`^${LEAD}${any(PREPOSITIONAL_W, W_WORD)}${EOW}`),
		type: 'interrogative'
	},
	{
		// 6. Polite modal requests. Placed before the imperative rules so that
		// "bitte kannst du mir helfen" stays a question rather than a command.
		expression: rx(`^(?:bitte\\s+)?${any(
			'kannst', 'können', 'könntest', 'könnten', 'würdest', 'würden', 'darf', 'dürfte', 'dürften', 'hättest', 'hätten',
			'wärst', 'wären', 'magst', 'möchtest', 'möchten', 'hast', 'haben', 'weißt', 'wissen', 'sagst', 'sagen', 'störe'
		)}\\s+${any('du', 'sie', 'ihr', 'wir', 'ich')}${EOW}`),
		type: 'interrogative'
	},
	{
		// 7a. V1 exclamatives: verb + subject + emphatic modal particle
		// ("ist das aber schön", "hat der vielleicht glück", "bist du ja gewachsen").
		expression: rx(`^${VERB}${EOW}\\s+(?:${SUBJECT}${EOW}\\s+${any('aber', 'ja', 'mal wieder', 'doch tatsächlich')}|${any(DEMONSTRATIVE, 'der', 'die', 'das')}${EOW}\\s+vielleicht)${EOW}`),
		type: 'exclamatory'
	},
	{
		// 7b. Konjunktiv II wishes with verb-first order ("hätte ich doch geschwiegen",
		// "wäre er nur hier", "könnte ich bloß fliegen").
		expression: rx(`^${any('hätte', 'wäre', 'könnte', 'müsste', 'dürfte', 'sollte', 'würde', 'möchte', 'wüsste', 'käme', 'ginge', 'gäbe', 'täte')}(?:st|n|t)?\\s+${SUBJECT}${EOW}\\s+(?:${any('doch', 'nur', 'bloß', 'wenigstens', 'endlich', 'mal')}${EOW}|${EMOTIVE}${EOW}$)`),
		type: 'exclamatory'
	},
	{
		// 7c. Wishes introduced by "wenn" plus a wish particle ("wenn ich doch nur zeit
		// hätte", "wenn er bloß käme"). Ordinary conditionals fall through to rule 12.
		expression: rx(`^wenn\\s+${SUBJECT}${EOW}\\s+${any('doch', 'nur', 'bloß', 'doch nur', 'bloß nicht', 'wenigstens')}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 7d. Emphatic "dass" clauses used as exclamations ("dass du dich das traust",
		// "dass ihr auch immer zu spät kommt"). Neutral "dass" clauses stay declarative.
		expression: rx(`^dass\\s+${SUBJECT}${EOW}\\s+${any('auch', 'doch', 'nur', 'immer', 'ausgerechnet', 'überhaupt', 'jemals', 'niemals', 'so', 'sowas', 'wirklich', 'tatsächlich', OBJECT_PRONOUN)}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 8. Elliptical statements with a dropped subject ("macht nichts", "geht nicht",
		// "kommt darauf an", "passt schon", "sieht gut aus"). They share the surface form
		// of an imperative or a V1 question, so they have to be recognised first.
		expression: rx(`^${any('geht', 'macht', 'stimmt', 'passt', 'klappt', 'kommt', 'läuft', 'schmeckt', 'reicht', 'hilft', 'lohnt', 'bringt', 'tut', 'sieht', 'wird')}\\s+${any('nicht', 'nichts', 'schon', 'so', 'auch', 'leider', 'wohl', 'kaum', 'darauf', 'drauf', 'klar', 'gut', 'weh', 'los')}${EOW}`),
		type: 'declarative'
	},
	{
		// 9a. du-imperatives ("komm her", "vergiss es", "sei bitte still"). A following
		// subject pronoun means it is really a V1 question ("gehe ich zu weit").
		expression: rx(`^${IMPERATIVE_SG}${EOW}(?!\\s+${any('ich', 'du', 'er', 'wir', 'man')}${EOW})`),
		type: 'exclamatory'
	},
	{
		// 9b. ihr-imperatives, recognised by a following particle or separable prefix
		// ("kommt her", "hört auf", "setzt euch", "seid still"). "kommt er heute" keeps
		// its question reading because "er" is not an imperative tail.
		expression: rx(`^${IMPERATIVE_PL}${IMPERATIVE_OBJECT}\\s+${IMPERATIVE_TAIL}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 9c. Sie-imperatives: "seien sie ..." is always a command, other infinitive forms
		// only when an imperative tail follows ("kommen sie bitte", "nehmen sie platz").
		expression: rx(`^(?:seien\\s+sie${EOW}|${PLURAL_VERB}\\s+sie${IMPERATIVE_OBJECT}\\s+${IMPERATIVE_TAIL}${EOW})`),
		type: 'exclamatory'
	},
	{
		// 9d. Requests opened by "bitte", plus infinitive and past-participle imperatives
		// used on signs and in instructions ("bitte warten", "nicht rauchen", "stillgestanden").
		expression: rx(`^(?:bitte${EOW}|${any('nicht', 'niemals', 'nie', 'bitte nicht')}\\s+[a-zäöüß]{3,}en$)`),
		type: 'exclamatory'
	},
	{
		// 10. Interjections, greetings, curses and emotive one-liners at the start of the
		// sentence ("mensch war das knapp", "verdammt noch mal", "toll gemacht").
		expression: rx(`^${any(INTERJECTION, EMOTIVE)}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 11a. Statements with exclamatory force: modal particle plus an emotive predicate
		// ("das ist ja unglaublich", "der film war echt schrecklich").
		expression: rx(`^.+\\s${any('ja', 'aber', 'echt', 'wirklich', 'total', 'voll', 'so', 'einfach', 'vielleicht', 'doch', 'derart', 'dermaßen', 'ganz schön', 'verdammt', 'wahnsinnig', 'unglaublich')}\\s+${EMOTIVE}(?:${EOW}\\s+[a-zäöüß]+)?$`),
		type: 'exclamatory'
	},
	{
		// 11b. Fixed exclamatory predicates ("das ist der wahnsinn", "das war zum heulen").
		expression: rx(`^.+\\s${any('der wahnsinn', 'der hammer', 'die höhe', 'der gipfel', 'das letzte', 'zum kotzen', 'zum heulen', 'zum verrücktwerden', 'nicht zu fassen', 'kaum zu glauben', 'nicht zu glauben', 'eine frechheit', 'eine unverschämtheit', 'eine katastrophe', 'ein albtraum', 'ein traum')}$`),
		type: 'exclamatory'
	},
	{
		// 12. Yes/no questions with verb-first order ("hast du zeit", "gibt es noch karten",
		// "kommt der bus bald", "gefällt dir das"). All non-question V1 patterns have
		// already been handled above.
		expression: rx(`^${VERB}${EOW}\\s+${any(SUBJECT, OBJECT_PRONOUN, QUESTION_ADVERB)}${EOW}`),
		type: 'interrogative'
	},
	{
		// 13. Subordinating conjunctions and relative openers: these introduce verb-final
		// clauses, which are statements, not questions. Kept ahead of the generic V1
		// fallback so that "damit ich das verstehe" or "solange ich lebe" stay declarative.
		expression: rx(`^${any(
			'weil', 'da', 'denn', 'obwohl', 'obgleich', 'obschon', 'wenngleich', 'wenn', 'falls', 'sofern', 'soweit', 'soviel',
			'solange', 'sobald', 'seit', 'seitdem', 'bevor', 'ehe', 'nachdem', 'während', 'damit', 'sodass', 'so dass', 'indem',
			'als', 'als ob', 'wie wenn', 'zumal', 'außer', 'es sei denn', 'je nachdem', 'bis', 'dass', 'ob(?:wohl)?gleich',
			'anstatt', 'statt', 'ohne dass', 'insofern', 'insoweit', 'nur dass', 'kaum dass'
		)}${EOW}`),
		type: 'declarative'
	},
	{
		// 14a. Indirect-question fragments introduced by "ob" ("ob er wohl kommt").
		expression: rx(`^ob${EOW}`),
		type: 'interrogative'
	},
	{
		// 14b. Generic verb-first fallback for verbs outside the lexicon: a word with a
		// finite ending immediately followed by a subject or object pronoun
		// ("regnet es", "funktioniert das", "interessiert dich das"). The negative
		// lookahead blocks prepositions, particles and determiners with the same endings
		// ("mit ihr ...", "selbst ich ...", "alle die ...").
		expression: rx(`^(?!${any(
			'mit', 'seit', 'statt', 'samt', 'laut', 'gegen', 'ohne', 'neben', 'zwischen', 'hinter', 'außer', 'wider', 'wegen',
			'während', 'innerhalb', 'entlang', 'nicht', 'selbst', 'erst', 'jetzt', 'meist', 'fast', 'sonst', 'zuerst', 'zuletzt',
			'dort', 'schon', 'dann', 'denn', 'wenn', 'eben', 'gerade', 'heute', 'morgen', 'gestern', 'bitte', 'danke', 'also',
			'alle', 'viele', 'einige', 'manche', 'beide', 'keine', 'meine', 'deine', 'seine', 'ihre', 'unsere', 'eure', 'diese',
			'jene', 'jede', 'welche', 'solche', 'andere', 'wenige', 'mehrere', 'ganze', 'halbe', 'erste', 'zweite', 'letzte',
			'nächste', 'weder', 'entweder', 'sowohl', 'zumindest', 'immerhin', 'trotzdem', 'außerdem', 'nämlich'
		)}${EOW})[a-zäöüß]{3,}(?:st|t|e|en)${EOW}\\s+${any(SUBJECT_PRONOUN, OBJECT_PRONOUN, 'das', 'dies')}${EOW}`),
		type: 'interrogative'
	},
	{
		// 15. Everything else is a statement: subject-initial ("ich gehe nach hause"),
		// topicalised ("gestern war ich krank"), verb-final fragments, and anything the
		// rules above did not claim.
		expression: /.+/i,
		type: 'declarative'
	}
]