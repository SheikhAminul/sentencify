import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/*
 * Spanish sentence-type detection.
 *
 * `detectSentenceType` walks this array top-to-bottom and the first match wins, so rules are ordered
 * from "most certain" to "most speculative":
 *
 *   1. leading/trailing punctuation — Spanish opens questions and exclamations with ¿ and ¡, which is
 *      the single most reliable signal available and is checked before anything else. Note that the
 *      documented input contract strips punctuation, so every construction below is also reachable
 *      without it; these rules are a fast path for callers that keep it, never the only route.
 *   2. fixed idioms/constructions whose type doesn't follow from the general wh-word rules below and
 *      that must be checked before those general rules would otherwise misclassify them (rhetorical
 *      "¡dónde se ha visto!", optative "¡quién pudiera!", literary "¡cuán grande!", resigned "¡qué le
 *      vamos a hacer!", "¡qué día tan bonito!").
 *   3. colloquial greeting-questions ("qué tal", "cómo te va") that take no following verb.
 *   4. wh-pronouns that are essentially always interrogative sentence-initially ("quién", "cuál",
 *      "por qué"), including bare one-word wh fragments ("¿cómo?", "¿y tú?").
 *   5. evaluative predicates — strong emotion words trigger exclamatory on their own ("estoy furioso"),
 *      milder ones only when intensified ("estoy muy cansado" but plain "estoy cansado" is just a
 *      statement of fact, per the same strong/mild split `en.ts` uses) — plus copular reaction
 *      sentences ("esto es increíble", "eres un crack"). These run before the verb-first question
 *      openers in 6, because "estás" opens both "¿estás bien?" and "¡estás increíble!".
 *   6. other structural interrogatives: question-typical verb-first openers ("puedes", "te gustaría"),
 *      conditional question formulas ("y si...", "sería posible..."), the colloquial "a que" wager
 *      construction, negative opinion questions ("no crees que...") and epistemic "acaso"/"será que".
 *   7. accent-gated wh-words: "qué / cómo / cuándo / dónde / cuál / quién / cuánto" (written with the
 *      accent) are only ever interrogative or exclamative. Their unaccented homographs
 *      "que / como / cuando / donde / cual / quien / cuanto" are relative pronouns or conjunctions
 *      ("el libro que leí", "hazlo como puedas") and are deliberately never matched by these rules —
 *      that is what stops an indirect question like "no sé cuándo llega" from being misread, since
 *      the wh-word there isn't at the start of the sentence. A wh-word followed by a verb is
 *      interrogative ("qué necesitas"); followed by a noun/adjective it is exclamative ("qué desastre").
 *   8. the same wh-words with no verb anywhere: "qué desastre", "cuánta gente".
 *   9. sentence-final tags ("..., verdad", "..., no crees").
 *  10. fixed exclamative constructions: interjections, formulas, well-wishes, ironic noun phrases
 *      ("menudo lío"), intensifiers ("lo bien que canta", "la de gente que había"), optative and
 *      imprecative clauses ("si supieras...", "que te vaya bien", "así te mueras"), superlatives.
 *  11. imperatives, which this library reports as declarative (it only exposes three types). Checked
 *      *before* the bare-fragment rule in 12, so a one-word command ("cállate", "dímelo") isn't swept
 *      up as a one-word reaction.
 *  12. bare one/two-word fragments with no finite verb, which are reactions rather than statements.
 *  13. a declarative catch-all.
 *
 * Input is lowercase, but accents are preserved in ordinary Spanish typing and are load-bearing here:
 * do not fold "e/é", "o/ó", "a/á" together in the wh-word rules, or the accent-gating breaks.
 *
 * Some constructions genuinely go either way in real Spanish without punctuation or intonation to
 * disambiguate them ("cómo que no vienes" is written with both ¡...! and ¿...? in the wild; echo
 * fragments like "¿A Japón?" are indistinguishable from a plain noun phrase). Those are intentionally
 * left to whichever rule happens to catch them rather than forced — there is no correct answer.
 */

/* ------------------------------------------------------------------------------------------------
 * Shared fragments
 * ----------------------------------------------------------------------------------------------*/

/** Quotes/brackets/whitespace permitted around a terminal or initial mark. */
const CLOSE = `["'\u00BB\u203A)\\]}\\s]*`
const OPEN = `["'\u00AB\u2039(\\[{\\s]*`

/**
 * The letters an ordinary Spanish word is built from. Spelled out one accent at a time rather than as
 * a range: the tempting `a-ú` shorthand quietly omits "ü" (so "pingüino", "vergüenza" and "bilingüe"
 * stop matching halfway through) while sweeping in unrelated Latin-1 punctuation such as "÷".
 */
const LETTER = `a-záéíóúüñ`

/** A run of ordinary Spanish word characters. Digits included, so "2024" counts as a token. */
const WORD = `[${LETTER}0-9]+`

/**
 * A trailing word boundary that works after an accented vowel. JS's `\b` only treats ASCII
 * `[A-Za-z0-9_]` as "word" characters, so `\b` right after á/é/í/ó/ú (e.g. "qué\b", "sabrá\b") silently
 * fails to match — both sides of the position count as non-word, so no boundary is ever found. Every
 * trailing boundary in this file follows text that can end in an accented vowel, so `WB` is used
 * instead everywhere except true sentence-initial boundaries (which are always preceded by plain ASCII).
 */
const WB = `(?![${LETTER}0-9])`

/** Discourse fillers and greetings that may open a sentence before its real structure begins. */
const lead = `(?:(?:pues|bueno|vale|venga|oye|oiga|a ver|en fin|total|entonces|así que|o sea|es decir|osea|por cierto|la verdad|además|hola|buenas|buenos días|buenas tardes|buenas noches|dios mío|madre mía|eh+|em+|este|mmm+|ay|uy|ah|oh|bah|puf|hombre|che)[\\s,]+)*`

/** Prepositions that commonly front a wh-word or wh-pronoun: "a quién", "de dónde", "con quién". */
const prep = `(?:a|con|de|en|para|por|sin|sobre|hacia|desde|hasta|entre|tras|bajo|contra|durante|mediante|según)\\s+`

/**
 * Common conjugated verb forms for the verbs that most often anchor a request, a question or an
 * ordinary predicate, plus generic endings for the -aste/-iste preterite, the regular -ará/-ería-style
 * future/conditional, the stressed -ó preterite ("generó", "sorprendió" — always a finite verb in
 * Spanish, never a noun or adjective ending), the -áis/-éis 2nd-person plural (a shape no Spanish noun
 * has), and the 1st-person-plural -amos/-emos/-imos, which are distinctive enough to be reliable verb
 * signals on their own. Bare unaccented endings like -a/-an/-o/-es are deliberately left out of this
 * generic set even though they're common verb endings too, because they collide too often with
 * ordinary nouns and adjectives ("molesta", "advertencia") to be safe without a real part-of-speech
 * tagger — the same reason the imperfect -ía is spelled out verb by verb below instead of being added
 * as a generic ending, since "día", "alegría" and "sorpresa"-class nouns would swamp it.
 *
 * This is a curated list rather than a full conjugator, but it is wide enough to tell "qué necesitas"
 * (interrogative) from "qué desastre" (exclamative) without one. Its other job is negative: several
 * rules below gate an exclamatory reading on *not* finding a verb here, so a noun that sneaks into
 * this list ("lista", "trabajo", "cuento") silently breaks "qué lista eres" and friends — which is why
 * noun/verb homographs are kept out even at the cost of missing a genuine verb reading.
 */
