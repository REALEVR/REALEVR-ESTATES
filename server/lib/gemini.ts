import { GoogleGenAI } from '@google/genai'

// Shared across every Gemini-backed feature (AI Assistant, description generation,
// conversational sign-in, daily social content) so there's one place that knows how
// to construct the client and one env var to configure.
export function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return null
    return new GoogleGenAI({ apiKey })
}
