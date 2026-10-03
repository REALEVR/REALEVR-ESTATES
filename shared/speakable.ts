/**
 * What reads well on a screen reads badly aloud: "UGX 2,500,000", "2 bed · 1 bath", "65 m²", "https://...". A voice that
 * spells these out sounds like a machine reading a form, which is what "fake" is. This turns written text into the words
 * a person would say. Used by the browser (before asking for speech) and the server (before sending text to a voice).
 * Safe to apply twice.
 */

const CURRENCY: Record<string, string> = {
  UGX: 'Ugandan shillings', KES: 'Kenyan shillings', TZS: 'Tanzanian shillings', RWF: 'Rwandan francs', BIF: 'Burundian francs',
  USD: 'US dollars', EUR: 'euros', GBP: 'pounds', NGN: 'naira', GHS: 'cedis', ZAR: 'rand', ETB: 'birr', EGP: 'Egyptian pounds',
  MAD: 'dirhams', AED: 'dirhams', INR: 'rupees', CNY: 'yuan', JPY: 'yen', CAD: 'Canadian dollars', AUD: 'Australian dollars',
  XOF: 'CFA francs', XAF: 'CFA francs', ZMW: 'kwacha', MWK: 'kwacha', BWP: 'pula', MZN: 'meticais', SOS: 'Somali shillings', SSP: 'South Sudanese pounds',
}

const trim = (n: number) => String(Math.round(n * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')

/** 2500000 -> "2.5 million", 650000 -> "650 thousand", 1200 -> "1,200 thousand"-free "1.2 thousand" avoided: "1200". */
export function spokenNumber(n: number): string {
  if (n >= 1e9) return `${trim(n / 1e9)} billion`
  if (n >= 1e6) return `${trim(n / 1e6)} million`
  if (n >= 1e4) return `${Math.round(n / 1e3)} thousand`
  return String(Math.round(n))
}

const codes = Object.keys(CURRENCY).join('|')
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }

function amount(num: string, mult?: string): number {
  const n = Number(num.replace(/,/g, ''))
  return Number.isFinite(n) ? n * (mult ? MULT[mult.toLowerCase()] ?? 1 : 1) : NaN
}

export function speakable(input: string): string {
  let t = input
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' the link ')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, ' the email address ')

  // "UGX 2,500,000" and "UGX2.5m" and "2,500,000 UGX"
  const before = new RegExp(`\\b(${codes})\\s?(\\d[\\d,]*(?:\\.\\d+)?)\\s?(thousand|million|billion|mn|bn|k|m|b)?\\b`, 'gi')
  t = t.replace(before, (whole, code: string, num: string, mult?: string) => {
    const v = amount(num, mult)
    return Number.isNaN(v) ? whole : `${spokenNumber(v)} ${CURRENCY[code.toUpperCase()]}`
  })
  const after = new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?)\\s?(thousand|million|billion|mn|bn|k|m|b)?\\s?(${codes})\\b`, 'gi')
  t = t.replace(after, (whole, num: string, mult: string | undefined, code: string) => {
    const v = amount(num, mult)
    return Number.isNaN(v) ? whole : `${spokenNumber(v)} ${CURRENCY[code.toUpperCase()]}`
  })

  t = t
    .replace(/\b(\d+)\s?(?:bed|beds|bd|br)\b/gi, (_m, n: string) => `${n} bedroom`)
    .replace(/\b(\d+)\s?(?:bath|baths|ba)\b/gi, (_m, n: string) => `${n} bathroom`)
    .replace(/(\d)\s?(?:m²|m2\b|sqm\b|sq\.? ?m\b)/gi, '$1 square metres')
    .replace(/(\d)\s?(?:ft²|ft2\b|sq\.? ?ft\b|sqft\b)/gi, '$1 square feet')
    .replace(/\s?\/\s?(month|mo|night|day|week|year|yr)\b/gi, (_m, u: string) => ` per ${u.toLowerCase() === 'mo' ? 'month' : u.toLowerCase() === 'yr' ? 'year' : u.toLowerCase()}`)
    .replace(/\b360\s?°/g, 'three sixty')
    .replace(/°/g, ' degrees')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\s[·•|]\s/g, ', ')
    .replace(/&/g, ' and ')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/[*_`#>~]+/g, '')
    .replace(new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]', 'gu'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return t
}
