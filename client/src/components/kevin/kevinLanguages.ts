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
