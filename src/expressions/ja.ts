// ja.ts
import type { SentenceTypeDetectExpressionSets } from '../type-detection.js'

/**
 * Japanese sentence-type detection.
 *
 * Input contract (see ../type-detection.ts): sentences arrive trimmed and **without
 * punctuation**, so 「？」「！」 carry no information. Japanese also marks sentence type
 * almost entirely at the *end* of the clause, and its markers are homographs of very
 * common declarative material:
 *
 *   か   question particle 「行きますか」 … but also 静か・確か・まさか・とか・ばか
 *   の   question particle 「行くの」   … but also the genitive 「私の」・formal 「〜のだ」
 *   ん   「〜んですか」                  … but also 「そうなんです」(の→ん explanatory)
 *   な   prohibitive 「行くな」          … but also 「みんな」「大きな」「〜だな」
 *   も   turns every 疑問詞 into an indefinite: 何も・誰も・いつも・どこも
 *
 * Every rule below therefore pairs a marker with the lexical guards that keep it from
 * firing on those look-alikes. Because the first match wins, the order is the algorithm:
 *
 *    1. pure interjections / onomatopoeia   – can never be anything but exclamations
 *    2. 〜なんて / なんという / どんなに      – exclamatives that start with a 疑問詞
 *    3. embedded questions + 〜ください      – declarative despite containing か or 疑問詞
 *    4. explicit question endings           – か・かな・かしら・っけ
 *    5. confirmation tags                   – よね・でしょ・だろ (but not でしょう/だろう)
 *    6. 疑問詞 questions                     – 何・誰・どこ・いつ・どう… in situ
 *    7. 〜の rising-intonation questions
 *    8. imperatives, prohibitives, requests
 *    9. emphatic particles and elongation   – ぞ・ぜ・じゃん・〜っ・〜ー
 *   10. emotive vocabulary and greetings
 *   11. declarative default
 *
 * Known limits (unsolvable without the 「？」): declarative-form questions carried purely
 * by intonation 「これ食べる」「知ってる」 read as statements, and 「〜でしょう」「〜だろう」
 * are treated as conjecture 「明日は雨でしょう」 rather than as confirmation requests.
 */

/* ------------------------------------------------------------------ helpers */

/** Wraps alternatives in a non-capturing group. */
const any = (...alternatives: string[]): string => `(?:${alternatives.join('|')})`

/** Compiles a rule source string. */
const rx = (source: string): RegExp => new RegExp(source)

/**
 * Elongation, glottal stops and laughter that may trail any sentence-final form
 * (「そうかー」「やばっ」「うれしいw」). Matched after every ending pattern.
 */
const TAIL = '(?:[ーぁぃぅぇぉっん〜～]|w|ｗ|笑|草)*'

/**
 * Interjections may additionally be stretched with full vowels 「うわあああ」「やったー」,
 * which ordinary sentence endings must not be (or 「でしょ」+う would look like a tag).
 */
const SHOUT_TAIL = '(?:[ーぁぃぅぇぉあいうえおっん〜～]|w|ｗ|笑|草)*'

/* ------------------------------------------------------------- 疑問詞 (wh) */

/**
 * A 疑問詞 becomes an indefinite ("some-/any-/every-") as soon as か・も・でも follows,
 * optionally across a case particle: 何か・誰にも・どこでも・いつまでも.
 */
const INDEFINITE = '(?!(?:に|へ|で|と|の|まで|から|より|にも)?(?:か|も|でも))'

