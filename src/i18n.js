// i18n.js — a hand-rolled localization layer (CATS-54).
//
// Per architecture.md "Plain JS, no toolchain": no library. The catalog is ~20 keys, so a
// dictionary + two small helpers is cheaper than i18next and keeps the no-dependency stance.
//
//   • strings   — { locale: { key: value } }. A value is a plain string OR, for the few keys
//                 that vary with a count, an object { one, few, many } chosen by plural(n).
//   • t(key, locale, params)        — interpolate {placeholders} into a plain-string key.
//   • tCount(key, locale, n, params)— same, but first picks the one/few/many variant by count.
//   • detectLocale()                — localStorage.froggame_lang → navigator.language prefix → 'en'.
//   • plural(n)                     — Ukrainian one/few/many rule (also correct for English's two-form
//                 case, since English only uses 'one' vs 'many').
//
// Missing key OR unsupported locale ALWAYS falls back to English — never a blank, never a raw key.

export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'uk'];

const STORAGE_KEY = 'froggame_lang';

// Locale → dictionary. Keys are flat dotted names so call sites read cfg.text.goalHint.
// Tone is load-bearing on the overlay subtitles (CATS-22 tone guardrails): the Ukrainian
// translations preserve the warm-anticlimax / never-punishing framing. A native tone review
// of those four lines is tracked separately — this is the first-pass implementation.
export const strings = {
  en: {
    // index.html (lang attr + title set dynamically in main.js; #hint set inline)
    docTitle: 'Mr. Kwak',
    hint: 'Use ↑/↓ and ←/→ to steer · R to restart · M mute · +/− volume · tilt on mobile',

    // config.onboarding hints
    goalHint: 'Hurry to the far shore of the lake\nbefore sunset!',
    controlHint: 'Use ↑/↓ and ←/→ to steer · Collect gifts by passing close to them',

    // config.stretch labels (the four stretches, home shore → party shore)
    stretchGentleShore: 'The Gentle Shore',
    stretchDragonflyBend: 'Dragonfly Bend',
    stretchMiddle: 'The Middle Stretch',
    stretchFarReaches: 'The Far Reaches',

    // hud.js — gift counts. CATS-114 follow-up: the emoji is drawn by the HUD
    // itself at icon size (💐 / 🫙), so these keys carry the WORD only. CATS-130: the steering
    // ("sharpness of movement") line was removed from the HUD — steeringWord is gone.
    // CATS-129 follow-up 2: the loss readout (lostLine) is gone too — a debug duplicate.
    bouquetWord: 'Bouquet',
    jarWord: 'Jar',

    // screens.js — overlay titles. CATS-134: the end overlays are TITLES ONLY (the per-outcome
    // subtitle keys are gone); tone stays load-bearing (R7/R9).
    overlayWonTitle: 'You made it to the party!',
    overlayArrivedEmptyTitle: 'You made it across…',
    overlayLostTitle: 'The sun set on the lake…',
    // CATS-129 follow-up 2: overlayIdleTitle/overlayIdleSub are gone — the idle state draws
    // no center text (the hint box owns the teaching now).
    overlayRestart: 'Press R to go again',

    // language picker label
    langLabel: 'Language',

    // story page sound control (CATS-110) — the speaker button's tooltip
    soundToggle: 'Sound on/off',

    // ============================================================
    // story.js — the charm-pass content (CATS-75). Tone is load-bearing
    // (R7/R8/R9): warm anticlimax, fish-as-comedy, never punishing/scary/
    // saccharine. The Ukrainian catalog is the source of truth for this
    // block's wording — keep the two in step (CATS-136).
    // ============================================================

    // Per-stretch beats (STRETCH_BEATS). narration + emotion per stretch.
    // stretch0Narration: '{frogName} sets off on his journey.',
    // stretch0Emotion: 'hope — the first act of courtship',
    stretch1Narration: 'The Gentle Shore is already behind. {frogName} hurries toward the far shore of the lake.',
    stretch1Emotion: '{frogName} hurries toward the far shore of the lake.',
    stretch2Narration: '{frogName} has made it halfway. The sun is sinking toward the horizon too.',
    stretch2Emotion: 'The sun is rolling toward the horizon too.',
    stretch3Narration: '{frogName} is on the final stretch. The festival lights twinkle ahead.',
    stretch3Emotion: 'The party lights twinkle ahead.',

    // Gift milestones (milestoneFor). {at: 3,5} for flowers; {at: 1,3,5} for dragonflies.
    flowerMilestone3: 'Three flowers already make a lovely bouquet.',
    flowerMilestone5: 'A beautiful bouquet! Keep it safe from those cheeky koi.',
    dragonflyMilestone1: 'Your first dragonfly is in the jar — take good care of it.',
    dragonflyMilestone3: 'Three dragonflies swirl inside the jar.',
    dragonflyMilestone5: 'A jar full of shimmering dragonflies! {frogName} rows with extra care.',


    // Collect charm lines (collectLine) — three-line pools per kind.
    flowerCollect0: 'A lovely flower joins the bouquet.',
    flowerCollect1: 'A splash of color for the bouquet.',
    flowerCollect2: 'The bouquet looks even prettier now.',
    dragonflyCollect0: 'A shimmering dragonfly flutters into the jar.',
    dragonflyCollect1: 'The dragonfly’s delicate wings catch the light.',
    dragonflyCollect2: 'A new dragonfly glimmers in the jar.',

    // Fish flavor (fishAteLine / fishBumpLine). fishAte is per-tier with a {what}
    // chunk-noun placeholder; the chunk noun is plural-object chosen by `lost`.
    //   chunk one/few/many by `lost`: 'a flower' / 'a pair of flowers' / 'several flowers'.
    fishAteChunk: {
      one: 'a flower',
      few: 'a pair of flowers',
      many: 'several flowers',
    },
    fishAte0: 'A little koi nibbles at {what} — the cheeky little thing!',
    fishAte1: 'A medium-sized fish gulps down {what}. What terrible manners!',
    fishAte2: 'A huge carp glides past the bouquet. Suddenly, the bouquet is missing {what}.',

    fishBump2: 'A big carp shoves the boat sideways. {frogName} shields the bouquet from that glutton.',
    fishBump1: 'A medium-sized fish nudges the boat off course. {frogName} hugs the bouquet close.',
    fishBump0: 'A tiny koi bumps into the boat.',

    // Dragonfly loss (dragonflyLostLine). A shore bump spills exactly ONE dragonfly
    // (config dragonflies_lost_per_border_bump: 1, clamped to the jar), so the noun and
    // the verb are fixed — no {n} placeholder, no plural pool. CATS-135.
    dragonflyLost: 'The boat hit the shore, the jar wobbled, and a dragonfly flew away.',
    dragonflyLost: 'The boat bumps against the shore, the jar wobbles, and a dragonfly flutters away.',
    // CATS-134: the arrival/empty/soft-fail beat copy is GONE — the end overlays show titles
    // only (screens.js overlay*Title). arrivalTitle/emptyTitle/softFailTitle duplicated the
    // overlay titles verbatim; every sub/welcome/smile/charm/twist line was removed with them.

    // ============================================================
    // postcard.js — the share card copy + buttons (CATS-33 copy, localized CATS-75;
    // final wording CATS-124). Letter structure: salutation → headline + body per
    // outcome → wish line → invite → sender signature. {frogName} / {fernName} /
    // {flowers} / {dragonflies} interpolate. cardBodyWonCount retired in CATS-124;
    // cardSignature kept (CATS-124 follow-up).
    // ============================================================
    cardHeadlineTo: 'For {fernName},',
    cardHeadlineWon: '{frogName} arrived\nat the Festival of Summer\'s Last Evening\njust in time to meet you there!',
    cardBodyWonMany: 'Along the way, he gathered\na fragrant bouquet of {flowers} lilies\nand {dragonflies} dragonflies with shimmering wings.\nAll to share with you a little piece\nof the magic of this charming forest.',
    cardHeadlineEmpty: '{frogName} crossed the entire Forest Lake,\nhurrying to the Festival of Summer\'s Last Evening\nto watch the sunset with you.',
    cardBodyEmpty: 'The journey was full of exciting adventures —\nand now {frogName} has many stories to share\nabout this charming forest.',
    cardHeadlineLost: '{frogName} is hurrying\nto the Festival of Summer\'s Last Evening,\neager to meet you there.',
    cardBodyLost: 'It is an enchanting journey through a charming world,\nwhere stars twinkle in the clear waters of the Forest Lake,\nand dragonflies with iridescent wings\ndance above the water.',
    cardBodyWish: 'That evening, {frogName} made one wish —\nthat summer in his heart would never end.',
    cardBodyIvite: 'Can you guess who this mysterious {frogName} is?\nJoin him on his journey →',
    // Sender signature on the postcard back (drawn by the text layer, CATS-83).
    // {frogName} is the player's frog (canonical default Mr. Kwak).
    cardSignature: '— {frogName}, from across the lake',
    // Card controls (CATS-116 + follow-up): two labeled groups under the card — "Send a
    // reply" (Share link + Download) and "Donate" (WWF / UAnimals). The donation labels
    // dropped the "with …" ending — the org now lives in the tooltip (cardTip*). Every
    // control has a tooltip. The old X/Twitter, WhatsApp and Email share intents are gone.
    cardBtnCopy: 'Share link',
    cardBtnSave: 'Download',
    cardGroupReply: 'Send a reply',
    cardGroupDonate: 'Donate',
    cardBtnWwf: 'Save the forest',
    cardBtnUanimals: 'Gift a donation',
    cardBtnPlayAgain: 'Play again',
    cardTipShare: 'Copy the postcard link to the clipboard',
    cardTipDownload: 'Save the postcard as a PNG image',
    cardTipPlayAgain: 'Start a new run',
    cardTipWwf: 'Save the forest with WWF Ukraine',
    cardTipUanimals: 'Gift a donation with UAnimals',
    cardExportBlocked: 'Image export is blocked by this browser. Use "Share link" to share the postcard.',
    // CATS-120: the transient hint shown screen-center for 1s after Share copies the link.
    cardCopiedHint: 'Link copied to clipboard',

    // ============================================================
    // welcome.js — the welcome card (CATS-80), the first screen. Postcard/letter
    // aesthetic: image left, writing right. All copy here is i18n (no inline strings).
    // {frogName} / {fernName} are the canonical defaults (CATS-111: the frog is fixed,
    // only the To field is typed, pre-filled with the fern default).
    // ============================================================
    // The LETTER itself — the invitation Mr. Kwak received (CATS-111 final wording). Set in
    // the handwriting face, mid-page; \n breaks are load-bearing (white-space:pre-line).
    welcomeHeading: 'Welcome',
    welcomeRules: 'Dear friend, Mr. Kwak!\n\nIt would be a great joy\nto meet you today at the annual\nForest Festival of Summer\'s Last Evening,\nso we can watch the sunset together\nand say farewell to summer.\n\nDo not be late — the most heartfelt wishes\ncome true on this evening.\nI am sending this letter by postal cricket —\nhe knows the way.\n\nI cannot wait to see you!',
    // The lead-in above the To field: the frame for the player's answer.
    welcomeTo: 'Mr. Kwak immediately knew who had sent the letter.\nWhat about you?\nWho would you wish to send a letter like this to?',
    // The mandatory name field's placeholder hint (not a value).
    welcomeNameHint: "(Recipient's name)",
    // The compose button's text label — drawn over the button art (welcome button PNG).
    welcomeStart: 'Compose the letter',
    welcomeWithLove: 'With Love',
    welcomeStampAlt: 'Postage stamp',
    welcomeLeftAlt: 'Welcome illustration',

    // ============================================================
    // storypage.js — the opening story page (CATS-104 / CATS-110), shown
    // BEFORE the welcome card. CATS-110: the page is now full-bleed intro
    // art that carries the story text inside the painting itself — only the
    // continue hint and the art's alt text are rendered here.
    // ============================================================
    storyContinue: 'Click or press any key to begin',
    storyArtAlt: 'The love letter on a lily petal',

    // hintbox.js (CATS-129) — the instruction hint box's continue affordance. The box's
    // goal/controls lines reuse goalHint/controlHint above. hintHazards is the two flavor
    // lines (koi nibble / dragonflies slip) rendered as one pre-line block.
    hintHazards: 'Cheeky koi fish might nibble the flowers in your bouquet.\nOne careless move, and the dragonflies fly out of the jar.',
    hintBoxContinue: 'Click or press any key to set off',

    // screens.js (CATS-129) — the end overlays' postcard invite, drawn once the warm beat
    // has landed and the card is waiting for the player's click. Replaces the old auto-rise.
    overlayPostcardInvite: 'Click or press any key for your postcard',
  },

  uk: {
    docTitle: 'Пан Квак',
    hint: 'Використовуй ↑/↓ та ←/→ для керування · R для перезапуску · M вимкнути звук · +/− гучність · нахил на телефоні',

    goalHint: 'Поквапся на протилежний берег озера\nдо заходу сонця!',
    controlHint: 'Використовуй ↑/↓ та ←/→ для керування\nЗбирай подарунки пропливаючи поруч',

    stretchGentleShore: 'Тихий берег',
    stretchDragonflyBend: 'Закрут бабок',
    stretchMiddle: 'Середина озера',
    stretchFarReaches: 'Далекі води',

    bouquetWord: 'Букет',
    jarWord: 'Банка',

    overlayWonTitle: 'Ти дістався свята!',
    overlayArrivedEmptyTitle: 'Ти перебрався на той бік…',
    overlayLostTitle: 'Сонце сіло над озером…',
    overlayRestart: 'Натисни R, щоб почати знову',

    langLabel: 'Мова',

    // story page sound control (CATS-110) — the speaker button's tooltip
    soundToggle: 'Увімкнути/вимкнути звук',

    // ============================================================
    // story.js — charm-pass content (CATS-75). Переклад зберігає тональні
    // обмеження R7/R8/R9: тепла антикульмінація, риба як комедія, бабки
    // просто відлітають, ніколи не караючи/лякаючи. Перший прохід; нативний
    // tone review окремо (див. коментар угорі каталогу).
    // ============================================================

    // Per-stretch beats.
    // stretch0Narration: '{frogName} розпочинає подорож',
    // stretch0Emotion: 'надія — перший жест залицяння',
    stretch1Narration: 'Тихий Берег вже позаду. {frogName} поспішає на той бік Озера.',
    stretch1Emotion: '{frogName} поспішає на той бік Озера.',
    stretch2Narration: '{frogName} подолав половину шляху. Сонце теж хилиться до обрію.',
    stretch2Emotion: 'Сонце теж котиться на небосхилі.',
    stretch3Narration: '{frogName} долає станній відрізок щляху. Вогники свята мерехтять попереду.',
    stretch3Emotion: 'Вогники свята мерехтять попереду.',

    // Gift milestones.
    flowerMilestone3: 'Три квітки. Це вже красивий букет.',
    flowerMilestone5: 'Букет справді прекрасний. Бережи його від нахабних рибок кої.',
    dragonflyMilestone1: 'Одна бабка в банці — бережи її.',
    dragonflyMilestone3: 'Три бабки в банці кружляють свій танок.',
    dragonflyMilestone5: 'Ціла банка мерехтливих бабок. {frogName} веслує дуже обережно.',

    // Collect charm lines.
    flowerCollect0: 'Чудова квітка для букету',
    flowerCollect1: 'Ще одна квітка в букеті.',
    flowerCollect2: 'Букет тепер ще красивіший.',
    dragonflyCollect0: 'Мерехтлива бабка залітає до банки.',
    dragonflyCollect1: 'Ще одна бабка з іскристими крильцями.',
    dragonflyCollect2: 'Ще одна бабка залітає до банки.',

    // Fish flavor.
    fishAteChunk: {
      one: 'одну квітку',
      few: 'пару квіток',
      many: 'декілька квіток',
    },
    fishAte0: 'Дрібна рибка кої пожувала {what}, от мала нахаба.',
    fishAte1: 'Середня риба проковтує {what}. Оце так манери!',
    fishAte2: 'Величезний короп пропливає повз букет, і {what} просто зникає.',
    fishBump2: 'Великий короп штовхає човен. {frogName} оберігає букет від цього ненажери.',
    fishBump1: 'Середня риба суне човен набік. {frogName} обіймає букет — це на подарунок.',
    fishBump0: 'Крихітна рибка кої стукається об човен.',

    // Втрата бабки (CATS-135): удар об берег втрачає рівно ОДНУ бабку (див. англійський
    // каталог), тож форми жіночого роду однини просто правильні.
    dragonflyLost: 'Човен вдарився об берег, банка захиталась і бабка полетіла геть.',

    // CATS-134: копії arrival/empty/soft-fail видалено — фінальні екрани показують лише
    // заголовки (див. коментар в англійському каталозі).

    // ============================================================
    // postcard.js — share card copy + buttons (локалізовано CATS-75;
    // остаточні формулювання CATS-124). Структура листа: звертання →
    // заголовок + текст за результатом → побажання → запрошення.
    // Підпис та cardBodyWonCount вилучено в CATS-124.
    // ============================================================
    cardHeadlineTo: 'Для {fernName},',
    cardHeadlineWon: '{frogName} прибув на свято\nОстаннього Літнього Вечора\nсаме вчасно, щоб зустрітися там з тобою!',
    cardBodyWonMany: 'У цій подорожі він зібрав запашний букет із {flowers} лілій\nта {dragonflies} бабок з іскристими крильцями.\nУсе — щоб поділитися з тобою частинкою чарівності цього лісового світу.',
    cardHeadlineEmpty: '{frogName} перетнув все Лісове Озеро\nпоспішаючи на свято\nОстаннього Літнього Вечора,\nщоб зустріти цей захід сонця разом з тобою.',
    cardBodyEmpty: 'Ця подорож була сповнена захопливих пригод —\nі тепер {frogName} має що розповісти тобі про цей чарівний лісовий світ.',
    cardHeadlineLost: '{frogName} поспішає на свято\nОстаннього Літнього Вечора,\nщоб якнайщвидше зустрітись там з тобою.',
    cardBodyLost: 'Це захоплююча подорож у чарівному світі,\nде у чистій воді Лісового Озера мерехтять зорі,\nа над плесом кружляють бабки з іскристими крильцями.',
    cardBodyWish: 'Цього вечора {frogName} загадав одне бажання —\nщоб літо в його серці ніколи не закінчувалося.',
    cardBodyIvite: 'А чи здогадуєшся ти, хто цей загадковий {frogName}?\nПриєднуйся до його подорожі →',
    // Підпис відправника на звороті листівки (малює текстовий шар, CATS-83).
    cardSignature: '— {frogName}, з того боку озера',
    // Керування під листівкою (CATS-116 + follow-up): дві підписані групи — «Надіслати
    // відповідь» (Поділитись + Зберегти) та «Задонатити» (WWF / UAnimals). Назви організацій
    // переїхали з написів у підказки (cardTip*) — написи стали коротшими, іконки більшими.
    cardBtnCopy: 'Поділитись',
    cardBtnSave: 'Зберегти',
    cardGroupReply: 'Надіслати відповідь',
    cardGroupDonate: 'Задонатити',
    cardBtnWwf: 'Порятунок лісу',
    cardBtnUanimals: 'Донат-подарунок',
    cardBtnPlayAgain: 'Грати знову',
    cardTipShare: 'Скопіювати посилання на листівку',
    cardTipDownload: 'Зберегти листівку як PNG-зображення',
    cardTipPlayAgain: 'Почати нову гру',
    cardTipWwf: 'Порятунок лісу з WWF Ukraine',
    cardTipUanimals: 'Донат-подарунок з UAnimals',
    cardExportBlocked: 'Цей браузер блокує експорт зображення. Щоб поділитися листівкою, скористайся «Поділитись».',
    // CATS-120: підказка на 1 с у центрі екрана після копіювання посилання кнопкою «Поділитись».
    cardCopiedHint: 'Посилання скопійовано',

    // ============================================================
    // welcome.js — вітальна листівка (CATS-80), перший екран.
    // {frogName} / {fernName} — канонічні замовчування (CATS-111: жабка фіксована,
    // вводиться лише поле «Кому», попередньо заповнене замовчуванням).
    // ============================================================
    welcomeHeading: 'Вітаємо',
    welcomeRules: 'Любий друже, Пане Квак!\n\nДля мене буде великою радістю\nзустріти Вас сьогодні на щорічному\nлісовому святі Останнього Літнього Вечора,\nщоб разом помилуватися заходом сонця\nта попрощатися з літом.\n\nНе баріться, цього вечора\nздійснюються найщиріші бажання.\nПередаю цього листа поштовим цвіркуном —\nвін знає дорогу.\n\nЧекаю на Вас із нетерпінням!',
    // Зачин над полем «Кому»: рамка для відповіді гравця.
    welcomeTo: 'Пан Квак одразу здогадався, від кого цей лист.\nА як щодо тебе?\nКому б ти бажав надіслати такого листа?',
    // Підказка-заповнювач обовʼязкового поля імені (не значення).
    welcomeNameHint: '(Ім\'я адресата)',
    // Текст кнопки — малюється поверх арт-кнопки (PNG-заготовка).
    welcomeStart: 'Скласти лист',
    welcomeWithLove: 'З любовʼю',
    welcomeStampAlt: 'Поштова марка',
    welcomeLeftAlt: 'Вітальна ілюстрація',

    // ============================================================
    // storypage.js — сторінка вступу (CATS-104 / CATS-110), показується
    // ПЕРЕД вітальною листівкою. CATS-110: сторінка — повноекранний
    // вступ-арт, у якому текст історії вбудований у сам малюнок;
    // тут рендеряться лише підказка «продовжити» та alt малюнка.
    // ============================================================
    storyContinue: 'Клікни або натисни будь-яку клавішу, щоб почати',
    storyArtAlt: 'Любовний лист на пелюстці лілії',

    // hintbox.js (CATS-129) — підказка-скринька перед стартом. Рядки мети та керування
    // беруться з goalHint/controlHint вище. hintHazards — два смакові рядки (кої обгризають
    // букет / бабки вислизають з банки), один блок з pre-line.
    hintHazards: "Нахабні рибки кої можуть потроху об'їдати твій букет.\nА необережний рух — і крилаті бабки вилітають з банки.",
    hintBoxContinue: 'Клікни або натисни будь-яку клавішу, щоб відштовхнутись',

    // screens.js (CATS-129) — запрошення до листівки на фінальних екранах.
    overlayPostcardInvite: 'Клікни або натисни будь-яку клавішу, щоб побачити листівку',
  },
};