const verbForms = `(?:soy|eres|es|somos|sois|son|era[ns]?|éramos|fui|fuiste|fue|fuimos|fueron|seré|serás?|será[n]?|seremos|serán|sería[ns]?|seríamos|sea[ns]?|seas|fuera[ns]?|estoy|estás?|está[n]?|estamos|estáis|estaba[ns]?|estábamos|estuve|estuviste|estuvo|estuvieron|estaré|estarás?|estará[n]?|estaremos|estaría[ns]?|esté[ns]?|estés|hay|he|has|ha|hemos|habéis|han|había[ns]?|habíamos|hubo|hubieron|habrá[ns]?|habré|habremos|habría[ns]?|haya[ns]?|hayas|hubiera[ns]?|tengo|tienes?|tiene[n]?|tenemos|tenéis|tenía[ns]?|teníamos|tuve|tuviste|tuvo|tuvieron|tendré|tendrás?|tendrá[n]?|tendremos|tendría[ns]?|tenga[ns]?|tengas|hago|haces?|hace[n]?|hacemos|hacéis|hacía[ns]?|hice|hiciste|hizo|hicieron|haré|harás?|hará[n]?|haremos|haría[ns]?|haga[ns]?|hagas|puedo|puedes?|puede[n]?|podemos|podéis|podía[ns]?|pude|pudiste|pudo|pudieron|podré|podrás?|podrá[n]?|podremos|podría[ns]?|pueda[ns]?|puedas|debo|debes?|debe[n]?|debemos|debéis|debía[ns]?|deberé|deberás?|deberá[n]?|debería[ns]?|deberíamos|quiero|quieres?|quiere[n]?|queremos|queréis|quería[ns]?|quise|quisiste|quiso|quisieron|querrás?|querrá[n]?|querría[ns]?|quiera[ns]?|quieras|sé|sabes?|sabe[n]?|sabemos|sabéis|sabía[ns]?|sabíamos|supe|supiste|supo|supieron|sabré|sabrás?|sabrá[n]?|sabría[ns]?|sepa[ns]?|sepas|voy|vas?|va[n]?|vamos|vais|iba[ns]?|íbamos|iré|irás?|irá[n]?|iremos|iría[ns]?|vaya[ns]?|vayas|vengo|vienes?|viene[n]?|venimos|venís|venía[ns]?|vine|viniste|vino|vinieron|vendré|vendrás?|vendrá[n]?|vendría[ns]?|venga[ns]?|vengas|digo|dices?|dice[n]?|decimos|decís|decía[ns]?|dije|dijiste|dijo|dijimos|dijeron|diré|dirás?|dirá[n]?|diremos|diría[ns]?|diga[ns]?|digas|veo|ves?|ve[n]?|vemos|veis|veía[ns]?|vi|vio|vimos|vieron|veré|verás?|verá[n]?|veremos|vería[ns]?|vea[ns]?|veas|doy|das?|da[n]?|damos|dais|daba[ns]?|di|diste|dio|dimos|dieron|daré|darás?|dará[n]?|daremos|daría[ns]?|dé|des|den|pongo|pones?|pone[n]?|ponemos|puse|pusiste|puso|pusieron|pondré|pondrás?|pondrá[n]?|pondría[ns]?|ponga[ns]?|pongas|salgo|sales?|sale[n]?|salimos|salí|saliste|salió|salieron|saldré|saldrás?|saldrá[n]?|saldría[ns]?|salga[ns]?|salgas|traigo|traes?|trae[n]?|traemos|trajo|trajeron|oigo|oyes?|oye[n]?|oímos|oí|oyó|oyeron|gustas?|gusta[n]?|gustó|gustaron|gustaría[ns]?|encanta[n]?|encantó|apetece[n]?|apeteció|interesa[n]?|interesó|importas?|importa[n]?|importó|importaría[ns]?|molestas?|molesta[n]?|molestó|molestaría[ns]?|parece[sn]?|pareció|parecía[ns]?|conviene[ns]?|duele[n]?|dolió|faltas?|falta[n]?|faltó|sobra[n]?|queda[n]?|quedas?|quedó|quedaron|quedado|toca[n]?|tocó|suena[n]?|sonó|huele[n]?|olió|pasas?|pasa[n]?|pasó|pasaron|piensas?|piensa[n]?|pienso|pensamos|pensó|crees?|cree[n]?|creo|creemos|creyó|espero|esperas?|espera[n]?|esperó|siento|sientes?|siente[n]?|sintió|imagino|imaginas?|supongo|supones?|opino|opinas?|opina[n]?|prometo|juro|odio|adoro|amo|extraño|añoro|leo|lees?|lee[n]?|leyó|escribo|escribes?|escribe[n]?|escribió|vivo|vives?|vive[n]?|vivió|duermo|duermes?|duerme[n]?|durmió|corro|corres?|corre[n]?|corrió|gano|ganas?|gana[n]?|ganó|pierdo|pierdes?|pierde[n]?|perdió|abro|abres?|abre[n]?|abrió|cierro|cierras?|cierra[n]?|cerró|subo|subes?|sube[n]?|subió|bajo|bajas?|baja[n]?|bajó|entro|entras?|entra[n]?|entró|vuelvo|vuelves?|vuelve[n]?|volvió|regreso|conozco|conoces?|conoce[n]?|conoció|recuerdo|recuerdas?|recuerda[n]?|recordó|olvidas?|olvida[n]?|olvidó|olvidé|acabo|acabas?|acaba[n]?|acabó|sigo|sigues?|sigue[n]?|siguió|dejo|dejas?|deja[n]?|dejó|necesito|necesitas?|necesita[n]?|necesitamos|necesitó|necesitaría[ns]?|busco|buscas?|busca[n]?|buscó|recomiendas?|recomienda[n]?|sugieres?|sugiere[n]?|prefiero|prefieres?|prefiere[n]?|prefirió|trabajas?|trabaja[n]?|trabajó|estudias?|estudia[n]?|estudió|entrenas?|entrena[n]?|llevas?|lleva[n]?|llevó|regalas?|regala[n]?|regalamos|demora[n]?|dura[n]?|duró|pesa[n]?|pesó|marca[n]?|marcó|combina[n]?|comienza[n]?|comenzó|sirve[n]?|sirvió|aterriza[n]?|amanece[n]?|dedica[n]?|recetó|acuerdas?|acuerda[n]?|cursas?|cursa[n]?|resulta[n]?|resultó|enseñas?|enseña[n]?|enseñó|como|comes?|come[n]?|comió|compras?|compra[n]?|compramos|compró|vendes?|vende[n]?|vendió|llamo|llamas?|llama[n]?|llamó|ayudas?|ayuda[n]?|ayudó|entiendes?|entiende[n]?|entendió|significa[n]?|significó|funcionas?|funciona[n]?|funcionó|cuestas?|cuesta[n]?|costó|vales?|vale[n]?|valió|encuentras?|encuentra[n]?|encontró|llegas?|llega[n]?|llegó|llegaron|empiezas?|empieza[n]?|empezó|terminas?|termina[n]?|terminó|permites?|permite[n]?|permitió|contestas?|contesta[n]?|respondes?|responde[n]?|respondió|escuchas?|escucha[n]?|escuchó|hablas?|habla[n]?|habló|cambias?|cambia[n]?|cambió|dudas?|duda[n]?|andas?|anda[n]?|anduvo|atreves?|atreve[n]?|uso|usas?|usa[n]?|usó|tarda[ns]?|tardó|acepta[ns]?|aceptó|consume[ns]?|mide[ns]?|midió|soporta[ns]?|adapta[ns]?|existe[n]?|existió|ocurre[n]?|ocurrió|sucede[n]?|sucedió|depende[n]?|dependió|contiene[n]?|requiere[n]?|implica[n]?|afecta[n]?|incluye[n]?|incluyó|admite[n]?|merece[n]?|cabe[n]?|alcanza[n]?|alcanzó|priorizo|borras?|borra[n]?|juegas?|juega[n]?|jugó|\\w*(?:aste|iste|íste|aron|ieron|abas|aban|ábamos|áis|éis|ará|erá|irá|arán|erán|irán|arás|erás|irás|aré|eré|iré|aremos|eremos|iremos|aría|ería|iría|arías|erías|irías|arían|erían|irían|ó|amos|emos|imos))`

/** Subject pronouns that may sit between a wh-word and its verb: "qué tú piensas" (unusual but valid). */
const subjPronouns = `tú|vos|usted(?:es)?|él|ella|ellos|ellas|nosotros|nosotras|vosotros|vosotras|yo|uno`
/** Object/reflexive clitics that commonly sit before the verb: "cómo te va", "qué se dice". Wrapped in
 * its own non-capturing group so `${clitics}\s+` binds the trailing space to the whole alternation
 * rather than just its last member. */
const clitics = `(?:me|te|se|nos|os|le|les|lo|la|los|las)`
/** Either kind of pronoun, one or two in a row ("cómo te lo imaginas"). */
const pron = `(?:${subjPronouns}|${clitics})`

/** Imperfect subjunctive stems ("-ra" forms), used by the optative "quién" exclamation. */
const subjImperfect = `(?:supier|pudier|tuvier|hubier|quisier|fuer|estuvier|dier|vier|hicier|dijer|pusier|salier|vinier|volvier|sintier|leyer|oyer|cayer|creyer|trajer|anduvier|cupier|contar|imaginar|pensar|hablar|mirar|escuchar|llamar|encontrar|amar|ganar|llegar|volar|soñar)(?:a|as)`
/** Present subjunctive forms used by desiderative "que"/imprecative "así" exclamations. */
const subjPresent = `(?:vaya[ns]?|vayas|descanses?|descanse[n]?|aproveche[ns]?|mejores?|mejore[n]?|tengas?|tenga[ns]?|disfrutes?|disfrute[n]?|duermas?|duerma[n]?|salga[ns]?|salgas|venga[ns]?|vengas|sea[ns]?|seas|esté[ns]?|estés|gane[ns]?|ganes|cumplas?|cumpla[n]?|mueras?|muera[n]?|ayude[ns]?|hunda[ns]?|hundas?|llueva[ns]?|vuelvas?|vuelva[n]?|pases?|pase[n]?|vivas?|viva[n]?|sigas?|siga[n]?|logres?|logre[n]?|apruebes?|apruebe[n]?|encuentres?|encuentre[n]?|te\\s+vaya|le\\s+vaya|os\\s+vaya|les\\s+vaya|nos\\s+vaya)`

/** Degree/emphasis modifiers that may pad an evaluative phrase. */
const intensifiers = `muy|bastante|realmente|súper|super|tan|demasiado|extremadamente|increíblemente|absolutamente|totalmente|completamente|verdaderamente|sumamente|tremendamente|terriblemente|profundamente|francamente|infinitamente|de verdad`

/** Adjectives strong enough to read as exclamatory on their own: "estoy furioso". */
const strongEmotionAdj = `hart[oa]s?|furios[oa]s?|indignad[oa]s?|indignadísim[oa]s?|desesperad[oa]s?|encantad[oa]s?|encantadísim[oa]s?|fascinad[oa]s?|maravillad[oa]s?|aterrorizad[oa]s?|horrorizad[oa]s?|asustad[oa]s?|sorprendid[oa]s?|estupefact[oa]s?|atónit[oa]s?|extasiad[oa]s?|eufóric[oa]s?|devastad[oa]s?|destrozad[oa]s?|deshech[oa]s?|hundid[oa]s?|feliz|felices|entusiasmad[oa]s?|emocionadísim[oa]s?|emocionad[oa]s?|conmovid[oa]s?|abrumad[oa]s?|alucinad[oa]s?|flipad[oa]s?|cabread[oa]s?|enfadadísim[oa]s?|rabios[oa]s?|boquiabiert[oa]s?|radiante[s]?`

/** Adjectives that read as exclamatory only when intensified: "estoy muy cansado". */
const mildEmotionAdj = `cansad[oa]s?|aburrid[oa]s?|content[oa]s?|triste[s]?|preocupad[oa]s?|nervios[oa]s?|confundid[oa]s?|ansios[oa]s?|ocupad[oa]s?|satisfech[oa]s?|aliviad[oa]s?|agradecid[oa]s?|orgullos[oa]s?|decepcionad[oa]s?|frustrad[oa]s?|enfadad[oa]s?|enojad[oa]s?|molest[oa]s?|dolid[oa]s?|estresad[oa]s?|agobiad[oa]s?|ilusionad[oa]s?|motivad[oa]s?|sorprendent[e]?s?`

/**
 * Bodily/weather sensation nouns used in the fixed "qué/cuánto + noun + tener/hacer" idiom
 * ("qué frío hace", "cuánta razón tienes"). These read as exclamatory almost without exception, unlike
 * the general "wh-word + noun + verb" shape used for genuine questions like "qué hora es".
 */
