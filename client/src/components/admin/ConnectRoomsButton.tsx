import { useCallback, useEffect, useRef, useState } from 'react'
import { DoorOpen, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'

type DoorLinks = Record<string, { to: string; yaw: number; pitch: number }[]>

interface ConnectRoomsButtonProps {
    propertyId: number
    tourUrl: string
    size?: 'sm' | 'default'
    className?: string
}

/**
 * Connect the rooms of a phone-captured tour with doors.
 *
 * Opens the tour itself in "edit" mode (the shared viewer, server/templates/
 * tour-viewer/tour-app.js, with ?edit=1): the agent turns to a doorway, puts the
 * crosshair on it and taps the room it leads to. The viewer only reports what was
 * placed (postMessage); the saving happens here, through the authenticated
 * PUT /api/upload/tour-links/:id, which also builds the preview pictures.
 *
 * Only offered for tours captured with the phone flow, which are the only ones
 * with a tour.json to attach doors to: the button asks the server first and
 * explains instead of opening something that cannot work.
 */
export default function ConnectRoomsButton({ propertyId, tourUrl, size = 'sm', className }: ConnectRoomsButtonProps) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [checking, setChecking] = useState(false)
    const [unavailable, setUnavailable] = useState<string | null>(null)
    const [links, setLinks] = useState<DoorLinks | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [frameKey, setFrameKey] = useState(0)
    const frameRef = useRef<HTMLIFrameElement>(null)
    const dirty = links !== null

    const begin = async () => {
        setChecking(true)
        setUnavailable(null)
        try {
            const res = await apiRequest('GET', `/api/upload/tour-links/${propertyId}`)
            const info = await res.json()
            if (!info.editable) {
                setUnavailable(info.reason || 'Rooms can only be connected on tours captured with the phone flow.')
                toast({ title: "Can't connect rooms", description: info.reason || 'This tour was not captured with the phone flow.', variant: 'destructive' })
                return
            }
            setLinks(null)
            setSaved(false)
            setOpen(true)
        } catch (err: any) {
            toast({ title: "Couldn't open the editor", description: String(err?.message ?? err), variant: 'destructive' })
        } finally {
            setChecking(false)
        }
    }

    // Doors placed in the embedded viewer arrive here.
    useEffect(() => {
        if (!open) return
        const onMessage = (event: MessageEvent) => {
            if (event.source !== frameRef.current?.contentWindow) return
            const data = event.data
            if (!data || data.source !== 'realevr-tour' || data.action !== 'links-changed' || typeof data.links !== 'object') return
            setLinks(data.links as DoorLinks)
            setSaved(false)
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [open])

    const save = useCallback(async () => {
        if (!links) return
        setSaving(true)
        try {
            await apiRequest('PUT', `/api/upload/tour-links/${propertyId}`, { links })
            setSaved(true)
            setLinks(null)
            toast({ title: 'Doors saved', description: 'Visitors will see them the next time they open the tour.' })
        } catch (err: any) {
            const raw = String(err?.message ?? err)
            let message = raw
            try {
                message = JSON.parse(raw.replace(/^\d+:\s*/, '')).message ?? raw
            } catch {
                /* plain text error */
            }
            toast({ title: "Couldn't save the doors", description: message, variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }, [links, propertyId, toast])

    const close = () => {
        if (dirty && !window.confirm('You have doors that are not saved yet. Close without saving?')) return
        setOpen(false)
        setLinks(null)
    }

    // The editing view loads tour.json, so after a save it has to be fetched again to show the saved state.
    const editUrl = `${tourUrl}${tourUrl.includes('?') ? '&' : '?'}edit=1&v=${frameKey}`

    return (
        <>
            <Button type="button" size={size} variant="outline" className={className} onClick={begin} disabled={checking} title={unavailable ?? undefined}>
                {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DoorOpen className="mr-1 h-3 w-3" />}
                Connect rooms
            </Button>

            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
                <DialogContent className="flex h-[90vh] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>Connect the rooms</DialogTitle>
                        <DialogDescription>
                            Visitors will see a blinking door wherever you place one, with a preview of the room behind it. In each room, turn
                            until the + sits on the doorway, then tap the room it leads to. Add the door back in the other room too.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-black">
                        <iframe
                            ref={frameRef}
                            key={frameKey}
                            src={editUrl}
                            title="Place doors between rooms"
                            className="h-full w-full"
                            allow="fullscreen; gyroscope; accelerometer"
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => window.open(tourUrl, '_blank')}>
                            <ExternalLink className="mr-1 h-3 w-3" />
                            See it as a visitor
                        </Button>
                        <div className="flex items-center gap-2">
                            {saved && <span className="text-sm text-emerald-600">Saved</span>}
                            {saved && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setFrameKey((k) => k + 1)}>
                                    Reload editor
                                </Button>
                            )}
                            <Button type="button" onClick={save} disabled={!dirty || saving}>
                                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                Save doors
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
