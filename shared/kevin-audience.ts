/**
 * Who is Kevin talking to? On the sign-up screen, and again after sign-up, he asks what brings the person here and
 * then stays with them: a tenant, a landlord, a company, or someone who wants to sponsor. These answers do not
 * depend on any AI service, so he is a real helper even when no AI key is set.
 */
export type Audience = 'tenant' | 'landlord' | 'company' | 'sponsor'
export const AUDIENCES: Audience[] = ['tenant', 'landlord', 'company', 'sponsor']

export interface AudienceReply {
    reply: string
    /** Buttons that take them straight to the right place. */
    links: Array<{ label: string; path: string }>
    /** Show the WhatsApp button too (a person should be involved). */
    whatsapp: boolean
}

type L = 'en' | 'sw' | 'fr'

const REPLIES: Record<Audience, Record<L, { reply: string; links: Array<[string, string]>; whatsapp: boolean }>> = {
    tenant: {
        en: { reply: 'Welcome. As a tenant you can look around homes in 360° before you travel, save the ones you like, and message owners directly. Tell me the area, your budget and when you want to move, and I will show you matches. I am here with you until you have found the place.', links: [['Homes to rent', '/rental-units'], ['Short stays', '/bnbs']], whatsapp: false },
        sw: { reply: 'Karibu. Kama mpangaji unaweza kutazama nyumba kwa 360° kabla ya kusafiri, kuhifadhi unazopenda na kuwasiliana na wamiliki moja kwa moja. Niambie eneo, bajeti yako na unapotaka kuhamia, nikuonyeshe zinazofaa. Niko nawe hadi upate makazi.', links: [['Nyumba za kupanga', '/rental-units'], ['Makazi ya muda mfupi', '/bnbs']], whatsapp: false },
        fr: { reply: 'Bienvenue. En tant que locataire, vous pouvez visiter les logements en 360° avant de voyager, enregistrer vos favoris et écrire directement aux propriétaires. Dites-moi le quartier, votre budget et la date d’emménagement, et je vous montre ce qui convient. Je reste avec vous jusqu’à ce que vous ayez trouvé.', links: [['Logements à louer', '/rental-units'], ['Séjours courts', '/bnbs']], whatsapp: false },
    },
    landlord: {
        en: { reply: 'Welcome. Listing is free, whether it is a rental, a home for sale, or a short stay. You will need a few photos or a 360° tour, the price and the location. I will stay with you if you get stuck, and if anything is urgent I can connect you straight to the RealEVR team on WhatsApp.', links: [['List my property', '/list-your-property'], ['How hosting works', '/host-responsibly']], whatsapp: true },
        sw: { reply: 'Karibu. Kuorodhesha ni bure, iwe ni kupangisha, kuuza au makazi ya muda mfupi. Utahitaji picha chache au ziara ya 360°, bei na eneo. Nitakuwa nawe ukikwama, na likiwa la haraka nitakuunganisha moja kwa moja na timu ya RealEVR kwenye WhatsApp.', links: [['Orodhesha mali yangu', '/list-your-property'], ['Jinsi ya kuwa mwenyeji', '/host-responsibly']], whatsapp: true },
        fr: { reply: 'Bienvenue. Publier est gratuit, que ce soit une location, une vente ou un séjour court. Il vous faut quelques photos ou une visite 360°, le prix et l’emplacement. Je reste avec vous si vous êtes bloqué, et en cas d’urgence je vous mets en relation directe avec l’équipe RealEVR sur WhatsApp.', links: [['Publier mon bien', '/list-your-property'], ['Comment héberger', '/host-responsibly']], whatsapp: true },
    },
    company: {
        en: { reply: 'Welcome. Developers, agencies, banks, auctioneers and other firms can join as partners. Developers and agencies list free; banks run live auctions and pay a yearly partner fee that depends on the country. I can show you what your kind of company needs, and a person from our team can speak with you on WhatsApp.', links: [['Become a partner', '/become-a-partner'], ['Partner fees', '/fees']], whatsapp: true },
        sw: { reply: 'Karibu. Wasanidi, mawakala, benki, wapiga mnada na kampuni nyingine wanaweza kujiunga kama washirika. Wasanidi na mawakala wanaorodhesha bure; benki huendesha minada ya moja kwa moja na hulipa ada ya kila mwaka kulingana na nchi. Naweza kukuonyesha kinachohitajika, na mtu wa timu yetu anaweza kuzungumza nawe WhatsApp.', links: [['Kuwa mshirika', '/become-a-partner'], ['Ada za ushirika', '/fees']], whatsapp: true },
        fr: { reply: 'Bienvenue. Promoteurs, agences, banques, commissaires-priseurs et autres entreprises peuvent devenir partenaires. Promoteurs et agences publient gratuitement ; les banques organisent des enchères en direct et paient des frais annuels selon le pays. Je peux vous montrer ce qu’il faut, et une personne de l’équipe peut vous parler sur WhatsApp.', links: [['Devenir partenaire', '/become-a-partner'], ['Frais partenaires', '/fees']], whatsapp: true },
    },
    sponsor: {
        en: { reply: 'Thank you. A sponsor, someone who wants to pay rent for a tenant or support a project or listing, is looked after personally by our team so the arrangement is clear and safe for everyone. Tell me a little about who or what you want to support and in which country, or message the team on WhatsApp now.', links: [['How the platform works', '/how-it-works'], ['Trust and safety', '/trust-safety']], whatsapp: true },
        sw: { reply: 'Asante. Mdhamini, yaani anayetaka kulipia mpangaji kodi au kusaidia mradi au tangazo, anahudumiwa binafsi na timu yetu ili mpango uwe wazi na salama kwa wote. Niambie kidogo unataka kumsaidia nani au nini, na nchi gani, au waandikie timu WhatsApp sasa.', links: [['Jinsi jukwaa linavyofanya kazi', '/how-it-works'], ['Usalama', '/trust-safety']], whatsapp: true },
        fr: { reply: 'Merci. Un parrain, c’est-à-dire quelqu’un qui veut payer le loyer d’un locataire ou soutenir un projet ou une annonce, est suivi personnellement par notre équipe pour que l’accord soit clair et sûr pour tous. Dites-moi qui ou quoi vous voulez soutenir et dans quel pays, ou écrivez à l’équipe sur WhatsApp maintenant.', links: [['Comment fonctionne la plateforme', '/how-it-works'], ['Confiance et sécurité', '/trust-safety']], whatsapp: true },
    },
}

export function audienceReply(choice: string, language?: string | null): AudienceReply | null {
    if (!(AUDIENCES as string[]).includes(choice)) return null
    const n = (language ?? '').toLowerCase()
    const l: L = /swahili|kiswahili/.test(n) ? 'sw' : /french|fran/.test(n) ? 'fr' : 'en'
    const r = REPLIES[choice as Audience][l]
    return { reply: r.reply, links: r.links.map(([label, path]) => ({ label, path })), whatsapp: r.whatsapp }
}

/** The line on the chips' own labels and what is sent to Kevin when one is tapped. */
export const AUDIENCE_LABELS: Record<Audience, { en: string; sw: string; fr: string }> = {
    tenant: { en: 'I want to rent or buy', sw: 'Natafuta nyumba', fr: 'Je cherche un logement' },
    landlord: { en: 'I own a property', sw: 'Nina mali', fr: 'Je suis propriétaire' },
    company: { en: 'I represent a company', sw: 'Naiwakilisha kampuni', fr: 'Je représente une entreprise' },
    sponsor: { en: 'I want to sponsor', sw: 'Nataka kudhamini', fr: 'Je veux parrainer' },
}