const sensationNoun = `frío|calor|hambre|sed|sueño|cansancio|miedo|pena|gusto|rabia|asco|dolor|prisa|razón|suerte|paciencia|vergüenza|ganas|nervios|alivio|coraje|impotencia|nostalgia|ilusión|flojera|antojo|susto|envidia|lástima`

/**
 * Evaluative nouns/adjectives/adverbs that turn "qué + ... + verb" into a reaction exclamation ("qué
 * buen trabajo hiciste", "qué risa me dio tu comentario", "qué rápido corres") rather than a genuine
 * information question ("qué hora es", "qué libro prefieres"). Deliberately excludes degree words like
 * "tan" — "qué tan grave es" is a real question — so only the evaluative word itself signals the
 * reaction reading, and equally excludes neutral nouns that merely *can* be evaluated ("trabajo",
 * "cuento", "recomendación"), since "qué trabajo tienes" and "qué cuento leíste" are ordinary
 * questions; the evaluative adjective in "qué buen trabajo hiciste" is what carries the exclamation.
 */
const evalWord = `bien|bueno|buen|buena|buenos|buenas|estupend[oa]|mal|malo|mala|malos|malas|feo|fea|lindo|linda|bonit[oa]|guap[oa]|elegante|impecable|injust[oa]|grande|gran|enorme|alivio|lástima|gusto|pena|rabia|sorpresa|alegría|suerte|desgracia|oportunidad|detalle|coraje|risa|emoción|vergüenza|desastre|impresionante|locura|susto|precios[oa]|desorden|ric[oa]|groser[oa]|talento|tristeza|maravillos[oa]|maravilla|delicia|injusticia|generos[oa]|envidia|paciencia|terrible|horror|barbaridad|escándalo|disparate|tontería|estupidez|ridiculez|placer|honor|privilegio|orgullo|ternura|belleza|hermosura|lío|follón|caos|milagro|bendición|pesadilla|infierno|gloria|memoria|carácter|valor|valentía|humildad|amabilidad|simpatía|gracia|list[oa]|tont[oa]|pesad[oa]|antipátic[oa]|simpátic[oa]|amable|encantador[a]?|divertid[oa]|interesante|curios[oa]|rar[oa]|extrañ[oa]|horrible|espantos[oa]|asqueros[oa]|magnífic[oa]|espectacular|fabulos[oa]|genial|excelente|perfect[oa]|increíble|brutal|tremend[oa]|alucinante|hermos[oa]|bell[oa]|divin[oa]|adorable|tiern[oa]|dulce|sabros[oa]|delicios[oa]|exquisit[oa]|poco|mucho|rápido|lento|deprisa|despacio|tarde|temprano|pronto|lejos|cerca|fuerte|duro|alto|difícil|fácil|complicado|sencillo|caro|barato`

/**
 * Nouns whose presence right after "qué"/"cuánto" marks the sentence as a genuine information
 * question rather than a reaction: "qué hora es", "qué color es tu coche", "qué precio tiene el
 * libro". These are structurally identical to the "qué + adjective + copula + subject" exclamation
 * ("qué pequeña es esta habitación"), and without a part-of-speech tagger the noun list is what keeps
 * the two apart — so this doubles as a guard on the exclamatory inversion rules below.
 */
const questionNoun = `horas?|días?|fechas?|años?|mes(?:es)?|semanas?|momentos?|edad(?:es)?|colores?|color|tallas?|tamaños?|precios?|costes?|costos?|marcas?|modelos?|tipos?|clases?|categorías?|nombres?|apellidos?|números?|teléfonos?|direcciones?|dirección|correos?|países?|país|ciudad(?:es)?|pueblos?|lugares?|sitios?|zonas?|barrios?|calles?|idiomas?|lenguas?|libros?|películas?|series?|canciones?|canción|discos?|grupos?|equipos?|deportes?|comidas?|platos?|bebidas?|postres?|frutas?|animales?|plantas?|coches?|carros?|motos?|trenes?|autobuses?|vuelos?|asientos?|puertas?|llaves?|cursos?|carreras?|asignaturas?|materias?|títulos?|temas?|asuntos?|motivos?|razones?|causas?|diferencias?|ventajas?|partes?|capítulos?|páginas?|palabras?|letras?|frases?|ideas?|opciones?|opción|alternativas?|caminos?|rutas?|métodos?|maneras?|formas?|modos?|herramientas?|programas?|aplicaciones?|versiones?|versión|formatos?|archivos?|carpetas?|cuentas?|bancos?|tarjetas?|monedas?|cambios?|porcentajes?|cantidad(?:es)?|niveles?|puestos?|cargos?|profesiones?|oficios?|horarios?|turnos?|pisos?|habitaciones?|mesas?|sillas?|ropas?|zapatos?|camisas?|pantalones?|regalos?|tiendas?|restaurantes?|hoteles?|médicos?|doctores?|hospitales?|medicinas?|medicamentos?|dosis|síntomas?|resultados?|notas?|calificaciones?|puntuaciones?|premios?|documentos?|papeles?|firmas?|contraseñas?|usuarios?|servidores?|sistemas?|errores?|problemas?|distancias?|velocidad(?:es)?|peso|pesos|altura|alturas`

/** A determiner that can front a noun phrase: articles, demonstratives, possessives. */
const DET = `(?:el|la|los|las|un|una|unos|unas|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella|aquellos|aquellas|mi|tu|su|mis|tus|sus|nuestr[oa]s?|vuestr[oa]s?)`

/**
 * Copulative/state/appearance verbs used by the "qué + adjective + verb + subject" inversion
 * exclamation ("qué pequeña es esta habitación", "qué rápido llegó el tren"). Deliberately a small,
 * closed grammatical class (copulas plus a few common unaccusative verbs of appearance/motion) rather
 * than the full `verbForms` set — a genuine transitive verb like "marca" in "qué hora marca tu reloj"
 * must NOT be included here, since that sentence is a real question ("what time does your clock show"),
 * not an exclamation, and only stays correctly classified because "marca" falls outside this list.
 */
const stateVerbs = `(?:es|fue|fueron|está[n]?|son|están|parece[n]?|parecía[n]?|queda[n]?|quedó|(?:ha|han)\\s+quedado|(?:ha|han)\\s+sido|anda[n]?|resulta[n]?|resultó|sale[n]?|salió|salieron|llega[n]?|llegó|llegaron|pasa[n]?|pasó|acaba[n]?|acabó|acabaron|se\\s+puso|se\\s+pone[n]?|trabaja[n]?|tienes?|tiene[n]?|corre[n]?|brilla[n]?|ruge[n]?|huele[n]?|duele[n]?|cruje[n]?|mueve[n]?|nota[n]?|desliza[n]?)`

/**
 * Manner/appearance verbs used by the "cómo + verb + inverted subject" exclamation ("cómo corre ese
 * atleta", "cómo brilla el mar"). Pointedly *excludes* the copulas that `stateVerbs` carries: "cómo
 * es la casa", "cómo está el paciente" and "cómo son tus vecinos" are all perfectly ordinary
 * questions sharing that exact surface shape, so admitting "es"/"está"/"son" here would misfile a
 * whole family of everyday questions as exclamations.
 */
const mannerVerbs = `(?:corre[n]?|corrió|brilla[n]?|brilló|ruge[n]?|rugió|huele[n]?|olió|duele[n]?|dolió|cruje[n]?|crujió|(?:se\\s+)?mueve[n]?|(?:se\\s+)?movió|(?:se\\s+)?desliza[n]?|vuela[n]?|voló|arde[n]?|ardió|resplandece[n]?|tiembla[n]?|tembló|late[n]?|latió|suena[n]?|sonó|retumba[n]?|pesa[n]?|pesó|aprieta[n]?|apretó|quema[n]?|quemó|pica[n]?|picó|sopla[n]?|sopló|nada[n]?|salta[n]?|saltó|crece[n]?|creció|avanza[n]?|corta[n]?|ilumina[n]?|cocina[n]?|dibuja[n]?|toca[n]?|tocó)`

/**
 * Verbs of emotional reaction used by the "me + reaction-verb" exclamation ("me encanta esta canción")
 * and its intensified "cómo me + reaction-verb" sibling ("cómo me encanta este parque") — never a
 * genuine question, since you can't meaningfully ask someone else how a thing affects your own
 * feelings. Shared between both rules so the verb list only needs maintaining in one place.
 */
const reactionVerbs = `(?:encanta[n]?|encantó|encantaría|fascina[n]?|fascinó|alegra[n]?|alegró|alegro|alegré|entusiasma[n]?|entusiasmó|sorprende[n]?|sorprendió|disgusta[n]?|disgustó|molesta[n]?|molestó|irrita[n]?|irritó|enfada[n]?|enfadó|enoja[n]?|enojó|horroriza[n]?|horrorizó|emociona[n]?|emocionó|conmueve[n]?|conmovió|impresiona[n]?|impresionó|indigna[n]?|indignó|asusta[n]?|asustó|apetece[n]?|gusta[n]?|gustó|duele[n]?|dolió|chifla[n]?|mola[n]?|moló|flipa[n]?|caíste|muero\\s+por|(?:da|dio)\\s+(?:mucha\\s+|muchísima\\s+|tanta\\s+)?(?:risa|pena|rabia|miedo|asco|vergüenza|coraje)|(?:hace|hizo)\\s+(?:gracia|reír|ilusión)|(?:pone|puso)\\s+(?:furios[oa]|content[oa]|trist[ei]|nervios[oa])|divertí|reí|emocioné|harté|fui\\s+${WORD})`

