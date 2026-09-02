import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Minimize2 } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'

interface ChatMessage {
    role: 'user' | 'bot'
    text: string
}

const WELCOME_MESSAGE: ChatMessage = {
    role: 'bot',
    text: "Hello! I'm the RealEVR Assistant. Ask me about properties, VR tours, or how booking works.",
}

// Floating AI chat widget. All Gemini calls are proxied through /api/ai/chat so the
// API key never reaches the browser.
export default function AIAssistant() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)

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
            const res = await apiRequest('POST', '/api/ai/chat', { message })
            const data = await res.json()
            setMessages((prev) => [...prev, { role: 'bot', text: data.reply }])
        } catch (error: any) {
            const notConfigured = String(error?.message || '').includes('503')
            setMessages((prev) => [
                ...prev,
                {
                    role: 'bot',
                    text: notConfigured
                        ? "The AI Assistant isn't configured yet. Please contact support directly for now."
                        : "I'm having trouble connecting right now. Please try again shortly.",
                },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF5A5F] text-white shadow-xl transition-transform hover:scale-110"
                aria-label="Open AI Assistant"
            >
                <Bot size={26} />
            </button>
        )
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#FF5A5F] px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                    <Bot size={18} />
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
