import type { Express, Request, Response } from 'express'
import { geminiAI } from '../services/geminiAI.js'

export function registerAIRoutes(app: Express): void {
    // POST /api/ai/generate-description
    app.post('/api/ai/generate-description', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const {
                title,
                location,
                bedrooms,
                bathrooms,
                squareMeters,
                propertyType,
                amenities,
                price,
                currency,
                additionalFeatures,
            } = req.body

            if (!title || !location || !propertyType) {
                return res.status(400).json({
                    message: 'title, location, and propertyType are required',
                })
            }

            const description = await geminiAI.generatePropertyDescription({
                title,
                location,
                bedrooms: bedrooms || 1,
                bathrooms: bathrooms || 1,
                squareMeters: squareMeters || 50,
                propertyType,
                amenities,
                price,
                currency,
                additionalFeatures,
            })

            return res.json({ description })
        } catch (error: any) {
            if (error.message?.includes('GEMINI_API_KEY')) {
                return res.status(503).json({ message: 'AI service not configured' })
            }
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/ai/generate-highlights
    app.post('/api/ai/generate-highlights', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const { description, amenities } = req.body

            if (!description) {
                return res.status(400).json({ message: 'description is required' })
            }

            const highlights = await geminiAI.generatePropertyHighlights({ description, amenities })
            return res.json({ highlights })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/ai/answer-question
    app.post('/api/ai/answer-question', async (req: Request, res: Response) => {
        try {
            const { propertyTitle, propertyDescription, question } = req.body

            if (!propertyTitle || !propertyDescription || !question) {
                return res.status(400).json({
                    message: 'propertyTitle, propertyDescription, and question are required',
                })
            }

            const answer = await geminiAI.answerPropertyQuestion({
                propertyTitle,
                propertyDescription,
                question,
            })

            return res.json({ answer })
        } catch (error: any) {
            if (error.message?.includes('GEMINI_API_KEY')) {
                return res.status(503).json({ message: 'AI service not configured' })
            }
            return res.status(500).json({ message: error.message })
        }
    })

    console.log('✅ AI routes registered')
}
