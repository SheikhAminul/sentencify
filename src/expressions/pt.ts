// pt.ts
import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/**
 * Portuguese sentence-type detection (Brazilian and European usage).
 *
 * Input contract (see ../type-detection.ts): sentences arrive lowercase, trimmed and
 * **without punctuation**. That hurts more in Portuguese than in most languages, because
 * Portuguese marks yes/no questions almost exclusively by intonation:
 *
 *     "você vem amanhã"   -> statement *and* question, identical strings
 *
 * There is no reliable V1/V2 signal to fall back on either: null-subject statements are
 * everywhere ("está chovendo", "foi ótimo", "faz sentido"), so a fronted verb proves
 * nothing. What Portuguese *does* encode lexically, and what these rules use:
 *
 *   1. wh-words (que, o que, qual, quem, quando, onde, como, quanto, por que, cadê …)
 *   2. final tags ("né", "não é mesmo", "ou não", "hein")
 *   3. question markers ("será que", "por acaso", "tem certeza", "dá pra")
 *   4. request/offer forms ("posso …", "pode me …", "quer …", "sabe onde …")
 *   5. 2nd person singular morphology, which addresses the listener directly and is
 *      therefore question-prone in EP ("queres", "sabes", "gostaste", "fizeste")
 *   6. imperative morphology: the subjunctive-based você/vocês forms ("faça", "digam",
 *      "não se preocupe") and bare tu forms plus a clitic or particle ("me ajuda",
 *      "espera aí", "diz-me")
 *   7. the exclamative constructions "que + AVALIATIVO", "como + cópula + AVALIATIVO",
 *      "quanto + NOME", superlatives in -íssimo, and interjections
 *
 * Because the first matching rule wins, the ordering below is the actual algorithm:
 *
 *    1. tag questions
 *    2. frozen phrases that only look interrogative ("como sempre", "quem sabe", "porque")
 *    3. fixed elliptical questions ("o quê", "como assim", "e aí", "tudo bem")
 *    4. wh-exclamatives      – before the wh-questions ("que pena", "como é lindo")
 *    5. wh-questions
 *    6. question markers     – "será que", "por acaso", "tem certeza"
 *    7. requests and offers  – "posso entrar", "pode me ajudar", "quer café"
 *    8. 2nd person singular forms (mostly European Portuguese)
 *    9. imperatives          – subjunctive forms, tu forms with a clitic, negatives
 *   10. interjections, greetings, curses, closing formulas
 *   11. emphatic statements  – declarative order with exclamatory force
 *   12. declarative default
 *
 * Known limits, unsolvable without punctuation or prosody: declarative-order yes/no
 * questions ("você vem amanhã", "chegou o João"), and initial "quando"/"como" adverbial
 * clauses ("quando cheguei ele já tinha saído") which are read as questions.
 */

/* ------------------------------------------------------------------ helpers */

/** Wraps alternatives in a non-capturing group. */
const any = (...alternatives: string[]): string => `(?:${alternatives.join('|')})`

/**
 * End-of-word guard used instead of `\b`. JavaScript's word boundary is ASCII based, so
 * `está\b`, `né\b` or `você\b` can never match; this lookahead covers accented letters.
 */
const EOW = '(?![a-záàâãéêíìóòôõúùüçñ])'

/** A single letter / a single word (accented letters included). */
const LETTER = '[a-záàâãéêíìóòôõúùüçñ]'
const WORD = `${LETTER}+`

/** Compiles a rule source string; all rules are case-insensitive. */
const rx = (source: string): RegExp => new RegExp(source, 'i')

/* --------------------------------------------------------------- pronouns */

const SUBJECT_PRONOUN = any('eu', 'tu', 'você', 'vocês', 'vc', 'vcs', 'cê', 'ele', 'ela', 'eles', 'elas', 'nós', 'vós', 'a gente', 'o senhor', 'a senhora', 'os senhores', 'as senhoras')

/** Unstressed object pronouns, which may also be enclitic ("diz-me", "ajude-me"). */
const CLITIC = any('me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes', 'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las', 'mo', 'ma')

/* ------------------------------------------------------- evaluative lexicon */

/** Intensifiers that may sit between a copula and an evaluative word. */
const INTENSIFIER = any('mais', 'tão', 'muito', 'mto', 'super', 'bem', 'tanto', 'tamanho', 'extremamente', 'incrivelmente', 'absurdamente', 'realmente', 'mesmo', 'tremendamente', 'terrivelmente', 'bastante')