// Resolve a raw dictionary value (which may itself be a plural object) to a string for a
// given count. Plain strings pass through unchanged.
function pickVariant(value, locale, n) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value[plural(n, locale)] ?? value.many ?? value.one ?? '';
  }
  return '';
}

// Interpolate {placeholders} from params into str.
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

// t(key, locale, params?) — plain-string lookup with English fallback.
export function t(key, locale, params) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const value = (strings[loc] && strings[loc][key])
    ?? (strings[DEFAULT_LOCALE] && strings[DEFAULT_LOCALE][key])
    ?? key; // last resort: the key itself (should never happen for a maintained catalog)
  return interpolate(typeof value === 'string' ? value : pickVariant(value, loc, 0), params);
}

// tCount(key, locale, n, params?) — pluralized lookup. Chooses the one/few/many variant by n
// before interpolating. `n` is also injected as params.n unless the caller overrides it.
export function tCount(key, locale, n, params) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const dict = strings[loc] && strings[loc][key] != null ? strings[loc] : strings[DEFAULT_LOCALE];
  const value = dict ? dict[key] : key;
  const merged = { ...(params || {}), n };
  return interpolate(pickVariant(value, loc, n), merged);
}

// detectLocale() — localStorage choice wins; else the navigator.language prefix if supported;
// else the English default.
export function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch (_) { /* localStorage may be unavailable (private mode / SSR) */ }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const prefix = navigator.language.slice(0, 2).toLowerCase();
    if (SUPPORTED_LOCALES.includes(prefix)) return prefix;
  }
  return DEFAULT_LOCALE;
}

