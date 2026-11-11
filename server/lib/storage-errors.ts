import type { Response } from 'express'

// AWS SDK error names that mean "our credentials were rejected", not "the
// request was bad". When these happen every listing read fails until someone
// fixes the AWS variables on the host, so we answer 503 (service unavailable)
// instead of a generic 500 and log a line that says what to fix.
const AWS_CREDENTIAL_ERROR_NAMES = new Set([
    'UnrecognizedClientException',
    'InvalidClientTokenId',
    'InvalidSignatureException',
    'ExpiredTokenException',
    'ExpiredToken',
    'CredentialsProviderError',
])

const CREDENTIAL_RETRY_AFTER_SECONDS = 300

export interface StorageErrorInfo {
    status: 500 | 503
    credentialProblem: boolean
    errorName: string
    errorMessage: string
}

export function classifyStorageError(error: unknown): StorageErrorInfo {
    const err = (error ?? {}) as { name?: unknown; message?: unknown; Code?: unknown }
    const errorName = typeof err.name === 'string' ? err.name : typeof err.Code === 'string' ? err.Code : 'UnknownError'
    const errorMessage = typeof err.message === 'string' ? err.message : String(error)
    const credentialProblem =
        AWS_CREDENTIAL_ERROR_NAMES.has(errorName) || /security token included in the request is invalid/i.test(errorMessage)
    return { status: credentialProblem ? 503 : 500, credentialProblem, errorName, errorMessage }
}

// Log a failed listing read with its real cause and send a safe response.
// The client only ever sees `publicMessage`; AWS details stay in server logs.
export function sendStorageReadError(res: Response, route: string, error: unknown, publicMessage: string): void {
    const info = classifyStorageError(error)
    if (info.credentialProblem) {
        console.error(
            `[storage] ${route} failed: AWS rejected the credentials (${info.errorName}). ` +
                'Check AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and any stale AWS_SESSION_TOKEN) on the host.'
        )
        res.set('Retry-After', String(CREDENTIAL_RETRY_AFTER_SECONDS))
    } else {
        console.error(`[storage] ${route} failed (${info.errorName}): ${info.errorMessage}`)
    }
    res.status(info.status).json({ message: publicMessage })
}