/** Copulas and other linking verbs an evaluative predicate hangs off. */
const COPULA = any('é', 'são', 'foi', 'foram', 'era', 'eram', 'está', 'estão', 'estava', 'estavam', 'tá', 'tão', 'ficou', 'ficaram', 'fica', 'ficam', 'ficava', 'parece', 'parecem', 'pareceu', 'parecia', 'virou', 'viraram', 'continua', 'és', 'estás', 'estavas', 'anda')

/**
 * Strongly evaluative adjectives. Used both after "que"/"como" and – on their own – as
 * evidence that a declarative-order sentence is really an exclamation. Neutral gradable
 * adjectives (grande, caro, novo, quente …) are deliberately absent: "o prédio é grande"
 * must stay declarative.
 */
const EMOTIVE = any(
	'incrív(?:el|eis)', 'inacreditáv(?:el|eis)', 'inimagináv(?:el|eis)', 'impressionantes?', 'surpreendentes?',
	'maravilhos[oa]s?', 'fantástic[oa]s?', 'fabulos[oa]s?', 'sensaciona(?:l|is)', 'espetacular(?:es)?', 'espantos[oa]s?',
	'extraordinári[oa]s?', 'formidáv(?:el|eis)', 'magnífic[oa]s?', 'esplêndid[oa]s?', 'sublimes?', 'divin[oa]s?',
	'perfeit[oa]s?', 'impecáv(?:el|eis)', 'imperdív(?:el|eis)', 'inesquecív(?:el|eis)', 'emocionantes?', 'comoventes?',
	'genia(?:l|is)', 'brilhantes?', 'excelentes?', 'ótim[oa]s?', 'otim[oa]s?', 'lind[oa]s?', 'deslumbrantes?',
	'encantador(?:a|es|as)?', 'adoráv(?:el|eis)', 'delicios[oa]s?', 'hilári[oa]s?', 'engraçadíssim[oa]s?',
	'terrív(?:el|eis)', 'horrív(?:el|eis)', 'horroros[oa]s?', 'medonh[oa]s?', 'péssim[oa]s?', 'pessim[oa]s?',
	'nojent[oa]s?', 'repugnantes?', 'assustador(?:a|es|as)?', 'aterrorizantes?', 'chocantes?', 'deprimentes?',
	'lamentáv(?:el|eis)', 'vergonhos[oa]s?', 'escandalos[oa]s?', 'inaceitáv(?:el|eis)', 'insuportáv(?:el|eis)',
	'catastrófic[oa]s?', 'trágic[oa]s?', 'absurd[oa]s?', 'ridícul[oa]s?', 'grotesc[oa]s?', 'surrea(?:l|is)',
	'insan[oa]s?', 'louc[oa]s?', 'doid[oa]s?', 'maluc[oa]s?', 'idiotas?', 'imbec(?:il|is)', 'estúpid[oa]s?', 'burr[oa]s?',
	'gigantesc[oa]s?', 'colossa(?:l|is)', 'monstruos[oa]s?', 'sortud[oa]s?', 'injust[oa]s?', 'cru(?:el|éis)'
)

/**
 * Mildly evaluative adjectives. Enough to license an exclamation after "que"/"como"
 * ("que legal", "como é chato"), but not on their own: "a comida é boa" is a statement.
 */
const EMOTIVE_MILD = any(
	'bom', 'bons', 'boa', 'boas', 'lega(?:l|is)', 'bacanas?', 'massa', 'top', 'j[oó]ia', 'show', 'chique', 'daora',
	'fei[oa]s?', 'ruim', 'ruins', 'chat[oa]s?', 'tristes?', 'engraçad[oa]s?', 'gostos[oa]s?', 'fof[oa]s?', 'espert[oa]s?',
	'querid[oa]s?', 'bonit[oa]s?', 'bel[oa]s?', 'difíc(?:il|eis)', 'fác(?:il|eis)', 'estranh[oa]s?',
	'esquisit[oa]s?', 'corajos[oa]s?', 'genti(?:l|s)', 'amáv(?:el|eis)', 'sinistr[oa]s?', 'demais'
)

/** Nouns that carry their own affect, the classic complement of exclamative "que". */
const EMOTIVE_NOUN = any(
	'pena', 'saudades?', 'sorte', 'azar', 'susto', 'horror', 'nojo', 'vergonha', 'alívio', 'alegria', 'tristeza',
	'loucura', 'maravilha', 'beleza', 'absurdo', 'droga', 'merda', 'porcaria', 'bagunça', 'confusão', 'chatice',
	'fome', 'sede', 'sono', 'calor', 'frio', 'dor', 'medo', 'raiva', 'ódio', 'amor', 'paixão', 'orgulho', 'coragem',
	'barulho', 'silêncio', 'bobagem', 'besteira', 'exagero', 'desperdício', 'injustiça', 'tragédia', 'desastre',
	'milagre', 'surpresa', 'coincidência', 'delícia', 'gracinha', 'honra', 'prazer', 'privilégio', 'inferno',
	'paraíso', 'sacanagem', 'tédio', 'cansaço', 'sufoco', 'perrengue', 'saco', 'gente', 'ironia', 'pesadelo',
	'cara de pau', 'mão na roda', 'falta de sorte', 'baita', 'tanta gente', 'nervoso', 'papelão', 'mancada'
)

