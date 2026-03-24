import { GoogleGenerativeAI } from '@google/generative-ai'

class GeminiAIService {
    private genAI: GoogleGenerativeAI | null = null
    private modelName = 'gemini-1.5-flash'

    private getModel() {
        if (!this.genAI) {
            const apiKey = process.env.GEMINI_API_KEY
            if (!apiKey) {
                throw new Error('GEMINI_API_KEY environment variable is not set')
            }
            this.genAI = new GoogleGenerativeAI(apiKey)
        }
        return this.genAI.getGenerativeModel({ model: this.modelName })
    }

    async generatePropertyDescription(params: {
        title: string
        location: string
        bedrooms: number
        bathrooms: number
        squareMeters: number
        propertyType: string
        amenities?: string[]
        price?: number
        currency?: string
        additionalFeatures?: string
    }): Promise<string> {
        try {
            const model = this.getModel()

            const amenitiesText = params.amenities?.length
                ? `Amenities include: ${params.amenities.join(', ')}.`
                : ''

            const priceText = params.price
                ? `Listed at ${params.currency || 'UGX'} ${params.price.toLocaleString()}.`
                : ''

            const prompt = `You are a professional real estate copywriter. Write a compelling, engaging property description for the following property listing. Keep it between 100-150 words. Be enthusiastic but accurate.

Property Details:
- Title: ${params.title}
- Location: ${params.location}
- Type: ${params.propertyType}
- Bedrooms: ${params.bedrooms}
- Bathrooms: ${params.bathrooms}
- Size: ${params.squareMeters} square meters
${amenitiesText}
${priceText}
${params.additionalFeatures ? `Additional Features: ${params.additionalFeatures}` : ''}

Write only the description, no headings or labels.`

            const result = await model.generateContent(prompt)
            const response = result.response
            return response.text().trim()
        } catch (error: any) {
            console.error('[GeminiAI] Error generating property description:', error)
            throw new Error(`Failed to generate description: ${error.message}`)
        }
    }

    async generatePropertyHighlights(params: {
        description: string
        amenities?: string[]
    }): Promise<string[]> {
        try {
            const model = this.getModel()

            const prompt = `Based on the following property description, extract 5 key selling points or highlights as a JSON array of strings. Return only the JSON array, no other text.

Description: ${params.description}
Amenities: ${params.amenities?.join(', ') || 'Not specified'}

Return format: ["highlight 1", "highlight 2", "highlight 3", "highlight 4", "highlight 5"]`

            const result = await model.generateContent(prompt)
            const text = result.response.text().trim()

            // Parse JSON array
            const jsonMatch = text.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0])
            }

            return ['Great location', 'Modern amenities', 'Spacious rooms', 'Quality finishes', 'Excellent value']
        } catch (error: any) {
            console.error('[GeminiAI] Error generating highlights:', error)
            return ['Great location', 'Modern amenities', 'Spacious rooms', 'Quality finishes', 'Excellent value']
        }
    }

    async answerPropertyQuestion(params: {
        propertyTitle: string
        propertyDescription: string
        question: string
    }): Promise<string> {
        try {
            const model = this.getModel()

            const prompt = `You are a helpful real estate assistant for REALEVR Estates. Answer the following question about a property based on the information provided. Be concise and helpful.

Property: ${params.propertyTitle}
Description: ${params.propertyDescription}

Question: ${params.question}

Answer:`

            const result = await model.generateContent(prompt)
            return result.response.text().trim()
        } catch (error: any) {
            console.error('[GeminiAI] Error answering question:', error)
            throw new Error(`Failed to answer question: ${error.message}`)
        }
    }
}

export const geminiAI = new GeminiAIService()
