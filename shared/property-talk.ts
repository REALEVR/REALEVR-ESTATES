/**
 * Is a piece of talk about property (renting, buying, selling, a home, land, a stay) anywhere in the
 * world, or said to Kevin by name? One keyword test across the languages Kevin offers, shared by:
 *  - the browser, so hands-free listening only wakes him for property talk, and
 *  - the server, so only property-related conversation is saved.
 * Nothing leaves the machine for it; it is not a service.
 */

// Latin-script words are matched whole (so "home" does not match "homeless"), others anywhere in the text.
const LATIN_WORDS = [
  // English
  'house', 'houses', 'home', 'homes', 'apartment', 'apartments', 'flat', 'flats', 'condo', 'condos', 'villa', 'villas', 'bungalow', 'studio', 'duplex',
  'bedroom', 'bedrooms', 'bathroom', 'room', 'rooms', 'property', 'properties', 'real estate', 'estate', 'land', 'plot', 'plots', 'acre', 'acres',
  'rent', 'rents', 'rental', 'rentals', 'renting', 'lease', 'leasing', 'to let', 'landlord', 'landlords', 'tenant', 'tenants', 'mortgage',
  'buy', 'buying', 'sell', 'selling', 'sale', 'listing', 'listings', 'list my', 'viewing', 'virtual tour', 'airbnb', 'bnb', 'bnbs',
  'furnished', 'unfurnished', 'accommodation', 'hostel', 'bank sale', 'auction', 'square metres', 'square meters', 'sqm', 'agent', 'broker', 'kevin',
  // More property talk, worldwide
  'realtor', 'realtors', 'real-estate', 'housing', 'tenancy', 'tenure', 'freehold', 'leasehold', 'title deed', 'title deeds', 'conveyancing', 'stamp duty',
  'property tax', 'valuation', 'valuer', 'surveyor', 'developer', 'developers', 'construction', 'renovation', 'renovate', 'sublet', 'roommate', 'roommates',
  'co-living', 'deposit', 'down payment', 'refinance', 'home equity', 'foreclosure', 'eviction', 'evict', 'penthouse', 'townhouse', 'cottage', 'mansion',
  'warehouse', 'office space', 'commercial property', 'retail space', 'shop space', 'neighbourhood', 'neighborhood', 'suburb', 'gated community',
  'estate agent', 'letting', 'lettings', 'house hunting', 'floor plan', 'floorplan', 'square feet', 'sq ft', 'sqft', 'hectare', 'hectares',
  'closing costs', 'escrow', 'rent-to-own', 'landlady', 'caretaker', 'service charge', 'ground rent', 'land title', 'deed', 'brokers',
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
// Small talk
// ---------------------------------------------------------------------------

const SMALL_TALK = new RegExp(
    '^\\s*(?:(?:hello|hallo|hullo|hi|hey|hei|okay|ok|yo|good (?:morning|afternoon|evening|night)|hola|bonjour|salut|ol[aá]|habari|jambo|mambo|vipi|marhaba|namaste|thanks|thank you|asante|merci|gracias|obrigado|bye|goodbye|ciao|cheers|great|nice|cool|wow|yes|yeah|yep|no|nope|sure|please|sorry|welcome|how are you|are you there|can you hear me|what\'s up|sasa)(?:\\s+(?:there|again|so much|very much|a lot|kevin|kelvin|kevan|kevyn|kevon|kevi))*[\\s,.!?]*)+$',
    'i',
)

/** Only a greeting, a thank-you, a goodbye or "are you there": nothing to find and nowhere to go. Kevin answers; the page stays put. */
export function isSmallTalk(text: string): boolean {
  const t = (text || '').trim()
  return t.length > 0 && t.length < 60 && SMALL_TALK.test(t)
}