// setLocale(locale) — persist the choice. The caller reloads so the whole UI re-renders.
export function setLocale(locale) {
  try {
    if (SUPPORTED_LOCALES.includes(locale)) {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  } catch (_) { /* ignore */ }
}

// resolveText(locale) — materialize a flat, ready-to-render object for this locale. Renderers
// read cfg.text.goalHint etc. exactly as they read the old hardcoded strings, so the i18n
// layer is invisible to them: no per-render key lookup, no interpolation at the call site for
// the static strings. Count-varying strings stay as {one,few,many} objects and are picked via
// tCount() at the (rare) call site that has a number.
export function resolveText(locale) {
  const loc = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const dict = strings[loc] || strings[DEFAULT_LOCALE];
  const base = strings[DEFAULT_LOCALE];
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = dict[k] != null ? dict[k] : base[k];
  }
  return out;
}

// plural(n, locale) → 'one' | 'few' | 'many'.
//
// Ukrainian rule (also covers English, which only distinguishes one vs. many via this same
// function: English strings simply repeat the 'many' wording for 'few'):
//   one  — n % 10 == 1 and n % 100 != 11
//   few  — n % 10 in 2..4 and n % 100 not in 12..14
//   many — everything else (0, 5-19, and the ×10 forms)
// Reference: CLDR cardinal rules for uk.
export function plural(n, locale) {
  n = Math.abs(Math.trunc(n)) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}