/* ------------------------------------------------------------- imperatives */

/**
 * Subjunctive-based imperatives (você/vocês), the standard way of giving an order in
 * writing and in Brazil in speech. Sentence-initially these are unambiguous commands.
 * Homographs of prepositions or nouns ("entre", "para", "sente", "conte") are excluded
 * and handled through the clitic/particle rule instead.
 */
const IMPERATIVE_SUBJ = any(
	'faça', 'façam', 'diga', 'digam', 'venha', 'venham', 'vá', 'seja', 'sejam', 'esteja', 'estejam', 'tenha',
	'tenham', 'saiba', 'saibam', 'ponha', 'ponham', 'saia', 'saiam', 'dê', 'deem', 'dêem', 'veja', 'vejam', 'ouça',
	'ouçam', 'olhe', 'olhem', 'escute', 'escutem', 'espere', 'esperem', 'pare', 'parem', 'deixe', 'deixem', 'pegue',
	'peguem', 'traga', 'tragam', 'leve', 'levem', 'tome', 'tomem', 'ande', 'andem', 'corra', 'corram', 'levante',
	'levantem', 'ajude', 'ajudem', 'cuide', 'cuidem', 'tente', 'tentem', 'siga', 'sigam', 'leia', 'leiam', 'escreva',
	'escrevam', 'abra', 'abram', 'feche', 'fechem', 'pense', 'pensem', 'lembre', 'lembrem', 'esqueça', 'esqueçam',
	'desculpe', 'desculpem', 'perdoe', 'perdoem', 'aguarde', 'aguardem', 'responda', 'respondam', 'repita', 'repitam',
	'continue', 'continuem', 'comece', 'comecem', 'termine', 'terminem', 'evite', 'evitem', 'verifique', 'verifiquem',
	'confira', 'confiram', 'clique', 'cliquem', 'digite', 'digitem', 'preencha', 'preencham', 'assine', 'assinem',
	'envie', 'enviem', 'ligue', 'liguem', 'avise', 'avisem', 'chame', 'chamem', 'use', 'usem', 'coloque', 'coloquem',
	'retire', 'retirem', 'mantenha', 'mantenham', 'guarde', 'guardem', 'prove', 'provem', 'experimente', 'experimentem',
	'aproveite', 'aproveitem', 'relaxe', 'relaxem', 'acalme', 'aperte', 'apertem', 'puxe', 'puxem', 'empurre',
	'empurrem', 'suba', 'subam', 'desça', 'desçam', 'volte', 'voltem', 'fique', 'fiquem', 'desista', 'desistam',
	'fale', 'falem', 'coma', 'comam', 'beba', 'bebam', 'durma', 'durmam', 'minta', 'chore',
	'grite', 'brigue', 'desanime', 'atreva', 'ouse', 'mexa', 'mexam', 'toque', 'toquem', 'preocupe', 'preocupem',
	'entregue', 'devolva', 'apague', 'acenda', 'abaixe', 'aumente', 'diminua', 'limpe', 'lave', 'arrume', 'organize',
	'prepare', 'sirva', 'misture', 'salve', 'baixe', 'instale', 'atualize', 'reinicie', 'cadastre',
	'indique', 'marque', 'agende', 'cancele', 'confirme', 'reserve', 'compre', 'pague', 'poupe', 'economize', 'estude',
	'aprenda', 'treine', 'pratique', 'respire', 'acorde', 'junte', 'conte', 'note', 'imagine', 'imaginem', 'adivinhe', 'adivinhem', 'escolha', 'escolham', 'decida', 'decidam', 'peça', 'peçam',
	'digas', 'faças', 'vás', 'venhas', 'sejas', 'estejas', 'tenhas', 'fales', 'comas', 'bebas', 'corras', 'percas',
	'esqueças', 'preocupes', 'toques', 'mexas', 'saias', 'entres', 'olhes', 'esperes', 'pares', 'deixes', 'penses',
	'chores', 'grites', 'desistas', 'ouses', 'perca', 'percam', 'apresse', 'atenda', 'atendam', 'aceite', 'aceitem', 'permita', 'permitam', 'apoie', 'reze'
)

