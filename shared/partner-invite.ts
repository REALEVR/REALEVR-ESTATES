/**
 * The one-time invitation sent to an organisation we have a contact for, in the language most used in its country.
 * Short on purpose: who we are, what the programme is, what it costs, one link, why they are getting it, how to stop.
 */
import { COMPANY } from './company'

export type InviteLang = 'en' | 'fr' | 'pt' | 'es' | 'ar' | 'sw'

const FR = 'BJ BF BI CM CF TD KM CG CD CI DJ GA GN MG ML NE SN TG FR BE LU MC HT'.split(' ')
const PT = 'AO CV GW MZ ST PT BR TL'.split(' ')
const ES = 'AR BO CL CO CR CU DO EC SV GT HN MX NI PA PY PE UY VE ES GQ'.split(' ')
const AR = 'DZ EG LY MA MR SD TN AE SA QA KW BH OM JO LB IQ SY YE PS'.split(' ')
const SW = ['TZ']

export function inviteLanguage(countryCode: string): InviteLang {
    const c = countryCode.toUpperCase()
    if (FR.includes(c)) return 'fr'
    if (PT.includes(c)) return 'pt'
    if (ES.includes(c)) return 'es'
    if (AR.includes(c)) return 'ar'
    if (SW.includes(c)) return 'sw'
    return 'en'
}

interface Text {
    subject: (country: string) => string
    hello: (org: string) => string
    what: string
    bank: (fee: number, country: string) => string
    free: string
    cta: string
    why: (org: string, country: string) => string
    stop: string
    dir?: 'rtl'
}

