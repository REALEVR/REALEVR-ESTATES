/**
 * Spotting an urgent message, in the languages Kevin is used in. Pure, used by the server (to alert the team and
 * answer) and tested on its own.
 *
 *  emergency: someone may be in danger or is being robbed, threatened or defrauded right now
 *  urgent:    time-critical but not dangerous (locked out, being evicted, "I need a place tonight")
 *
 * It looks for clear words only. "Urgently looking for a 2-bedroom" is urgent for the person but not an
 * emergency; both are sent to the team's WhatsApp so a person answers fast, and only an emergency also tells the
 * visitor to call the emergency services first.
 */
export type UrgentKind = 'emergency' | 'urgent'

export interface UrgentResult {
    level: UrgentKind
    /** What tripped it, for the team's message. */
    matched: string
}

const W = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu')

const EMERGENCY: RegExp[] = [
    // English
    W('on fire|fire broke out|house is burning|burning down|flood(?:ed|ing)?|gas leak|electrocut\\w*|collaps(?:e|ed|ing)|ambulance|bleeding|injured|break-?in|broke into|burglar\\w*|thie(?:f|ves)|robb(?:ed|ery)|stolen|attacked|assault\\w*|kidnap\\w*|threaten(?:ed|ing|s)|rape[dr]?|gun|knife|scam(?:med|mer)?|fraud(?:ster)?|cheated|conned|wrong account|sent (?:the )?money to'),
    // Kiswahili
    W('dharura|nyumba inaungua|moto umewaka|mafuriko|gesi inavuja|mwizi|wezi|wizi|uvamizi|nimeibiwa|nimetapeliwa|utapeli|nimedanganywa|nimeshambuliwa|natishiwa'),
    // French
    W('incendie|au feu|inondation|fuite de gaz|cambriolage|voleur|vol|arnaque|escroquerie|agress\\w+|menac\\w+|ambulance|blessé'),
    // Portuguese
    W('emergência|incêndio|inundação|vazamento de gás|assalto|ladrão|roubo|roubaram|golpe|fraude|ameaça|ameaçado|sequestro'),
    // Spanish
    W('emergencia|incendio|inundación|fuga de gas|robo|ladrón|estafa|fraude|amenaza|amenazado|secuestro'),
    // Arabic
    new RegExp('(?:طوارئ|طارئ|حريق|فيضان|سرقة|سرقوا|حرامي|احتيال|نصب|تهديد|هددني|اختطاف)', 'u'),
]

const URGENT: RegExp[] = [
    W('urgent(?:ly)?|asap|immediately|right now|tonight|emergency|locked out|evict(?:ed|ion)|kicked out|homeless|nowhere to (?:sleep|stay|go)|no place to (?:sleep|stay)|deadline (?:is )?today'),
    W('haraka sana|haraka|usiku huu|nimefukuzwa|kufukuzwa|sina mahali pa kulala|nimefungiwa nje'),
    W('urgent|urgence|tout de suite|expuls\\w+|à la rue|ce soir'),
    W('urgente|despejo|despejado|agora mesmo|esta noite|sem onde dormir'),
    W('urgente|desalojo|desalojado|ahora mismo|esta noche|sin donde dormir'),
    new RegExp('(?:عاجل|فورا|فوراً|الليلة|إخلاء|طردوني|بلا مأوى)', 'u'),
]

// Words that look like trouble but are ordinary property talk.
const FALSE_ALARM = W('fire ?place|fire ?wood|fire station|fire exit|fire alarm|fire extinguisher|fire safety|flood (?:plain|zone|risk)|gas (?:cooker|stove|cylinder)|theft insurance|security guard|burglar ?proof|burglar bars?|knife block|scam(?:s)? (?:awareness|prevention)')

export function detectUrgent(message: string): UrgentResult | null {
    const text = message.slice(0, 1000)
    const calm = FALSE_ALARM.test(text)
    for (const re of EMERGENCY) {
        const m = text.match(re)
        if (m && !(calm && /fire|flood|gas|theft|burglar|knife|scam/i.test(m[0]))) return { level: 'emergency', matched: m[0].toLowerCase() }
    }
    for (const re of URGENT) {
        const m = text.match(re)
        if (m) return { level: 'urgent', matched: m[0].toLowerCase() }
    }
    return null
}

