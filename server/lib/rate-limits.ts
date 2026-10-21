/**
 * Where the request-rate limits apply. Kept in one place so the numbers can be read, argued with and changed together.
 * Limits are per visitor address (and, for sign-in, per account being tried) over a window; see rateLimit in security.ts.
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express'
import { rateLimit } from './security'

const MIN = 60_000

/** Run `limiter` only for requests whose path matches and whose method is not a plain read. */
function when(match: RegExp, limiter: RequestHandler, opts: { includeReads?: boolean } = {}): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!match.test(req.path)) return next()
        if (!opts.includeReads && (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS')) return next()
        return limiter(req, res, next)
    }
}

const bodyField = (field: string) => (req: Request): string | null => {
    const v = (req.body as Record<string, unknown> | undefined)?.[field]
    return typeof v === 'string' && v ? v.trim().toLowerCase().slice(0, 120) : null
}

export function applyRateLimits(app: Express): void {
    // Guessing passwords: per address, and per account whoever is trying it.
    app.use('/api', when(/^\/login$/, rateLimit({ name: 'login', windowMs: 15 * MIN, max: 20, ipMax: 120, key: bodyField('username'), message: 'Too many sign-in attempts. Wait 15 minutes and try again.' })))
    // Making accounts and sending email/SMS: cost money and enable abuse.
    app.use('/api', when(/^\/register$/, rateLimit({ name: 'register', windowMs: 60 * MIN, max: 30, message: 'Too many sign-ups from this connection. Try again later.' })))
    app.use('/api', when(/^\/resend-verification$/, rateLimit({ name: 'resend', windowMs: 60 * MIN, max: 6, ipMax: 30, key: bodyField('email') })))
    app.use('/api', when(/^\/verify-token$/, rateLimit({ name: 'verify-token', windowMs: 15 * MIN, max: 40 })))
    app.use('/api', when(/^\/gene\/self-serve\/[^/]+\/(send-verification|resend-otp|verify-otp)$/, rateLimit({ name: 'otp', windowMs: 15 * MIN, max: 30 })))
    // Things that cost money per call (AI answers, speech) or open a conversation with a person.
    app.use('/api', when(/^\/gene\/(chat|speak)$/, rateLimit({ name: 'ai', windowMs: 10 * MIN, max: 120 })))
    app.use('/api', when(/^\/ai(\/|$)/, rateLimit({ name: 'ai2', windowMs: 10 * MIN, max: 80 })))
    // Each payment prompt rings a phone and costs the gateway a call.
    app.use('/api', when(/^\/payment\/iotec\/collect$/, rateLimit({ name: 'collect', windowMs: 10 * MIN, max: 30, message: 'Too many payment requests. Wait a few minutes.' })))
    // Public forms.
    app.use(
        '/api',
        when(
            /^\/(crypto\/requests|data-requests|partner-program\/apply|auction-bidder\/apply|gene\/messages\/start|properties\/[^/]+\/tour-report|gene\/leads\/[^/]+\/ping)$/,
            rateLimit({ name: 'forms', windowMs: 15 * MIN, max: 60 })
        )
    )
    // Everything else that changes data: a generous ceiling that only a script would hit. Machine callers are exempt.
    const exempt = /^\/(payments\/inbound|country-spots\/inbound\/|rum$|gene\/whatsapp\/webhook|payment\/iotec)/
    const ceiling = rateLimit({ name: 'writes', windowMs: MIN, max: 600 })
    app.use('/api', (req, res, next) => (exempt.test(req.path) || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' ? next() : ceiling(req, res, next)))
}
