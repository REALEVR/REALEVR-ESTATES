import { useEffect, useState } from 'react'
import { useWhatsappThreads, useWhatsappThreadMessages } from '@/hooks/useMessaging'
import { Loader2, MessageCircle } from 'lucide-react'

/**
 * Read-only view of WhatsApp conversations (server/gene/whatsapp-concierge.ts's
 * message log), surfaced in the same inbox shape as in-app conversations —
 * admin-only, see server/gene/messaging.ts's whatsapp-threads endpoint for
 * why. Replying here isn't supported: the WhatsApp concierge already has
 * its own automated + human-escalation reply path
 * (GET /api/gene/whatsapp/inbox in whatsapp.ts) — this is purely "see what's
 * being said on that channel without leaving the dashboard."
 */
export default function WhatsappThreadsPanel() {
    const threadsQuery = useWhatsappThreads(true)
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

    const threads = threadsQuery.data ?? []

    useEffect(() => {
        if (selectedPhone === null && threads.length > 0) {
            setSelectedPhone(threads[0].phone)
        }
    }, [threads, selectedPhone])

    const messagesQuery = useWhatsappThreadMessages(selectedPhone)

    if (threadsQuery.isLoading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (threads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <MessageCircle className="h-8 w-8" />
                <p className="text-sm">No WhatsApp conversations yet.</p>
            </div>
        )
    }

    const selected = threads.find((t) => t.phone === selectedPhone) ?? null

    return (
        <div className="flex h-[560px] rounded-lg border border-border overflow-hidden bg-card">
            <div className="w-64 shrink-0 border-r border-border overflow-y-auto">
                {threads.map((t) => (
                    <button
                        key={t.phone}
                        type="button"
                        onClick={() => setSelectedPhone(t.phone)}
                        className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                            selectedPhone === t.phone ? 'bg-accent/10' : 'hover:bg-secondary'
                        }`}
                    >
                        <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.phone}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessagePreview}</p>
                    </button>
                ))}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
                {selected ? (
                    <>
                        <div className="border-b border-border px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">{selected.name}</p>
                            <p className="text-xs text-muted-foreground">{selected.phone} · {selected.messageCount} messages</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                            {messagesQuery.isLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                (messagesQuery.data ?? []).map((m) => {
                                    const fromCustomer = m.direction === 'inbound'
                                    return (
                                        <div key={m.id} className={`flex ${fromCustomer ? 'justify-start' : 'justify-end'}`}>
                                            <div
                                                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                                                    fromCustomer ? 'bg-secondary text-foreground' : 'bg-accent text-accent-foreground'
                                                }`}
                                            >
                                                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                        <div className="border-t border-border p-3 text-xs text-muted-foreground text-center">
                            Read-only — reply from WhatsApp directly, or via the escalation inbox for human handoffs.
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a thread</div>
                )}
            </div>
        </div>
    )
}
