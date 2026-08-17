import { Router } from 'express'
import { GoogleGenAI } from '@google/genai'

const router = Router()

const SYSTEM_INSTRUCTION =
    'You are a helpful real estate assistant for RealEVR Estates in Uganda. You help users find ' +
    'properties, explain the rental/purchase process, and answer questions about the platform. Be ' +
    'professional, friendly, and knowledgeable about Ugandan real estate (Kampala, Entebbe, Jinja, etc.). ' +
    'Mention features like immersive VR property tours, secure payments, and verified listings. Keep ' +
    'responses concise and helpful.'

function getClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return null
    return new GoogleGenAI({ apiKey })
}

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

export default router