/**
 * Bare tu/colloquial imperatives. Identical to the 3rd person singular present, so they
 * only count as commands when a clitic or an imperative particle follows.
 */
const IMPERATIVE_TU = any(
	'fala', 'diz', 'faz', 'vem', 'vai', 'dá', 'põe', 'sai', 'olha', 'escuta', 'ouve', 'para', 'espera', 'deixa',
	'pega', 'traz', 'toma', 'leva', 'anda', 'corre', 'senta', 'levanta', 'ajuda', 'cuida', 'tenta', 'prova', 'come',
	'bebe', 'abre', 'fecha', 'sobe', 'desce', 'volta', 'fica', 'chama', 'liga', 'manda', 'mostra', 'conta', 'lembra',
	'esquece', 'presta', 'segura', 'solta', 'joga', 'guarda', 'aguenta', 'respira', 'aproveita', 'experimenta',
	'tira', 'coloca', 'bota', 'arruma', 'limpa', 'lava', 'apaga', 'acende', 'aperta', 'puxa', 'empurra', 'avisa',
	'responde', 'repete', 'continua', 'começa', 'termina', 'assina', 'envia', 'digita', 'clica', 'confere', 'verifica',
	'entra', 'usa', 'pensa', 'acredita', 'confia', 'sonha', 'aprende', 'estuda', 'trabalha', 'descansa', 'dorme',
	'acorda', 'desculpa', 'perdoa', 'cala', 'vira', 'pula', 'corta', 'pede', 'anota', 'marca', 'paga', 'compra', 'some', 'sente', 'segue', 'procura', 'encontra', 'escreve', 'lê', 'canta', 'dança', 'sorri', 'chora', 'sê'
)

/**
 * Particles, directional adverbs and politeness markers that typically close an
 * imperative ("espera aí", "vem cá", "fala sério", "pega leve"). Neutral adverbs such as
 * "bem" or "também" are absent so that "vai bem" stays a statement.
 */
const IMPERATIVE_PARTICLE = any(
	'aí', 'ai', 'lá', 'cá', 'aqui', 'já', 'logo', 'agora', 'isso', 'isto', 'essa', 'esse', 'aquilo', 'tudo', 'disso',
	'rápido', 'devagar', 'direito', 'quieto', 'quieta', 'calado', 'calada', 'calma', 'sério', 'leve', 'firme', 'forte',
	'comigo', 'conosco', 'embora', 'por favor', 'pf', 'pelo amor de deus', 'de novo', 'novamente', 'pra mim', 'para mim',
	'pra lá', 'pra cá', 'um pouco', 'um instante', 'um momento', 'atenção', 'cuidado', 'assim', 'nada', 'nunca mais', 'nisso', 'nessa', 'daqui', 'dali',
	'depressa', 'fundo', 'bonito', 'a boca', 'o bico', 'a verdade', 'de bobagem', 'de besteira'
)

/* ---------------------------------------------------------------- wh-words */

/** Interrogative words and phrases. */
const WH_WORD = any(
	'o que', 'o quê', 'quê', 'que horas', 'quantas vezes', 'quantos anos',
	'por que', 'por quê', 'porquê', 'por qual motivo', 'por qual razão', 'pq',
	'pra que', 'pra quê', 'para que', 'para quê',
	'desde quando', 'até quando', 'de onde', 'donde', 'aonde', 'pra onde', 'para onde', 'por onde', 'até onde',
	'com quem', 'de quem', 'para quem', 'pra quem', 'em quem', 'por quem', 'a quem',
	'com que', 'de que', 'em que', 'a que', 'sobre que', 'sobre o que', 'com o que', 'de qual', 'em qual', 'com qual',
	'cadê', 'cade', 'kd', 'quão',
	'quais', 'qual', 'quem', 'quando', 'onde', 'como', 'quant[oa]s?', 'que'
)

/** Optional conversational lead-in in front of a question ("e", "então", "por favor"). */
const LEAD = `(?:${any('e', 'então', 'mas', 'aí', 'ah', 'oh', 'ó', 'oi', 'olá', 'ei', 'opa', 'desculpa', 'desculpe', 'com licença', 'por favor', 'faz favor', 'afinal', 'gente', 'cara', 'mano', 'amigo', 'bom', 'bem', 'tipo', 'tá', 'ok', 'hum', 'hmm', 'espera', 'calma', 'peraí')}\\s+){0,2}`

/**
 * An addressee may be spelled out in front of a request ("você pode me ajudar", "vocês
 * querem entrar"). Only 2nd person forms qualify: "ele quer café" is a statement.
 */
