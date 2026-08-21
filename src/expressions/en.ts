import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/*
 * English sentence-type detection.
 *
 * `detectSentenceType` walks this array top-to-bottom and the first match wins, so the rules are
 * ordered from "most certain" to "most speculative":
 *
 *   1. terminal punctuation, when the writer has already told us the answer
 *   2. exclamative structures that reuse question words ("what a mess", "how lovely")
 *   3. interrogative structures (wh-fronting, subject-auxiliary inversion, tags, fragments)
 *   4. imperatives, which this library reports as declarative
 *   5. exclamative content (interjections, evaluative predicates, superlatives, emphasis)
 *   6. a declarative catch-all
 *
 * Everything here is written for the input this library actually receives: lowercase, unpunctuated
 * speech-to-text or streamed model output. No rule may depend on capitalization, and every pattern
 * has to survive contractions ("what's", "isn't", "he'd") including curly apostrophes — hence the
 * shared `APOS`/`A` constants rather than a literal `'`.
 *
 * The strategy is syntactic rather than lexical. Word lists are unavoidable for evaluative
 * vocabulary, but question detection leans on the structural facts of English instead: a wh-word at
 * the front, an auxiliary moved in front of its subject, a tag bolted onto a statement, or a
 * verbless fragment. That is what lets "did Tom remember his passport" be recognised as a question
 * without "Tom" appearing in any list.
 */

/** Straight, curly, modifier-letter and acute apostrophes — all four occur in real-world text. */
const APOS = `'\u2019\u02BC\u00B4`
/** The same set as a character class, for matching one apostrophe. */
const A = `[${APOS}]`
/** A word, allowing internal apostrophes and hyphens. */
const W = `[\\w${APOS}-]+`
/** Quotes/brackets/whitespace permitted after a terminal mark: `"Is it?"`, `(wow!)`. */
const CLOSE = `["'\u2019\u201D\u00BB\u203A)\\]}\\s]*`

/* ------------------------------------------------------------------------------------------------
 * Verbs
 * ----------------------------------------------------------------------------------------------*/

const beVerbs = `is|are|am|was|were|isn${A}t|aren${A}t|wasn${A}t|weren${A}t|ain${A}t`
const doVerbs = `do|does|did|don${A}t|doesn${A}t|didn${A}t`
const haveVerbs = `have|has|had|haven${A}t|hasn${A}t|hadn${A}t`
const modalVerbs = `will|would|can|could|shall|should|may|might|must|ought|dare|need|won${A}t|wouldn${A}t|can${A}t|cannot|couldn${A}t|shan${A}t|shouldn${A}t|mightn${A}t|mustn${A}t|needn${A}t|oughtn${A}t|daren${A}t`

/** Every finite auxiliary and modal. Inversion of one of these is the backbone of question syntax. */
const auxiliaries = `${beVerbs}|${doVerbs}|${haveVerbs}|${modalVerbs}`

/** Auxiliaries that cliticise onto the previous word: what's, who're, they'd, we'll, you've, I'm. */
const clitics = `${A}(?:s|re|d|ll|ve|m)`

/* ------------------------------------------------------------------------------------------------
 * Noun-phrase material
 * ----------------------------------------------------------------------------------------------*/

const personalPronouns = `i|you|he|she|it|we|they|u`
const otherPronouns = `there|here|this|that|these|those|one|ones|someone|somebody|something|anyone|anybody|anything|everyone|everybody|everything|no one|nobody|nothing|all|both|each|either|neither|any|some|most|many|much|few|several|none|others|another`
const determiners = `the|a|an|my|your|his|her|its|our|their|whose|no|every|other|such|two|three|four|five|six|seven|eight|nine|ten|enough`

/** The unambiguous core of a subject: pronouns, determiners and quantifiers, with any clitic. */
const strictSubject = `(?:(?:${personalPronouns}|${otherPronouns}|${determiners})(?:${clitics})?)`

/**
 * Words that can never begin a subject. Used as a negative lookahead so an ordinary noun or a name
 * can still be a subject ("did *Tom* call", "is *Sarah* here") while a bare verb phrase cannot
 * ("must *be* nice", "do *not* touch", "may *cause* drowsiness") — which is what keeps imperatives
 * and elliptical statements out of the question rules.
 */
const notASubject = [
	'not', 'never', 'please', 'kindly', 'just', 'really', 'only', 'so', 'too', 'very', 'quite', 'rather', 'also', 'still',
	'already', 'even', 'almost', 'nearly', 'probably', 'maybe', 'perhaps', 'possibly', 'definitely', 'certainly', 'surely',
	'honestly', 'seriously', 'actually', 'literally', 'totally', 'absolutely', 'finally', 'then', 'now', 'again', 'therefore',
	'however', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'get',
	'got', 'go', 'going', 'gone', 'come', 'coming', 'came', 'make', 'making', 'made', 'take', 'taking', 'took', 'say',
	'saying', 'said', 'see', 'seen', 'know', 'known', 'think', 'thought', 'want', 'need', 'like', 'love', 'hate', 'look',
	'seem', 'sound', 'feel', 'work', 'help', 'tell', 'give', 'put', 'keep', 'let', 'leave', 'find', 'call', 'use', 'try',
	'start', 'stop', 'turn', 'wait', 'believe', 'remember', 'forget', 'imagine', 'worry', 'mind', 'cause', 'contain',
	'include', 'apply', 'vary', 'differ', 'depend', 'consist', 'occur', 'happen', 'exist', 'remain', 'to', 'for', 'with',
	'from', 'by', 'on', 'in', 'at', 'of', 'and', 'or', 'but', 'if', 'because', 'since', 'when', 'while', 'though',
	'although', 'as', 'than', 'that'
].join('|')

/** A subject that may be a plain noun or a name, but never a bare verb or adverb. */
const looseSubject = `(?:${strictSubject}\\b|(?!(?:${notASubject})\\b)${W})`