/** Interrogative words, each carrying the guards that block its idiomatic uses. */
const WH = any(
	// どう and its family. どうして/どうやって stay questions, どうも・どうせ・どうやら do not.
	'どうして(?!も)', 'どうやって', 'どういう(?!こと(?:だ|です)?$)',
	`どう${INDEFINITE}(?!せ|やら|ぞ|りで|いたし|にか|にも|して?も)`,
	'なぜ(?!なら|か)', '何故(?!なら)',
	// 何: block counters read as "many" (何度も・何人も), the indefinite 何か・何も, and the
	// accidental substring inside こんなに・そんなに・あんなに (これ/それ/あれ + 「〜な」+に, not 何).
	`(?<!こん|そん|あん)何${INDEFINITE}(?!らか|やら|(?:度|回|人|年|日|月|週|時間|分|冊|個|本|枚|台|軒|杯|着|匹|羽|件|回目)も)`,
	`(?<!こん|そん|あん)なに${INDEFINITE}(?!しろ|より|ぶん|げ|やら|くそ)`,
	// はhiragana なん is mostly 「〜なんです」「〜なんて」, so only its productive uses count.
	'なん(?:で(?!も|す)|の(?!か)|だっけ|じ|ぼ)',
	`${any('誰', 'だれ', 'どなた', 'どちら様')}${INDEFINITE}`,
	`${any('どこ', '何処')}${INDEFINITE}(?!となく)`,
	`${any('いつ', '何時')}${INDEFINITE}(?!しか|のまに|ぞ)`,
	`${any('どれ', 'どちら', 'どっち')}${INDEFINITE}(?!ほど)`,
	// どの: guard the accidental substring inside 「〜ほどの」 (degree ほど + genitive の, not どの).
	'(?<!ほ)どの(?:くらい|ぐらい)?', 'どんな(?!に)', 'どんだけ',
	`${any('いくら', 'いくつ', '幾ら', '幾つ')}${INDEFINITE}`,
	'いかが', 'どのように', 'どういうこと(?!だ|です)'
)

/* ------------------------------------------------- 感動詞 (interjections) */

/** Interjections and onomatopoeia that constitute a whole utterance. */
const INTERJECTION = any(
	// surprise / reaction
	'あ', 'ああ', 'あっ', 'あー', 'あれ', 'あれれ', 'あら', 'あらら', 'おや', 'おやおや', 'おっと', 'おお', 'おー',
	'うわ', 'うわあ', 'うわー', 'わ', 'わあ', 'わー', 'わっ', 'え', 'ええ', 'えっ', 'えー', 'えぇ', 'へえ', 'へー',
	'ほう', 'ほー', 'ふう', 'ふー', 'はあ', 'はー', 'ひゃー', 'ぎゃー', 'きゃー', 'きゃあ', 'ぐっ', 'うっ', 'げっ', 'げえ',
	'ちぇ', 'ちっ', 'ぷっ', 'ぶっ', 'まあ', 'まー', 'ぬおー', 'どわー', 'ぎょえー', 'がーん', 'うーん',
	// cheers, calls, exertion
	'やあ', 'よう', 'おい', 'おーい', 'こら', 'ねえ', 'ねー', 'よし', 'よしっ', 'よっしゃ', 'わーい', 'やった', 'やったー',
	'やっほー', 'ばんざい', '万歳', 'どっこいしょ', 'よいしょ', 'せーの', 'それー', 'ほらー', 'ほれ',
	// pain, dismay, cursing
	'いてっ', '痛っ', 'あちゃー', 'しまった', 'やべ', 'やべー', 'やばっ', 'ちくしょう', 'ちくしょー', 'くそ', 'くそー',
	'ばか', 'ばかやろー', '馬鹿', 'ふざけんな', 'ふざけるな', 'ぐぬぬ', 'うーん', 'ううっ', 'うえーん', 'えーん',
	// mimetic words used as a whole reaction
	'どきどき', 'わくわく', 'うきうき', 'いらいら', 'むかむか', 'ぞくぞく', 'ざわざわ', 'そわそわ', 'ひやひや',
	'へとへと', 'くたくた', 'ぼろぼろ', 'しょんぼり', 'げんなり', 'どんより', 'すっきり', 'さっぱり', 'ほっと', 'びっくり'
)

/* ------------------------------------------------------ 感情語 (emotive) */

