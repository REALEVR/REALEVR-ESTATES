import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import type { WaitlistEntry, WaitlistRegistrationInput } from '../models/Waitlist'
import {
    sendConfirmationEmail,
    sendInviteEmail,
    sendStatusUpdateEmail,
    sendVerificationReminderEmail,
} from '../services/waitlistEmailService'

const router = Router()

// ─── Validation Schemas ───────────────────────────────────────────────────────

const WaitlistRegistrationSchema = z.object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    email: z.string().email('Invalid email address'),
    phoneNumber: z.string().optional(),
    propertyType: z.enum(['residential', 'commercial', 'land', 'mixed']),
    propertyCount: z.number().int().min(1).optional(),
    location: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    interest: z.enum(['quick-sale', 'long-term-rent', 'short-term-rent', 'all']),
    estimatedPropertyValue: z.string().optional(),
    businessDescription: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
    socialMedia: z
        .object({
            instagram: z.string().optional(),
            facebook: z.string().optional(),
            linkedin: z.string().optional(),
        })
        .optional(),
    heardAbout: z.enum(['social-media', 'referral', 'search', 'ad', 'other']),
    referralCode: z.string().optional(),
})

// ─── Token Expiry Constants ───────────────────────────────────────────────────

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24
const INVITE_TOKEN_EXPIRY_HOURS = 24 * 7 // 7 days

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

function getTokenExpiry(hours: number): string {
    const expiry = new Date()
    expiry.setHours(expiry.getHours() + hours)
    return expiry.toISOString()
}

async function findEntryByEmail(email: string): Promise<WaitlistEntry | null> {
    const items = await DynamoDBUtils.scanTable(
        TABLES.WAITLIST,
        'email = :email',
        { ':email': email.toLowerCase() }
    )
    return (items[0] as WaitlistEntry) ?? null
}

async function findEntryById(id: string): Promise<WaitlistEntry | null> {
    const item = await DynamoDBUtils.getItem(TABLES.WAITLIST, { id })
    return (item as WaitlistEntry) ?? null
}

async function getWaitlistPosition(id: string): Promise<{ position: number; total: number }> {
    const allEntries = await DynamoDBUtils.scanTable(TABLES.WAITLIST)
    const active = allEntries
        .filter((e) => e.status !== 'rejected')
        .sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())
    const position = active.findIndex((e) => e.id === id) + 1
    return { position: position > 0 ? position : active.length, total: active.length }
}

// ─── Public Routes ────────────────────────────────────────────────────────────