/** A gerund subject, so "would switching to X help" and "could running out of memory cause it" invert. */
const gerundSubject = `(?!(?:nothing|anything|something|everything|morning|evening|getting|putting)\\b)[\\w-]{4,}ing`

/** Objects that follow imperative "have": "have a seat", "have fun" — never a question. */
const haveObjects = `a|an|some|another|fun|patience|faith|mercy|hope|courage|dinner|lunch|breakfast|yourself|yourselves|one|look|seat|word|go|think|care|heart|nice|good|great|safe|lovely|mine|yours`

/**
 * Subject-auxiliary inversion, the shape shared by every yes/no question. Parameterised by how
 * permissive the subject may be: a bare sentence opening can afford a loose subject, whereas after
 * a comma-terminated lead-in only an unambiguous one is safe.
 */
const inversion = (subject: string) =>
	`(?:(?:${beVerbs}|${doVerbs})\\s+${subject}|(?:${haveVerbs})\\s+(?!(?:${haveObjects})\\b)${subject}|(?:${modalVerbs})\\s+(?:${subject}|${gerundSubject}))`

/* ------------------------------------------------------------------------------------------------
 * Sentence openings that should be skipped before testing structure
 * ----------------------------------------------------------------------------------------------*/

/** Fillers, greetings and connectives: "so", "well", "hey", "ok", "oh", "by the way". */
const discourseMarkers = [
	'so', 'well', 'ok', 'okay', 'alright', 'right', 'now', 'then', 'anyway', 'anyhow', 'besides', 'actually', 'honestly',
	'frankly', 'basically', 'seriously', 'literally', 'obviously', 'clearly', 'apparently', 'hopefully', 'sadly', 'luckily',
	'thankfully', 'oh', 'ah', 'ahh', 'er', 'erm', 'um', 'uh', 'hmm', 'hm', 'hey', 'hi', 'hello', 'yo', 'please', 'sorry',
	'excuse me', 'yes', 'yeah', 'yep', 'yup', 'no', 'nope', 'nah', 'sure', 'and', 'but', 'or', 'plus', 'also', 'still',
	'though', 'however', 'therefore', 'meanwhile', 'first', 'second', 'third', 'next', 'lastly', 'wait', 'look', 'listen',
	'see', 'come on', 'by the way', 'btw', 'to be honest', 'tbh', 'in short', 'after all', 'of course', 'for real',
	'i mean', 'you know', 'like'
].join('|')

/** Conjunctions opening a subordinate clause, after which the *main* clause decides the type. */
const subordinators = [
	'if', 'when', 'whenever', 'while', 'whilst', 'as', 'after', 'before', 'once', 'since', 'because', 'unless', 'until',
	'till', 'although', 'though', 'even though', 'even if', 'whereas', 'so that', 'in case', 'now that', 'given that',
	'assuming', 'provided', 'supposing', 'whether', 'wherever', 'whatever', 'however', 'no matter', 'to be fair', 'in fact',
	'in the end', 'at this point', 'first of all', 'that said', 'other than that'
].join('|')

/** Openings that reliably introduce a question even without a comma to mark the join. */
const questionOpeners = [
	'out of curiosity', 'quick question', 'one more thing', 'one last thing', 'before i (?:forget|go)',
	'just to (?:check|confirm|ask|be sure)', 'just checking', 'just wondering', 'i was wondering', 'i wonder', 'any idea',
	'any chance', 'sorry', 'excuse me', 'pardon me', 'tell me', 'remind me', 'real quick', 'question', 'curious'
].join('|')

/**
 * Optional lead-in that may be skipped before matching a structure. Two shapes are allowed:
 *
 *   - a run of discourse markers ("so", "ok well", "oh hey")
 *   - one comma-terminated prefix: a subordinate clause ("if you have a minute,") or a short
 *     interjection, vocative or adverbial ("by the way,", "mum,", "to be honest,")
 *
 * Both prefixes are built from comma-free tokens, so they can only ever reach the *first* comma.
 * That is what stops a non-restrictive relative clause ("The report, which we finished yesterday,
 * was accepted") from being read as a lead-in wrapped around a question.
 */
const lead = `(?:(?:${discourseMarkers})[\\s,]+)*`
const clausePrefix = `${lead}(?:(?:(?:${subordinators})\\b[^,]{0,100}|[^\\s,]+(?:\\s+[^\\s,]+){0,3})\\s*,\\s*${lead})?`

/* ------------------------------------------------------------------------------------------------
 * Wh-words and degree words
 * ----------------------------------------------------------------------------------------------*/

const whWords = `who|whom|whose|what|which|when|where|why|how|whoever|whatever|whichever`

/** Adverbs that may sit between a wh-word and its auxiliary: "how exactly does this work". */
const whAdverbs = `exactly|precisely|else|ever|even|really|actually|then|now|well|badly|on earth|the hell|the heck|the devil|in the world`

/** "how" plus one of these is always a question of degree, never an exclamation. */
const degreeWords = `much|many|long|often|far|old|soon|big|tall|deep|wide|heavy|fast|hard|bad|likely|come|about`

/* ------------------------------------------------------------------------------------------------
 * Evaluative vocabulary — the raw material of exclamations
 * ----------------------------------------------------------------------------------------------*/

/** Degree modifiers that may pad an evaluative phrase: "so incredibly frustrating". */
export const intensifiers = [
	'absolutely', 'completely', 'utterly', 'totally', 'entirely', 'thoroughly', 'downright', 'outright', 'positively',
	'genuinely', 'truly', 'really', 'very', 'so', 'such', 'extremely', 'incredibly', 'unbelievably', 'remarkably',
	'exceptionally', 'extraordinarily', 'insanely', 'ridiculously', 'stupidly', 'crazily', 'wildly', 'madly', 'amazingly',
	'astonishingly', 'stunningly', 'surprisingly', 'shockingly', 'terribly', 'awfully', 'horribly', 'dreadfully',
	'painfully', 'seriously', 'super', 'mega', 'ultra', 'hella', 'dead', 'well', 'proper', 'right', 'bloody', 'damn',
	'damned', 'freaking', 'frigging', 'fucking', 'beyond', 'way', 'far', 'much', 'even', 'simply', 'just', 'quite',
	'pretty', 'rather', 'perfectly', 'deeply', 'highly', 'immensely', 'enormously', 'exceedingly', 'particularly',
	'especially', 'honestly', 'literally', 'definitely', 'certainly', 'indeed', 'total', 'complete', 'utter', 'absolute',
	'sheer', 'real'
].join('|')