/** Adjectives, nouns and set phrases whose plain use is an exclamation. */
const EMOTIVE = any(
	// evaluation
	'すごい', 'すご', 'すげ', 'すんげ', 'しゅごい', 'やばい', 'やば', 'えぐい', 'えぐ', 'つよい', '最高', '最悪', 'ひどい',
	'ヤバい', 'かっこいい', 'かっこよ', 'かわいい', 'かわい', '可愛い', 'きれい', '綺麗', '美しい', 'うつくしい', '素晴らしい',
	'すばらしい', '素敵', 'すてき', '見事', '立派', '完璧', '神', '天才', 'さすが', '流石', '圧巻', '感動', '絶景',
	// taste / sensation
	'うまい', 'うま', 'おいしい', '美味しい', 'まずい', '痛い', 'いたい', '熱い', '寒い', 'さむい', 'あつい', 'つめたい',
	// feelings
	'うれしい', '嬉しい', 'たのしい', '楽しい', 'かなしい', '悲しい', 'さびしい', '寂しい', 'さみしい', 'こわい', '怖い',
	'くやしい', '悔しい', 'はずかしい', '恥ずかしい', 'せつない', '切ない', 'つらい', '辛い', 'しんどい', 'めんどくさい',
	'恐ろしい', 'おそろしい',
	'面白い', 'おもしろい', 'つまらない', 'たまらない', 'ありがたい', 'もったいない', '疲れた', 'つかれた', '助かった',
	'よかった', '良かった', 'できた', '出来た', '勝った', '負けた', '死んだ', '終わった', 'やられた', 'やっちゃった',
	// surprise / disbelief
	'まさか', 'なんと(?!か|なく|も)', 'ありえない', 'あり得ない', '信じられない', 'びっくり', '衝撃', '愕然', 'ショック',
	'うそ', '嘘', 'マジ', 'まじ', 'まじか', 'マジか', '本当に', 'ほんとに', 'ほんまに',
	// achievement / gaming
	'勝利', '優勝', '圧勝', '完勝', '完敗', '惜敗', '達成', 'クリア', 'ゲット', 'げっと', 'コンプリート', '撃破', '討伐',
	// net slang
	'草', 'わろた', 'ワロタ', 'ワロス', '爆笑', 'うける', 'きたこれ', 'キタ', '沼', '尊い', '推せる'
)

/** Degree adverbs that may precede an emotive word without weakening the exclamation. */
const INTENSIFIER = any(
	'とても', '本当に', 'ほんとに', 'ほんと', 'めっちゃ', 'めちゃくちゃ', 'めちゃ', 'めっさ', '超', 'ちょー', 'すごく',
	'すっごく', 'すんごく', 'かなり', 'まじで', 'マジで', 'ガチで', '絶対', '完全に', '激', '鬼', 'ばり', 'バリ',
	'やたら', 'マジ', 'まじ', 'なんか', 'なんて', 'ほんま', 'それは', 'これは', 'いや', 'もう', 'ああ', 'わあ', 'うわ'
)

/** 驚く-based degree phrases 「驚くべき」「驚くほど（の）」, on top of the plain INTENSIFIER set. */
const DEGREE = any(INTENSIFIER, '驚く(?:べき|ほど(?:の)?)', 'まさに')

/** Greetings and set social phrases that behave like interjections. */
const GREETING = any(
	'おはよう', 'おはようございます', 'こんにちは', 'こんばんは', 'やっほ', 'ただいま', 'おかえり', 'おかえりなさい',
	'いってきます', 'いってらっしゃい', 'いただきます', 'ごちそうさま', 'おめでとう', 'おめでとうございます',
	'ありがとう', 'ありがとうございます', 'ありがとうございました', 'どうもありがとう', 'あざす', 'あざっす',
	'サンキュー', 'さんきゅー', 'おおきに', 'かたじけない', 'めしあがれ', 'がんばれ', '頑張れ', 'ファイト', 'どんまい'
)

/* ------------------------------------------------------------- 命令 (orders) */