type Lang = 'en' | 'sw' | 'fr' | 'pt' | 'es' | 'ar'

export function langOf(name: string | undefined | null): Lang {
    const n = (name ?? '').toLowerCase()
    if (/swahili|kiswahili/.test(n)) return 'sw'
    if (/french|fran/.test(n)) return 'fr'
    if (/portug/.test(n)) return 'pt'
    if (/spanish|espa/.test(n)) return 'es'
    if (/arabic|عرب/.test(n)) return 'ar'
    return 'en'
}

const EMERGENCY_REPLY: Record<Lang, string> = {
    en: 'I am sorry, that sounds serious. If anyone is in danger, call your local emergency number first (112 works on most phones; 999 in Uganda). I have told the RealEVR team right now; tap the green button to message them on WhatsApp and a person will take over.',
    sw: 'Pole sana, hilo linaonekana zito. Kama mtu yuko hatarini, piga simu ya dharura kwanza (112 kwenye simu nyingi; 999 nchini Uganda). Nimeijulisha timu ya RealEVR sasa hivi; bonyeza kitufe cha kijani kuwaandikia WhatsApp na mtu atakusaidia.',
    fr: 'Je suis désolé, cela semble grave. Si quelqu’un est en danger, appelez d’abord le numéro d’urgence local (le 112 fonctionne sur la plupart des téléphones). J’ai prévenu l’équipe RealEVR à l’instant ; touchez le bouton vert pour leur écrire sur WhatsApp, une personne prendra le relais.',
    pt: 'Lamento, isso parece sério. Se alguém está em perigo, ligue primeiro para o número de emergência local (o 112 funciona na maioria dos telemóveis). Avisei agora a equipa da RealEVR; toque no botão verde para lhes escrever no WhatsApp e uma pessoa assume.',
    es: 'Lo siento, eso suena grave. Si alguien está en peligro, llame primero al número de emergencias local (el 112 funciona en la mayoría de los teléfonos). He avisado ahora mismo al equipo de RealEVR; toque el botón verde para escribirles por WhatsApp y una persona se hará cargo.',
    ar: 'أنا آسف، يبدو الأمر خطيرًا. إذا كان أحد في خطر فاتصل أولًا برقم الطوارئ المحلي (الرقم 112 يعمل على معظم الهواتف). لقد أبلغتُ فريق RealEVR الآن؛ اضغط الزر الأخضر لمراسلتهم على واتساب وسيتولى شخص حقيقي الأمر.',
}

const URGENT_REPLY: Record<Lang, string> = {
    en: 'Understood, this is urgent. I have told the RealEVR team right now. Tap the green button to message them on WhatsApp so a person can help you straight away.',
    sw: 'Nimeelewa, hili ni la haraka. Nimeijulisha timu ya RealEVR sasa hivi. Bonyeza kitufe cha kijani kuwaandikia WhatsApp ili mtu akusaidie mara moja.',
    fr: 'Compris, c’est urgent. J’ai prévenu l’équipe RealEVR à l’instant. Touchez le bouton vert pour leur écrire sur WhatsApp afin qu’une personne vous aide tout de suite.',
    pt: 'Entendido, é urgente. Avisei agora a equipa da RealEVR. Toque no botão verde para lhes escrever no WhatsApp e uma pessoa ajudá-lo de imediato.',
    es: 'Entendido, es urgente. He avisado ahora mismo al equipo de RealEVR. Toque el botón verde para escribirles por WhatsApp y que una persona le ayude de inmediato.',
    ar: 'فهمت، الأمر عاجل. لقد أبلغتُ فريق RealEVR الآن. اضغط الزر الأخضر لمراسلتهم على واتساب ليساعدك شخص حقيقي فورًا.',
}

export function urgentReply(level: UrgentKind, language?: string | null): string {
    const l = langOf(language)
    return (level === 'emergency' ? EMERGENCY_REPLY : URGENT_REPLY)[l]
}