/** The subset strong enough to make *any* following adjective an exclamation. */
const emphaticIntensifiers = [
	'absolutely', 'completely', 'utterly', 'totally', 'entirely', 'thoroughly', 'downright', 'extremely', 'incredibly',
	'unbelievably', 'remarkably', 'exceptionally', 'extraordinarily', 'insanely', 'ridiculously', 'stupidly', 'crazily',
	'wildly', 'madly', 'amazingly', 'astonishingly', 'stunningly', 'shockingly', 'terribly', 'awfully', 'horribly',
	'dreadfully', 'painfully', 'super', 'mega', 'ultra', 'hella', 'dead', 'bloody', 'damn', 'damned', 'freaking',
	'frigging', 'fucking', 'beyond', 'so', 'such', 'immensely', 'enormously', 'exceedingly', 'deeply', 'really'
].join('|')

/**
 * Adjectives carrying an evaluation strong enough to read as an exclamation unaided
 * ("that's *dreadful*"). Deliberately separate from `mildAdjectives`, which need an intensifier.
 */
export const emotionalExpressions = [
	// admiration and delight
	'amazing', 'incredible', 'unbelievable', 'fantastic', 'fantabulous', 'wonderful', 'marvellous', 'marvelous',
	'fabulous', 'phenomenal', 'spectacular', 'sensational', 'stupendous', 'magnificent', 'majestic', 'glorious',
	'splendid', 'superb', 'sublime', 'exquisite', 'divine', 'heavenly', 'terrific', 'tremendous', 'outstanding',
	'exceptional', 'extraordinary', 'remarkable', 'impressive', 'stunning', 'striking', 'breathtaking', 'jaw-dropping',
	'mind-blowing', 'eye-opening', 'awe-inspiring', 'inspiring', 'inspirational', 'uplifting', 'heartwarming', 'moving',
	'touching', 'priceless', 'invaluable', 'flawless', 'seamless', 'effortless', 'immaculate', 'pristine', 'perfect',
	'unreal', 'surreal', 'magical', 'epic', 'legendary', 'iconic', 'world-class', 'top-notch', 'first-rate', 'stellar',
	'brilliant', 'genius', 'ingenious', 'masterful', 'awesome', 'excellent', 'exciting', 'thrilling', 'exhilarating',
	'electrifying', 'dazzling', 'radiant', 'gorgeous', 'beautiful', 'lovely', 'adorable', 'charming', 'delightful',
	'delicious', 'scrumptious', 'mouthwatering', 'wholesome', 'refreshing', 'satisfying', 'gratifying', 'rewarding',
	'fulfilling', 'groundbreaking', 'game-changing', 'revolutionary', 'transformative', 'impactful', 'clever', 'elegant',
	'graceful',
	// dismay, anger and fear
	'terrible', 'horrible', 'horrid', 'horrific', 'horrendous', 'awful', 'atrocious', 'appalling', 'abysmal', 'dismal',
	'dreadful', 'ghastly', 'hideous', 'devastating', 'catastrophic', 'disastrous', 'calamitous', 'tragic',
	'heartbreaking', 'gut-wrenching', 'harrowing', 'traumatic', 'shocking', 'staggering', 'astounding', 'alarming',
	'disturbing', 'distressing', 'unsettling', 'frightening', 'terrifying', 'horrifying', 'petrifying', 'chilling',
	'creepy', 'scary', 'spooky', 'infuriating', 'maddening', 'enraging', 'aggravating', 'exasperating', 'frustrating',
	'annoying', 'irritating', 'tiresome', 'exhausting', 'draining', 'overwhelming', 'unbearable', 'intolerable',
	'insufferable', 'excruciating', 'agonizing', 'agonising', 'embarrassing', 'humiliating', 'mortifying', 'shameful',
	'disgraceful', 'scandalous', 'outrageous', 'unacceptable', 'inexcusable', 'unforgivable', 'ridiculous', 'absurd',
	'preposterous', 'laughable', 'pathetic', 'useless', 'hopeless', 'pointless', 'worthless', 'disgusting', 'revolting',
	'repulsive', 'repugnant', 'vile', 'foul', 'gross', 'nasty', 'brutal', 'miserable', 'wretched', 'depressing',
	'demoralizing', 'demoralising', 'disappointing',
	// strong emotional states
	'devastated', 'gutted', 'furious', 'livid', 'heartbroken', 'mortified', 'appalled', 'horrified', 'thrilled',
	'ecstatic', 'overjoyed', 'delighted', 'chuffed', 'stoked', 'psyched', 'speechless', 'gobsmacked', 'flabbergasted',
	'dumbfounded',
	// informal
	'insane', 'crazy', 'bonkers', 'nuts', 'wild', 'mad', 'unhinged', 'hilarious', 'bizarre', 'savage', 'clutch', 'killer',
	'banging', 'cracking', 'smashing', 'stonking', 'dope', 'ace', 'immense', 'unmatched', 'unrivalled', 'unrivaled',
	'underrated', 'overrated'
].join('|')

