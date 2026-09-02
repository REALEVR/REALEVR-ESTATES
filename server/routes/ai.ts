import { Router } from 'express'
import { Type } from '@google/genai'
import { storage } from '../storage'
import { hashPassword } from '../auth'
import { getGeminiClient as getClient } from '../lib/gemini'

const router = Router()

const SYSTEM_INSTRUCTION =
    'You are a helpful real estate assistant for RealEVR Estates in Uganda. You help users find ' +
    'properties, explain the rental/purchase process, and answer questions about the platform. Be ' +
    'professional, friendly, and knowledgeable about Ugandan real estate (Kampala, Entebbe, Jinja, etc.). ' +
    'Mention features like immersive VR property tours, secure payments, and verified listings. Keep ' +
    'responses concise and helpful.'

// POST /api/ai/chat - Proxy a single-turn chat message to Gemini for the AI Assistant widget.
// The API key stays server-side; the client never sees it.
router.post('/chat', async (req: any, res: any) => {
    try {
        const { message } = req.body || {}
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'A message is required' })
        }

        const ai = getClient()
        if (!ai) {
            return res.status(503).json({
                message: 'AI Assistant is not configured. Set GEMINI_API_KEY on the server to enable it.',
            })
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        })

        res.json({ reply: response.text || "I'm sorry, I couldn't process that. Please try again." })
    } catch (error: any) {
        console.error('[AI] Chat error:', error)
        res.status(500).json({ message: 'AI Assistant is temporarily unavailable. Please try again later.' })
    }
})

// POST /api/ai/generate-description - Draft a listing description from title + location.
// Restricted to authenticated agents/admins, mirroring how property creation is gated elsewhere.
router.post('/generate-description', async (req: any, res: any) => {
    try {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        if (!['admin', 'agent'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Only agents and admins can generate descriptions' })
        }

        const { title, location, propertyType } = req.body || {}
        if (!title || !location) {
            return res.status(400).json({ message: 'Title and location are required' })
        }

        const ai = getClient()
        if (!ai) {
            return res.status(503).json({
                message: 'AI description generation is not configured. Set GEMINI_API_KEY on the server.',
            })
        }

        const prompt = `Generate a professional and enticing real estate listing description for a ${
            propertyType || 'property'
        } in Uganda with the following details:
Title: ${title}
Location: ${location}

Highlight modern features, security, and convenience. Keep it under 150 words and do not use markdown formatting.`

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        })

        res.json({ description: response.text || '' })
    } catch (error: any) {
        console.error('[AI] Description generation error:', error)
        res.status(500).json({ message: 'Failed to generate description. Please try again.' })
    }
})

// --- Conversational sign-in ---
// Instead of a standard signup form, a visitor chats with the AI, which extracts a
// structured profile (name/email/phone/role) as the conversation goes. The password
// itself is never sent to Gemini - it's collected by a dedicated UI step and only
// touches /onboarding-register below.

const ONBOARDING_SYSTEM_INSTRUCTION =
    "You are the friendly signup concierge for RealEVR Estates, a Ugandan real-estate platform with " +
    "immersive VR property tours. A new visitor needs an account before they can use the site. Have a " +
    "warm, natural conversation to collect exactly four things: their full name, email address, phone " +
    "number, and whether they're primarily here as a 'tenant' (looking to rent/buy) or a 'landlord' " +
    "(listing properties - map this to role \"agent\"). Ask for whatever is still missing, one or two " +
    "things at a time, don't interrogate. Confirm details back to them naturally. Merge anything you " +
    "learn into the profile you return - never drop previously-known fields. Once you have a plausible " +
    "full name, a valid-looking email, a phone number, and a role, say something warm like their profile " +
    "is ready and the last step is choosing a password, and set readyForPassword to true. Keep replies to " +
    "2-3 sentences."

