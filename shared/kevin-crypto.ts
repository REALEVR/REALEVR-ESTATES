/**
 * Kevin knows a home can be bought with Bitcoin or another digital currency. The answer is fixed, so it is the
 * same in every language Kevin speaks and correct even when no AI service is set up: how it works, what is
 * checked, and the one safety rule that matters.
 */
export interface CryptoAnswer {
    reply: string
    links: Array<{ label: string; path: string }>
    whatsapp: boolean
}

type L = 'en' | 'sw' | 'fr'

/** Talk about paying with coin: bitcoin, btc, crypto, usdt, ethereum, "digital currency" (also in Swahili and French). */
export const CRYPTO_TALK = /\b(bit ?coins?|btc|crypto(?:currenc(?:y|ies))?|usdt|usdc|tether|ethereum|ether|stablecoins?|digital (?:currency|money|coins?)|sarafu ya kidijitali|cryptomonnaie|monnaie num[eé]rique)\b/i

const REPLY: Record<L, { reply: string; links: Array<[string, string]> }> = {
    en: {
        reply:
            'Yes, you can ask to buy a home with Bitcoin or another digital currency. Every home for sale has a Buy with Bitcoin button that shows the price in coin at the live rate. You send your details, we check the seller accepts it and verify who you are and where the funds come from, then you get written payment instructions for an escrow or the seller\'s lawyer. Never send coin to anyone before that.',
        links: [['Homes for sale', '/for-sale'], ['Bank sales', '/bank-sales']],
    },
    sw: {
        reply:
            'Ndiyo, unaweza kuomba kununua nyumba kwa Bitcoin au sarafu nyingine ya kidijitali. Kila nyumba ya kuuzwa ina kitufe cha Nunua kwa Bitcoin kinachoonyesha bei kwa sarafu kwa kiwango cha sasa. Unatuma maelezo yako, tunathibitisha kuwa muuzaji anakubali na tunakagua wewe ni nani na pesa zinatoka wapi, kisha unapata maelekezo ya malipo kwa maandishi kwa escrow au wakili wa muuzaji. Usitume sarafu kwa mtu yeyote kabla ya hapo.',
        links: [['Nyumba za kuuzwa', '/for-sale'], ['Mauzo ya benki', '/bank-sales']],
    },
    fr: {
        reply:
            'Oui, vous pouvez demander à acheter un bien avec du Bitcoin ou une autre monnaie numérique. Chaque bien à vendre a un bouton Acheter avec Bitcoin qui affiche le prix en crypto au taux du moment. Vous envoyez vos coordonnées, nous vérifions que le vendeur accepte, puis votre identité et l\'origine des fonds, et vous recevez des instructions de paiement écrites pour un séquestre ou l\'avocat du vendeur. N\'envoyez jamais de crypto à quiconque avant cela.',
        links: [['Biens à vendre', '/for-sale'], ['Ventes bancaires', '/bank-sales']],
    },
}

export function cryptoAnswer(message: string, language?: string | null): CryptoAnswer | null {
    if (!CRYPTO_TALK.test(message)) return null
    const n = (language ?? '').toLowerCase()
    const l: L = /swahili|kiswahili/.test(n) ? 'sw' : /french|fran/.test(n) ? 'fr' : 'en'
    const r = REPLY[l]
    return { reply: r.reply, links: r.links.map(([label, path]) => ({ label, path })), whatsapp: false }
}
