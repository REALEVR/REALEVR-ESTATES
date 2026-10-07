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

// A provider that says "bad key", "no credits" or "that model is gone" will say the same thing on the next request, so it is
// left alone for a while instead of being tried (and waited for) on every message. Other failures are tried again at once.
const RESTING = new Map<AiProvider, number>()
const REST_MS: Record<'bad' | 'limit', number> = { bad: 10 * 60_000, limit: 60_000 }

export function isProviderResting(provider: AiProvider, now = Date.now()): boolean {
    const until = RESTING.get(provider)
    if (until === undefined) return false
    if (until <= now) {
        RESTING.delete(provider)
        return false
    }
    return true
}

/** Rest a provider after a failure that will repeat. Returns how it was classified (for the log). */
export function noteProviderFailure(provider: AiProvider, status: number | undefined, body = '', now = Date.now()): 'bad' | 'limit' | null {
    const text = body.toLowerCase()
    let kind: 'bad' | 'limit' | null = null
    if (status === 401 || status === 403 || status === 404) kind = 'bad'
    else if (status === 429) kind = /insufficient_quota|no credits|credit_balance|billing/.test(text) ? 'bad' : 'limit'
    if (kind) RESTING.set(provider, now + REST_MS[kind])
    return kind
}

export function resetProviderRest(): void {
    RESTING.clear()
}

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
            const body = await response.text()
            noteProviderFailure('anthropic', response.status, body)
            console.error('[gene/ai-provider] Anthropic error', response.status, body)
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
            const body = await response.text()
            noteProviderFailure('openai', response.status, body)
            console.error('[gene/ai-provider] OpenAI error', response.status, body)
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

// Google retires Gemini models without much warning ("no longer available to new users"). GEMINI_MODEL picks one; otherwise these
// are tried in order, then whatever flash models Google lists as current, and the first that works is kept until the server restarts.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
let geminiWorking: string | null = null
let discovered: { at: number; names: string[] } | null = null

function geminiCandidates(): string[] {
    const wanted = (process.env.GEMINI_MODEL || '').trim()
    return Array.from(new Set([...(geminiWorking ? [geminiWorking] : []), ...(wanted ? [wanted] : []), ...GEMINI_MODELS]))
}

const versionOf = (name: string) => parseFloat(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0')

/** The plain "flash" models Google lists right now, newest first (asked at most once an hour). */
export async function discoverGeminiModels(ai: { models: { list: (params?: object) => Promise<AsyncIterable<{ name?: string; supportedActions?: string[] }>> } }): Promise<string[]> {
    if (discovered && Date.now() - discovered.at < 3_600_000) return discovered.names
    try {
        const names: string[] = []
        for await (const m of await ai.models.list({ config: { pageSize: 100 } })) {
            const name = String(m.name ?? '').replace(/^models\//, '')
            const can = !m.supportedActions || m.supportedActions.includes('generateContent')
            if (/^gemini-\d+(\.\d+)?-flash$/.test(name) && can) names.push(name)
        }
        names.sort((x, y) => versionOf(y) - versionOf(x))
        discovered = { at: Date.now(), names }
        return names
    } catch (err) {
        console.error('[gene/ai-provider] Could not ask Google which Gemini models exist:', err)
        return []
    }
}

export function resetGeminiState(): void {
    geminiWorking = null
    discovered = null
}

type GeminiClient = NonNullable<ReturnType<typeof getGeminiClient>>

export async function callGeminiWith(ai: GeminiClient, systemPrompt: string, history: AiChatMessage[], message: string, maxTokens = 500): Promise<string | null> {
    const prompt = [
        ...history.slice(-8).map((m) => `${m.role === 'user' ? 'Visitor' : 'You'}: ${m.text}`),
        `Visitor: ${message}`,
    ].join('\n')
    const tried = new Set<string>()
    let busy = false
    let gone = false

    const attemptModel = async (model: string): Promise<{ reply?: string; stop?: boolean }> => {
        tried.add(model)
        // A busy model (500/503) gets one more try a moment later.
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: { systemInstruction: systemPrompt, maxOutputTokens: Math.max(maxTokens, 256) },
                })
                const reply = (response.text || '').trim()
                if (reply.length > 0) {
                    geminiWorking = model
                    return { reply }
                }
                return { stop: true }
            } catch (err) {
                const status = Number((err as { status?: number })?.status) || undefined
                if (status === 500 || status === 503) {
                    busy = true
                    console.error(`[gene/ai-provider] Gemini ${model} is busy (${status})${attempt === 0 ? '; trying it once more' : '; moving on'}`)
                    if (attempt === 0) await new Promise((r) => setTimeout(r, 700))
                    continue
                }
                if (status === 404) {
                    gone = true
                    if (geminiWorking === model) geminiWorking = null
                    console.error(`[gene/ai-provider] Gemini model ${model} is not available; trying the next one`)
                    return {}
                }
                // Bad key, no quota, anything else: no other model will do better.
                noteProviderFailure('gemini', status, String((err as Error)?.message ?? ''))
                console.error('[gene/ai-provider] Gemini call failed:', err)
                return { stop: true }
            }
        }
        return {}
    }

    for (const model of geminiCandidates()) {
        const r = await attemptModel(model)
        if (r.reply) return r.reply
        if (r.stop) return null
    }
    // None of the models we know worked. If any was simply gone, ask Google what exists now.
    if (gone) {
        for (const model of await discoverGeminiModels(ai as never)) {
            if (tried.has(model)) continue
            const r = await attemptModel(model)
            if (r.reply) return r.reply
            if (r.stop) return null
        }
    }
    // Busy is not broken: leave it alone for a minute, not ten.
    noteProviderFailure('gemini', busy ? 429 : 404)
    console.error(busy ? '[gene/ai-provider] Gemini is too busy right now' : '[gene/ai-provider] Gemini has none of the models we know or list; set GEMINI_MODEL to a current one')
    return null
}

async function callGemini(systemPrompt: string, history: AiChatMessage[], message: string, maxTokens = 500): Promise<string | null> {
    const ai = getGeminiClient()
    if (!ai) return null
    return callGeminiWith(ai, systemPrompt, history, message, maxTokens)
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
    if (!isProviderResting('anthropic')) {
        const anthropicReply = await callAnthropic(systemPrompt, history, message, maxTokens)
        if (anthropicReply) return { reply: anthropicReply, provider: 'anthropic' }
    }

    if (!isProviderResting('openai')) {
        const openAiReply = await callOpenAi(systemPrompt, history, message, maxTokens)
        if (openAiReply) return { reply: openAiReply, provider: 'openai' }
    }

    if (!isProviderResting('gemini')) {
        const geminiReply = await callGemini(systemPrompt, history, message, maxTokens)
        if (geminiReply) return { reply: geminiReply, provider: 'gemini' }
    }

    return null
}
