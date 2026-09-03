import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MessagesInbox from '@/components/messaging/MessagesInbox'
import WhatsappThreadsPanel from '@/components/messaging/WhatsappThreadsPanel'
import { MessageSquare } from 'lucide-react'

/** Admin's "Messages" sidebar destination — every agent's support thread
 * (any admin can see and reply to any of them, see server/gene/messaging.ts),
 * plus a read-only view of WhatsApp conversations, in one place. */
export default function AdminMessages() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-6 w-6 text-accent" /> Messages
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Agent support conversations and WhatsApp threads, in one inbox.
                </p>
            </div>

            <Tabs defaultValue="agent-support">
                <TabsList>
                    <TabsTrigger value="agent-support">Agent Support</TabsTrigger>
                    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                </TabsList>
                <TabsContent value="agent-support" className="mt-4">
                    <MessagesInbox kindFilter="agent_admin" emptyLabel="No agents have started a support conversation yet." />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-4">
                    <WhatsappThreadsPanel />
                </TabsContent>
            </Tabs>
        </div>
    )
}