/** Everyday adjectives that read as exclamations only when intensified: "so good", "way too slow". */
const mildAdjectives = [
	'good', 'great', 'nice', 'fine', 'cool', 'neat', 'sweet', 'cute', 'pretty', 'handsome', 'smart', 'sharp', 'solid',
	'strong', 'clean', 'smooth', 'slick', 'sleek', 'tidy', 'fun', 'funny', 'happy', 'glad', 'proud', 'lucky', 'kind',
	'generous', 'thoughtful', 'helpful', 'useful', 'handy', 'easy', 'simple', 'quick', 'fast', 'slow', 'big', 'huge',
	'massive', 'enormous', 'giant', 'tiny', 'small', 'long', 'short', 'hard', 'tough', 'rough', 'weird', 'strange', 'odd',
	'peculiar', 'random', 'bad', 'sad', 'angry', 'upset', 'tired', 'exhausted', 'busy', 'boring', 'dull', 'tedious',
	'expensive', 'cheap', 'cold', 'hot', 'warm', 'wet', 'dry', 'loud', 'quiet', 'bright', 'dark', 'heavy', 'light',
	'close', 'far', 'early', 'late', 'wrong', 'true', 'clear', 'obvious', 'important', 'serious', 'special', 'different',
	'ready'
].join('|')

/** Nouns that are an evaluation in themselves: "that was *a nightmare*", "you're *a lifesaver*". */
const emotionalNouns = [
	'lifesaver', 'life saver', 'life-saver', 'time saver', 'timesaver', 'game changer', 'game-changer', 'godsend',
	'blessing', 'miracle', 'dream', 'treat', 'gem', 'steal', 'bargain', 'triumph', 'victory', 'breakthrough', 'milestone',
	'masterpiece', 'delight', 'joy', 'relief', 'blast', 'riot', 'hoot', 'charm', 'breeze', 'doddle', 'cinch', 'wonder',
	'nightmare', 'disaster', 'catastrophe', 'calamity', 'fiasco', 'debacle', 'shambles', 'mess', 'disgrace', 'travesty',
	'tragedy', 'horror', 'joke', 'farce', 'scandal', 'letdown', 'let-down', 'ripoff', 'rip-off', 'headache', 'drag',
	'bore', 'chore', 'slog', 'killer', 'stinker', 'shocker', 'close call', 'close one', 'near miss', 'waste of time',
	'load of nonsense', 'load of rubbish', 'pity', 'shame', 'sight', 'stunner'
].join('|')

/** Nouns that turn a bare evaluative adjective into a full exclamation: "great job", "nice work". */
const praiseNouns = `job|work|effort|catch|call|point|question|idea|suggestion|news|find|thinking|save|shot|shots|one|stuff|move|choice|luck|progress|result|results|turnaround|write-up|writeup|advice|tip|tips|feedback|explanation|summary|analysis|presentation|performance|game|match|season|meal|cooking|photo|photos|picture|pictures`

/** Interjections that mark the whole utterance as an exclamation on sight. */
const interjections = [
	'wow', 'whoa', 'woah', 'ugh', 'argh', 'aargh', 'agh', 'ack', 'yikes', 'yay', 'yaay', 'woohoo', 'whoopee', 'yippee',
	'hooray', 'hurray', 'hurrah', 'huzzah', 'bravo', 'phew', 'whew', 'oops', 'whoops', 'ouch', 'ow', 'aw', 'aww', 'eek',
	'ew', 'eww', 'yuck', 'ick', 'blimey', 'crikey', 'sheesh', 'jeez', 'geez', 'gee', 'golly', 'gosh', 'goodness',
	'heavens', 'dammit', 'damnit', 'darn', 'dang', 'alas', 'boo', 'bah', 'pff', 'pfft', 'ahem', 'bruh', 'jeepers',
	'yowza', 'wowza', 'hot damn', 'good grief', 'good lord', 'good heavens', 'my goodness', 'my word', 'oh no', 'oh god',
	'oh my', 'oh man', 'oh boy', 'oh dear', 'oh wow', 'oh crap', 'oh shit', 'oh please', 'oh come on', 'come off it',
	'no way', 'not again', 'for goodness sake', 'for crying out loud', 'omg', 'wtf', 'yesss', 'yessss', 'thank god',
	'thank goodness', 'thank heavens', 'you what'
].join('|')

/** Interjections that are also ordinary words, so a clause must follow: "man, that was close". */
const softInterjections = `man|boy|dude|bro|god|lord|christ|jesus|holy|hell|damn|shoot|crap|shit|bugger|bollocks|blast|bother`

/** Fixed exclamative formulas that no structural rule would otherwise catch. */
const exclamativeFormulas = [
	'congratulations', 'congrats', 'well done', 'good luck', 'best of luck', 'happy birthday', 'happy anniversary',
	'happy new year', 'happy christmas', 'merry christmas', 'happy holidays', 'happy easter', `season${A}s greetings`,
	'welcome back', 'welcome home', 'welcome aboard', 'bless you', 'god bless', 'cheers', 'hooray for', `here${A}s to`,
	'rest in peace', 'get well soon', 'safe travels', 'bon voyage', 'good riddance', 'about time', 'not again',
	'never again', 'no way', 'as if', 'my pleasure', 'nailed it', 'crushed it', 'smashed it', 'you did it', 'we did it',
	'i did it', 'told you so', 'i knew it', 'here we go', `let${A}s go`, 'love it', 'loving it', 'love this', 'love that',
	'hats off', 'chapeau', 'legend', 'amen to that', 'hear hear', 'good on you', 'fair play', 'take a bow'
].join('|')

/** Short urgent commands, conventionally exclamations rather than neutral instructions. */
const urgentCommands = `watch out|look out|heads up|get out|get down|get back|get off|hurry up|hurry|come on|move it|run|duck|freeze|stop it|stop that|cut it out|knock it off|shut up|go away|leave me alone|let go|help me|careful|mind out|wake up|listen up|look alive|hands off|back off|not so fast`