const T: Record<InviteLang, Text> = {
    en: {
        subject: (c) => `Partner with RealEVR Estates in ${c}`,
        hello: (o) => `Hello ${o},`,
        what: 'RealEVR Estates is a property platform from Kampala, Uganda, with 360° virtual tours and live online auctions for bank sales. Listing is free, and buyers across Africa and abroad can look around properties before they visit.',
        bank: (f, c) => `Banks and lenders can list repossessed properties as live auctions with identity-checked, sanctions-screened bidders who each pay a non-refundable US$1,000 commitment fee. The partner fee in ${c} is US$${f.toLocaleString()} a year; we take no commission on the sale price.`,
        free: 'Joining as this kind of partner is free.',
        cta: 'See what is needed and apply',
        why: (o, c) => `We are writing once because ${o} appears to operate in ${c}.`,
        stop: 'If you do not want to hear from us, use this link and we will not write again:',
    },
    fr: {
        subject: (c) => `Devenez partenaire de RealEVR Estates en ${c}`,
        hello: (o) => `Bonjour ${o},`,
        what: "RealEVR Estates est une plateforme immobilière basée à Kampala (Ouganda), avec des visites virtuelles à 360° et des ventes aux enchères en ligne pour les biens saisis par les banques. L'inscription des biens est gratuite, et les acheteurs d'Afrique et d'ailleurs peuvent visiter à distance.",
        bank: (f, c) => `Les banques et prêteurs peuvent mettre en vente leurs biens repris par enchères en direct, avec des enchérisseurs dont l'identité est vérifiée et qui ont chacun versé des frais d'engagement non remboursables de 1 000 USD. Les frais de partenariat pour ${c} sont de ${f.toLocaleString()} USD par an ; nous ne prélevons aucune commission sur le prix de vente.`,
        free: 'Ce type de partenariat est gratuit.',
        cta: 'Voir les conditions et candidater',
        why: (o, c) => `Nous vous écrivons une seule fois car ${o} semble exercer en ${c}.`,
        stop: 'Si vous ne souhaitez plus être contacté, utilisez ce lien et nous ne vous écrirons plus :',
    },
    pt: {
        subject: (c) => `Seja parceiro da RealEVR Estates em ${c}`,
        hello: (o) => `Olá ${o},`,
        what: 'A RealEVR Estates é uma plataforma imobiliária sediada em Kampala, Uganda, com visitas virtuais 360° e leilões online ao vivo de imóveis de bancos. Anunciar é gratuito, e compradores de África e do exterior podem visitar os imóveis à distância.',
        bank: (f, c) => `Bancos e instituições de crédito podem leiloar imóveis retomados em leilões ao vivo, com licitantes com identidade verificada e verificados contra sanções, cada um tendo pago uma taxa de compromisso não reembolsável de 1.000 USD. A taxa de parceria em ${c} é de ${f.toLocaleString()} USD por ano; não cobramos comissão sobre o preço de venda.`,
        free: 'Este tipo de parceria é gratuito.',
        cta: 'Ver os requisitos e candidatar-se',
        why: (o, c) => `Escrevemos uma única vez porque ${o} parece atuar em ${c}.`,
        stop: 'Se não quiser receber mais mensagens, use este link e não voltaremos a escrever:',
    },
    es: {
        subject: (c) => `Sea socio de RealEVR Estates en ${c}`,
        hello: (o) => `Hola ${o}:`,
        what: 'RealEVR Estates es una plataforma inmobiliaria con sede en Kampala (Uganda), con recorridos virtuales de 360° y subastas en línea en vivo de inmuebles de bancos. Publicar es gratis y compradores de África y del extranjero pueden recorrer los inmuebles a distancia.',
        bank: (f, c) => `Los bancos y prestamistas pueden subastar inmuebles recuperados en directo, con postores de identidad verificada y comprobados frente a listas de sanciones, cada uno con una cuota de compromiso no reembolsable de 1.000 USD. La cuota de socio en ${c} es de ${f.toLocaleString()} USD al año; no cobramos comisión sobre el precio de venta.`,
        free: 'Ser socio de este tipo es gratuito.',
        cta: 'Ver requisitos y solicitar',
        why: (o, c) => `Le escribimos una sola vez porque ${o} parece operar en ${c}.`,
        stop: 'Si no desea recibir más mensajes, use este enlace y no volveremos a escribirle:',
    },
    ar: {
        subject: (c) => `كونوا شركاء RealEVR Estates في ${c}`,
        hello: (o) => `مرحبًا ${o}،`,
        what: 'RealEVR Estates منصة عقارية مقرها كمبالا في أوغندا، تقدّم جولات افتراضية 360° ومزادات مباشرة عبر الإنترنت لعقارات البنوك. الإدراج مجاني، ويستطيع المشترون في إفريقيا وخارجها معاينة العقارات عن بُعد.',
        bank: (f, c) => `يمكن للبنوك والجهات المقرِضة عرض العقارات المستردّة في مزادات مباشرة مع مزايدين جرى التحقق من هويتهم وفحصهم مقابل قوائم العقوبات، ودفع كلٌّ منهم رسم التزام غير قابل للاسترداد قدره 1000 دولار. رسم الشراكة في ${c} هو ${f.toLocaleString()} دولارًا سنويًا، ولا نتقاضى أي عمولة على سعر البيع.`,
        free: 'الانضمام كهذا النوع من الشركاء مجاني.',
        cta: 'اطّلعوا على المتطلبات وقدّموا طلبكم',
        why: (o, c) => `نراسلكم مرة واحدة لأن ${o} يبدو أنه يعمل في ${c}.`,
        stop: 'إن لم ترغبوا في تلقي رسائل منا، استخدموا هذا الرابط ولن نراسلكم مجددًا:',
        dir: 'rtl',
    },
    sw: {
        subject: (c) => `Kuwa mshirika wa RealEVR Estates nchini ${c}`,
        hello: (o) => `Habari ${o},`,
        what: 'RealEVR Estates ni jukwaa la mali isiyohamishika lenye makao Kampala, Uganda, lenye ziara za mtandaoni za 360° na minada ya moja kwa moja ya mali za benki. Kuorodhesha ni bure, na wanunuzi kutoka Afrika na nje wanaweza kutembelea mali kwa mbali.',
        bank: (f, c) => `Benki na wakopeshaji wanaweza kuuza mali zilizotwaliwa kwa mnada wa moja kwa moja, na washindani waliothibitishwa utambulisho wao, kila mmoja akilipa ada ya ahadi isiyorejeshwa ya dola 1,000. Ada ya ushirika nchini ${c} ni dola ${f.toLocaleString()} kwa mwaka; hatuchukui kamisheni kwenye bei ya mauzo.`,
        free: 'Kujiunga kama mshirika wa aina hii ni bure.',
        cta: 'Angalia mahitaji na uombe',
        why: (o, c) => `Tunaandika mara moja kwa sababu ${o} inaonekana kufanya kazi nchini ${c}.`,
        stop: 'Ikiwa hutaki kupokea ujumbe kutoka kwetu, tumia kiungo hiki nasi hatutaandika tena:',
    },
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function inviteEmail(p: { country: string; countryCode: string; organisation: string; role: string; feeUsd: number; link: string; unsubscribe: string }): { subject: string; html: string; text: string; lang: InviteLang } {
    const lang = inviteLanguage(p.countryCode)
    const t = T[lang]
    const money = p.role === 'bank' && p.feeUsd > 0 ? t.bank(p.feeUsd, p.country) : t.free
    const sender = `${COMPANY.tradingName}, ${COMPANY.city}, ${COMPANY.country} · ${COMPANY.emails.partners}`
    const text = [t.hello(p.organisation), '', t.what, '', money, '', `${t.cta}: ${p.link}`, '', t.why(p.organisation, p.country), `${t.stop} ${p.unsubscribe}`, '', sender].join('\n')
    const html = `<div${t.dir ? ' dir="rtl"' : ''} style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">
<p>${esc(t.hello(p.organisation))}</p><p>${esc(t.what)}</p><p>${esc(money)}</p>
<p><a href="${esc(p.link)}" style="display:inline-block;background:#0b5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(t.cta)}</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0"><p style="font-size:12px;color:#666">${esc(t.why(p.organisation, p.country))} ${esc(t.stop)} <a href="${esc(p.unsubscribe)}">${esc(p.unsubscribe)}</a></p>
<p style="font-size:12px;color:#666">${esc(sender)}</p></div>`
    return { subject: t.subject(p.country), html, text, lang }
}
