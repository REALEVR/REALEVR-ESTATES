/**
 * GENE Platform — shared multi-provider AI reply helper.
 *
 * Every conversational surface in this app (the public floating assistant,
 * GENE's public chat, and the signed-in personal agent) used to each carry
 * its own copy of "call Anthropic" — three near-identical implementations,
 * and only one provider, so a single missing/invalid/rate-limited
 * ANTHROPIC_API_KEY silently degraded all of them to canned replies at
 * once. This module replaces all three: one place that knows how to get a
 * real AI reply, tries multiple providers in order, and never throws.
 *
 * Order: Anthropic Claude -> OpenAI (ChatGPT) -> Google Gemini -> null.
 * Each of the three env vars below is independently optional; whichever
 * are actually set get tried, in that order, and the first one to return a
 * real reply wins. Callers get back either `{ reply, provider }` or `null`
 * (meaning: none configured, or all failed) - null means "fall back to
 * your own canned/templated response," never "show a broken/unconfigured
 * error to a visitor." That graceful-degrade contract is unchanged from
 * before; what's new is three chances to avoid needing it instead of one.
 */

import { getGeminiClient } from '../lib/gemini'

export interface AiChatMessage {
    role: 'user' | 'assistant'
    text: string
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

async function callAnthropic(systemPrompt: string, history: AiChatMessage[], message: string, maxTokens = 500): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null

    try {
        const messages = [
            ...history.slice(-8).map((m) => ({ role: m.role, content: m.text })),
            { role: 'user' as const, content: message },
        ]
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                // Set ANTHROPIC_MODEL to change it (e.g. a larger model for richer answers).
                model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
                max_tokens: maxTokens,
                system: systemPrompt,
                messages,
            }),
        })
        if (!response.ok) {
            console.error('[gene/ai-provider] Anthropic error', response.status, await response.text())
            return null
        }
        const data: any = await response.json()
        const textBlocks: string[] = Array.isArray(data?.content)
            ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text)
            : []
        const reply = textBlocks.join('\n').trim()
        return reply.length > 0 ? reply : null
    } catch (err) {
        console.error('[gene/ai-provider] Anthropic call failed:', err)
        return null
    }
}

async function callOpenAi(systemPrompt: string, history: AiChatMessage[], message: string, maxTokens = 500): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return null

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
            { role: 'user', content: message },
        ]
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: maxTokens,
                messages,
            }),
        })
        if (!response.ok) {
            console.error('[gene/ai-provider] OpenAI error', response.status, await response.text())
            return null
        }
        const data: any = await response.json()
        const reply = typeof data?.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content.trim() : ''
        return reply.length > 0 ? reply : null
    } catch (err) {
        console.error('[gene/ai-provider] OpenAI call failed:', err)
        return null
    }
}

async function callGemini(systemPrompt: string, history: AiChatMessage[], message: string, maxTokens = 500): Promise<string | null> {
    const ai = getGeminiClient()
    if (!ai) return null

    try {
        const prompt = [
            ...history.slice(-8).map((m) => `${m.role === 'user' ? 'Visitor' : 'You'}: ${m.text}`),
            `Visitor: ${message}`,
        ].join('\n')
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction: systemPrompt, maxOutputTokens: Math.max(maxTokens, 256) },
        })
        const reply = (response.text || '').trim()
        return reply.length > 0 ? reply : null
    } catch (err) {
        console.error('[gene/ai-provider] Gemini call failed:', err)
        return null
    }
}

/**
 * Tries Claude, then ChatGPT, then Gemini - first one actually configured
 * AND successful wins. `history` is recent conversation turns (both AI
 * providers get up to the last 8; Gemini has no separate "system" message
 * concept in this SDK call shape, so its history is folded into the prompt
 * text instead of a system field, same effect).
 */
export async function getAiReply(
    systemPrompt: string,
    message: string,
    history: AiChatMessage[] = [],
    /** A spoken answer is a sentence or two: asking for fewer tokens makes it arrive sooner. */
    maxTokens = 500
): Promise<{ reply: string; provider: AiProvider } | null> {
    const anthropicReply = await callAnthropic(systemPrompt, history, message, maxTokens)
    if (anthropicReply) return { reply: anthropicReply, provider: 'anthropic' }

    const openAiReply = await callOpenAi(systemPrompt, history, message, maxTokens)
    if (openAiReply) return { reply: openAiReply, provider: 'openai' }

    const geminiReply = await callGemini(systemPrompt, history, message, maxTokens)
    if (geminiReply) return { reply: geminiReply, provider: 'gemini' }

    return null
}
