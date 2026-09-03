import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useConversations, useConversationMessages, useSendMessage, type Conversation } from '@/hooks/useMessaging'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, MessageSquare } from 'lucide-react'

/**
 * Generic two-way conversation inbox — the conversation list on the left,
 * the selected thread + a compose box on the right. Reused as-is by:
 *  - AgentDashboard.tsx's "Messages" tab (tenant_agent threads where the
 *    agent is a participant, plus their own agent_admin support thread)
 *  - a tenant's own "Messages" view (tenant_agent threads they started)
 *  - AdminMessagesPage.tsx's "Agent Support" tab (every agent_admin
 *    thread, since an admin can see all of them — see canAccess() in
 *    server/gene/messaging.ts)
 *
 * `kindFilter` narrows which of the caller's visible conversations show up
 * here, since e.g. an agent's own inbox shouldn't be cluttered by every
 * other agent's admin-support thread even though the API only enforces who
 * can *access* a conversation, not who sees it in which UI.
 */
export default function MessagesInbox({
    kindFilter,
    emptyLabel = 'No conversations yet.',
}: {
    kindFilter?: Conversation['kind']
    emptyLabel?: string
}) {
    const { user } = useAuth()
    const conversationsQuery = useConversations(true)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [draft, setDraft] = useState('')

    const conversations = (conversationsQuery.data ?? []).filter((c) => !kindFilter || c.kind === kindFilter)

    // Keep a conversation selected once the list loads; select the most
    // recently active one by default.
    useEffect(() => {
        if (selectedId === null && conversations.length > 0) {
            setSelectedId(conversations[0].id)
        }
    }, [conversations, selectedId])

    const threadQuery = useConversationMessages(selectedId)
    const sendMessage = useSendMessage(selectedId)

    const handleSend = async () => {
        const text = draft.trim()
        if (!text || selectedId === null) return
        setDraft('')
        try {
            await sendMessage.mutateAsync(text)
        } catch {
            setDraft(text) // put it back so nothing is silently lost
        }
    }

    const otherPartyName = (conversation: Conversation) => {
        if (!user) return 'Conversation'
        if (conversation.kind === 'agent_admin') {
            return conversation.participantIds[0] === user.id ? 'RealEVR Admin' : conversation.participantNames[conversation.participantIds[0]]
        }
        const otherId = conversation.participantIds.find((id) => id !== user.id)
        return (otherId !== undefined && conversation.participantNames[otherId]) || 'Conversation'
    }

    if (conversationsQuery.isLoading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8" />
                <p className="text-sm">{emptyLabel}</p>
            </div>
        )
    }

    const selected = conversations.find((c) => c.id === selectedId) ?? null

    return (
        <div className="flex h-[560px] rounded-lg border border-border overflow-hidden bg-card">
            {/* Conversation list */}
            <div className="w-64 shrink-0 border-r border-border overflow-y-auto">
                {conversations.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                            selectedId === c.id ? 'bg-accent/10' : 'hover:bg-secondary'
                        }`}
                    >
                        <p className="text-sm font-medium text-foreground truncate">{otherPartyName(c)}</p>
                        {c.propertyTitle && <p className="text-xs text-muted-foreground truncate">{c.propertyTitle}</p>}
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessagePreview || 'No messages yet'}</p>
                    </button>
                ))}
            </div>

            {/* Thread */}
            <div className="flex-1 flex flex-col min-w-0">
                {selected ? (
                    <>
                        <div className="border-b border-border px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">{otherPartyName(selected)}</p>
                            {selected.propertyTitle && <p className="text-xs text-muted-foreground">Re: {selected.propertyTitle}</p>}
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                            {threadQuery.isLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                (threadQuery.data?.messages ?? []).map((m) => {
                                    const mine = m.senderId === user?.id
                                    return (
                                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                            <div
                                                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                                                    mine ? 'bg-accent text-accent-foreground' : 'bg-secondary text-foreground'
                                                }`}
                                            >
                                                {!mine && <p className="text-[11px] font-medium opacity-70 mb-0.5">{m.senderName}</p>}
                                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                        <form
                            className="border-t border-border p-3 flex items-end gap-2"
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleSend()
                            }}
                        >
                            <Textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Write a message…"
                                className="min-h-[44px] max-h-32 resize-none"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                            />
                            <Button type="submit" size="icon" disabled={!draft.trim() || sendMessage.isPending}>
                                {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                        Select a conversation
                    </div>
                )}
            </div>
        </div>
    )
}