/** Verbs that commonly open an imperative. Reported as declarative, per this library's three types. */
const imperativeVerbs = [
	'please', 'kindly', 'let', 'lets', `let${A}s`, 'do not', `don${A}t`, 'never', 'always', 'no\\s+\\w+ing',
	'go', 'come', 'stay', 'stand', 'sit', 'wait', 'hold', 'keep', 'stop', 'start', 'begin', 'finish', 'continue', 'carry',
	'take', 'bring', 'give', 'get', 'put', 'place', 'set', 'lay', 'drop', 'pick', 'grab', 'hand', 'pass', 'send',
	'deliver', 'make', 'build', 'create', 'design', 'draw', 'paint', 'write', 'draft', 'note', 'record', 'sign', 'fill',
	'complete', 'read', 'review', 'check', 'verify', 'confirm', 'ensure', 'inspect', 'examine', 'test', 'try', 'compare',
	'measure', 'count', 'calculate', 'estimate', 'analyse', 'analyze', 'assess', 'consider', 'think', 'imagine',
	'picture', 'suppose', 'remember', 'forget', 'recall', 'remind', 'tell', 'say', 'speak', 'talk', 'ask', 'answer',
	'reply', 'respond', 'explain', 'describe', 'define', 'clarify', 'summarize', 'summarise', 'list', 'outline',
	'expand', 'elaborate', 'translate', 'call', 'ring', 'phone', 'text', 'email', 'message', 'ping', 'contact', 'reach',
	'follow', 'invite', 'join', 'meet', 'open', 'close', 'shut', 'lock', 'unlock', 'press', 'push', 'pull', 'click',
	'tap', 'swipe', 'scroll', 'select', 'choose', 'type', 'enter', 'input', 'paste', 'copy', 'cut', 'delete', 'remove',
	'clear', 'undo', 'redo', 'save', 'download', 'upload', 'export', 'import', 'share', 'print', 'scan', 'attach',
	'detach', 'insert', 'add', 'append', 'include', 'install', 'uninstall', 'update', 'upgrade', 'downgrade', 'reset',
	'restart', 'reboot', 'refresh', 'reload', 'run', 'execute', 'deploy', 'launch', 'compile', 'debug', 'fix', 'repair',
	'patch', 'merge', 'commit', 'clone', 'branch', 'revert', 'rollback', 'refactor', 'rename', 'move', 'sort', 'filter',
	'group', 'format', 'indent', 'align', 'adjust', 'change', 'modify', 'edit', 'replace', 'swap', 'switch', 'toggle',
	'enable', 'disable', 'turn', 'connect', 'disconnect', 'plug', 'unplug', 'charge', 'power', 'boot', 'log', 'login',
	'logout', 'register', 'subscribe', 'apply', 'submit', 'cancel', 'approve', 'reject', 'accept', 'decline', 'ignore',
	'skip', 'proceed', 'pause', 'resume', 'schedule', 'book', 'reserve', 'order', 'buy', 'sell', 'pay', 'spend',
	'invest', 'budget', 'plan', 'prepare', 'organize', 'organise', 'arrange', 'tidy', 'clean', 'wash', 'rinse', 'dry',
	'wipe', 'polish', 'pack', 'unpack', 'load', 'unload', 'lift', 'raise', 'lower', 'throw', 'catch', 'kick', 'hit',
	'stir', 'mix', 'whisk', 'fold', 'chop', 'slice', 'dice', 'peel', 'grate', 'season', 'sprinkle', 'pour', 'heat',
	'preheat', 'boil', 'simmer', 'fry', 'bake', 'roast', 'grill', 'steam', 'serve', 'eat', 'drink', 'taste', 'enjoy',
	'rest', 'relax', 'breathe', 'sleep', 'wake', 'exercise', 'stretch', 'walk', 'drive', 'ride', 'travel', 'visit',
	'explore', 'search', 'look', 'watch', 'see', 'listen', 'hear', 'notice', 'observe', 'monitor', 'track', 'trace',
	'find', 'locate', 'identify', 'discover', 'learn', 'study', 'practice', 'practise', 'teach', 'train', 'guide',
	'lead', 'show', 'demonstrate', 'present', 'report', 'use', 'reuse', 'avoid', 'prevent', 'protect', 'secure', 'back',
	'restore', 'backup', 'archive', 'store', 'feed', 'water', 'mind', 'beware', 'behave', 'be', 'have', 'remain',
	'become', 'act', 'work', 'help', 'thank', 'welcome'
].join('|')

/* ------------------------------------------------------------------------------------------------
 * Reusable predicate fragments
 * ----------------------------------------------------------------------------------------------*/

/** Copulas and other linking verbs that introduce a predicate adjective. */
const copulas = `(?:is|are|am|was|were|be|been|${A}s|${A}re|${A}m|looks?|looked|sounds?|sounded|seems?|seemed|feels?|felt|smells?|tastes?|gets?|got|becomes?|became|stays?|remains?|turned out|came out|turns out)`

/** Subjects a copula may cliticise onto: "that's", "it's", "they're", "the food's". */
const evaluatedSubjects = `(?:${personalPronouns}|${otherPronouns}|the|my|your|his|her|our|their|its)(?:${clitics})?`

/** Zero or more degree modifiers. */
const padding = `(?:(?:${intensifiers})\\s+)*`