/** Lexicalised imperatives; the generic 〜ろ / 〜な patterns are handled in the rules. */
const IMPERATIVE_VERB = any(
	'見ろ', 'みろ', 'しろ', 'せよ', 'やめろ', '止めろ', '来い', 'こい', '行け', 'いけ', '急げ', 'いそげ', '待て', 'まて',
	'走れ', 'はしれ', '頑張れ', 'がんばれ', 'やれ', '黙れ', 'だまれ', '出せ', 'だせ', '返せ', 'かえせ', '離せ', '放せ',
	'逃げろ', '止まれ', 'とまれ', '進め', 'すすめ', '起きろ', 'おきろ', '寝ろ', '食べろ', '飲め', 'のめ', '書け', 'かけ',
	'読め', 'よめ', '聞け', 'きけ', '立て', 'たて', '座れ', 'すわれ', '入れ', 'はいれ', '消せ', 'けせ', '開けろ', '閉めろ',
	'落ち着け', '答えろ', '教えろ', '信じろ', '許せ', '助けろ', 'どけ', 'よけろ', 'かかれ', '構え', 'やめとけ'
)

/** Particles and adverbs that typically trail an imperative or a request. */
const ORDER_TAIL = '(?:よ|ね|ってば|から|ば|っ|ー|w)*'

/* ---------------------------------------------------------------- exports */

