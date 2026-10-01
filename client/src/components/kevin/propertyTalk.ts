/**
 * Two small judgements Kevin makes about what he hears.
 *
 * `isAboutProperties`: is this someone talking to him about property (renting, buying, selling,
 * a home, land, a stay) anywhere in the world, or just talking? Hands-free listening only wakes him
 * for the first kind, so a conversation in the room or a television never opens him up. It is a
 * keyword test across the languages Kevin offers, not a service: nothing leaves the browser for it.
 *
 * `regionalTag`: the speech engine hears an accent far better when told which one to expect. English
 * spoken in Kampala is recognised better as Kenyan English than as British English, in Lagos as Nigerian
 * English, in Johannesburg as South African English; Swahili the same. The same tag steers the device
 * voice towards a matching regional voice when one is installed.
 */

// Latin-script words are matched whole (so "home" does not match "homeless"), others anywhere in the text.
const LATIN_WORDS = [
  // English
  'house', 'houses', 'home', 'homes', 'apartment', 'apartments', 'flat', 'flats', 'condo', 'condos', 'villa', 'villas', 'bungalow', 'studio', 'duplex',
  'bedroom', 'bedrooms', 'bathroom', 'room', 'rooms', 'property', 'properties', 'real estate', 'estate', 'land', 'plot', 'plots', 'acre', 'acres',
  'rent', 'rents', 'rental', 'rentals', 'renting', 'lease', 'leasing', 'to let', 'landlord', 'landlords', 'tenant', 'tenants', 'mortgage',
  'buy', 'buying', 'sell', 'selling', 'sale', 'listing', 'listings', 'list my', 'viewing', 'virtual tour', 'airbnb', 'bnb', 'bnbs',
  'furnished', 'unfurnished', 'accommodation', 'hostel', 'bank sale', 'auction', 'square metres', 'square meters', 'sqm', 'agent', 'broker', 'kevin',
  // Swahili
  'nyumba', 'chumba', 'vyumba', 'kupanga', 'kupangisha', 'kodi', 'kuuza', 'kununua', 'shamba', 'kiwanja', 'viwanja', 'mali', 'mpangaji', 'mwenye nyumba',
  // Luganda / Kinyarwanda
  'ennyumba', 'enju', 'ekibanja', 'okupangisa', 'okugula', 'inzu', 'inzu', 'gukodesha', 'kugura', 'kugurisha', 'isambu',
  // French
  'maison', 'maisons', 'appartement', 'appartements', 'logement', 'logements', 'chambre', 'chambres', 'terrain', 'terrains', 'louer', 'location', 'acheter',
  'vendre', 'vente', 'loyer', 'propriétaire', 'locataire', 'immobilier', 'bien immobilier', 'villa', 'studio', 'meublé', 'hypothèque',
  // Portuguese
  'casa', 'casas', 'apartamento', 'apartamentos', 'quarto', 'quartos', 'terreno', 'terrenos', 'alugar', 'arrendar', 'arrendamento', 'comprar', 'vender', 'venda',
  'aluguel', 'aluguer', 'imóvel', 'imóveis', 'imobiliária', 'inquilino', 'senhorio', 'moradia',
  // Spanish
  'piso', 'pisos', 'habitación', 'habitaciones', 'alquilar', 'alquiler', 'vivienda', 'viviendas', 'inmueble', 'inmuebles', 'inquilino', 'propietario',
  // German
  'haus', 'häuser', 'wohnung', 'wohnungen', 'zimmer', 'grundstück', 'mieten', 'miete', 'kaufen', 'verkaufen', 'immobilie', 'immobilien', 'vermieter', 'mieter',
  // Somali
  'guri', 'guryo', 'kiro', 'iibso', 'dhul',
]
const OTHER_SCRIPTS = [
  // Arabic
  'بيت', 'منزل', 'شقة', 'شقق', 'فيلا', 'غرفة', 'عقار', 'عقارات', 'أرض', 'ايجار', 'إيجار', 'للإيجار', 'للايجار', 'للبيع', 'شراء', 'بيع', 'مستأجر', 'مؤجر', 'سكن',
  // Chinese
  '房', '租', '买房', '卖房', '公寓', '别墅', '地产', '房产', '出租', '出售', '住宅', '土地',
  // Hindi
  'घर', 'मकान', 'फ्लैट', 'किराया', 'किराये', 'ज़मीन', 'जमीन', 'खरीद', 'बेच', 'संपत्ति', 'प्रॉपर्टी',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LATIN = new RegExp(`(?<![\\p{L}\\p{M}])(?:${LATIN_WORDS.map(escape).join('|')})(?![\\p{L}\\p{M}])`, 'iu')
const OTHER = new RegExp(OTHER_SCRIPTS.map(escape).join('|'), 'u')

/** Is this about property, or addressed to Kevin by name? */
export function isAboutProperties(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  return LATIN.test(t) || OTHER.test(t)
}

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
