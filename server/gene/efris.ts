/**
 * EFRIS (Uganda Revenue Authority's Electronic Fiscal Receipting and
 * Invoicing Solution) — issues RealEVR's OWN e-invoice for the UGX 1,000
 * RentRail service fee, under RealEVR's own TIN, via EFRIS's Direct API.
 *
 * SCOPE, deliberately narrow — builds on the reasoning in rentrail.ts's top
 * doc comment: the RENT itself is the landlord's income, not RealEVR's, so
 * RentRail still never invoices the rent — a landlord's own EFRIS receipt
 * for that stays the tenant's responsibility to collect from them directly
 * (see rentrail.ts's deliverReceipt). The SERVICE FEE is different: it's a
 * real sale RealEVR itself makes to the tenant, and RealEVR is the taxpayer
 * of record for it, so an EFRIS invoice for just that fee, under RealEVR's
 * own TIN, is legally clean in a way invoicing the rent would not be.
 *
 * STATUS: scaffolding only — NOT wired to a live EFRIS environment. RealEVR
 * is not yet registered for EFRIS Direct API access (no TIN/device enrolled
 * for API-based invoicing) as of this writing. With no EFRIS_* env vars
 * set, issueServiceFeeInvoice below always returns 'not_configured' —
 * exactly the same "feature exists, honestly inert until configured"
 * pattern already used for IOTEC_WALLET_ID elsewhere in this codebase (see
 * rentrail.ts's attemptAutoDisbursement) — never a fabricated success.
 *
 * WHY THE ACTUAL WIRE CALL ISN'T IMPLEMENTED YET: EFRIS's Direct API wraps
 * every request in a signed envelope (an interface code — e.g. T101 for
 * invoice upload — plus a device-specific session key and a signature)
 * that has to match URA's published technical specification exactly to be
 * accepted; get it wrong and URA either rejects the call outright or,
 * worse, silently accepts something that isn't a valid fiscal document.
 * That specification, plus a UAT/sandbox credential to verify an
 * implementation against, isn't available in this environment. Rather than
 * guess at a tax authority's signing scheme, this module is fully wired
 * into RentRail's payment lifecycle (see rentrail.ts's
 * POST /payments/:id/collected) so turning this on later needs zero
 * changes anywhere else — no new call sites, no data-model changes, no
 * admin-UI changes — but callEfrisDirectApi below deliberately throws
 * until someone:
 *   1. Completes URA's EFRIS Direct API / device enrollment for RealEVR's
 *      own TIN, and
 *   2. Replaces callEfrisDirectApi with the real request-signing
 *      implementation, built against URA's actual technical specification
 *      and verified against a UAT credential before it ever touches
 *      production.
 */

export type EfrisInvoiceStatus = 'not_configured' | 'issued' | 'failed'

export interface EfrisInvoiceResult {
    status: EfrisInvoiceStatus
    invoiceNumber?: string // URA's Fiscal Document Number (FDN), once real
    verificationCode?: string
    qrCodeUrl?: string
    error?: string
    issuedAt?: string
}

export interface EfrisServiceFeeInvoiceInput {
    reference: string // RentRail's own txRef — used as the invoice's external reference
    amount: number // the service fee itself (SERVICE_FEE_UGX in rentrail.ts), never the rent
    currency: 'UGX'
    buyerName: string
    buyerPhone: string // canonical 256XXXXXXXXX
    description: string
}

/** Placeholder variable names — the exact set EFRIS's Direct API needs
 * (TIN, device number, an API key/certificate, possibly more) can only be
 * finalized against URA's real technical specification once RealEVR is
 * enrolled; treat these three as provisional, not a confirmed schema. */
function isEfrisConfigured(): boolean {
    return Boolean(process.env.EFRIS_TIN && process.env.EFRIS_DEVICE_NO && process.env.EFRIS_API_KEY)
}

/**
 * The only entry point this module exposes. Never throws, never fabricates
 * success — see this file's top doc comment for the full reasoning.
 */
export async function issueServiceFeeInvoice(input: EfrisServiceFeeInvoiceInput): Promise<EfrisInvoiceResult> {
    if (!isEfrisConfigured()) {
        return {
            status: 'not_configured',
            error: 'EFRIS_TIN / EFRIS_DEVICE_NO / EFRIS_API_KEY not configured — RealEVR is not yet registered for EFRIS Direct API access.',
        }
    }
    try {
        const { invoiceNumber, verificationCode, qrCodeUrl } = await callEfrisDirectApi(input)
        return { status: 'issued', invoiceNumber, verificationCode, qrCodeUrl, issuedAt: new Date().toISOString() }
    } catch (err: any) {
        return { status: 'failed', error: err?.message || 'Unexpected error issuing the EFRIS invoice.' }
    }
}

async function callEfrisDirectApi(
    _input: EfrisServiceFeeInvoiceInput
): Promise<{ invoiceNumber: string; verificationCode?: string; qrCodeUrl?: string }> {
    // Deliberately not implemented — see this file's top doc comment. The
    // env vars above being set means someone has started integration, not
    // that the wire protocol below is ready; this stays a loud, explicit
    // failure (never a silent fake success) until it's genuinely built
    // against URA's real spec and verified against a UAT credential.
    throw new Error(
        "EFRIS Direct API call not implemented — needs URA's Direct API technical specification (request signing/envelope format) plus a UAT credential to verify against before this can be completed safely. See server/gene/efris.ts."
    )
}
