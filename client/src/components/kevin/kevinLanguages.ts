/**
 * Languages Kevin offers as one-tap choices, plus the small set of interface
 * strings he needs before a server round trip is possible.
 *
 * The list is a convenience, not a limit: the picker also takes any language
 * typed in, and the AI replies in whatever it is told. `code` and `name` go to
 * the server (which puts the name in the AI's instructions); `bcp47` is only
 * for the browser's speech engines, and is null where we don't know a tag.
 */
export interface KevinLanguage {
  code: string | null
  name: string // English name, sent to the server
  native: string // shown on the chip
  bcp47: string | null // speech synthesis / recognition tag
}

export const KEVIN_LANGUAGES: KevinLanguage[] = [
  { code: 'en', name: 'English', native: 'English', bcp47: 'en-GB' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', bcp47: 'sw-KE' },
  { code: 'lg', name: 'Luganda', native: 'Luganda', bcp47: 'lg-UG' },
  { code: 'rw', name: 'Kinyarwanda', native: 'Kinyarwanda', bcp47: 'rw-RW' },
  { code: 'fr', name: 'French', native: 'Français', bcp47: 'fr-FR' },
  { code: 'ar', name: 'Arabic', native: 'العربية', bcp47: 'ar-SA' },
  { code: 'pt', name: 'Portuguese', native: 'Português', bcp47: 'pt-BR' },
  { code: 'es', name: 'Spanish', native: 'Español', bcp47: 'es-ES' },
  { code: 'zh', name: 'Chinese', native: '中文', bcp47: 'zh-CN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'de', name: 'German', native: 'Deutsch', bcp47: 'de-DE' },
  { code: 'so', name: 'Somali', native: 'Soomaali', bcp47: 'so-SO' },
]

/** The visitor's browser language if Kevin ships it, else English: what he listens and speaks in until they choose. */
export function languageFromBrowser(): KevinLanguage {
  const tags = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language].filter(Boolean)
  for (const tag of tags) {
    const base = String(tag).toLowerCase().split('-')[0]
    const found = KEVIN_LANGUAGES.find((l) => l.code === base)
    if (found) return found
  }
  return KEVIN_LANGUAGES[0]
}

/** A typed-in language becomes a chip-equivalent if it matches a known one
 * (by English or native name, any case); otherwise it's passed through by
 * name alone and Kevin will still answer in it, just without a voice. */
export function languageFromText(text: string): KevinLanguage | null {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null
  const needle = cleaned.toLowerCase()
  const known = KEVIN_LANGUAGES.find(
    (l) => l.name.toLowerCase() === needle || l.native.toLowerCase() === needle || l.code === needle,
  )
  if (known) return known
  return { code: null, name: cleaned, native: cleaned, bcp47: null }
}

export interface KevinStrings {
  placeholder: string
  listening: string
  thinking: string
  intro: string // used if the server can't write Kevin's introduction
  error: string
  noVoice: string // {lang} is replaced with the language's native name
  didntCatch: string // spoken when nothing intelligible was heard
  tapToSpeak: string
  micBlocked: string
  talkToKevin: string
  typeInstead: string
  introIntake: string // the first-visit welcome that asks for a name
  shareNote: string // standing note about where shared details go
  privacy: string
  handsFreeOffer: string // consent text: what turning it on means
  handsFreeOn: string
  handsFreeNotNow: string
  handsFreeLabel: string // toolbar tooltip
  handsFreeActive: string // shown while he is listening for you
  tapToHear: string // shown when his reply is waiting for a first tap (browsers block sound before one)
  whatsapp: string // the button that opens a WhatsApp chat with the team
}

const en: KevinStrings = {
  placeholder: 'Ask Kevin anything…',
  listening: 'Listening…',
  thinking: 'Kevin is thinking…',
  intro: "Hello, I'm Kevin, your guide to RealEVR Estates. How can I help you find a home today?",
  error: "I'm having trouble connecting right now. Please try again in a moment.",
  noVoice: "Kevin can't speak {lang} aloud on this device, so he'll reply in text.",
  didntCatch: "Sorry, I didn't catch that.",
  tapToSpeak: 'Tap to speak',
  micBlocked: 'Kevin needs microphone access to hear you. You can allow it in your browser settings, or type instead.',
  talkToKevin: 'Talk to Kevin',
  typeInstead: 'Type instead',
  introIntake: "Hello, I'm Kevin, your guide to RealEVR Estates. May I know your name, so I can look after you properly?",
  shareNote: 'Details you share go to the RealEVR team so they can help you.',
  privacy: 'Privacy',
  handsFreeOffer: "Prefer to just talk? Turn on hands-free and I'll answer whenever you speak while this page is open. When you speak, a short clip is sent to a speech service (ElevenLabs, or your browser's own) to turn it into text, and the words are sent to RealEVR so I can reply. Nothing is sent while the room is quiet, and you can switch it off any time.",
  handsFreeOn: 'Turn on hands-free',
  handsFreeNotNow: 'Not now',
  handsFreeLabel: 'Hands-free',
  handsFreeActive: 'Listening: just talk',
  tapToHear: 'Tap anywhere to hear my reply',
  whatsapp: 'Message us on WhatsApp',
}

// Written only for languages where the wording is straightforward and safe.
// Everything else (Luganda, Kinyarwanda, Somali, typed languages) uses the
// English interface labels, while Kevin's own words come from the AI.
const BY_CODE: Record<string, KevinStrings> = {
  en,
  sw: {
    placeholder: 'Muulize Kevin chochote…',
    listening: 'Nakusikiliza…',
    thinking: 'Kevin anafikiria…',
    intro: 'Habari! Mimi ni Kevin, mwongozo wako wa RealEVR Estates. Nikusaidie vipi kupata makazi leo?',
    error: 'Nina tatizo la kuunganisha sasa hivi. Tafadhali jaribu tena baada ya muda mfupi.',
    noVoice: 'Kevin hawezi kuzungumza {lang} kwa sauti kwenye kifaa hiki, kwa hivyo atajibu kwa maandishi.',
  didntCatch: 'Samahani, sikusikia vizuri.',
  tapToSpeak: 'Gusa ili kuzungumza',
  micBlocked: 'Kevin anahitaji ruhusa ya kipaza sauti ili kukusikia. Unaweza kuiruhusu kwenye mipangilio ya kivinjari, au uandike badala yake.',
  talkToKevin: 'Zungumza na Kevin',
  typeInstead: 'Andika badala yake',
  introIntake: 'Habari! Mimi ni Kevin, mwongozo wako wa RealEVR Estates. Naweza kujua jina lako ili nikuhudumie vizuri?',
  shareNote: 'Maelezo unayotoa huenda kwa timu ya RealEVR ili ikusaidie.',
  privacy: 'Faragha',
  handsFreeOffer: 'Unapendelea kuzungumza tu? Washa hands-free nami nitajibu kila unapozungumza ukiwa kwenye ukurasa huu. Unapozungumza, kipande kifupi cha sauti hutumwa kwa huduma ya sauti (ElevenLabs, au ya kivinjari chako) kukibadilisha kuwa maandishi, kisha maneno hutumwa kwa RealEVR ili nikujibu. Hakuna kinachotumwa chumba kikiwa kimya, na unaweza kuizima wakati wowote.',
  handsFreeOn: 'Washa hands-free',
  handsFreeNotNow: 'Si sasa',
  handsFreeLabel: 'Hands-free',
  handsFreeActive: 'Nakusikiliza: zungumza tu',
  tapToHear: 'Gusa popote ili usikie jibu langu',
  whatsapp: 'Tutumie ujumbe WhatsApp',
  },
  fr: {
    placeholder: 'Posez une question à Kevin…',
    listening: "J'écoute…",
    thinking: 'Kevin réfléchit…',
    intro: "Bonjour ! Je suis Kevin, votre guide chez RealEVR Estates. Comment puis-je vous aider à trouver un logement aujourd'hui ?",
    error: "J'ai du mal à me connecter pour le moment. Veuillez réessayer dans un instant.",
    noVoice: 'Kevin ne peut pas parler {lang} à voix haute sur cet appareil ; il répondra par écrit.',
  didntCatch: "Désolé, je n'ai pas compris.",
  tapToSpeak: 'Touchez pour parler',
  micBlocked: "Kevin a besoin d'accéder au micro pour vous entendre. Autorisez-le dans les réglages du navigateur, ou écrivez à la place.",
  talkToKevin: 'Parler à Kevin',
  typeInstead: 'Écrire plutôt',
  introIntake: "Bonjour ! Je suis Kevin, votre guide chez RealEVR Estates. Puis-je connaître votre prénom pour mieux m'occuper de vous ?",
  shareNote: "Les informations que vous partagez sont transmises à l'équipe RealEVR pour vous aider.",
  privacy: 'Confidentialité',
  handsFreeOffer: "Vous préférez simplement parler ? Activez le mode mains libres et je répondrai chaque fois que vous parlerez tant que cette page est ouverte. Quand vous parlez, un court extrait est envoyé à un service vocal (ElevenLabs, ou celui de votre navigateur) pour être transformé en texte, puis les mots sont envoyés à RealEVR pour que je puisse répondre. Rien n'est envoyé quand la pièce est silencieuse, et vous pouvez le désactiver à tout moment.",
  handsFreeOn: 'Activer les mains libres',
  handsFreeNotNow: 'Pas maintenant',
  handsFreeLabel: 'Mains libres',
  handsFreeActive: "À l'écoute : parlez simplement",
  tapToHear: 'Touchez l’écran pour entendre ma réponse',
  whatsapp: 'Écrivez-nous sur WhatsApp',
  },
  es: {
    placeholder: 'Pregúntale a Kevin lo que quieras…',
    listening: 'Escuchando…',
    thinking: 'Kevin está pensando…',
    intro: '¡Hola! Soy Kevin, tu guía en RealEVR Estates. ¿Cómo puedo ayudarte a encontrar un hogar hoy?',
    error: 'Tengo problemas para conectarme ahora mismo. Inténtalo de nuevo en un momento.',
    noVoice: 'Kevin no puede hablar {lang} en voz alta en este dispositivo, así que responderá por escrito.',
  didntCatch: 'Perdona, no te he entendido.',
  tapToSpeak: 'Toca para hablar',
  micBlocked: 'Kevin necesita acceso al micrófono para oírte. Puedes permitirlo en los ajustes del navegador o escribir en su lugar.',
  talkToKevin: 'Hablar con Kevin',
  typeInstead: 'Escribir en su lugar',
  introIntake: '¡Hola! Soy Kevin, tu guía en RealEVR Estates. ¿Me dices tu nombre para atenderte mejor?',
  shareNote: 'Los datos que compartas llegan al equipo de RealEVR para poder ayudarte.',
  privacy: 'Privacidad',
  handsFreeOffer: '¿Prefieres simplemente hablar? Activa el modo manos libres y responderé cada vez que hables mientras esta página esté abierta. Cuando hablas, se envía un fragmento corto a un servicio de voz (ElevenLabs, o el de tu navegador) para convertirlo en texto, y las palabras se envían a RealEVR para que pueda responder. No se envía nada cuando la sala está en silencio, y puedes desactivarlo en cualquier momento.',
  handsFreeOn: 'Activar manos libres',
  handsFreeNotNow: 'Ahora no',
  handsFreeLabel: 'Manos libres',
  handsFreeActive: 'Escuchando: solo habla',
  tapToHear: 'Toca la pantalla para oír mi respuesta',
  whatsapp: 'Escríbenos por WhatsApp',
  },
  pt: {
    placeholder: 'Pergunte qualquer coisa ao Kevin…',
    listening: 'Ouvindo…',
    thinking: 'O Kevin está pensando…',
    intro: 'Olá! Eu sou o Kevin, seu guia na RealEVR Estates. Como posso ajudar você a encontrar um lar hoje?',
    error: 'Estou com dificuldade para me conectar agora. Tente novamente em instantes.',
    noVoice: 'O Kevin não consegue falar {lang} em voz alta neste dispositivo, então vai responder por escrito.',
  didntCatch: 'Desculpe, não entendi.',
  tapToSpeak: 'Toque para falar',
  micBlocked: 'O Kevin precisa de acesso ao microfone para ouvir você. Permita nas configurações do navegador ou escreva.',
  talkToKevin: 'Falar com o Kevin',
  typeInstead: 'Escrever',
  introIntake: 'Olá! Eu sou o Kevin, seu guia na RealEVR Estates. Posso saber seu nome para atender você melhor?',
  shareNote: 'Os dados que você compartilha vão para a equipe da RealEVR para ajudar você.',
  privacy: 'Privacidade',
  handsFreeOffer: 'Prefere apenas falar? Ative o modo mãos livres e eu respondo sempre que você falar enquanto esta página estiver aberta. Quando você fala, um trecho curto é enviado a um serviço de voz (ElevenLabs, ou o do seu navegador) para virar texto, e as palavras são enviadas à RealEVR para que eu possa responder. Nada é enviado quando o ambiente está em silêncio, e você pode desligar a qualquer momento.',
  handsFreeOn: 'Ativar mãos livres',
  handsFreeNotNow: 'Agora não',
  handsFreeLabel: 'Mãos livres',
  handsFreeActive: 'Ouvindo: é só falar',
  tapToHear: 'Toque na tela para ouvir minha resposta',
  whatsapp: 'Fale conosco no WhatsApp',
  },
  de: {
    placeholder: 'Frag Kevin alles…',
    listening: 'Ich höre zu…',
    thinking: 'Kevin denkt nach…',
    intro: 'Hallo! Ich bin Kevin, Ihr Begleiter bei RealEVR Estates. Wie kann ich Ihnen heute helfen, ein Zuhause zu finden?',
    error: 'Ich habe gerade Verbindungsprobleme. Bitte versuchen Sie es gleich noch einmal.',
    noVoice: 'Kevin kann auf diesem Gerät kein {lang} sprechen und antwortet daher schriftlich.',
  didntCatch: 'Entschuldigung, das habe ich nicht verstanden.',
  tapToSpeak: 'Zum Sprechen tippen',
  micBlocked: 'Kevin braucht Mikrofonzugriff, um Sie zu hören. Erlauben Sie ihn in den Browsereinstellungen oder tippen Sie stattdessen.',
  talkToKevin: 'Mit Kevin sprechen',
  typeInstead: 'Stattdessen tippen',
  introIntake: 'Hallo! Ich bin Kevin, Ihr Begleiter bei RealEVR Estates. Darf ich Ihren Namen erfahren, damit ich mich gut um Sie kümmern kann?',
  shareNote: 'Angaben, die Sie machen, gehen an das RealEVR-Team, damit es Ihnen helfen kann.',
  privacy: 'Datenschutz',
  handsFreeOffer: 'Sie möchten einfach sprechen? Schalten Sie Freisprechen ein, dann antworte ich, sobald Sie sprechen, solange diese Seite geöffnet ist. Wenn Sie sprechen, wird ein kurzer Ausschnitt an einen Sprachdienst (ElevenLabs oder den Ihres Browsers) gesendet, der ihn in Text umwandelt, und die Wörter gehen an RealEVR, damit ich antworten kann. Solange es still ist, wird nichts gesendet, und Sie können es jederzeit ausschalten.',
  handsFreeOn: 'Freisprechen einschalten',
  handsFreeNotNow: 'Nicht jetzt',
  handsFreeLabel: 'Freisprechen',
  handsFreeActive: 'Ich höre zu: sprechen Sie einfach',
  tapToHear: 'Tippen Sie irgendwo, um meine Antwort zu hören',
  whatsapp: 'Schreiben Sie uns auf WhatsApp',
  },
  ar: {
    placeholder: 'اسأل كيفن أي شيء…',
    listening: 'أستمع إليك…',
    thinking: 'كيفن يفكر…',
    intro: 'مرحباً! أنا كيفن، دليلك في RealEVR Estates. كيف يمكنني مساعدتك في العثور على منزل اليوم؟',
    error: 'أواجه مشكلة في الاتصال الآن. يرجى المحاولة مرة أخرى بعد قليل.',
    noVoice: 'لا يستطيع كيفن التحدث بهذه اللغة بصوت مسموع على هذا الجهاز، لذا سيرد كتابةً.',
  didntCatch: 'عذراً، لم أفهم ذلك.',
  tapToSpeak: 'اضغط للتحدث',
  micBlocked: 'يحتاج كيفن إلى الوصول إلى الميكروفون ليسمعك. يمكنك السماح بذلك من إعدادات المتصفح، أو الكتابة بدلاً من ذلك.',
  talkToKevin: 'تحدث مع كيفن',
  typeInstead: 'اكتب بدلاً من ذلك',
  introIntake: 'مرحباً! أنا كيفن، دليلك في RealEVR Estates. هل يمكنني معرفة اسمك لأخدمك بشكل أفضل؟',
  shareNote: 'المعلومات التي تشاركها تصل إلى فريق RealEVR ليتمكن من مساعدتك.',
  privacy: 'الخصوصية',
  handsFreeOffer: 'هل تفضّل أن تتحدث فقط؟ فعّل وضع التحدث بدون لمس وسأردّ كلما تحدثتَ ما دامت هذه الصفحة مفتوحة. عند التحدث يُرسَل مقطع قصير إلى خدمة صوتية (ElevenLabs أو خدمة متصفحك) لتحويله إلى نص، ثم تُرسَل الكلمات إلى RealEVR لأتمكن من الرد. لا يُرسَل شيء عندما يكون المكان هادئًا، ويمكنك إيقافه في أي وقت.',
  handsFreeOn: 'تفعيل التحدث بدون لمس',
  handsFreeNotNow: 'ليس الآن',
  handsFreeLabel: 'بدون لمس',
  handsFreeActive: 'أستمع: تحدّث فقط',
  tapToHear: 'المس الشاشة لتسمع ردي',
  whatsapp: 'راسلنا عبر واتساب',
  },
  zh: {
    placeholder: '问问 Kevin 任何问题…',
    listening: '正在聆听…',
    thinking: 'Kevin 正在思考…',
    intro: '你好！我是 Kevin，你在 RealEVR Estates 的向导。今天我能怎样帮你找到理想的家？',
    error: '我现在连接遇到问题，请稍后再试。',
    noVoice: '此设备无法朗读{lang}，Kevin 将以文字回复。',
  didntCatch: '抱歉，我没听清。',
  tapToSpeak: '点按说话',
  micBlocked: 'Kevin 需要使用麦克风才能听到你。你可以在浏览器设置中允许，或改为打字。',
  talkToKevin: '和 Kevin 对话',
  typeInstead: '改为打字',
  introIntake: '你好！我是 Kevin，你在 RealEVR Estates 的向导。方便告诉我你的名字吗？这样我能更好地帮你。',
  shareNote: '你分享的信息会交给 RealEVR 团队，以便为你提供帮助。',
  privacy: '隐私',
  handsFreeOffer: '想直接说话吗？开启免提后，只要这个页面打开，你一开口我就会回应。你说话时，一小段音频会发送到语音服务（ElevenLabs，或你浏览器自带的服务）转成文字，文字再发送给 RealEVR 以便我回答。房间安静时不会发送任何内容，你可以随时关闭。',
  handsFreeOn: '开启免提',
  handsFreeNotNow: '暂时不要',
  handsFreeLabel: '免提',
  handsFreeActive: '正在聆听：直接说话',
  tapToHear: '点一下屏幕，听我的回答',
  whatsapp: '通过 WhatsApp 联系我们',
  },
  hi: {
    placeholder: 'केविन से कुछ भी पूछें…',
    listening: 'सुन रहा हूँ…',
    thinking: 'केविन सोच रहा है…',
    intro: 'नमस्ते! मैं केविन हूँ, RealEVR Estates में आपका गाइड। आज घर ढूँढने में मैं आपकी कैसे मदद कर सकता हूँ?',
    error: 'अभी कनेक्ट करने में समस्या हो रही है। कृपया थोड़ी देर बाद फिर कोशिश करें।',
    noVoice: 'इस डिवाइस पर केविन {lang} में बोल नहीं सकता, इसलिए वह लिखकर जवाब देगा।',
  didntCatch: 'माफ़ कीजिए, मैं समझ नहीं पाया।',
  tapToSpeak: 'बोलने के लिए टैप करें',
  micBlocked: 'केविन को आपकी बात सुनने के लिए माइक्रोफ़ोन की अनुमति चाहिए। आप ब्राउज़र सेटिंग में इसे अनुमति दे सकते हैं, या टाइप कर सकते हैं।',
  talkToKevin: 'केविन से बात करें',
  typeInstead: 'टाइप करें',
  introIntake: 'नमस्ते! मैं केविन हूँ, RealEVR Estates में आपका गाइड। क्या मैं आपका नाम जान सकता हूँ, ताकि आपकी बेहतर मदद कर सकूँ?',
  shareNote: 'आप जो जानकारी साझा करते हैं वह RealEVR टीम को जाती है ताकि वे आपकी मदद कर सकें।',
  privacy: 'गोपनीयता',
  handsFreeOffer: 'बस बात करना पसंद है? हैंड्स-फ़्री चालू करें, और जब तक यह पेज खुला है, आप जब भी बोलेंगे मैं जवाब दूँगा। बोलने पर एक छोटा अंश किसी वॉइस सेवा (ElevenLabs, या आपके ब्राउज़र की अपनी) को टेक्स्ट बनाने के लिए भेजा जाता है, और शब्द RealEVR को भेजे जाते हैं ताकि मैं जवाब दे सकूँ। कमरा शांत होने पर कुछ नहीं भेजा जाता, और आप इसे कभी भी बंद कर सकते हैं।',
  handsFreeOn: 'हैंड्स-फ़्री चालू करें',
  handsFreeNotNow: 'अभी नहीं',
  handsFreeLabel: 'हैंड्स-फ़्री',
  handsFreeActive: 'सुन रहा हूँ: बस बोलिए',
  tapToHear: 'मेरा जवाब सुनने के लिए कहीं भी टैप करें',
  whatsapp: 'WhatsApp पर संदेश भेजें',
  },
}

export function stringsFor(lang: KevinLanguage | null): KevinStrings {
  return (lang?.code && BY_CODE[lang.code]) || en
}

/** Right-to-left scripts, for laying out the message bubbles. */
export function isRtl(lang: KevinLanguage | null): boolean {
  return lang?.code === 'ar'
}

/** True when we ship Kevin's introduction in this language ourselves, so it can
 * appear instantly; otherwise the AI writes it. */
export function hasBuiltInIntro(lang: KevinLanguage | null): boolean {
  return !!(lang?.code && BY_CODE[lang.code])
}
