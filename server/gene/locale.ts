/**
 * GENE Platform — best-effort "what language should the AI reply in"
 * detection, for the site's AI chat surfaces (server/gene/chat.ts's public
 * assistant, server/gene/personal-agent.ts's "My RealEVR Agent").
 *
 * Deliberately derived from the visitor's browser `Accept-Language` header
 * — sent automatically on every request, no client code needed — rather
 * than IP-based country geolocation. Two honest reasons for that:
 *   1. This app has no geo-IP service configured, and the free tiers of
 *      the usual ones (ip-api.com, ipapi.co) are rate-limited in ways that
 *      make them risky to depend on for a public, potentially high-traffic
 *      chat endpoint — better to not fake a "detects your country"
 *      capability that isn't actually wired to anything real.
 *   2. Accept-Language is a more accurate signal for the actual goal
 *      ("reply in the language this person understands") than a country
 *      guess would be anyway — plenty of countries are multilingual, and a
 *      visitor could be traveling. If a real geo-IP signal (e.g. a CDN's
 *      cf-ipcountry header) is ever added in front of this app, this is
 *      the one place to wire it in as an extra hint.
 */

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    fr: 'French',
    sw: 'Swahili',
    lg: 'Luganda',
    rw: 'Kinyarwanda',
    rn: 'Kirundi',
    am: 'Amharic',
    so: 'Somali',
    ar: 'Arabic',
    es: 'Spanish',
    pt: 'Portuguese',
    de: 'German',
    it: 'Italian',
    nl: 'Dutch',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    hi: 'Hindi',
    ur: 'Urdu',
    bn: 'Bengali',
    ru: 'Russian',
    tr: 'Turkish',
    vi: 'Vietnamese',
    th: 'Thai',
    id: 'Indonesian',
    ms: 'Malay',
    pl: 'Polish',
    uk: 'Ukrainian',
    ro: 'Romanian',
    el: 'Greek',
    he: 'Hebrew',
    fa: 'Persian',
}

/** Parses an Accept-Language header (e.g. "fr-FR,fr;q=0.9,en;q=0.8") and
 * returns the highest-weighted language, region subtag dropped since only
 * the language matters here. Returns null if the header is missing/empty
 * or its top tag is the wildcard. */
export function detectPreferredLanguage(acceptLanguageHeader: string | string[] | undefined): { code: string; name: string } | null {
    const header = Array.isArray(acceptLanguageHeader) ? acceptLanguageHeader[0] : acceptLanguageHeader
    if (!header) return null

    const top = header
        .split(',')
        .map((part) => {
            const [tag, qPart] = part.trim().split(';q=')
            const q = qPart ? parseFloat(qPart) : 1
            return { tag: (tag || '').trim(), q: Number.isFinite(q) ? q : 1 }
        })
        .filter((entry) => entry.tag)
        .sort((a, b) => b.q - a.q)[0]

    if (!top || top.tag === '*') return null
    const code = top.tag.split('-')[0].toLowerCase()
    if (!code) return null
    return { code, name: LANGUAGE_NAMES[code] || code }
}

/** A ready-to-drop-in system-prompt line — empty string (nothing to add)
 * when the visitor's browser is already English or unknown, since that's
 * this AI's natural default anyway. */
export function languageInstruction(acceptLanguageHeader: string | string[] | undefined): string {
    const lang = detectPreferredLanguage(acceptLanguageHeader)
    if (!lang || lang.code === 'en') return ''
    return `The visitor's browser is set to ${lang.name} (locale hint: "${lang.code}"). Greet them and reply in ${lang.name} by default. If they write in a different language, switch to match whatever language they're actually using instead.`
}
