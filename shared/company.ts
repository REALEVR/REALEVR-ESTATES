/**
 * Who is behind the platform, as the legal pages state it. Fill the empty fields in once the details exist
 * (a registered company number, a registered address, a Personal Data Protection Office registration number);
 * a line is printed only when it has a value, so no page ever shows a made-up registration or street address.
 */
export const COMPANY = {
    tradingName: 'RealEVR Estates',
    country: 'Uganda',
    city: 'Kampala',
    /** Legal name as registered, if different from the trading name. */
    legalName: '',
    registrationNumber: '',
    registeredAddress: '',
    taxNumber: '',
    /** Registration with Uganda's Personal Data Protection Office. */
    pdpoRegistrationNumber: '',
    emails: { support: 'support@realevr.com', legal: 'legal@realevr.com', privacy: 'privacy@realevr.com', partners: 'partners@realevr.com' },
    whatsapp: '+256 771 891 323',
} as const

/** The identity lines to print under "Contact", skipping anything not set. */
export function companyLines(): string[] {
    const c = COMPANY
    return [
        c.legalName && c.legalName !== c.tradingName ? `${c.legalName} (trading as ${c.tradingName})` : c.tradingName,
        c.registeredAddress || `${c.city}, ${c.country}`,
        c.registrationNumber ? `Company registration no. ${c.registrationNumber}` : '',
        c.taxNumber ? `Tax no. ${c.taxNumber}` : '',
        c.pdpoRegistrationNumber ? `Registered with Uganda's Personal Data Protection Office, no. ${c.pdpoRegistrationNumber}` : '',
    ].filter(Boolean)
}