/** Adjectives that make a plain copular sentence a reaction: "esto es increíble", "eres tonto". */
const exclamAdj = `incre[íi]bles?|genial(?:es)?|fantástic[oa]s?|maravillos[oa]s?|espectacular(?:es)?|impresionantes?|alucinantes?|flipantes?|brutal(?:es)?|tremend[oa]s?|bestial(?:es)?|magnífic[oa]s?|estupend[oa]s?|excelentes?|perfect[oa]s?|precios[oa]s?|hermos[oa]s?|divin[oa]s?|adorables?|encantador(?:a|es|as)?|entrañables?|conmovedor(?:a|es|as)?|emocionantes?|inolvidables?|únic[oa]s?|mágic[oa]s?|delicios[oa]s?|exquisit[oa]s?|horribles?|terribles?|espantos[oa]s?|asqueros[oa]s?|repugnantes?|desastros[oa]s?|catastrófic[oa]s?|vergonzos[oa]s?|escandalos[oa]s?|inadmisibles?|inaceptables?|indignantes?|injust[oa]s?|ridícul[oa]s?|absurd[oa]s?|penos[oa]s?|lamentables?|fatal(?:es)?|guay|chul[oa]s?|tont[oa]s?|idiotas?|imbéciles?|estúpid[oa]s?|cretin[oa]s?`

/** Nouns that make "es un/una N" a reaction: "es un desastre", "eres un crack". */
const exclamNoun = `escándalo|desastre|horror|asco|pasada|pasote|maravilla|locura|barbaridad|primor|encanto|crack|genio|máquina|fenómeno|fiera|bestia|sueño|regalo|milagro|lujo|espanto|robo|timo|abuso|vergüenza|chollo|pesadilla|infierno|gloria|joya|tesoro|monstruo|obra\\s+de\\s+arte|pena|lástima|drama|tragedia|caos|lío|desmadre|despropósito|disparate|atrocidad|pasada\\s+total|desastre\\s+total|caos\\s+total|notición`

/**
 * The imperative shape Spanish forms by welding clitics onto the verb: "cuéntame", "dímelo",
 * "explícamelo", "quítatelo". Attaching a clitic shifts the stress back far enough that Spanish
 * spelling rules force a written accent onto the stem, so "contains an accented vowel + ends in a
 * clitic cluster" is a reliable shape. The vowel immediately before the clitic is restricted to the
 * imperative endings a/e (plus their accented forms) rather than any letter, which is what keeps
 * ordinary accented nouns that happen to end in clitic-shaped letters out of it — "película" would
 * otherwise parse as "pelícu" + "la", and "increíble" as "increíb" + "le".
 */
const encliticImperative = `[${LETTER}]{2,}[áéíóú][${LETTER}]*[aeáé](?:me|te|se|nos|os|le|les|lo|la|los|las)(?:lo|la|los|las|me|te|se)?`

/* ------------------------------------------------------------------------------------------------
 * Rules
 * ----------------------------------------------------------------------------------------------*/

