/**
 * The laws RealEVR Estates designs its documents and processes around, by region. This is information so people
 * can see which rules apply to them, not legal advice and not a promise that any authority has approved anything.
 * Laws change: each region is reviewed by local counsel before the platform actively markets there.
 */
export interface LegalRegion {
    id: string
    name: string
    /** ISO country codes the region covers (used to pick the right block for a country). */
    countries: string[]
    privacy: string[]
    /** Where a privacy complaint may be made. */
    authority: string
    consumer: string[]
    moneyAndSanctions: string[]
    property: string[]
    note?: string
}

export const LEGAL_REGIONS: LegalRegion[] = [
    {
        id: 'uganda',
        name: 'Uganda (home jurisdiction)',
        countries: ['UG'],
        privacy: ['Data Protection and Privacy Act, 2019 and its 2021 Regulations'],
        authority: "Personal Data Protection Office (PDPO), National Information Technology Authority – Uganda (NITA-U)",
        consumer: ['Electronic Transactions Act, 2011 (electronic contracts and signatures)', 'Contracts Act, 2010', 'Sale of Goods and Supply of Services Act, 2017', 'Computer Misuse Act, 2011 (as amended)'],
        moneyAndSanctions: ['Anti-Money Laundering Act, 2013 (as amended) and the Financial Intelligence Authority', 'Anti-Terrorism Act, 2002', 'Anti-Corruption Act, 2009'],
        property: ['Mortgage Act, 2009 and Mortgage Regulations, 2012 (sale of mortgaged property)', 'Auctioneers Act and Regulations (a bank-sale auction is conducted by a licensed auctioneer)', 'Land Act and Registration of Titles Act (title, transfer, caveats)', 'Stamps Act, Income Tax Act and Value Added Tax Act (duties and taxes on transfer)'],
        note: 'Uganda is the governing law of our Terms. Local counsel must confirm how a platform-run live auction fits the Auctioneers Act (see Auction Terms).',
    },
    {
        id: 'east-africa',
        name: 'Kenya, Tanzania, Rwanda, Burundi, South Sudan, Ethiopia',
        countries: ['KE', 'TZ', 'RW', 'BI', 'SS', 'ET'],
        privacy: ['Kenya: Data Protection Act, 2019', 'Tanzania: Personal Data Protection Act, 2022', 'Rwanda: Law No. 058/2021 on the protection of personal data and privacy', 'Ethiopia: Personal Data Protection Proclamation No. 1321/2024'],
        authority: "Kenya: Office of the Data Protection Commissioner. Tanzania: Personal Data Protection Commission. Rwanda: National Cyber Security Authority. Ethiopia: Ethiopian Communications Authority",
        consumer: ['Kenya: Consumer Protection Act, 2012; Computer Misuse and Cybercrimes Act, 2018', 'Tanzania: Fair Competition Act (consumer protection) and Electronic and Postal Communications Act'],
        moneyAndSanctions: ['Kenya: Proceeds of Crime and Anti-Money Laundering Act, 2009', 'Tanzania: Anti-Money Laundering Act, 2006', 'Rwanda, Burundi, South Sudan and Ethiopia: each country\'s anti-money-laundering and counter-terrorist-financing law'],
        property: ['Each country\'s land, mortgage and auctioneer rules decide who may sell mortgaged property and how'],
    },
    {
        id: 'west-africa',
        name: 'Nigeria, Ghana and the rest of West Africa',
        countries: ['NG', 'GH', 'SN', 'CI', 'SL', 'LR', 'GM', 'BJ', 'TG', 'BF', 'ML', 'NE', 'GN', 'GW', 'CV', 'MR'],
        privacy: ['Nigeria: Nigeria Data Protection Act, 2023', 'Ghana: Data Protection Act, 2012 (Act 843)', 'Senegal: Law 2008-12; Côte d\'Ivoire: Law 2013-450 (and the other ECOWAS members\' laws)'],
        authority: 'Nigeria: Nigeria Data Protection Commission. Ghana: Data Protection Commission. Others: the national data protection authority',
        consumer: ['Nigeria: Federal Competition and Consumer Protection Act, 2018; Cybercrimes (Prohibition, Prevention, etc.) Act, 2015 (as amended)', 'Ghana: Electronic Transactions Act, 2008 (Act 772)'],
        moneyAndSanctions: ['Nigeria: Money Laundering (Prevention and Prohibition) Act, 2022', 'Ghana: Anti-Money Laundering Act, 2020 (Act 1044)'],
        property: ['Local land-title, mortgage-enforcement and auction rules; in several countries a court or licensed officer must run a mortgagee sale'],
    },
    {
        id: 'southern-africa',
        name: 'South Africa and Southern Africa',
        countries: ['ZA', 'BW', 'NA', 'ZM', 'ZW', 'MW', 'MZ', 'LS', 'SZ', 'AO', 'MG', 'MU'],
        privacy: ['South Africa: Protection of Personal Information Act, 2013 (POPIA)', 'Botswana: Data Protection Act, 2018; Zambia: Data Protection Act, 2021; Zimbabwe: Cyber and Data Protection Act, 2021; Mauritius: Data Protection Act, 2017; Malawi: Data Protection Act, 2024'],
        authority: 'South Africa: Information Regulator. Others: the national data protection authority',
        consumer: ['South Africa: Consumer Protection Act, 2008; Electronic Communications and Transactions Act, 2002'],
        moneyAndSanctions: ['South Africa: Financial Intelligence Centre Act, 2001 (FICA)', 'Other countries: national anti-money-laundering laws'],
        property: ['South Africa: National Credit Act and the Magistrates\' Courts / High Court rules on sales in execution'],
    },
    {
        id: 'north-africa-middle-east',
        name: 'North Africa and the Middle East',
        countries: ['EG', 'MA', 'TN', 'DZ', 'LY', 'SD', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'LB', 'IL', 'TR'],
        privacy: ['Egypt: Personal Data Protection Law No. 151 of 2020', 'Morocco: Law 09-08', 'UAE: Federal Decree-Law No. 45 of 2021', 'Saudi Arabia: Personal Data Protection Law (2021)', 'Türkiye: Law No. 6698 (KVKK)'],
        authority: 'The national data protection authority',
        consumer: ['Each country\'s consumer-protection and e-commerce law'],
        moneyAndSanctions: ['National anti-money-laundering laws and Financial Action Task Force standards'],
        property: ['Foreign ownership, registration and auction rules differ widely: check them before bidding'],
    },
    {
        id: 'eu-eea',
        name: 'European Union and European Economic Area',
        countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO'],
        privacy: ['General Data Protection Regulation (EU) 2016/679', 'ePrivacy Directive 2002/58/EC (cookies and electronic marketing)'],
        authority: 'The data protection supervisory authority of the country where you live or work',
        consumer: ['Consumer Rights Directive 2011/83/EU', 'Unfair Contract Terms Directive 93/13/EEC', 'Digital Services Act (EU) 2022/2065 (notice-and-action; point of contact)', 'Platform-to-Business Regulation (EU) 2019/1150'],
        moneyAndSanctions: ['EU anti-money-laundering rules and EU/UN sanctions lists'],
        property: ['Property transfer and auction rules are national'],
    },
    {
        id: 'uk-switzerland',
        name: 'United Kingdom and Switzerland',
        countries: ['GB', 'CH'],
        privacy: ['UK: UK GDPR, Data Protection Act 2018, Data (Use and Access) Act 2025 and PECR', 'Switzerland: revised Federal Act on Data Protection (FADP) 2023'],
        authority: "UK: Information Commissioner's Office. Switzerland: Federal Data Protection and Information Commissioner",
        consumer: ['UK: Consumer Rights Act 2015; Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013; Online Safety Act 2023'],
        moneyAndSanctions: ['UK: Money Laundering Regulations 2017, Proceeds of Crime Act 2002, Bribery Act 2010 and UK sanctions lists'],
        property: ['National property and auction rules'],
    },
    {
        id: 'north-america',
        name: 'United States and Canada',
        countries: ['US', 'CA'],
        privacy: ['US: California Consumer Privacy Act as amended by CPRA, and other state privacy laws (for example Virginia, Colorado, Connecticut, Texas); CAN-SPAM; TCPA; COPPA (we do not serve under-18s)', 'Canada: PIPEDA, Quebec Law 25, CASL'],
        authority: 'US: your state attorney general (and the California Privacy Protection Agency). Canada: the Office of the Privacy Commissioner of Canada',
        consumer: ['US: Fair Housing Act and state equivalents (no discriminatory listings); DMCA §512 for copyright notices'],
        moneyAndSanctions: ['US: OFAC sanctions, Bank Secrecy Act principles, Foreign Corrupt Practices Act', 'Canada: Proceeds of Crime (Money Laundering) and Terrorist Financing Act; Corruption of Foreign Public Officials Act'],
        property: ['Auction and foreclosure sales are governed by state/provincial law and are usually handled locally'],
    },
    {
        id: 'asia-pacific',
        name: 'Asia, Australia and New Zealand',
        countries: ['IN', 'PK', 'BD', 'LK', 'NP', 'CN', 'JP', 'KR', 'SG', 'MY', 'TH', 'VN', 'ID', 'PH', 'HK', 'TW', 'AU', 'NZ'],
        privacy: ['India: Digital Personal Data Protection Act, 2023', 'China: Personal Information Protection Law', 'Japan: APPI; South Korea: PIPA; Singapore: PDPA 2012; Australia: Privacy Act 1988; New Zealand: Privacy Act 2020'],
        authority: 'The national privacy or data protection authority',
        consumer: ['Australia: Australian Consumer Law; Spam Act 2003', 'Each country\'s consumer-protection and e-commerce law'],
        moneyAndSanctions: ['National anti-money-laundering laws and FATF standards'],
        property: ['Foreign-buyer restrictions and registration rules are national: check them before bidding'],
    },
    {
        id: 'latin-america',
        name: 'Latin America and the Caribbean',
        countries: ['BR', 'MX', 'AR', 'CL', 'CO', 'PE', 'UY', 'EC', 'CR', 'PA', 'DO', 'JM', 'TT', 'BS', 'BB'],
        privacy: ['Brazil: Lei Geral de Proteção de Dados (LGPD, Law 13.709/2018)', 'Mexico: Federal Law on Protection of Personal Data Held by Private Parties', 'Argentina: Law 25.326; Colombia: Law 1581 of 2012; Chile: Law 19.628 (and its 2024 replacement)'],
        authority: 'Brazil: ANPD. Others: the national data protection authority',
        consumer: ['Each country\'s consumer-protection law'],
        moneyAndSanctions: ['National anti-money-laundering laws and FATF standards'],
        property: ['Foreclosure and auction rules are national'],
    },
]

/** The block that applies to a country code (falls back to none, so the page shows every region). */
export function regionForCountry(code: string): LegalRegion | undefined {
    const c = code.toUpperCase()
    return LEGAL_REGIONS.find((r) => r.countries.includes(c))
}