const ADDRESSEE = `(?:${any('você', 'vocês', 'tu', 'vc', 'vcs', 'cê', 'o senhor', 'a senhora', 'os senhores', 'as senhoras')}\\s+)?`

/** Infinitives that follow a modal in a typical request ("pode repetir", "poderia abrir"). */
const REQUEST_INF = any(
	'ajudar', 'repetir', 'explicar', 'falar', 'dizer', 'esperar', 'confirmar', 'verificar', 'abrir', 'fechar', 'trazer',
	'mandar', 'enviar', 'mostrar', 'emprestar', 'passar', 'chamar', 'ligar', 'vir', 'ir', 'entrar', 'sair', 'começar',
	'parar', 'continuar', 'tentar', 'ver', 'olhar', 'escutar', 'ouvir', 'segurar', 'guardar', 'anotar', 'assinar',
	'me ajudar', 'me dizer', 'me explicar', 'me passar', 'me mostrar', 'me emprestar', 'nos ajudar'
)

/* --------------------------------------------------------------- exports */

export const pt: SentenceTypeDetectExpressionSets = [
	{
		// 1. Tag questions: a statement turned into a question by a final tag
		// ("está frio né", "você vem não é", "vamos ou não"). Anchored at the end, and
		// verb-like tags ("viu", "sabe", "entendeu") are left out because they are far too
		// common as ordinary sentence endings ("ninguém sabe", "ele não viu").
		expression: rx(`^.+\\s${any(
			'né', 'ne', 'né não', 'não é', 'nao e', 'não é mesmo', 'não é verdade', 'não é assim', 'não é não',
			'não acha', 'não achas', 'não acham', 'não concorda', 'concorda', 'concordas', 'não seria',
			'ou não', 'ou o quê', 'ou o que', 'hein', 'hem', 'tá', 'ta', 'tá bom', 'tá bem', 'tá certo', 'tá legal',
			'pode ser', 'de acordo', 'combinado', 'sim ou não'
		)}$`),
		type: 'interrogative'
	},
	{
		// 2. Frozen phrases that begin with a wh-word but are neither questions nor
		// exclamations ("como sempre", "quem sabe", "seja como for", "porque"), plus the
		// subordinating conjunctions. "se importa/incomoda" is excluded: that is a request.
		expression: rx(`^(?:${any(
			'como sempre', 'como eu disse', 'como eu falei', 'como já disse', 'como já falei', 'como você sabe',
			'como vocês sabem', 'como se sabe', 'como dito', 'como combinado', 'como previsto',
			'como se fosse', 'como se fossem', 'como se nada', 'como se tivesse',
			'como se estivesse', 'como se não', 'como esperado', 'como quiser', 'como quiseres', 'como for', 'seja como for', 'seja o que for', 'seja qual for',
			'quem sabe', 'quem quer que', 'onde quer que', 'o que quer que', 'que seja', 'que nem', 'que tal se',
			'porque', 'porquanto', 'pois é', 'pois bem', 'por isso', 'portanto', 'no entanto', 'todavia', 'contudo',
			'entretanto', 'apesar', 'embora', 'ainda que', 'mesmo que', 'mesmo assim', 'caso', 'já que', 'desde que',
			'assim que', 'logo que', 'sempre que', 'enquanto', 'antes que', 'depois que', 'a menos que',
			'a não ser que', 'conforme', 'segundo', 'visto que', 'uma vez que', 'dado que', 'contanto que', 'sem que',
			'além disso', 'ou seja', 'isto é', 'quer dizer', 'digamos que', 'sei lá', 'talvez', 'quando muito'
		)}|se(?!\\s+(?:importa|importas|incomoda|incomodas|importaria)${EOW}))${EOW}`),
		type: 'declarative'
	},
	{
		// 3. Fixed elliptical questions and echo questions, which have no verb to inspect
		// ("o quê", "como assim", "e aí", "tudo bem", "sério").
		expression: rx(`^${any(
			'o quê', 'o que', 'como assim', 'como é que é', 'e aí', 'e ai', 'e daí', 'e então', 'e agora', 'e depois',
			'e você', 'e vocês', 'e tu', 'e eu', 'e nós', 'e essa', 'tudo bem', 'tudo bom', 'tudo certo', 'tudo tranquilo',
			'como vai', 'como vais', 'como vão', 'como estás', 'como está', 'sério', 'sério mesmo', 'é sério', 'jura',
			'verdade', 'mesmo', 'de verdade', 'ué', 'ue', 'e agora josé'
		)}$`),
		type: 'interrogative'
	},
	{
		// 4a. Exclamative "que": "que" followed by an evaluative word, optionally with a
		// noun and/or intensifier in between ("que pena", "que dia lindo", "que filme mais
		// chato", "que bom que você veio"). "que horas são" has no evaluative word and
		// falls through to the wh-questions.
		expression: rx(`^que\\s+(?:${INTENSIFIER}\\s+)?(?:${WORD}\\s+){0,2}(?:${INTENSIFIER}\\s+)?${any(EMOTIVE, EMOTIVE_MILD, EMOTIVE_NOUN)}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 4b. Optative "que" plus a subjunctive, the standard blessing/curse pattern
		// ("que deus te abençoe", "que viva o rei", "quem me dera").
		expression: rx(`^(?:que\\s+${any('deus', 'viva', 'vivam', 'dure', 'venha', 'vença', 'morra', 'se dane', 'se foda')}|quem\\s+${any('me dera', 'diria', 'imaginaria', 'imaginava', 'poderia imaginar')})${EOW}`),
		type: 'exclamatory'
	},
	{
		// 4c. Exclamative "como": copula plus an evaluative word ("como é lindo", "como
		// está bonito aqui"), an affectionate clitic ("como eu te amo"), or a subject plus
		// a preterite closing the sentence ("como você cresceu", "como o tempo passou").
		expression: rx(`^como\\s+(?:${COPULA}\\s+(?:${INTENSIFIER}\\s+)?${any(EMOTIVE, EMOTIVE_MILD)}${EOW}|eu\\s+${CLITIC}\\s+|${any(SUBJECT_PRONOUN, 'isso', 'tudo', 'o tempo', 'a vida', 'as coisas', 'esse povo')}\\s+${LETTER}*(?:ou|eu|iu|ei|i)${EOW}(?:\\s+${WORD})?$)`),
		type: 'exclamatory'
	},
	{
		// 4d. Exclamative "quanto/quanta": a quantifier over an affective noun
		// ("quanta gente", "quanta saudade", "quanto tempo"). With a verb it is a question
		// ("quanto custa", "quantos anos você tem"), which the wh-rule handles.
		expression: rx(`^(?:quant[oa]s?\\s+${EMOTIVE_NOUN}${EOW}|quanto\\s+tempo$|quão\\s)`),
		type: 'exclamatory'
	},
	{
		// 5. Wh-questions, optionally preceded by a short lead-in ("e onde você mora",
		// "por favor que horas são", "de quem é isso").
		expression: rx(`^${LEAD}${WH_WORD}${EOW}`),
		type: 'interrogative'
	},
	{
		// 6. Question markers: the words Portuguese uses precisely because word order
		// cannot mark a question ("será que ele vem", "por acaso você viu", "tem certeza",
		// "dá pra abrir a janela").
		expression: rx(`^${LEAD}${ADDRESSEE}${any(
			'será que', 'sera que', 'por acaso', 'acaso', 'porventura', 'por ventura', 'não seria', 'não seria melhor',
			'tem certeza', 'tens certeza', 'têm certeza', 'tem ideia', 'tens ideia', 'tem noção', 'tem como', 'tens como',
			'teria como', 'há como', 'dá pra', 'dá para', 'dava pra', 'daria pra', 'daria para', 'seria possível',
			'seria melhor', 'posso saber', 'pode me dizer', 'podes dizer', 'me diz uma coisa', 'me diga uma coisa',
			'quer dizer que', 'então você', 'tem alguém', 'tem alguma', 'tem algum', 'tem algo', 'há alguém', 'e se'
		)}${EOW}`),
		type: 'interrogative'
	},
	{
		// 7. Requests and offers. First person modals are requests almost by definition
		// ("posso entrar", "podemos começar"); third person modals need a clitic, an
		// addressee or a request infinitive so that "pode acontecer" stays a statement.
		expression: rx(`^${LEAD}${ADDRESSEE}(?:${any('posso', 'podemos', 'poderia eu', 'poderíamos')}${EOW}`
			+ `|${any('pode', 'podes', 'podem', 'poderia', 'poderias', 'poderiam', 'consegue', 'consegues', 'conseguem', 'conseguiria')}\\s+(?:${CLITIC}|${SUBJECT_PRONOUN}|${REQUEST_INF})${EOW}`
			+ `|(?:se\\s+)?${any('importa', 'importas', 'importam', 'importaria', 'incomoda', 'incomodas', 'incomodaria')}${EOW}`
			+ `|${any('quer', 'queres', 'querem', 'quiseres', 'aceita', 'aceitas', 'aceitam', 'prefere', 'preferes', 'preferem')}\\s+`
			+ `|${any('sabe', 'sabes', 'sabem', 'saberia', 'saberias')}\\s+${any('se', 'onde', 'quando', 'quem', 'como', 'qual', 'o que', 'que horas', 'por que', 'quanto')}${EOW})`),
		type: 'interrogative'
	},
	{
		// 8. Second person singular morphology (chiefly European Portuguese). Addressing
		// the listener directly with no other cue is overwhelmingly a question: the
		// explicit tu-forms below, plus any -aste/-este/-iste preterite ("gostaste do
		// filme", "fizeste isso"). The {2,} prefix keeps demonstratives and nouns out
		// ("este", "deste", "leste", "teste").
		expression: rx(`^(?:${any(
			'queres', 'tens', 'podes', 'sabes', 'estás', 'és', 'vais', 'vens', 'fazes', 'dizes', 'vês', 'dás', 'achas',
			'conheces', 'gostas', 'consegues', 'lembras', 'precisas', 'trazes', 'pões', 'ouves', 'entendes', 'percebes',
			'esperas', 'moras', 'trabalhas', 'estudas', 'comes', 'bebes', 'vives', 'pensas', 'queres saber', 'terás',
			'terias', 'estarás', 'irás', 'virás', 'farás', 'dirás', 'poderás', 'saberás', 'gostarias', 'preferes', 'viste', 'foste', 'vieste', 'quiseste', 'disseste', 'tiveste',
			'puseste', 'estiveste', 'soubeste', 'pudeste'
		)}${EOW}|${any('leste', 'deste', 'veste')}\\s+${any('o', 'a', 'os', 'as', 'esse', 'essa', 'este', 'esta', 'aquele', 'aquela', 'isso', 'aquilo', 'tudo', 'meu', 'teu', 'seu', 'um', 'uma')}${EOW}|${LETTER}{2,}(?:aste|este|iste)${EOW})`),
		type: 'interrogative'
	},
	{
		// 9a. Imperatives built on the subjunctive ("faça isso", "digam a verdade",
		// "tenha um bom dia"), including the negative ones ("não se preocupe", "nunca
		// desista", "não me diga").
		expression: rx(`^(?:${any('não', 'nao', 'nunca', 'jamais')}\\s+(?:mais\\s+)?)?(?:${CLITIC}\\s+)?${IMPERATIVE_SUBJ}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 9b. Bare tu/colloquial imperatives, recognised by the clitic or particle that
		// follows ("me ajuda", "espera aí", "vem cá", "fala sério", "diz-me a verdade",
		// "não fala assim"). Without such a cue the same form is a plain statement with a
		// null subject ("fala muito").
		expression: rx(`^(?:${any('não', 'nao', 'nunca', 'jamais')}\\s+)?(?:${CLITIC}\\s+)?${IMPERATIVE_TU}[\\s-]+${any(CLITIC, IMPERATIVE_PARTICLE)}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 9c. Hortatives and short exhortations ("vamos", "vamos lá", "bora", "vambora").
		// Longer "vamos" sentences are left alone, since "vamos para casa amanhã" is a
		// statement about the future.
		expression: rx(`^${any('vamos', 'vamo', 'bora', 'vambora', 'vamos lá', 'vão', 'vamos embora')}(?:\\s+${any('lá', 'embora', 'nessa', 'logo', 'já', 'rápido', 'comigo', 'gente', 'todos', 'dormir', 'comer', 'beber', 'jogar', 'começar', 'trabalhar', 'acordar', 'comemorar', 'festejar', 'nós')})?$`),
		type: 'exclamatory'
	},
	{
		// 9d. Politeness formulas anywhere in the sentence turn it into a request. Placed
		// after the question rules so that "pode me ajudar por favor" stays a question.
		expression: rx(`(?:^|\\s)${any('por favor', 'faz favor', 'faça favor', 'se faz favor', 'pelo amor de deus', 'por caridade')}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 10a. Interjections, greetings, curses and blessings that can open any sentence
		// ("nossa que susto", "caramba isso é lindo", "bom dia a todos", "obrigado pela ajuda").
		expression: rx(`^${any(
			'ah', 'oh', 'ai', 'ui', 'uh', 'ué', 'ora', 'ora essa', 'opa', 'epa', 'eita', 'eta', 'oxe', 'oxente', 'vixe',
			'arre', 'bah', 'puxa', 'poxa', 'caramba', 'caraca', 'nossa', 'minha nossa', 'nossa senhora', 'meu deus',
			'deus do céu', 'meu deus do céu', 'graças a deus', 'ainda bem', 'tomara', 'oxalá', 'queira deus', 'deus queira', 'uau', 'uou', 'wow', 'aleluia', 'caspita',
			'valeu', 'obrigado', 'obrigada', 'obrigadão', 'muito obrigado', 'muito obrigada', 'de nada', 'parabéns',
			'meus parabéns', 'felicidades', 'saúde', 'viva', 'bravo', 'socorro', 'cuidado', 'atenção', 'silêncio',
			'basta', 'oi', 'olá', 'alô', 'ei', 'psst', 'bom dia', 'boa tarde', 'boa noite', 'bom fim de semana',
			'boa sorte', 'boa viagem', 'bom apetite', 'bom trabalho', 'bom descanso', 'feliz natal', 'feliz páscoa',
			'feliz aniversário', 'feliz ano novo', 'tchau', 'adeus', 'até logo', 'até mais', 'até amanhã', 'falou',
			'abraço', 'abraços', 'beijo', 'beijos', 'coitado', 'coitada', 'pobrezinho', 'tadinho', 'ufa', 'ufà',
			'droga', 'merda', 'porra', 'caralho', 'puta merda', 'puta que pariu', 'desgraça', 'inferno', 'diabos',
			'que droga', 'que merda', 'nem pensar', 'nem me fale', 'não acredito', 'nem acredito', 'não creio',
			'não pode ser', 'não é possível', 'de jeito nenhum', 'de forma alguma', 'só que não', 'era só o que faltava',
			'já era hora', 'até que finalmente', 'finalmente', 'essa é boa', 'essa foi boa', 'olha só', 'veja só',
			'imagina só', 'imagine só', 'vejam só', 'pois não', 'ok então'
		)}${EOW}`),
		type: 'exclamatory'
	},
	{
		// 10b. Thanks, wishes and farewells in final position ("de qualquer forma
		// obrigado", "nos vemos amanhã boa noite").
		expression: rx(`\\s${any('obrigado', 'obrigada', 'obrigadão', 'valeu', 'parabéns', 'felicidades', 'boa sorte', 'boa viagem', 'bom dia', 'boa tarde', 'boa noite', 'até logo', 'até mais', 'tchau', 'adeus', 'um abraço', 'um beijo')}$`),
		type: 'exclamatory'
	},
	{
		// 10d. Short affirmations and reactions. Restricted to (almost) the whole sentence,
		// because "claro que ele vem" or "isso é bom" are ordinary statements.
		expression: rx(`^${any('claro', 'óbvio', 'obvio', 'lógico', 'exato', 'exatamente', 'isso', 'isso aí', 'é isso aí', 'beleza', 'com certeza', 'certamente', 'sem dúvida', 'nem', 'chega', 'sim', 'não', 'nao', 'jamais', 'combinado', 'fechado', 'feito', 'perfeito', 'ótimo', 'legal')}(?:\\s+${any('mesmo', 'sim', 'não', 'isso', 'aí', 'então', 'demais', 'total', 'né', 'de bobagem', 'de besteira')})?$`),
		type: 'exclamatory'
	},
	{
		// 11a. Declarative word order with exclamatory force: a copula plus a strongly
		// evaluative predicate ("isso é incrível", "a festa foi maravilhosa", "está muito
		// bonito"). Mild adjectives are excluded here – "a comida é boa" is a statement.
		expression: rx(`^(?:.+\\s)?${COPULA}\\s+(?:${INTENSIFIER}\\s+)?(?:${EMOTIVE}|${EMOTIVE_MILD}\\s+demais|demais)${EOW}$`),
		type: 'exclamatory'
	},
	{
		// 11b. Absolute superlatives in -íssimo/-érrimo, which exist for emphasis only
		// ("o filme foi lindíssimo", "está caríssimo").
		expression: rx(`${WORD}(?:íssim|érrim)[oa]s?${EOW}(?:\\s+${WORD}){0,3}$`),
		type: 'exclamatory'
	},
	{
		// 11c. Evaluative one-liners and fixed exclamatory predicates ("incrível",
		// "que beleza de dia", "isso é um absurdo", "foi um pesadelo").
		expression: rx(`^(?:(?:${INTENSIFIER}\\s+)?${any(EMOTIVE, EMOTIVE_MILD, EMOTIVE_NOUN)}${EOW}$|.+\\s(?:um|uma|o|a)\\s+${EMOTIVE_NOUN}${EOW}(?:\\s+${WORD}){0,3}$)`),
		type: 'exclamatory'
	},
	{
		// 12. Everything else is a statement: subject-initial ("eu vou amanhã"), null
		// subject ("está chovendo", "foi ótimo ver você"), topicalised ("ontem cheguei
		// tarde"), and any declarative-order question that punctuation would have marked.
		expression: /.+/i,
		type: 'declarative'
	}
]