export const es: SentenceTypeDetectExpressionSets = [
	/* ============================================================================================
	 * 1. Explicit punctuation — Spanish marks both ends of a question or exclamation, so a leading
	 *    ¿ / ¡ is just as good a signal as a trailing mark, and is checked first.
	 * ==========================================================================================*/
	{
		// "¡Vaya sorpresa!", "increíble!", "(¡qué bien!)"
		expression: new RegExp(`(?:^${OPEN}[¡!\u203C\u2049]|[!\u203C\u2049]${CLOSE}$)`),
		type: 'exclamatory'
	},
	{
		// "¿Vienes?", "vienes?", "(¿de verdad?)"
		expression: new RegExp(`(?:^${OPEN}[¿?\uFF1F]|[?\uFF1F]${CLOSE}$)`),
		type: 'interrogative'
	},
	{
		// A full stop or ellipsis is just as explicit: "Hola a todos."
		expression: new RegExp(`[.\u2026]${CLOSE}$`),
		type: 'declarative'
	},

	/* ============================================================================================
	 * 2. Fixed idioms that must be checked ahead of the general wh-word rules, because they don't
	 *    follow the ordinary "wh-word + verb = question" / "wh-word + noun = exclamation" shapes.
	 * ==========================================================================================*/
	{
		// "dónde vamos a parar", "adónde va a parar", "dónde/cuándo se ha visto", "cuándo aprenderás" —
		// fixed rhetorical-scolding formulas, not genuine information questions.
		expression: new RegExp(`^${lead}(?:dónde|cuándo|adónde)\\s+(?:se\\s+ha\\s+visto|se\\s+habrá\\s+visto|vamos\\s+a\\s+parar|va\\s+a\\s+parar|aprenderás|aprenderá[sn]?)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Optative "quién": "quién pudiera volar", "quién lo diría", "quién se lo iba a imaginar" — a
		// wish or rhetorical marvel, not a request for the referent's identity like plain "quién viene".
		expression: new RegExp(`^${lead}quién(?:es)?\\s+(?:${pron}\\s+){0,2}(?:${subjImperfect}|diría[ns]?|iba\\s+a\\s+${WORD})${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// Literary "cuán" ("qué tan" in formal register): "cuán grande es tu amor", "cuán lejos está".
		expression: new RegExp(`^${lead}cuán\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cómo no" (of course), "cómo así" (how come), "cómo que no" (what do you mean, no) — note
		// "cómo que ..." genuinely goes either way in real usage (written with both ¡...! and ¿...?),
		// so no attempt is made to look past "que" here.
		expression: new RegExp(`^${lead}cómo\\s+(?:no|así|que\\s+${WORD})${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué va", "qué más da", "qué le vamos a hacer", "qué remedio", "qué sé yo", "qué te importa" —
		// resigned or dismissive retorts. Each one is a fixed formula whose verb ("va", "vamos",
		// "importa") would otherwise be picked up by the core "qué + verb = question" rule in section 7.
		expression: new RegExp(`^${lead}qué\\s+(?:va|más\\s+da|remedio|sé\\s+yo|se\\s+yo|(?:le|se)\\s+(?:vamos|vas|va)\\s+a\\s+hacer|se\\s+le\\s+va\\s+a\\s+hacer|(?:te|le|me|os|les)\\s+importa|importa)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué manera de llover", "qué forma de hablar", "qué modo de tratar a la gente" — the fixed
		// "qué + manera/forma/modo + de + infinitive" idiom. Those three nouns are otherwise ordinary
		// question nouns ("qué forma tiene"), so the idiom has to be carved out before them.
		expression: new RegExp(`^${lead}qué\\s+(?:manera|forma|modo)\\s+de\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué frío hace", "qué hambre tengo", "cuánta razón tienes", "cuánta suerte tienes", "qué calor
		// insoportable hace", "qué frío tan intenso hace" — the fixed "wh-word + sensation/abstract noun
		// (+ an optional intensifying adjective) + tener/hacer" idiom. Structurally identical to the
		// genuine question shape ("qué hora es") but this specific noun set is exclamatory in practice.
		expression: new RegExp(`^${lead}(?:qué|cuánt[oa]s?)\\s+(?:tan\\s+)?(?:${sensationNoun})\\s+(?:tan\\s+)?(?:${WORD}\\s+)?(?:${pron}\\s+){0,2}(?:tengo|tienes?|tienen|tenemos|hace|hacía)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué día tan bonito", "qué chica tan simpática", "qué idea más buena", "qué libro tan
		// interesante" — the "qué + noun + tan/más + adjective" exclamation, one of the most common
		// exclamative frames in the language. Checked here because the noun slot is frequently a
		// question noun ("día", "libro") and a verb may still follow ("qué día tan bonito hace"), so
		// both the question-noun rule and the general "qué + noun + verb" rule would otherwise claim it.
		expression: new RegExp(`^${lead}qué\\s+${WORD}\\s+(?:tan|más)\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "mira que te lo advertí", "mira que es listo", "mira que venir tarde" — checked ahead of the
		// imperative rule below, which would otherwise catch the bare "mira" opener first.
		expression: new RegExp(`^${lead}mira\\s+que\\s+`, 'i'),
		type: 'exclamatory'
	},
	{
		// "mira qué bonito", "fíjate cómo llueve", "imagínate lo que pasó", "mira la de gente que hay" —
		// an attention-drawing verb handing off to a wh-word or an intensive "lo que"/"la de". Same
		// reason as the rule above: the bare imperative would otherwise swallow the sentence.
		expression: new RegExp(`^${lead}(?:mira|mire|fíjate|fíjese|imagínate|imagínese|verás|vieras)\\s+(?:qué|cómo|cuánt[oa]s?|lo\\s+que|la\\s+de|las?\\s+${WORD}\\s+que)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// A handful of fixed "cómo" exclamations that are never genuinely interrogative: weather/manner
		// exclamations ("cómo llueve", "cómo pasa el tiempo"), affection ("cómo te quiero"), and "cómo me
		// alegro". Checked ahead of the general "cómo + verb = question" rule below.
		expression: new RegExp(`^${lead}cómo\\s+(?:llueve|nieva|truena|graniza|canta[ns]?|baila[ns]?|llora[ns]?|grita[ns]?|mola[n]?|te\\s+atreves\\s+a|se\\s+atreve[n]?\\s+a|pasa\\s+el\\s+tiempo|vuela\\s+el\\s+tiempo|me\\s+alegro|(?:te|lo|la|los|las)\\s+(?:quiero|quieres|necesito|necesitas|extraño|extrañas|añoro|añoras|adoro|adoras|echo\\s+de\\s+menos))${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cuánto te quiero", "cuánto lo siento", "cuánto me alegro", "cuánto has crecido" — "cuánto"
		// followed by a clitic and a verb of feeling or change is a declaration of degree, not a request
		// for a quantity ("cuánto te debo" and "cuánto te costó" are questions, which is why this is
		// gated on a closed verb list rather than on the clitic alone).
		expression: new RegExp(`^${lead}cuánt[oa]\\s+(?:${clitics}\\s+){0,2}(?:quiero|quieres|siento|sentimos|alegro|alegra|añoro|extraño|adoro|admiro|agradezco|(?:has|ha|han|hemos)\\s+(?:crecido|cambiado|cambiado|mejorado|trabajado|sufrido|luchado|aguantado))${WB}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 3. Colloquial greeting-questions built on "qué"/"cómo" that don't take a following verb.
	 * ==========================================================================================*/
	{
		// "qué tal", "qué onda", "qué hay", "qué más", "qué cuentas", "qué es de tu vida", "cómo andas",
		// "cómo te va", "cómo va todo", "cómo lo llevas".
		expression: new RegExp(`^${lead}(?:qué\\s+(?:tal|onda|hay|más|hubo|pasó|te\\s+cuentas|cuentas|es\\s+de\\s+tu\\s+vida)|cómo\\s+(?:andas|anda|andáis|te\\s+va|le\\s+va|os\\s+va|les\\s+va|vamos|va\\s+todo|va\\s+eso|lo\\s+llevas|te\\s+encuentras))${WB}`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 4. Wh-pronouns that are (almost) never anything but interrogative when sentence-initial,
	 *    optionally fronted by a preposition: "a quién", "de dónde", "con quién", "para quién".
	 * ==========================================================================================*/
	{
		// "quién viene", "quiénes son", "cuál prefieres", "cuáles te gustan", "a quién buscas",
		// "con quién vives", "de quién es este abrigo", "para quién es esta carta".
		expression: new RegExp(`^${lead}(?:${prep})?(?:quién(?:es)?|cuál(?:es)?)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "por qué lloras", "para qué sirve esto".
		expression: new RegExp(`^${lead}(?:por|para)\\s+qué${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// A wh-word standing alone as the whole sentence — "¿cómo?", "¿y tú?", "¿y ahora qué?", "hasta
		// cuándo", "¿y eso?" (= how come). Without this, a bare wh-fragment falls all the way through to
		// the one/two-word reaction rule in section 12 and is reported as an exclamation.
		expression: new RegExp(`^${lead}(?:y\\s+)?(?:${prep})?(?:qué|cómo|cuándo|dónde|adónde|cuál(?:es)?|quién(?:es)?|cuánt[oa]s?|tú|vos|usted(?:es)?|él|ella|ellos|ellas|yo|nosotros|vosotros|eso|esto|ahora\\s+qué|entonces\\s+qué|luego\\s+qué|después\\s+qué|eso\\s+por\\s+qué)\\s*$`, 'i'),
		type: 'interrogative'
	},
	{
		// "a que no sabes quién llamó", "a que ganamos" — the colloquial wager/challenge construction.
		// Note the unaccented "que": this is a fixed formula, not the wh-word "a qué" ("a qué hora").
		expression: new RegExp(`^${lead}a\\s+que\\s+`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 5. Evaluative predicates: emotional states and copular reactions. Placed ahead of the
	 *    verb-first question openers in section 6 because the same 2nd-person copula opens both
	 *    ("¿estás bien?" vs "¡estás increíble!") and the adjective is what decides between them.
	 * ==========================================================================================*/
	{
		// "estoy furioso", "está encantada", "estamos hartos", "andas eufórico".
		expression: new RegExp(`^${lead}(?:estoy|estás|está|estamos|están|ando|andas|anda|andamos|andan|me\\s+siento|se\\s+siente|nos\\s+sentimos)\\s+(?:(?:${intensifiers})\\s+)?(?:${strongEmotionAdj})${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "estoy muy cansado", "está bastante ocupada" — but plain "estoy cansado" stays declarative.
		expression: new RegExp(`^${lead}(?:estoy|estás|está|estamos|están|me\\s+siento|se\\s+siente)\\s+(?:${intensifiers})\\s+(?:${mildEmotionAdj})${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "esto es increíble", "el concierto fue espectacular", "tu idea es genial", "eres un crack",
		// "es una pasada", "qué susto, estás horrible" — a copula plus a loaded adjective or noun. The
		// adjective/noun lists are the whole gate: swap in a neutral predicate ("el examen fue difícil",
		// "es un problema") and the sentence stays declarative, as it should.
		expression: new RegExp(`^${lead}(?:(?:${DET}|eso|esto|aquello|todo|hoy|ayer|mañana)\\s+)?(?:${WORD}\\s+){0,3}(?:eres|sois|es|son|estás|estáis|está[n]?|fue|fueron|era[n]?|parece[n]?|resultó|quedó|salió|(?:ha|han)\\s+sido|(?:ha|han)\\s+quedado)\\s+(?:(?:${intensifiers})\\s+)?(?:un[ao]?\\s+(?:${exclamNoun})|(?:${exclamAdj}))${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "un desastre", "una pasada", "vaya, un milagro" — the same reaction noun standing alone, with
		// the copula elided. Kept separate from the rule above so it doesn't need a verb at all.
		expression: new RegExp(`^${lead}un[ao]?\\s+(?:${exclamNoun})${WB}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 6. Question-shaped conditionals, polite-request formulas and verb-first yes/no openers —
	 *    checked before the generic "qué + noun" exclamatory rule, since "qué tal si" would
	 *    otherwise look like "qué + noun".
	 * ==========================================================================================*/
	{
		// "y si llueve mañana", "qué tal si vamos", "qué pasaría si no funciona", "qué harías si ganaras".
		expression: new RegExp(`^${lead}(?:y\\s+si|qué\\s+tal\\s+si|qué\\s+(?:pasaría|ocurriría|sucedería|dirías|opinas)\\s+si|qué\\s+harías\\s+si|cómo\\s+reaccionarías\\s+si)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "se puede fumar aquí", "se podría cambiar la fecha", "sería posible verlo hoy", "es seguro usar
		// eval en producción", "habría manera de arreglarlo", "hay algún banco por esta zona", "hay algo
		// más", "hay alguien ahí", "existe alguna forma de hacerlo".
		expression: new RegExp(`^${lead}(?:se\\s+puede|se\\s+podría|es\\s+(?:seguro|posible|normal|recomendable|cierto|verdad)|sería\\s+(?:posible|viable|factible|mucho\\s+pedir)|habría\\s+(?:manera|forma|modo)|hay\\s+(?:algún|alguna|alguno|otro|otra|algunos|algunas|algo|alguien|más|manera|forma|modo)|existe\\s+(?:algún|alguna|otra|otro))${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "puedes ayudarme", "podrías decirme", "podemos hablar", "sabes qué hora es", "sabe usted",
		// "quieres venir", "me puedes prestar" (clitic fronting the modal), "te gustaría venir", "te
		// importaría esperar", "te molesta si fumo", "te parece bien", "me permites pasar", "serías tan
		// amable de", "tendrías la amabilidad de", "me pregunto si vendrás", "te apetece un café".
		expression: new RegExp(`^${lead}(?:${clitics}\\s+)?(?:puedes|podrías|puede|podría|podemos|podéis|sabes|sabrías|sabe(?:\\s+usted)?|quieres|querrías|quiere|queréis|(?:te|le|os|les)\\s+(?:gustaría|importaría|importa|molestaría|molesta|parece|apetece|apetecería|interesa|interesaría|anima[s]?|animas|suena)|me\\s+permites|me\\s+permite|serías\\s+tan\\s+amable|sería\\s+tan\\s+amable|tendrías\\s+la\\s+amabilidad|me\\s+pregunto\\s+si)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "vas a asistir a la boda", "van a llegar tarde", "vais a la boda el sábado" — the 2nd/3rd-person
		// "ir a + infinitive/noun" periphrastic-future or destination question ("are you going to...?").
		// Deliberately excludes 1st-person-plural "vamos a", which is genuinely ambiguous between an
		// invitation-question and an imperative suggestion (see the imperative rule below) and is left
		// for whichever rule catches it.
		expression: new RegExp(`^${lead}(?:${clitics}\\s+)?(?:vas|van|vais)\\s+a\\s+${WORD}`, 'i'),
		type: 'interrogative'
	},
	{
		// "lo logramos", "lo lograste", "lo lograremos", "lo conseguiste", "conseguimos terminar el
		// proyecto" — achievement exclamations. Checked ahead of the generic bare-opener rule below,
		// whose "-aste/-iste" catch-all would otherwise misread "lograste"/"conseguiste" as a plain
		// yes/no question.
		expression: new RegExp(`^${lead}(?:lo\\s+)?(?:logr(?:é|aste|amos|aremos|ó|aron)|consegu(?:í|iste|imos|iremos|ió|ieron))${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "no me lo puedo creer", "no lo puedo creer", "no puedo creerlo", "no te imaginas lo que pasó",
		// "no me esperaba esa respuesta", "no hay palabras para describir...", "no sé cómo agradecerte",
		// "no puedo explicarte", "no puedo más", "nunca había visto algo así" — disbelief, amazement and
		// eagerness formulas. Checked before the negative-question rule below, which shares the "no"
		// opener, and before the imperative rule, which owns "no + subjunctive" ("no te preocupes").
		expression: new RegExp(`^${lead}(?:no\\s+(?:me\\s+lo\\s+puedo\\s+creer|lo\\s+puedo\\s+creer|puedo\\s+creer(?:lo|me)?|puedo\\s+explicarte|puedo\\s+esperar\\s+más|puedo\\s+más|doy\\s+crédito|te\\s+imaginas|me\\s+imaginaba|me\\s+esperaba|esperaba|sé\\s+cómo\\s+agradecer|me\\s+canso\\s+de|hay\\s+palabras\\s+para|tengo\\s+palabras\\s+para|hay\\s+derecho|me\\s+digas|puede\\s+ser)|(?:nunca|jamás)\\s+(?:${pron}\\s+)?(?:había|he|hemos|habíamos)\\s+visto)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "no crees que es tarde", "no te parece raro", "no sería mejor esperar", "no te gustaría venir",
		// "no es cierto que...", "no vienes con nosotros" — a negated opinion or invitation question.
		// Restricted to verbs that actually solicit agreement: a bare "no es fácil" or "no tengo tiempo"
		// is an ordinary statement and must not be caught here.
		expression: new RegExp(`^${lead}no\\s+(?:${clitics}\\s+){0,2}(?:crees|creéis|piensas|opinas|parece|parecería|preferirías|preferiría|gustaría|apetece|apetecería|interesa|interesaría|importaría|animas|atreves|sería\\s+mejor|sería|será|vendrás|vienes|venís|vas\\s+a|prefieres|quieres|queréis|podrías|puedes|deberíamos|debería|es\\s+cierto|es\\s+verdad|es\\s+así|te\\s+acuerdas|te\\s+suena)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "acaso no lo sabías", "será que se olvidó", "no será que está enfadado", "a poco no te gusta",
		// "verdad que sí", "cierto que vienes" — epistemic and confirmation-seeking openers with no
		// wh-word and no inversion to give them away.
		expression: new RegExp(`^${lead}(?:acaso|(?:no\\s+)?(?:será|sería|habrá|habría|estará|tendrá|podrá|irá)\\s+que|a\\s+poco|verdad\\s+que|cierto\\s+que|o\\s+sea\\s+que|entonces\\s+qué)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// Bare yes/no-question openers with no wh-word at all: "tienes tiempo", "puedo pasar", "sabías
		// que...", "crees que...", "vienes con nosotros", "necesitas ayuda", "recuerdas el nombre", "me
		// acompañas", "te acordaste de...", "le avisaste al cliente", "ya confirmaste", "has visto...",
		// "estás bien", "trabajas aquí", "queréis pizza". Sentence-initial 2nd-person forms carry the
		// weight here: with the subject pronoun dropped (as Spanish normally does) an unpunctuated
		// "vives en madrid" is a question far more often than a statement about the addressee. The list
		// stays curated rather than reaching for the whole `verbForms` set, most of which is 3rd-person
		// forms that also open ordinary statements ("me parece bien", "nos vemos el lunes"); the one
		// generic addition is the -áis/-éis 2nd-person-plural ending, a shape no Spanish noun has.
		expression: new RegExp(`^${lead}(?:${clitics}\\s+)?(?:ya\\s+)?(?:tienes?|tiene|tienen|puedo|sab[ií]as?|crees?|cree|te\\s+llegó|has|vienes?|vienen|necesitas?|recuerdas?|acompañas?|prefieres?|prefieren|vives?|conoces?|hablas?|conduces?|estás|eres|vas|haces|dices|ves|oyes|escuchas|entiendes|trabajas|estudias|juegas|comes|bebes|duermes|sales|llegas|vuelves|viajas|corres|lees|escribes|esperas|quedas|quieres|piensas|opinas|dudas|aceptas|firmas|pagas|traes|llevas|dejas|olvidas|usas|sigues|empiezas|terminas|acabas|sos|tenés|podés|querés|sabés|hacés|${WORD}(?:aste|iste|íste|áis|éis))${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "te gusta la música clásica", "te apetece un café", "te acuerdas de mí", "te traigo algo",
		// "te llamas ana" — a direct question fronted by the 2nd-person clitic "te", which in ordinary
		// Spanish word order never opens a statement about the speaker. Either a gustar-type verb (whose
		// 3rd-person form agrees with the *thing*, so "te gusta" is already 2nd-person addressed) or any
		// verb carrying a 2nd-person ending.
		expression: new RegExp(`^${lead}te\\s+(?:gusta[n]?|gustaría[n]?|apetece[n]?|parece[n]?|interesa[n]?|importa[n]?|molesta[n]?|duele[n]?|suena[n]?|toca|queda[n]?|falta[n]?|sobra[n]?|conviene[n]?|pasa|pasó|hace\\s+falta|acuerdas|animas|atreves|enteras|imaginas|${WORD}(?:as|es|ás|és|áis|éis|aste|iste))${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "me traes un vaso de agua", "me dejas usar tu computadora", "me pasas la sal", "me explicas
		// esto" — a request fronted by "me" plus a 2nd-person verb form. Unlike "te", the clitic "me"
		// happily opens ordinary statements ("me duele la cabeza", "me gusta el café", "me parece bien"),
		// which is why only the 2nd-person endings count here: it is the addressee doing the verb that
		// makes it a request rather than the speaker reporting on themselves.
		expression: new RegExp(`^${lead}me\\s+${WORD}(?:as|es|ás|és|áis|éis)${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "habéis visto las noticias", "han llegado ya los invitados" — a present-perfect auxiliary +
		// participle with no subject or wh-word ("has" is already covered by the bare-opener rule
		// above), restricted to these 2nd/3rd-person plural forms because they're never used to open a
		// declarative statement in this register. The 1st-person "he"/"hemos" are deliberately excluded,
		// since those commonly open an ordinary statement instead ("He terminado el informe.").
		expression: new RegExp(`^${lead}(?:habéis|han)\\s+${WORD}`, 'i'),
		type: 'interrogative'
	},
	{
		// "alguien sabe...", "alguien apagó..." (an unspecified subject), or a leading "ya"/"todavía"
		// ("already/yet") — "ya llegaron los invitados", "ya terminaste el informe". An unspecified
		// subject licenses the broad verb set; the "ya" branch is narrowed to preterite and perfect
		// forms, because "ya está" and "ya voy" are announcements rather than questions.
		expression: new RegExp(`^${lead}(?:alguien\\s+(?:${pron}\\s+){0,1}(?:${verbForms}|apagó|apagaron|lleg(?:ó|aron)|fue|fueron)|(?:ya|todavía)\\s+(?:${clitics}\\s+){0,2}(?:has|habéis|han|hab[ií]as|sabes|sabías|lo\\s+sabes|fuiste|fueron|viste|comiste|llegó|llegaron|volvió|volvieron|empezó|empezaron|acabó|terminó|salió|vino|vinieron|se\\s+fueron|está\\s+listo|estás\\s+listo|${WORD}(?:aste|iste|íste|aron|ieron)))${WB}`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 7. The core wh-word rule: an accented wh-word, optionally fronted by a preposition ("a qué
	 *    hora", "desde cuándo"), followed by (optionally) a pronoun and a finite verb. Only the
	 *    accented forms are matched — "que/como/cuando/donde/cuanto" without an accent are relative
	 *    pronouns or conjunctions and never trigger this rule.
	 * ==========================================================================================*/
	{
		// "qué necesitas", "cuánto cuesta", "cuántas veces lo dijiste", "qué te parece" — kept gated on
		// the curated verbForms list (rather than any word) because "qué"/"cuánto" also have a
		// legitimate no-verb exclamatory reading ("qué desastre", "cuánta gente") that this gating
		// protects; see the "cómo/cuándo/dónde" rule below, which doesn't need that protection.
		expression: new RegExp(`^${lead}(?:${prep})?(?:qué|cuánt[oa]s?)\\s+(?:${pron}\\s+){0,2}${verbForms}${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// "cómo corre ese atleta", "cómo brilla el mar bajo el sol", "cómo se mueve ese bailarín" — the
		// "cómo" sibling of the "qué + adjective + state verb + subject" inversion exclamation further
		// below: manner/appearance verb + inverted subject. Checked ahead of the general "cómo + verb"
		// interrogative rule right after this one, but restricted to the closed `mannerVerbs` class
		// plus the determiner-ended-subject requirement, because "cómo se llama tu perro" and "cómo
		// supiste la noticia" are genuine questions sharing the same surface shape "cómo + (clitic +)
		// verb + article + noun" — they stay correctly interrogative only because "llamar(se)" and
		// "saber" fall outside `mannerVerbs`, as do the copulas ("cómo está el paciente").
		expression: new RegExp(`^${lead}cómo\\s+(?:${pron}\\s+){0,2}${mannerVerbs}\\s+${DET}\\s+${WORD}(?:\\s+${WORD}){0,3}$`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cómo me encanta este parque", "cómo me duelen los pies" — the intensified "cómo" variant of
		// the "me + reaction-verb" exclamation (see `reactionVerbs`), checked here ahead of the general
		// "cómo + verb" interrogative rule right below for the same reason as the rule above.
		expression: new RegExp(`^${lead}cómo\\s+(?:me|nos)\\s+${reactionVerbs}${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cómo funciona esto", "cuándo llegas", "dónde vives", "desde cuándo vives aquí", "cómo puedo
		// optimizar esta función", "dónde se origina este error" — "cómo"/"cuándo"/"dónde"/"adónde"
		// always need a verb to complete the sentence, unlike "qué"/"cuánto" (no "cómo desastre"
		// equivalent exists), and per this file's own accent-gating rule these four are never anything
		// but interrogative or exclamatory — so any word that follows one, not just a verb from the
		// curated verbForms list, reads as a question here. The fixed exclamatory idioms for these
		// wh-words ("cómo no", "dónde se ha visto", "cómo llueve", ...) are carved out in section 2
		// above and run first, so they still take precedence over this broader fallback.
		expression: new RegExp(`^${lead}(?:${prep})?(?:cómo|cuándo|dónde|adónde)\\s+(?:${pron}\\s+){0,2}${WORD}`, 'i'),
		type: 'interrogative'
	},
	{
		// "qué buen trabajo hiciste", "qué alivio saber que...", "qué risa me dio tu comentario", "qué
		// rápido corres", "qué poco duermes" — an evaluative noun/adjective/adverb right after "qué"
		// makes this a reaction exclamation even though a verb follows later, unlike the neutral shape
		// matched by the question-noun rule below.
		expression: new RegExp(`^${lead}qué\\s+(?:${evalWord})(?:\\s+${WORD}){0,3}\\s+(?:${pron}\\s+){0,2}${verbForms}${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué de gente hay", "qué de trabajo queda por hacer" — the fixed "qué de + noun" quantity
		// idiom ("how much/many..."), distinct from the wh-pronoun "qué" and never used to form a
		// genuine question (real quantity questions use "cuánto/a"), so no verb check is needed.
		expression: new RegExp(`^${lead}qué\\s+de\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué pequeña es esta habitación", "qué rápido llegó el tren", "qué ordenado tienes el
		// escritorio", "qué increíblemente rápido pasó el fin de semana" (multi-word adjective/adverb
		// phrase before the verb), "qué fácil fue resolver el acertijo" (a trailing infinitive instead of
		// a subject noun phrase) — the "qué + adjective + copula/state verb + subject/infinitive"
		// inversion exclamation ("how ADJ SUBJ is!"). Three guards keep it off genuine questions: the
		// word after "qué" may not be a pronoun, a verb, or a `questionNoun`, since "qué color es tu
		// coche" and "qué precio tiene el libro" are the same shape but are requests for information;
		// and the sentence must end right after either a determiner-led noun phrase (the inverted
		// subject) or a bare infinitive, which is what excludes "qué hora marca tu reloj" (a transitive
		// verb outside the `stateVerbs` class) and "qué día es hoy" (ends in a bare adverb). The verb
		// slot also accepts the same generic -ó/-amos/-emos/-imos endings `verbForms` does ("qué
		// desafiante resultó el examen", "qué pésima planificación tuvimos") — still safe against
		// "marca"-style false positives, since those endings are morphologically distinctive verb markers
		// on their own, same as everywhere else they're used.
		expression: new RegExp(`^${lead}qué\\s+(?!${pron}${WB})(?!${verbForms}${WB})(?!${questionNoun}${WB})${WORD}(?:\\s+${WORD}){0,2}\\s+(?:${pron}\\s+){0,2}(?:${stateVerbs}|${WORD}(?:ó|amos|emos|imos))\\s+(?:${DET}\\s+${WORD}(?:\\s+${WORD}){0,3}|${WORD}(?:ar|er|ir|arse|erse|irse)(?:\\s+${WORD}){0,3})$`, 'i'),
		type: 'exclamatory'
	},
	{
		// "bien ordenados están los documentos", "bien fresca está la fruta del mercado", "bien limpio
		// ha quedado el coche" — the "bien + adjective/participle + copula + subject" inversion
		// exclamation, a variant of the "qué + adjective" pattern above that fronts with "bien" instead.
		// "bien" is never itself a question opener, so no trailing-subject restriction is needed here.
		expression: new RegExp(`^${lead}bien\\s+${WORD}(?:\\s+${WORD}){0,2}\\s+(?:${pron}\\s+){0,2}${verbForms}${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "qué hora", "qué talla usas", "cuántos años", "a qué hora empieza la función", "qué color te
		// gusta" — a neutral information noun after the wh-word. Listed before the no-verb exclamatory
		// rules in section 8 so that a verbless "qué hora" (an echo question) doesn't get read as a
		// reaction the way "qué desastre" rightly is.
		expression: new RegExp(`^${lead}(?:${prep})?(?:qué|cuánt[oa]s?)\\s+(?:${questionNoun})${WB}`, 'i'),
		type: 'interrogative'
	},
	{
		// A wh-word introducing a noun phrase that a verb still follows: "qué libro prefieres", "cuántas
		// personas vinieron", "qué curso de machine learning recomiendas" (up to 3 extra words before the
		// verb, to cover short "noun + de + noun" modifiers) — as opposed to "qué desastre" below, where
		// no verb ever shows up.
		expression: new RegExp(`^${lead}(?:${prep})?(?:qué|cuánt[oa]s?)\\s+${WORD}(?:\\s+${WORD}){0,3}\\s+(?:${pron}\\s+){0,2}${verbForms}${WB}`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 8. The same wh-words followed by a noun or adjective with no verb anywhere read as exclamations:
	 *    "qué desastre", "qué generosa", "cuánta gente", "cuánto tiempo perdido". The negative
	 *    lookahead against verbForms is what keeps this from firing on the interrogative shapes above.
	 * ==========================================================================================*/
	{
		// "qué lástima", "qué bonito", "qué tan grande", "qué mala suerte".
		expression: new RegExp(`^${lead}qué\\s+(?:tan\\s+|más\\s+)?(?!${verbForms}${WB})${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cuánto dinero", "cuánta gente", "cuántos problemas", "cuántas ganas".
		expression: new RegExp(`^${lead}cuánt[oa]s?\\s+(?!${verbForms}${WB})${WORD}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 9. Sentence-final question tags — no wh-word or inversion needed, just a tag bolted onto a
	 *    statement: "está bien, verdad", "vienes mañana, no crees", "hace frío, eh", "no es así".
	 * ==========================================================================================*/
	{
		// The unambiguous multi-word tags, which need no comma to be recognisable — nothing else in
		// Spanish ends a plain statement with "no crees" or "sí o no". Kept separate from the
		// comma-gated set below precisely because the documented input contract strips punctuation,
		// so a comma-only rule would never fire on the input this library actually receives.
		expression: new RegExp(`${WORD}[\\s,]+(?:¿\\s*)?(?:no\\s+crees|no\\s+te\\s+parece|no\\s+le\\s+parece|no\\s+os\\s+parece|sí\\s+o\\s+no|o\\s+qué|me\\s+explico|me\\s+entiendes|te\\s+enteras)${CLOSE}$`, 'i'),
		type: 'interrogative'
	},
	{
		// The weaker one-word tags, which do require a comma: a sentence that merely happens to end in
		// one of these words as its own predicate ("ojalá sea verdad", "eso no es así") isn't a tag
		// question. The bare "no" tag additionally requires a literal "¿" (as in ", ¿no?") since without
		// it, "no" alone is indistinguishable from the interjection "¡Ay, no!".
		expression: new RegExp(`,\\s*(?:¿\\s*(?:no\\s+es\\s+así|verdad|cierto|vale|eh|sabes|entiendes|de\\s+acuerdo|no)|(?:no\\s+es\\s+así|verdad|cierto|vale|eh|sabes|entiendes|de\\s+acuerdo))${CLOSE}$`, 'i'),
		type: 'interrogative'
	},

	/* ============================================================================================
	 * 10. Fixed exclamative formulas: "hay que ver", negation, intensifiers, congratulations,
	 *     well-wishes, interjections, reaction verbs. Checked ahead of the imperative rule below,
	 *     which would otherwise catch openers like "hay que", "corre" or "vamos" and report them as
	 *     plain declaratives.
	 * ==========================================================================================*/
	{
		// "hay que ver cómo llueve", "hay que ver lo que has hecho", "hay que ver qué cosas".
		expression: new RegExp(`^${lead}hay\\s+que\\s+ver${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "vamos, no te rindas", "vamos equipo, ya casi llegamos", "venga, que tú puedes", "vamos" and
		// "dale" standing alone — bare cheering interjections ("come on!"), optionally addressing
		// someone by name/group before the comma. Distinct from "vamos a + infinitive" ("vamos a
		// empezar"), which is genuinely ambiguous between an invitation-question and a plain statement
		// of intent and is left to the imperative rule below.
		expression: new RegExp(`^${lead}(?:(?:vamos|venga|dale|ándale|órale|eso\\s+es|así\\s+se\\s+hace)(?:\\s+${WORD})?\\s*,|(?:vamos|venga|dale|ándale|órale|arriba|olé|ole)\\s*$)`, 'i'),
		type: 'exclamatory'
	},
	{
		// "ni hablar", "ni se te ocurra", "ni loco", "ni pensarlo", "ni por asomo", "ni idea",
		// "ni que fuera de oro".
		expression: new RegExp(`^${lead}ni\\s+(?:hablar|se\\s+te\\s+ocurra|loc[oa]s?|pensarlo|por\\s+asomo|de\\s+broma|en\\s+sueños|muerto|idea|que\\s+${WORD})${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "y tanto", "y encima", "y ya", "y un jamón". ("y eso" is deliberately absent: on its own it's
		// the question "how come?", handled by the bare-wh rule in section 4.)
		expression: new RegExp(`^${lead}y\\s+(?:tanto|encima|ya|un\\s+jamón|dale)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "tanto tiempo", "tanta gente", "tanto ruido" — bare, elliptical.
		expression: new RegExp(`^${lead}tant[oa]\\s+${WORD}${WB}$`, 'i'),
		type: 'exclamatory'
	},
	{
		// "menos mal", "menos mal que viniste", "menos mal que no llovió".
		expression: new RegExp(`^${lead}menos\\s+mal${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "felicitaciones", "enhorabuena", "bien hecho", "ojalá te vaya bien", "feliz cumpleaños",
		// "que tengas un buen día", "buen provecho", "bienvenido", "gracias", "mil gracias".
		expression: new RegExp(`^${lead}(?:felicitaciones|enhorabuena|felicidades|bravo|bien\\s+hecho|así\\s+se\\s+hace|ojalá|ánimo|mucho\\s+ánimo|(?:mucha\\s+|buena\\s+)?suerte|feliz\\s+(?:cumpleaños|aniversario|año\\s+nuevo|navidad|semana|día|viaje)|felices\\s+fiestas|que\\s+(?:tengas|tenga|tengáis|pases|pase|paséis|disfrutes|disfrute|te\\s+vaya|le\\s+vaya|os\\s+vaya)\\s+${WORD}|buen\\s+provecho|bienvenid[oa]s?|salud|descansa|que\\s+descanses|(?:muchas\\s+|mil\\s+|un\\s+millón\\s+de\\s+)?gracias|te\\s+lo\\s+agradezco|te\\s+felicito|os\\s+felicito|lo\\s+felicito)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "ay", "uy", "uf", "guau", "vaya", "caray", "madre mía", "por dios", "hola", "socorro", "oh",
		// "caracoles", "rayos", "increíble", "perfecto", "genial", "por fin", "al fin", "sorprendente",
		// "sorpresa", "fabuloso", "claro que sí", "por supuesto", "corre"/"cuidado"/"socorro" (urgent
		// commands that function as pure interjections, which is why they're taken before the imperative
		// rule further down).
		expression: new RegExp(`^${lead}(?:ay|uy|uf|huy|oh|ah|guau|wow|vaya|anda|hala|órale|caray|caramba|caracoles|rayos|diablos|cielos|madre\\s+mía|dios\\s+mío|por\\s+dios|santo\\s+cielo|válgame|jo|joder|puf|bah|hola|adiós|socorro|auxilio|cuidado|atención|ojo|basta|silencio|corre|no\\s+puede\\s+ser|no\\s+me\\s+digas|qué\\s+va|de\\s+verdad|en\\s+serio|claro\\s+que\\s+sí|por\\s+supuesto|desde\\s+luego|faltaría\\s+más|ni\\s+de\\s+broma|incre[íi]ble|excelente|perfect[oa]|genial|magnífic[oa]|estupend[oa]|fantástic[oa]|fabulos[oa]|fenomenal|formidable|bárbar[oa]|buenísim[oa]|sorprendente|sorpresa|imag[íi]nate|por\\s+fin|al\\s+fin|ya\\s+era\\s+hora|eres\\s+un[a]?\\s+(?:genio|crack|máquina|fenómeno|figura|fiera|sol))${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "me encanta esta canción", "me fascina cómo lo explicas", "me da mucha rabia", "me pone
		// furioso" (present tense), and the same reaction verbs in the preterite: "me encantó la
		// presentación", "me sorprendió tu decisión", "me dio mucha pena", "me caíste tan bien". The
		// "cómo me + reaction-verb" variant ("cómo me encanta este parque") is carved out separately in
		// section 7, ahead of the general "cómo + verb" interrogative rule, since it would otherwise be
		// claimed there first.
		expression: new RegExp(`^${lead}(?:me|nos)\\s+${reactionVerbs}${WB}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 11. Optative and imprecative subjunctive clauses, ironic noun phrases, degree emphasis and
	 *     superlatives — the remaining exclamative constructions, all of which are more specific
	 *     than the imperative and bare-fragment fallbacks that follow.
	 * ==========================================================================================*/
	{
		// "si supieras cuánto te extraño", "si vieras qué cara puso", "si te contara", "si hubieras
		// visto su reacción" — optative "si". Deliberately restricted to this closed set of verbs
		// rather than the whole imperfect subjunctive: "si tuviera dinero me compraría un coche" and
		// "si pudiéramos empezar de nuevo, lo haría igual" are ordinary unreal conditionals, not
		// exclamations, and they share the "si + imperfect subjunctive" shape exactly.
		expression: new RegExp(`^${lead}si\\s+(?:${pron}\\s+){0,2}(?:supieras?|supierais|supieran|vieras?|vierais|vieran|contara|contase|contaras|hubieras\\s+visto|hubierais\\s+visto|hubieras\\s+estado|pudieras\\s+ver|ser[áa]s?\\s+${WORD}|es\\s+que)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "que te vaya bien", "que descanses", "que tengas suerte" — desiderative main-clause "que" at
		// the very start of the sentence. Because nothing precedes it, this can't be the relative
		// pronoun "que" (which always needs an antecedent to attach to).
		expression: new RegExp(`^${lead}que\\s+(?:${pron}\\s+){0,2}${subjPresent}${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "así te mueras", "así se hunda", "así no vuelvas" — the imprecative "así" + subjunctive.
		expression: new RegExp(`^${lead}así\\s+(?:${pron}\\s+){0,2}(?:no\\s+)?${subjPresent}${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "menudo problema", "menuda suerte", "valiente amigo", "bonito lío", "dichosa hora", "vaya
		// tela".
		expression: new RegExp(`^${lead}(?:menud[oa]|valiente|bonit[oa]|dichos[oa])\\s+${WORD}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "lo bien que canta", "lo guapa que está", "lo rápido que corre" — the intensive "lo + adj/adv
		// + que" construction. Requires a second "que" beyond the wh-word, which is what keeps this
		// from ever matching the ordinary relative "lo que dices".
		expression: new RegExp(`^${lead}lo\\s+${WORD}\\s+que\\s+`, 'i'),
		type: 'exclamatory'
	},
	{
		// "lo que me faltaba", "lo que hay que ver", "lo que has conseguido" — the elliptical "lo que"
		// reaction. Restricted to a closed set of continuations so the ordinary relative clause ("lo
		// que dices no tiene sentido") stays declarative.
		expression: new RegExp(`^${lead}lo\\s+que\\s+(?:me\\s+faltaba|faltaba|hay\\s+que\\s+ver|has\\s+conseguido|habéis\\s+conseguido|me\\s+alegro)${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// "la de cosas que tengo que hacer", "la de gente que había" — the intensive "la de + noun + que".
		expression: new RegExp(`^${lead}la\\s+de\\s+${WORD}\\s+que\\s+`, 'i'),
		type: 'exclamatory'
	},
	{
		// "las cosas que dices", "los problemas que tenemos", "las vueltas que da la vida".
		expression: new RegExp(`^${lead}(?:las|los)\\s+${WORD}\\s+que\\s+`, 'i'),
		type: 'exclamatory'
	},
	{
		// "cada cosa que dices", "cada ocurrencia" — but only as a short, complete exclamation; a
		// longer "cada vez que llueve me resfrío" is an ordinary temporal clause, not an exclamation.
		expression: new RegExp(`^${lead}cada\\s+${WORD}(?:\\s+que\\s+${WORD}(?:\\s+${WORD})?)?$`, 'i'),
		type: 'exclamatory'
	},
	{
		// "el mejor concierto que he visto", "la peor semana de mi vida", "lo más increíble de todo".
		expression: new RegExp(`\\b(?:el|la|los|las|lo)\\s+(?:mejor|peor|más\\s+${WORD})${WB}[^,]{0,40}(?:que\\s+(?:he|hemos|has|han)\\s+${WORD}|de\\s+(?:mi\\s+vida|la\\s+historia|todos\\s+los\\s+tiempos))${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// The absolute-superlative suffix "-ísimo/-ísima" (plus its plurals): "carga rapidísimo",
		// "riquísima", "muchísimo", "gravísimos". This is a productive Spanish morphological ending in its
		// own right — not a fixed word list — and one native speakers reach for specifically to express
		// heightened reaction ("very very X"), so a word carrying it anywhere in the sentence is a
		// reliable standalone exclamatory signal, independent of sentence position or surrounding
		// structure.
		expression: new RegExp(`${WORD}ísim[oa]s?${WB}`, 'i'),
		type: 'exclamatory'
	},
	{
		// A subject predicated by a copula/state verb (see `stateVerbs`) plus an adverb in "-mente" and a
		// following adjective: "el informe es extremadamente claro", "el vecino es increíblemente amable",
		// "la propuesta es financieramente brillante". Any "-mente" adverb qualifies here (a productive
		// suffix, like English "-ly"), not just the curated `intensifiers` list, because stacking a manner
		// adverb directly onto a copula this way is itself the marked, emphatic construction — plain
		// "muy"/"bastante" before an adjective is deliberately excluded, since those two stay just as
		// often declarative in practice ("el vecino nuevo es muy amable con todos").
		expression: new RegExp(`^${lead}(?:${DET}\\s+)?${WORD}(?:\\s+${WORD}){0,4}\\s+${stateVerbs}\\s+${WORD}mente\\s+${WORD}(?:\\s+${WORD}){0,2}$`, 'i'),
		type: 'exclamatory'
	},
	{
		// A closed set of fixed adverbial idioms of completeness/manner that Spanish reaches for
		// specifically to editorialize an outcome rather than just report it: "funciona de maravilla",
		// "colgó el navegador por completo", "no encaja para nada", "no aparece por ningún lado", "no
		// emite ni un solo sonido", "no calienta absolutamente nada". Each phrase here is a fixed formula
		// in its own right (not a stand-in for an open word class), the same kind of closed idiom list as
		// "menos mal"/"ni hablar" elsewhere in this file — so this isn't gated on sentence position, since
		// the idiom itself is the exclamatory signal regardless of where in the sentence it lands.
		expression: new RegExp(`\\b(?:de\\s+maravilla|estupendamente|de\\s+forma\\s+extraordinaria|por\\s+completo|para\\s+nada|absolutamente\\s+nada|ni\\s+un[oa]?\\s+${WORD}|por\\s+ningún\\s+lado|por\\s+más\\s+que)${WB}`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 12. Imperatives. Reported as declarative because this library exposes only three types. Placed
	 *     ahead of the bare-fragment rule below so that a one-word command ("cállate", "dímelo",
	 *     "espera") isn't swept up as a one-word reaction — every genuine one-word interjection that
	 *     shares this shape ("corre", "cuidado", "basta", "socorro") was already claimed in 10.
	 * ==========================================================================================*/
	{
		// "cierra la puerta", "por favor espera aquí", "no te preocupes", "vamos a empezar", "hay que
		// intentarlo", "dígame", "pasen por aquí".
		expression: new RegExp(`^${lead}(?:por\\s+favor\\s+)?(?:cierra|abre|ven|vete|ve|haz|di|pon|sal|ten|sé|deja|escucha|mira|espera|para|sigue|continúa|empieza|comienza|termina|acaba|ayuda|calla|siéntate|levántate|acuéstate|llama|envía|manda|recuerda|apúrate|apura|prueba|intenta|toma|coge|trae|lleva|tranquilo|tranquila|vengan|pasen|tomen|esperen|escuchen|miren|digan|siéntense|cállense|dígame|diga|perdone|disculpe|espere|mire|escuche|tome|pase|siga|ponga|tenga|venga\\s+${WORD}|vamos\\s+a|hay\\s+que|tenemos\\s+que|debemos|no\\s+(?:te\\s+|le\\s+|se\\s+|me\\s+|lo\\s+|la\\s+|nos\\s+)?(?:olvides|preocupes|dudes|muevas|hagas|digas|vayas|toques|mires|dejes|pierdas|rindas|enfades|tardes|corras|grites))${WB}`, 'i'),
		type: 'declarative'
	},
	{
		// "dime", "cuéntame", "explícamelo", "quítatelo", "avísame cuando llegues" — an imperative with
		// its clitics welded on (see `encliticImperative`).
		expression: new RegExp(`^${lead}${encliticImperative}${WB}`, 'i'),
		type: 'declarative'
	},

	/* ============================================================================================
	 * 13. Bare one- or two-word fragments with no recognized verb: "brillante", "mil gracias", "qué
	 *     alivio" already handled earlier, but plain adjectives/nouns/vocatives like "espectacular",
	 *     "ridículo", "socorro", "tío", "campeón" have no fixed idiom list to belong to. A short fragment
	 *     like this is essentially always a one-word reaction or address term, never a complete
	 *     declarative statement (every declarative in ordinary Spanish needs at least a subject and a
	 *     verb), so length plus the absence of a recognized verb is a safe, general signal — cheaper than
	 *     enumerating the open-ended set of adjectives/nouns Spanish speakers use this way. A leading
	 *     determiner is excluded, since "el informe" or "mi hermano" is a label or a sentence fragment
	 *     rather than a reaction.
	 * ==========================================================================================*/
	{
		expression: new RegExp(`^${lead}(?!${DET}${WB})(?!${verbForms}${WB})${WORD}(?:[,\\s]+(?!${verbForms}${WB})${WORD})?$`, 'i'),
		type: 'exclamatory'
	},

	/* ============================================================================================
	 * 14. Anything left over is a statement.
	 * ==========================================================================================*/
	{
		expression: /.+/,
		type: 'declarative'
	}
]