export const en: SentenceTypeDetectExpressionSets = [
	/* ============================================================================================
	 * 1. Explicit terminal punctuation — if the writer marked the sentence, believe them.
	 * ==========================================================================================*/
	{
		// "Stop!", "What?!", "Amazing!!!" — an exclamation mark outranks a question mark.
		expression: new RegExp(`[!\u203C\u2049\u203D]${CLOSE}$`),
		type: 'exclamatory'
	},
	{
		// "Are you coming?", "Really?", and the full-width form used in CJK-influenced text.
		expression: new RegExp(`[?\uFF1F]${CLOSE}$`),
		type: 'interrogative'
	},
	{
		// A full stop or ellipsis is just as explicit as the marks above: "Hello world."
		expression: new RegExp(`[.\u2026]${CLOSE}$`),
		type: 'declarative'
	},

	/* ============================================================================================
	 * 2. Exclamative syntax, checked before the wh-rules because it reuses the same wh-words:
	 *    "What a mess" is not a question about a mess.
	 * ==========================================================================================*/
	{
		// "What a day", "What an absolute mess", "Such a waste", "This is such a lovely surprise".
		// Guarded so a genuine question that happens to contain a "such a ..." phrase further in
		// (e.g. "could anyone believe such a ridiculous claim") is left for the interrogative rules.
		expression: new RegExp(`^(?!${lead}${inversion(looseSubject)})(?:${clausePrefix}(?:what|such)\\s+(?:a|an)\\b|\\b(?:${copulas})\\s+${padding}such\\s+(?:a|an)\\b|\\bsuch\\s+(?:a|an)\\s+${padding}(?:${emotionalExpressions}|${mildAdjectives})\\b)`, 'i'),
		type: 'exclamatory'
	},
	{
		// Determiner-less exclamative noun phrase: "What lovely flowers", "What nonsense".
		expression: new RegExp(`^${clausePrefix}what\\s+${padding}(?:${emotionalExpressions}|${emotionalNouns})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// "Look at that sunset", "Look how big he's got" — a short deictic call to attention.
		// Anything longer is an ordinary instruction and falls through to the imperative rule.
		expression: new RegExp(`^${lead}(?:look|check\\s+out)\\s+(?:how|what|at)\\b[^,]{0,32}$`, 'i'),
		type: 'exclamatory'
	},
	{
		// "How quickly the summer went", "How beautifully she sings", "How lucky we are to have you".
		// Exclamative "how" takes a degree word *and then a subject*; a question inverts instead
		// ("How tall is he"), so an auxiliary or degree word in that slot rules this out.
		expression: new RegExp(`^${clausePrefix}how\\s+(?!(?:${auxiliaries}|${degreeWords}|${whAdverbs})\\b)${padding}[\\w-]+\\s+(?:${personalPronouns}|${otherPronouns}|${determiners})(?:${clitics})?\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Bare "How lovely", "How very odd", "How kind of you", "How embarrassing for them".
		expression: new RegExp(`^${clausePrefix}how\\s+${padding}(?:${emotionalExpressions}|${mildAdjectives}|[\\w-]+ly)(?:\\s+(?:of|for)\\s+${W})?\\s*$`, 'i'),
		type: 'exclamatory'
	},
	{
		// Rhetorical "How cool is that", "How annoying is this rate limit" — a question in form only.
		// Degree words are excluded so genuine degree questions ("how far is it") fall through to the
		// interrogative degree-question rule instead of being read as rhetorical exclamations.
		expression: new RegExp(`^${clausePrefix}how\\s+${padding}(?!(?:${degreeWords})\\b)(?:${emotionalExpressions}|${mildAdjectives})\\s+(?:is|was|are|were)\\s+(?:that|this|these|those|it|he|she|they)\\b`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 3. Interrogative syntax.
	 * ==========================================================================================*/
	{
		// Wh-word with a contracted auxiliary: "what's", "who're", "where'd", "how'll", "why've".
		expression: new RegExp(`^${clausePrefix}(?:${whWords})${clitics}\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// Wh-fronting with inversion: "when is the meeting", "why did she leave", "who have you told",
		// "how exactly does that work".
		expression: new RegExp(`^${clausePrefix}(?:${whWords})\\s+(?:(?:${whAdverbs})\\s+)?(?:${auxiliaries})\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// A fronted wh-phrase, then inversion: "what time does the shop close", "what kind of music do
		// you like", "which framework would you recommend", "whose keys are these". The word right
		// after the wh-word may not be a personal pronoun, or "when I was young" and "what you did was
		// kind" would look inverted when they are not.
		expression: new RegExp(`^${clausePrefix}(?:${whWords})\\s+(?!(?:${personalPronouns})\\b)(?:${W}\\s+){1,3}(?:${auxiliaries})\\s+${strictSubject}\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// A preposition fronted along with its wh-complement (pied-piping): "at what time shall we
		// meet", "by whom was it discovered", "to whom are you talking", "in which room did they stay".
		expression: new RegExp(`^${clausePrefix}(?:about|after|against|among|around|as|at|before|behind|below|beneath|beside|between|beyond|by|down|during|except|for|from|in|into|near|of|off|on|onto|out|over|since|through|throughout|to|toward|towards|under|underneath|until|up|upon|via|with|within|without)\\s+(?:${whWords})\\b(?:\\s+${W})?\\s+(?:${auxiliaries})\\s+${strictSubject}\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// Degree questions: "how much", "how many people are coming", "how far", "how come".
		expression: new RegExp(`^${clausePrefix}how\\s+(?:${degreeWords})\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// The wh-word *is* the subject, so nothing inverts: "who called", "what happened",
		// "which train goes to Oxford", "what caused the outage", "who wants dessert". No comma-prefix
		// here — it would swallow relative clauses ("my brother, who lives in Cardiff, is visiting").
		expression: new RegExp(`^${lead}(?:who|what|which|whose)\\s+(?!(?:${personalPronouns})\\b)(?:${W}\\s+){0,4}(?:[\\w-]+(?:s|ed)|${auxiliaries}|went|came|got|made|took|broke|said|did|gave|told|left|won|lost|felt|kept|held|meant|brought|bought|sold|sent|found|thought|knew|grew|wrote|ran|began|spoke|chose|drove|fell|led|paid|built|sat|stood|understood|became)\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// Wh-fragments and formulas: "what about the deposit", "how about tomorrow", "what if it rains",
		// "how come", "why not", "why bother", "which one", "what else", "so what", "says who".
		expression: new RegExp(`^${clausePrefix}(?:(?:what|how)\\s+(?:about|if)\\b|why\\s+(?:bother|worry|ask|care|me|him|her|us|them)\\b|(?:${whWords})\\s+(?:not|else|then|though|now|so|for|to|come|next|again|exactly)\\b|(?:${whWords})(?:\\s+${W}){0,2}\\s*$)|^${lead}says\\s+who\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// Subject-auxiliary inversion, the core yes/no question: "is the shop open", "did Tom call",
		// "have you eaten", "could I borrow this", "aren't you cold", "was there a problem",
		// "would switching to TypeScript help".
		expression: new RegExp(`^${lead}${inversion(looseSubject)}\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// The same inversion after a comma-terminated lead-in, where only an unambiguous subject is
		// safe: "if you have a minute, could you look at this", "by the way, is the office open".
		expression: new RegExp(`^${clausePrefix}${inversion(strictSubject)}\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// A subordinate clause followed by an inverted main clause, with no comma marking the join:
		// "before I forget are we still on for Friday". Requiring a personal pronoun as the subject
		// keeps ordinary complex statements out ("if you have any questions let me know").
		expression: new RegExp(`^${lead}(?:${subordinators})\\b[^,?!]{0,80}?\\s(?:${auxiliaries})\\s+(?:${personalPronouns})\\b`, 'i'),
		type: 'interrogative'
	},
	{
		// The same after an opening that reliably introduces a question: "quick question is the office
		// open on Monday", "sorry to bother you but is this yours", "out of curiosity how much was it".
		expression: new RegExp(`^${lead}(?:${questionOpeners})\\b[^,?!]{0,60}?[\\s,]+(?:${inversion(strictSubject)}|(?:${whWords})\\b)`, 'i'),
		type: 'interrogative'
	},
	{
		// Question tags: "it's cold, isn't it", "you paid him, didn't you", "we're nearly there, aren't we",
		// "there aren't any issues, are there".
		expression: new RegExp(`[\\w${APOS}][,\\s]+(?:${auxiliaries})\\s+(?:${personalPronouns}|there)\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Tag words that turn a statement into a question: "that works, right", "you're in, yeah".
		// The lookbehind keeps ordinary sentence-final uses out ("turn right", "that is correct").
		expression: new RegExp(`[\\w${APOS}][,\\s]+(?<!\\b(?:is|are|was|were|am|be|been|${A}s|${A}re|${A}m|all|just|not|so|as|than|of|for|to|about|almost|nearly|exactly|perfectly|absolutely|the|a|an|you|and|back|until|since|even|way|damn|dead|turn|turned|left|feel|feels|look|looks|sound|sounds|seem|seems|alright)\\s)(?:right|correct|yeah|yea|yep|huh|eh|innit|ok|okay)\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Echo / in-situ questions, where the wh-word stays in its answer slot instead of fronting:
		// "he bought what", "she told whom", "he did what". Placed last in this section so every more
		// specific fronted-wh or inversion rule above gets first refusal.
		expression: new RegExp(`\\b(?:${whWords})\\s*$`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 4. Fixed exclamative formulas, ahead of the question fragments below, which would otherwise
	 *    read "well done you passed" as an elliptical question.
	 * ==========================================================================================*/
	{
		// "Congratulations", "happy birthday", "well done", "no way", "nailed it", "love it".
		expression: new RegExp(`^${lead}(?:${exclamativeFormulas})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// "Watch out", "get out of the road", "stop it", "help me", "hurry up".
		expression: new RegExp(`^${lead}(?:${urgentCommands})\\b(?:\\s+${W}){0,3}\\s*$`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 5. Verbless and elliptical questions — everyday spoken shorthand with no auxiliary to invert,
	 *    so only the shape of the fragment is left to go on.
	 * ==========================================================================================*/
	{
		// Built on a pronoun: "you sure", "you ok", "you coming", "he serious".
		expression: new RegExp(`^${lead}(?:${personalPronouns})\\s+(?:sure|ok|okay|alright|right|there|ready|coming|going|joking|kidding|serious|listening|awake|around|done|free|busy|good|hungry|in|up|game|still\\s+(?:there|here))\\b(?:\\s+${W}){0,2}\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// "Any questions", "anyone home", "anything else for you today", "got a minute". A finite verb
		// anywhere means it is a statement instead ("anything is possible", "got a new job last week").
		expression: new RegExp(`^${lead}(?:(?:any|anyone|anybody|anything|anywhere|anyhow)\\w*|got\\s+(?:a|an|any|the))\\b(?!.*\\b(?:${auxiliaries})\\b)(?:\\s+${W}){0,4}\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// A bare participle, the commonest spoken fragment of all: "feeling better", "sleeping already",
		// "coming with us", "still raining out there".
		expression: new RegExp(`^${lead}(?:still\\s+)?[\\w-]{3,}ing(?:\\s+${W}){0,2}\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Alternative questions offered as a fragment: "tea or coffee", "now or later", "yes or no".
		expression: new RegExp(`^${lead}${W}(?:\\s+${W}){0,2}\\s+or\\s+${W}(?:\\s+${W}){0,3}\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// Conventional request openings: "mind if I sit here", "care for a drink", "fancy a coffee",
		// "any idea when he'll be back", "guess what".
		expression: new RegExp(`^${lead}(?:mind\\s+if|care\\s+(?:for|to)|fancy\\s+(?:a|an|some)|wanna|want\\s+to\\s+(?:grab|come|join)|up\\s+for|how\\s+goes|guess\\s+(?:what|who)|any\\s+(?:idea|chance|thoughts|luck|news|update))\\b`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 6. Emphatic negation, ahead of the imperative rule so "never in a million years" is not read
	 *    as a command beginning with "never".
	 * ==========================================================================================*/
	{
		// "Never in a million years", "never again", "not a chance", "not on my watch", "this again".
		expression: new RegExp(`^${lead}(?:never\\s+(?:in|again|ever|have|has|had|did|was|were|would|mind)\\b|not\\s+(?:again|a\\s+chance|a\\s+hope|in\\s+a|on\\s+my|even\\s+close|one\\s+bit)\\b|(?:this|that|it|him|her|them|you)\\s+again\\s*$)`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 7. Imperatives. Reported as declarative because this library exposes only three types.
	 * ==========================================================================================*/
	{
		// "Close the door", "please fill in the form", "don't forget your umbrella", "let's leave at six".
		// A following auxiliary means the word was a noun after all: "Help is on the way".
		expression: new RegExp(`^${clausePrefix}(?:${imperativeVerbs})\\b\\s*(?!(?:${auxiliaries})\\b)`, 'i'),
		type: 'declarative'
	},
	{
		// A subordinate clause followed by a main clause that is not a question:
		// "When I was young we lived by the sea", "Although it rained, the picnic went ahead".
		expression: new RegExp(`^${lead}(?:${subordinators})\\b[^,]{0,120},\\s*(?!(?:${auxiliaries}|${whWords})\\b)`, 'i'),
		type: 'declarative'
	},

	/* ============================================================================================
	 * 8. Exclamative content: interjections, evaluative predicates, superlatives, emphasis.
	 * ==========================================================================================*/
	{
		// "Wow, that was close", "ugh, not again", "oh no, the milk has gone off", "yay".
		expression: new RegExp(`^(?:${discourseMarkers})?[\\s,]*(?:${interjections})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Interjections that are also ordinary nouns, so a clause has to follow to disambiguate:
		// "man, that error took forever" — but not "man is mortal".
		expression: new RegExp(`^${lead}(?:${softInterjections})\\b(?:\\s*,\\s*|\\s+(?=(?:${evaluatedSubjects})\\b))`, 'i'),
		type: 'exclamatory'
	},
	{
		// An evaluative word as its own opening remark, followed by the clause it reacts to:
		// "amazing, you finished already", "great news, the offer was accepted", "perfect, that's it".
		expression: new RegExp(`^${lead}${padding}(?:${emotionalExpressions}|great|good|nice|sweet|cool|excellent|superb|lovely)\\b(?:\\s+(?:${praiseNouns}))?(?:\\s*,\\s*|\\s+${padding}(?=(?:${evaluatedSubjects})\\b))`, 'i'),
		type: 'exclamatory'
	},
	{
		// Praise formulas: "great job on the presentation", "nice work everyone", "good point",
		// "that's a genuinely great question".
		expression: new RegExp(`(?:^${lead}|(?:${copulas})\\s+(?:a|an)\\s+)${padding}(?:${emotionalExpressions}|great|good|nice|sweet|solid|excellent|lovely|smart|clever)\\s+(?:${praiseNouns})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Evaluative predicate: "this is amazing", "the service here is dreadful", "that sounds awful",
		// "your garden looks stunning", "it turned out incredible".
		expression: new RegExp(`\\b(?:${copulas})\\s+${padding}(?:${emotionalExpressions})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// The same shape with an everyday adjective, which counts only when strongly intensified:
		// "this is so frustrating", "it's unbelievably slow", "that was absolutely fine".
		expression: new RegExp(`\\b(?:${copulas})\\s+${padding}(?:${emphaticIntensifiers})\\s+${padding}[\\w-]+\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Evaluative noun predicate: "that was a close call", "you're a lifesaver", "it's a total disaster".
		expression: new RegExp(`\\b(?:${copulas})\\s+(?:a|an|the|one)\\s+${padding}(?:(?:${emotionalExpressions})\\s+[\\w-]+|${emotionalNouns})\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// First-person reactions: "I love this song", "I can't believe we won", "I'm so proud of you",
		// "we're absolutely thrilled", "I can't wait".
		expression: new RegExp(`\\b(?:i|we|you|he|she|they)(?:${clitics})?\\s+(?:${padding}(?:love|loved|adore|hate|hated)\\s+(?!to\\b)|(?:can${A}t|cannot|couldn${A}t|can\\s+never)\\s+(?:believe|wait|stand|get\\s+over|cope)\\b|(?:am|is|are|was|were|${A}m|${A}re|${A}s)\\s+(?:${emphaticIntensifiers})\\s+)`, 'i'),
		type: 'exclamatory'
	},
	{
		// Degree emphasis: "so much better than before", "way too slow", "even better than I hoped",
		// "that makes so much more sense".
		expression: new RegExp(`\\b(?:so\\s+much|so\\s+many|way\\s+too|far\\s+too|much\\s+too|way|even|far)\\s+(?:more\\s+)?(?:better|worse|easier|harder|faster|slower|cleaner|nicer|simpler|smoother|clearer|sense|fun|good|bad)\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Superlatives with a scope phrase: "the best meal I've had all year", "the worst possible
		// timing", "the funniest thing I've heard all week".
		expression: new RegExp(`\\b(?:best|worst|greatest|finest|\\w{3,}est|most\\s+[\\w-]+)\\b[^,]{0,60}?\\b(?:ever|i${A}ve|we${A}ve|i\\s+have|possible|imaginable|in\\s+(?:years|ages|history|my\\s+life)|all\\s+(?:day|week|month|year|night|season))\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// "This is exactly what I needed", "that's just what the doctor ordered", "precisely the point".
		expression: new RegExp(`\\b(?:${copulas})\\s+(?:exactly|just|precisely|absolutely|literally)\\s+(?:what|the|how|why|it)\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Emphatic openings: "absolutely gorgeous", "so embarrassing", "totally worth it".
		expression: new RegExp(`^${lead}(?:${emphaticIntensifiers})\\s+(?:${emotionalExpressions}|${mildAdjectives}|worth|fun)\\b`, 'i'),
		type: 'exclamatory'
	},
	{
		// Relief at a long-awaited result: "finally it works", "the tests are finally passing".
		expression: new RegExp(`\\b(?:finally|at\\s+last)\\b(?:\\s+${W}){0,4}\\s*\\b(?:works?|working|worked|passing|passed|done|fixed|shipped|resolved|over|here|arrived|green|right)\\b|^${lead}(?:finally|at\\s+last)\\b(?:\\s+${W}){1,4}\\s*$`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 9. Anything left over is a statement.
	 * ==========================================================================================*/
	{
		expression: /.+/,
		type: 'declarative'
	}
]