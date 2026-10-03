/**
 * Small judgements Kevin makes about what he hears.
 *
 * `isAboutProperties` (shared with the server, see shared/property-talk.ts): is this someone talking to him
 * about property anywhere in the world, or just talking? Hands-free listening only wakes him for the first
 * kind, so a conversation in the room or a television never opens him up.
 *
 * `regionalTag`: the speech engine hears an accent far better when told which one to expect. English
 * spoken in Kampala is recognised better as Kenyan English than as British English, in Lagos as Nigerian
 * English, in Johannesburg as South African English; Swahili the same. The same tag steers the device
 * voice towards a matching regional voice when one is installed.
 */
export { isAboutProperties, isSmallTalk } from '@shared/property-talk'

// ---------------------------------------------------------------------------
// Accent-aware recognition
// ---------------------------------------------------------------------------

// The English (and Swahili) regions Chrome and Android recognise, by country. Uganda and its neighbours have
// no tag of their own: Kenyan English is the closest match for East Africa.
const ENGLISH_REGION: Record<string, string> = {
  KE: 'en-KE', UG: 'en-KE', RW: 'en-KE', BI: 'en-KE', SS: 'en-KE', ET: 'en-KE', SO: 'en-KE', DJ: 'en-KE', ER: 'en-KE',
  TZ: 'en-TZ',
  NG: 'en-NG', SL: 'en-NG', LR: 'en-NG', GM: 'en-NG', CM: 'en-NG', GH: 'en-GH',
  ZA: 'en-ZA', NA: 'en-ZA', BW: 'en-ZA', LS: 'en-ZA', SZ: 'en-ZA', ZW: 'en-ZA', ZM: 'en-ZA', MW: 'en-ZA', MZ: 'en-ZA',
}
const SWAHILI_REGION: Record<string, string> = { TZ: 'sw-TZ', KE: 'sw-KE', UG: 'sw-KE', RW: 'sw-KE', BI: 'sw-KE', CD: 'sw-KE' }

/**
 * The speech tag to use for a language, given where the visitor is. Only English and Swahili are
 * adjusted, and only for a visitor in Africa; everyone else keeps the tag they chose.
 */
export function regionalTag(tag: string | null | undefined, country: string | null | undefined, abroad = false): string | null {
  if (!tag) return null
  if (abroad || !country) return tag
  const primary = tag.replace(/_/g, '-').toLowerCase().split('-')[0]
  const code = country.toUpperCase()
  if (primary === 'en') return ENGLISH_REGION[code] ?? tag
  if (primary === 'sw') return SWAHILI_REGION[code] ?? tag
  return tag
}

// ---------------------------------------------------------------------------
// Waking him by name
// ---------------------------------------------------------------------------

// Speech engines write the name many ways. Greetings in the languages Kevin speaks.
const NAME = '(?:kev[iyae]n|kevon|kelvin|calvin|kevi)'
const GREETING = '(?:hello|hallo|hullo|hi|hey|hei|okay|ok|yo|good (?:morning|afternoon|evening)|hola|bonjour|salut|ol[aá]|habari|jambo|mambo|vipi|marhaba|namaste|oi)'
const WAKE = new RegExp(`^\\s*(?:${GREETING}[\\s,.!]+)?(?:there[\\s,.!]+)?${NAME}\\b[\\s,.!?]*`, 'i')
const GREETED = new RegExp(`\\b${GREETING}[\\s,.!]+${NAME}\\b`, 'i')

/** "Hello Kevin" (or hi / hey / okay / habari / bonjour Kevin, or just his name first): someone is calling him. */
export function isWakePhrase(text: string): boolean {
  return GREETED.test(text) || WAKE.test(text)
}

/** What was said once the calling is taken off the front: "Hello Kevin, I want a flat in Kololo" gives "I want a flat in Kololo". */
export function afterWakePhrase(text: string): string {
  return text.replace(WAKE, '').trim()
}

/** Only the calling, with nothing (or only filler like "are you there") after it: he should answer with a greeting, not a search. */
export function isWakeOnly(text: string): boolean {
  if (!isWakePhrase(text)) return false
  const rest = afterWakePhrase(text).replace(/[.!?,]+/g, ' ').trim().toLowerCase()
  if (!rest) return true
  return /^(are you there|you there|wake up|can you hear me|are you listening|come here|please|help me|i need (some )?help)$/.test(rest)
}
