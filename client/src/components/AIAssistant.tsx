import { useEffect, useRef, useState } from 'react'
import { Send, X, Minimize2 } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import logoIcon from '@/assets/logo-icon.png'

interface ChatMessage {
    role: 'user' | 'bot'
    text: string
}

const WELCOME_MESSAGE: ChatMessage = {
    role: 'bot',
    text: "Hello! I'm the RealEVR Assistant. Ask me about properties, VR tours, or how booking works.",
}

// sessionId ties this widget's conversation to the same GENE backend/history
// the "My Agent" chat tab and the WhatsApp concierge use - persisted in
// localStorage so refreshing the page (or closing and reopening the widget)
// doesn't lose the thread.
const SESSION_STORAGE_KEY = 'realevr_gene_chat_session_id'

function getOrCreateSessionId(): string {
    try {
        const existing = localStorage.getItem(SESSION_STORAGE_KEY)
        if (existing) return existing
        const fresh = crypto.randomUUID()
        localStorage.setItem(SESSION_STORAGE_KEY, fresh)
        return fresh
    } catch {
        // Storage unavailable (private browsing, etc.) - a per-load id still
        // lets this one conversation work, it just won't persist a reload.
        return crypto.randomUUID()
    }
}

// Floating AI chat widget - talks to the same GENE assistant backend
// (/api/gene/chat) as the signed-in "My Agent" chat tab and the WhatsApp
// concierge, instead of a separate, single-provider implementation. That
// backend tries Claude, then ChatGPT, then Gemini (server/gene/ai-provider.ts)
// and always has a real per-intent fallback reply even if none of the three
// are configured, so there's no "not configured" error state to show here
// anymore - every reply is a real one.
export default function AIAssistant() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    const sessionIdRef = useRef<string>()
    if (!sessionIdRef.current) sessionIdRef.current = getOrCreateSessionId()

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isOpen])

    const handleSend = async () => {
        const message = input.trim()
        if (!message || isLoading) return

        setInput('')
        setMessages((prev) => [...prev, { role: 'user', text: message }])
        setIsLoading(true)

        try {
            const res = await apiRequest('POST', '/api/gene/chat', { message, sessionId: sessionIdRef.current })
            const data = await res.json()
            if (typeof data.sessionId === 'string') sessionIdRef.current = data.sessionId
            setMessages((prev) => [...prev, { role: 'bot', text: data.reply }])
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'bot', text: "I'm having trouble connecting right now. Please try again shortly." },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF5A5F] p-2.5 text-white shadow-xl transition-transform hover:scale-110"
                aria-label="Open AI Assistant"
            >
                <img src={logoIcon} alt="" className="h-full w-full object-contain brightness-0 invert" />
            </button>
        )
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#FF5A5F] px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                    <img src={logoIcon} alt="" className="h-5 w-5 object-contain brightness-0 invert" />
                    <span className="font-semibold text-sm">RealEVR Assistant</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsOpen(false)} aria-label="Minimize">
                        <Minimize2 size={16} />
                    </button>
                    <button onClick={() => setIsOpen(false)} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                m.role === 'user' ? 'bg-[#FF5A5F] text-white' : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                            {m.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-400">Typing...</div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-gray-100 p-3">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about a property..."
                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]/30"
                />
                <Button size="icon" className="rounded-full" onClick={handleSend} disabled={isLoading}>
                    <Send size={16} />
                </Button>
            </div>
        </div>
    )
}