export const ja: SentenceTypeDetectExpressionSets = [
	{
		// 1. Whole-utterance interjections and onomatopoeia 「うわー」「やったー」「えっ」.
		// Anchored on both sides: a longer sentence merely *starting* with an interjection
		// may still be a question 「えっ本当ですか」 and is classified further down.
		expression: rx(`^${INTERJECTION}${SHOUT_TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 2. Exclamative constructions built on a 疑問詞 「なんてきれいなんだ」「なんという
		// speed」「どんなに嬉しいことか」, including when a topic subject is fronted before them
		// 「子供たちはなんて素晴らしい人なんだ」. They must be taken out before any 疑問詞 rule, and
		// 「なんて言ったの」 (quotative なんて + question) is excluded explicitly.
		expression: rx(`(?:^|(?<=は))${any('なんて(?!(?:言|いっ|いう|聞|きい))', 'なんという', 'なんちゅう', 'なんと(?!か|なく|も|いう)', 'どんなに', 'どれほど', 'いかに(?!も)', 'なにが(?:なんでも)')}`),
		type: 'exclamatory'
	},
	{
		// 3a. Embedded questions: a 疑問詞 or か inside a clause whose matrix predicate is
		// 「分からない」「知らない」「決めていない」 is a statement, not a question.
		expression: rx(`${any(
			'(?:分か|わか|判)(?:らない|んない|らん|りません|らなかった|りませんでした|らないです)',
			'(?:知ら|しら)(?:ない|ん|なかった)', '知りません', '存じません',
			'(?:覚えて|おぼえて)(?:ない|いない|いません)',
			'(?:決めて|決まって|きまって)(?:ない|いない|いません)',
			'(?:見当|想像)(?:も)?(?:つかない|できない|がつかない)',
			'(?:不明|未定|秘密)(?:だ|です)?'
		)}${TAIL}$`),
		type: 'declarative'
	},
	{
		// 3b. Requests and set closings that end in 〜ください / 〜お願いします. Conventionally
		// written with 「。」, so they are kept out of the imperative rules below.
		expression: rx(`${any('ください', '下さい', 'くださいませ', 'お願いします', 'お願いいたします', '願います', '申し上げます', 'いたします', 'よろしく')}${TAIL}$`),
		type: 'declarative'
	},
	{
		// 4. Explicit question endings: か and its variants, plus the recall marker っけ.
		// The lookbehind blocks the many words that merely end in か — 静か・確か・爽やか・
		// まさか・とか・ばか — none of which is a question.
		expression: rx(`(?<!${any(
			'と', 'なん', 'や', 'ら', 'わず', 'たし', 'ほの', 'にわ', 'はる', 'まさ', 'ば', 'ほ',
			'静', '確', '豊', '愚', '細', '僅', '密', '厳', '緩', '鮮', '速', '健', '清', '安', '爽', '穏', '賑', '滑', '柔',
			'温', '朗', '軽', '艶', '冷や', '大ま', 'おおま', 'なだ', 'やわ', 'しず', 'ゆた', 'おろ', 'こま'
		)})${any('か(?:い|な|なあ|なぁ|しら|ね|よ|ら)?', 'っけ', 'だっけ', 'ですっけ', 'ますっけ')}${TAIL}$`),
		type: 'interrogative'
	},
	{
		// 5. Confirmation tags 「だよね」「いいでしょ」「そうだろ」「ちゃうやん」. Note that the
		// full forms 「でしょう」「だろう」 are *not* included: they usually express conjecture
		// 「明日は雨でしょう」 and stay declarative.
		expression: rx(`${any('よね', 'よな', 'ですよね', 'だよね', 'でしょ', 'っしょ', 'だろ', 'やろ', 'じゃろ', 'やんな', 'ちゃう', 'ですかね', 'かね')}${TAIL}$`),
		type: 'interrogative'
	},
	{
		// 6. 疑問詞 questions. Japanese leaves the question word in situ 「あなたは何を食べ
		// ますか」, so it is searched anywhere in the sentence. Two guards apply: 〜ても makes
		// the clause concessive 「何をしても無駄だ」, and the indefinite readings (何か・誰も・
		// いつも・どこでも) are already excluded inside WH itself.
		expression: rx(`^(?![\\s\\S]*ても)[\\s\\S]*${WH}`),
		type: 'interrogative'
	},
	{
		// 7. Rising-intonation questions ending in の / なの 「どこ行くの」「本当に好きなの」.
		// の is only read as a question particle after a predicate ending, which keeps the
		// genitive 「私の」「今日の」 and the nominaliser 「〜もの」 out.
		expression: rx(`${any('る', 'た', 'ない', 'たい', 'なかった', 'だった', 'てる', 'でる', 'いる', 'ある', 'い', 'な', 'ん')}の${TAIL}$`),
		type: 'interrogative'
	},
	{
		// 7a. An interjection or evaluative reaction word followed by a comma sets the
		// illocutionary force for the whole utterance no matter how the clause continues
		// 「すごい、彼は優勝した」「わあ、雪が降ってきた」「信じられない、優勝した」. Placed after
		// every question/tag rule so a genuine question opened this way is still caught first.
		expression: rx(`^${any(INTERJECTION, EMOTIVE)}、`),
		type: 'exclamatory'
	},
	{
		// 7b. Emphatic "X is a(n) ..." predications: any subject marked by が/は, a degree
		// marker (本当に・とても・まさに・驚くべき・驚くほど（の）) or an evaluative word acting as
		// its own attributive modifier (最高の〜・信じられない〜), then either an attributive
		// noun phrase closed by the plain copula だ 「これは驚くべき発見だ」「作品が本当に恐ろしい」,
		// or the evaluative adjective itself as the whole predicate 「これは本当においしい」.
		// Restricted to bare/plain endings so it never touches the です/ます forms every
		// declarative fixture here uses 「これはとても面白いです」.
		expression: rx(`^[^、。]*${any('が', 'は')}${any(DEGREE, EMOTIVE)}${any('[\\s\\S]*だ', any(EMOTIVE, '驚く(?:べき|ほど(?:の)?)'))}${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 7c. "Such a ... — first time!" novelty exclamations: こんな/そんな/あんな (+に) ... 初めて
		// ... plain past/copula 「こんなに広い部屋は初めて見た」「あんな大きな波は初めて見た」. The
		// demonstrative-intensifier itself carries the exclamatory force even without わあ/すごい.
		expression: rx(`^${any('こんな', 'そんな', 'あんな')}(?:に)?[\\s\\S]*初めて[\\s\\S]*${any('だ', 'た')}${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 7d. まさか-wrapper astonishment 「まさか建物がこんなに完璧だなんて」「まさかこんな試合を見られ
		// るとは」: まさか opens the clause and なんて/とは closes it, however long the middle is.
		expression: rx(`^まさか[\\s\\S]*${any('なんて', 'とは')}${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 7e. Bare past-tense reaction/achievement verbs reached from an arbitrarily long
		// clause 「彫刻の完璧さに驚いた」「舞台が驚くべきので驚いた」「とうとう映画を成し遂げた」「つい
		// に橋が完成した」「こんなに美しいとは思わなかった」 — the same casual, unmarked-politeness
		// register as the past-tense reactions already in EMOTIVE (疲れた・助かった・勝った…), but
		// needing an end-anchored rule of their own since so much can precede them.
		expression: rx(`${any('驚いた', '言葉が出ない', '成し遂げた', '完成した', 'とは思わなかった')}${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 8a. Lexical imperatives 「待て」「逃げろ」「気をつけろ」 and the polite 〜なさい.
		expression: rx(`${any(IMPERATIVE_VERB, 'なさい', 'なはれ', 'たまえ')}${ORDER_TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 8b. Generic 〜ろ imperatives 「静かにしろ」「覚悟しろ」, minus the handful of nouns
		// that end in ろ (後ろ・頃・風呂・いろいろ・むしろ).
		expression: rx(`(?<!${any('うし', '後', 'ここ', 'そ', 'い', 'むし', 'ふ', '風', 'ぼ', 'ど', 'とこ')})ろ${ORDER_TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 8c. Prohibitive 〜な on a dictionary-form verb 「行くな」「触るな」. Excluded: 〜だろうな
		// / 〜そうな / 〜ような (conjecture) and な-adjectives, whose stem never ends in う-row.
		expression: rx(`(?<!${any('だろ', 'でしょ', 'ろ', 'そ', 'よ', 'ちゃ', 'じゃ')})${any('う', 'く', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'ぐ', 'ず')}な(?:よ)?${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 8d. Casual 〜て requests 「ちょっと待って」「やめて」「手伝って」 and their variants.
		// Adverbs and conjunctions that happen to end in て are excluded.
		expression: rx(`(?<!${any('すべ', '全', 'はじめ', '初め', '始め', 'かえっ', '決し', 'せめ', 'あえ', '改め', '極め', 'なん', 'だ', 'です', 'っ?たっ', 'として', 'につい', 'にとっ', 'によっ', 'に対し', 'そし')})${any('て', 'で')}${ORDER_TAIL}$|${any('てくれ', 'てちょうだい', 'てごらん', 'ないで', 'んじゃない(?:ぞ|よ)', 'すんな', 'するな')}${TAIL}$`),
		type: 'exclamatory'
	},
	{
		// 9. Emphatic sentence-final particles 「危ないぞ」「行くぜ」「いいじゃん」「〜だもん」 and
		// pure emphasis carried by elongation or a glottal stop 「たかーい」「やばっ」.
		expression: rx(`${any('ぞ', 'ぜ', 'じゃん', 'やん(?!か)', 'もん', 'だもん', 'なあ', 'なぁ', 'だなあ', 'わい', 'ってば', 'ったら')}${TAIL}$|(?<=[ぁ-ん])[ー〜]+[ぁ-ん]?$|(?<=[ぁ-ん])っ$|${any('w', 'ｗ', '笑', '草')}+$`),
		type: 'exclamatory'
	},
	{
		// 10. Emotive vocabulary and greetings, optionally with copula or particles
		// 「最高だね」「うれしいよ」「おめでとうございます」.
		expression: rx(`^${INTENSIFIER}*${any(EMOTIVE, GREETING)}${any('い', 'く', 'かった', 'すぎ', 'すぎる', 'だ', 'です', 'だよ', 'ですよ', 'だね', 'ですね', 'だな', 'ね', 'よ', 'な', 'した', 'しました', 'ます', 'ました', 'ございます', 'ー', 'っ', 'ん')}*$`),
		type: 'exclamatory'
	},
	{
		// 11. Everything else is a statement: predicate-final sentences 「これは本です」
		// 「昨日東京に行った」, noun fragments, numbers and anything the rules above left.
		expression: /./,
		type: 'declarative'
	}
]