const onboardingResponseSchema = {
    type: Type.OBJECT,
    properties: {
        reply: { type: Type.STRING },
        profile: {
            type: Type.OBJECT,
            properties: {
                fullName: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                role: { type: Type.STRING, enum: ['tenant', 'agent'] },
            },
        },
        readyForPassword: { type: Type.BOOLEAN },
    },
    required: ['reply', 'profile', 'readyForPassword'],
}

// POST /api/ai/onboarding-chat - one turn of the conversational sign-in.
router.post('/onboarding-chat', async (req: any, res: any) => {
    try {
        const { message, history, profile } = req.body || {}
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'A message is required' })
        }

        const ai = getClient()
        if (!ai) {
            return res.status(503).json({
                message: 'Conversational sign-in is not configured. Set GEMINI_API_KEY on the server.',
            })
        }

        const priorTurns: string[] = Array.isArray(history)
            ? history.slice(-10).map((h: any) => `${h.role === 'user' ? 'Visitor' : 'You'}: ${h.text}`)
            : []

        const prompt = [
            ...priorTurns,
            `Known profile so far: ${JSON.stringify(profile || {})}`,
            `Visitor: ${message}`,
        ].join('\n')

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: ONBOARDING_SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: onboardingResponseSchema,
            },
        })

        let parsed
        try {
            parsed = JSON.parse(response.text || '{}')
        } catch {
            parsed = { reply: response.text || "Sorry, could you say that again?", profile: profile || {}, readyForPassword: false }
        }

        // Merge rather than trust the model to always echo back known fields.
        const mergedProfile = { ...(profile || {}), ...(parsed.profile || {}) }
        Object.keys(mergedProfile).forEach((k) => {
            if (!mergedProfile[k]) delete mergedProfile[k]
        })

        res.json({
            reply: parsed.reply || "Could you tell me a bit more?",
            profile: mergedProfile,
            readyForPassword: Boolean(parsed.readyForPassword) && Boolean(mergedProfile.fullName && mergedProfile.email && mergedProfile.phone && mergedProfile.role),
        })
    } catch (error: any) {
        console.error('[AI] Onboarding chat error:', error)
        res.status(500).json({ message: 'Sign-in assistant is temporarily unavailable. Please try again.' })
    }
})

// POST /api/ai/onboarding-register - final step: create the account from the profile
// the conversation collected, plus a password entered directly (never via chat/Gemini).
router.post('/onboarding-register', async (req: any, res: any) => {
    try {
        const { fullName, email, phone, role, password, confirmPassword } = req.body || {}

        if (!fullName || !email || !phone || !role) {
            return res.status(400).json({ message: 'Missing profile information' })
        }
        if (!['tenant', 'agent'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' })
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' })
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' })
        }

        const existingEmailUser = await storage.getUserByEmail(email)
        if (existingEmailUser) {
            return res.status(400).json({ message: 'An account with that email already exists. Please sign in instead.' })
        }

        // Derive a unique username from the email's local part.
        const base = String(email).split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user'
        let username = base
        let suffix = 0
        while (await storage.getUserByUsername(username)) {
            suffix += 1
            username = `${base}${suffix}`
        }

        const hashed = await hashPassword(password)
        const user = await storage.createUser({
            username,
            password: hashed,
            email,
            fullName,
            phoneNumber: phone,
            role: role === 'agent' ? 'agent' : 'normal',
            isVerified: true, // created through the guided conversational flow; no separate email-link step
            subscriptionStatus: 'inactive',
        } as any)

        req.login(user, (err: any) => {
            if (err) {
                console.error('[AI] Onboarding auto-login error:', err)
                return res.status(500).json({ message: 'Account created, but automatic sign-in failed. Please log in.' })
            }
            const { password: _pw, ...safeUser } = user as any
            res.status(201).json({ user: safeUser })
        })
    } catch (error: any) {
        console.error('[AI] Onboarding register error:', error)
        res.status(500).json({ message: error.message || 'Failed to create account' })
    }
})

export default router