// POST /api/waitlist/register
router.post('/register', async (req: Request, res: Response) => {
    try {
        const parseResult = WaitlistRegistrationSchema.safeParse(req.body)
        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: parseResult.error.flatten().fieldErrors,
            })
        }

        const data: WaitlistRegistrationInput = parseResult.data as WaitlistRegistrationInput

        // Check for duplicate email
        const existing = await findEntryByEmail(data.email)
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'This email is already on the waitlist.',
            })
        }

        const id = `wl_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
        const now = new Date().toISOString()
        const verificationToken = generateToken()
        const verificationTokenExpiry = getTokenExpiry(VERIFICATION_TOKEN_EXPIRY_HOURS)

        const entry: WaitlistEntry = {
            id,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email.toLowerCase(),
            phoneNumber: data.phoneNumber,
            propertyType: data.propertyType,
            propertyCount: data.propertyCount,
            location: data.location,
            city: data.city,
            state: data.state,
            country: data.country,
            interest: data.interest,
            estimatedPropertyValue: data.estimatedPropertyValue,
            businessDescription: data.businessDescription,
            website: data.website,
            socialMedia: data.socialMedia,
            heardAbout: data.heardAbout,
            referralCode: data.referralCode,
            status: 'pending',
            emailVerified: false,
            verificationToken,
            verificationTokenExpiry,
            createdAt: now,
            updatedAt: now,
        }

        await DynamoDBUtils.putItem(TABLES.WAITLIST, entry as unknown as Record<string, unknown>)

        // Send confirmation email (non-blocking)
        sendConfirmationEmail(entry).catch((err) =>
            console.error('[Waitlist] Failed to send confirmation email:', err)
        )

        const { position, total } = await getWaitlistPosition(id)

        return res.status(201).json({
            success: true,
            waitlistId: id,
            position,
            total,
            message: 'Successfully added to waitlist! Please check your email to verify your address.',
        })
    } catch (error: any) {
        console.error('[Waitlist] Registration error:', error)
        return res.status(500).json({ success: false, message: 'Failed to register. Please try again.' })
    }
})

// GET /api/waitlist/verify/:token
router.get('/verify/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params
        const allEntries = await DynamoDBUtils.scanTable(
            TABLES.WAITLIST,
            'verificationToken = :token',
            { ':token': token }
        )
        const entry = allEntries[0] as WaitlistEntry | undefined
        if (!entry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification token.' })
        }

        if (entry.emailVerified) {
            return res.status(200).json({ success: true, message: 'Email already verified.' })
        }

        if (entry.verificationTokenExpiry && new Date(entry.verificationTokenExpiry) < new Date()) {
            return res.status(400).json({ success: false, message: 'Verification token has expired. Please request a new one.' })
        }

        await DynamoDBUtils.updateItem(
            TABLES.WAITLIST,
            { id: entry.id },
            'SET emailVerified = :verified, #st = :status, updatedAt = :now, verificationToken = :null',
            {
                ':verified': true,
                ':status': 'verified',
                ':now': new Date().toISOString(),
                ':null': null,
            },
            { '#st': 'status' }
        )

        const baseUrl = process.env.APP_BASE_URL || ''
        return res.redirect(`${baseUrl}/waitlist?verified=true`)
    } catch (error: any) {
        console.error('[Waitlist] Verify error:', error)
        return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' })
    }
})

// GET /api/waitlist/status/:email
router.get('/status/:email', async (req: Request, res: Response) => {
    try {
        const email = decodeURIComponent(req.params.email).toLowerCase()
        const entry = await findEntryByEmail(email)
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Email not found on waitlist.' })
        }

        const { position, total } = await getWaitlistPosition(entry.id)

        return res.json({
            success: true,
            status: entry.status,
            emailVerified: entry.emailVerified,
            position,
            total,
        })
    } catch (error: any) {
        console.error('[Waitlist] Status error:', error)
        return res.status(500).json({ success: false, message: 'Failed to retrieve status.' })
    }
})

// POST /api/waitlist/resend-verification
router.post('/resend-verification', async (req: Request, res: Response) => {
    try {
        const { email } = req.body
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' })
        }

        const entry = await findEntryByEmail(email)
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Email not found on waitlist.' })
        }

        if (entry.emailVerified) {
            return res.status(400).json({ success: false, message: 'Email is already verified.' })
        }

        const newToken = generateToken()
        const newExpiry = getTokenExpiry(VERIFICATION_TOKEN_EXPIRY_HOURS)

        await DynamoDBUtils.updateItem(
            TABLES.WAITLIST,
            { id: entry.id },
            'SET verificationToken = :token, verificationTokenExpiry = :expiry, updatedAt = :now',
            {
                ':token': newToken,
                ':expiry': newExpiry,
                ':now': new Date().toISOString(),
            }
        )

        const updatedEntry = { ...entry, verificationToken: newToken }
        sendVerificationReminderEmail(updatedEntry).catch((err) =>
            console.error('[Waitlist] Failed to send verification reminder:', err)
        )

        return res.json({ success: true, message: 'Verification email resent. Please check your inbox.' })
    } catch (error: any) {
        console.error('[Waitlist] Resend verification error:', error)
        return res.status(500).json({ success: false, message: 'Failed to resend verification email.' })
    }
})

// GET /api/waitlist/invite/:token  — click invite link
router.get('/invite/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params
        const allEntries = await DynamoDBUtils.scanTable(
            TABLES.WAITLIST,
            'inviteToken = :token',
            { ':token': token }
        )
        const entry = allEntries[0] as WaitlistEntry | undefined
        if (!entry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired invite token.' })
        }

        if (entry.inviteTokenExpiry && new Date(entry.inviteTokenExpiry) < new Date()) {
            return res.status(400).json({ success: false, message: 'Invite link has expired. Please contact support.' })
        }

        const baseUrl = process.env.APP_BASE_URL || ''
        return res.redirect(
            `${baseUrl}/auth?invite=${token}&email=${encodeURIComponent(entry.email)}&firstName=${encodeURIComponent(entry.firstName)}&lastName=${encodeURIComponent(entry.lastName)}`
        )
    } catch (error: any) {
        console.error('[Waitlist] Invite error:', error)
        return res.status(500).json({ success: false, message: 'Failed to process invite.' })
    }
})

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// Middleware to check admin role
function adminOnly(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' })
    }
    const user = req.user as { role?: string } | undefined
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' })
    }
    next()
}

// GET /api/admin/waitlist  — list all entries
router.get('/admin/list', adminOnly, async (req: Request, res: Response) => {
    try {
        const { status, propertyType, city, page = '1', limit = '20' } = req.query
        let items = await DynamoDBUtils.scanTable(TABLES.WAITLIST)

        if (status) items = items.filter((e) => e.status === status)
        if (propertyType) items = items.filter((e) => e.propertyType === propertyType)
        if (city) items = items.filter((e) => (e.city as string)?.toLowerCase().includes((city as string).toLowerCase()))

        items.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())

        const pageNum = parseInt(page as string, 10)
        const limitNum = parseInt(limit as string, 10)
        const start = (pageNum - 1) * limitNum
        const paginated = items.slice(start, start + limitNum)

        return res.json({
            success: true,
            total: items.length,
            page: pageNum,
            limit: limitNum,
            data: paginated,
        })
    } catch (error: any) {
        console.error('[Waitlist Admin] List error:', error)
        return res.status(500).json({ success: false, message: error.message })
    }
})

// GET /api/admin/waitlist/analytics
router.get('/admin/analytics', adminOnly, async (req: Request, res: Response) => {
    try {
        const items = await DynamoDBUtils.scanTable(TABLES.WAITLIST)

        const byStatus: Record<string, number> = {}
        const byPropertyType: Record<string, number> = {}
        const byCity: Record<string, number> = {}
        const byHeardAbout: Record<string, number> = {}

        for (const item of items) {
            byStatus[item.status as string] = (byStatus[item.status as string] || 0) + 1
            if (item.propertyType) byPropertyType[item.propertyType as string] = (byPropertyType[item.propertyType as string] || 0) + 1
            if (item.city) byCity[item.city as string] = (byCity[item.city as string] || 0) + 1
            if (item.heardAbout) byHeardAbout[item.heardAbout as string] = (byHeardAbout[item.heardAbout as string] || 0) + 1
        }

        const verifiedCount = items.filter((e) => e.emailVerified).length

        return res.json({
            success: true,
            totalRegistrations: items.length,
            verificationRate: items.length > 0 ? Math.round((verifiedCount / items.length) * 100) : 0,
            byStatus,
            byPropertyType,
            byCity,
            byHeardAbout,
        })
    } catch (error: any) {
        console.error('[Waitlist Admin] Analytics error:', error)
        return res.status(500).json({ success: false, message: error.message })
    }
})

// PATCH /api/admin/waitlist/:id  — update status/notes
router.patch('/admin/:id', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { status, notes } = req.body

        const entry = await findEntryById(id)
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Waitlist entry not found.' })
        }

        const updates: Record<string, unknown> = { ':now': new Date().toISOString() }
        const parts: string[] = ['updatedAt = :now']

        if (status) {
            updates[':status'] = status
            parts.push('#st = :status')
        }
        if (notes !== undefined) {
            updates[':notes'] = notes
            parts.push('notes = :notes')
        }

        const updated = await DynamoDBUtils.updateItem(
            TABLES.WAITLIST,
            { id },
            `SET ${parts.join(', ')}`,
            updates,
            status ? { '#st': 'status' } : undefined
        )

        if (status) {
            const updatedEntry = { ...entry, status, notes: notes ?? entry.notes }
            sendStatusUpdateEmail(updatedEntry, `Your status has been updated to: ${status}.`).catch((err) =>
                console.error('[Waitlist Admin] Status email error:', err)
            )
        }

        return res.json({ success: true, data: updated })
    } catch (error: any) {
        console.error('[Waitlist Admin] Update error:', error)
        return res.status(500).json({ success: false, message: error.message })
    }
})

// POST /api/admin/waitlist/:id/send-invite
router.post('/admin/:id/send-invite', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { message } = req.body

        const entry = await findEntryById(id)
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Waitlist entry not found.' })
        }

        const inviteToken = generateToken()
        const inviteTokenExpiry = getTokenExpiry(INVITE_TOKEN_EXPIRY_HOURS)

        await DynamoDBUtils.updateItem(
            TABLES.WAITLIST,
            { id },
            'SET inviteToken = :token, inviteTokenExpiry = :expiry, #st = :status, sentAtTimestamp = :now, updatedAt = :now',
            {
                ':token': inviteToken,
                ':expiry': inviteTokenExpiry,
                ':status': 'invited',
                ':now': new Date().toISOString(),
            },
            { '#st': 'status' }
        )

        const updatedEntry = { ...entry, inviteToken, status: 'invited' as const }
        const sent = await sendInviteEmail(updatedEntry, message)

        return res.json({ success: sent, inviteToken })
    } catch (error: any) {
        console.error('[Waitlist Admin] Send invite error:', error)
        return res.status(500).json({ success: false, message: error.message })
    }
})

// DELETE /api/admin/waitlist/:id
router.delete('/admin/:id', adminOnly, async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const entry = await findEntryById(id)
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Waitlist entry not found.' })
        }

        await DynamoDBUtils.deleteItem(TABLES.WAITLIST, { id })
        return res.json({ success: true, message: 'Entry removed from waitlist.' })
    } catch (error: any) {
        console.error('[Waitlist Admin] Delete error:', error)
        return res.status(500).json({ success: false, message: error.message })
    }
})

export default router
