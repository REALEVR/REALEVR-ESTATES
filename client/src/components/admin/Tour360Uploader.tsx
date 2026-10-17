import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ImagePlus, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { checkPanorama, readImageSize, roomNameFromFilename, slugifyRoomName } from '@/lib/panorama'
import {
    deleteDraftRoom,
    DraftRoom,
    fetchDraftRooms,
    finalizeTour,
    UploadError,
    uploadRoomPhoto,
} from '@/lib/room-capture-api'

type ItemStatus = 'checking' | 'invalid' | 'ready' | 'uploading' | 'qualified' | 'needs_retake' | 'error'

interface Item {
    id: string
    name: string
    status: ItemStatus
    message?: string
    progress: number
    /** Local file for new picks; absent for rooms that were already on the server. */
    file?: File
    preview?: string
    slug?: string
    attempts?: number
}

const MAX_ATTEMPTS = 3
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let counter = 0
const nextId = () => `p${Date.now().toString(36)}${counter++}`

interface Tour360UploaderProps {
    propertyId: number
    /** Called with the new tour link once the tour is built and live. */
    onPublished: (tourUrl: string) => void
}

/**
 * Add a tour from 360-camera photos in one go: pick (or drop) every panorama, check them instantly, upload them one after the
 * other with progress and automatic retries, then publish. Rooms already uploaded earlier are loaded back from the server, so
 * a refresh or a second visit does not lose anything.
 *
 * Uploads run one at a time on purpose: rooms join the tour in the order they were uploaded, so the first photo picked stays the
 * first room (the entrance), which a parallel upload would shuffle.
 */
export default function Tour360Uploader({ propertyId, onPublished }: Tour360UploaderProps) {
    const [items, setItems] = useState<Item[]>([])
    const [loadingDraft, setLoadingDraft] = useState(true)
    const [dragging, setDragging] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [publishProgress, setPublishProgress] = useState(0)
    const [publishMessage, setPublishMessage] = useState('')
    const [publishError, setPublishError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const itemsRef = useRef<Item[]>([])
    itemsRef.current = items
    const runningRef = useRef(false)
    const stopListeningRef = useRef<null | (() => void)>(null)

    const patch = useCallback((id: string, change: Partial<Item>) => {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)))
    }, [])

    // Pick up rooms uploaded in an earlier visit.
    useEffect(() => {
        let cancelled = false
        setLoadingDraft(true)
        fetchDraftRooms(propertyId)
            .then((rooms: DraftRoom[]) => {
                if (cancelled) return
                setItems((prev) => {
                    const known = new Set(prev.map((p) => p.slug).filter(Boolean))
                    const fromServer: Item[] = rooms
                        .filter((r) => !known.has(r.slug))
                        .map((r) => ({
                            id: `s-${r.slug}`,
                            name: r.name,
                            slug: r.slug,
                            status: r.status === 'qualified' ? 'qualified' : 'needs_retake',
                            progress: 1,
                            preview: r.thumb,
                            message: r.status === 'qualified' ? undefined : r.rejectionReasons.join(' '),
                        }))
                    return [...fromServer, ...prev]
                })
            })
            .finally(() => !cancelled && setLoadingDraft(false))
        return () => {
            cancelled = true
            stopListeningRef.current?.()
        }
    }, [propertyId])

    // Object URLs hold memory until released.
    useEffect(
        () => () => {
            itemsRef.current.forEach((it) => it.file && it.preview && URL.revokeObjectURL(it.preview))
        },
        []
    )

    const addFiles = useCallback(
        (fileList: FileList | File[] | null) => {
            if (!fileList) return
            const files = Array.from(fileList)
            if (files.length === 0) return
            const taken = new Set(itemsRef.current.map((i) => i.name))
            const fresh: Item[] = files.map((file, index) => {
                const name = roomNameFromFilename(file.name, taken, itemsRef.current.length + index + 1)
                taken.add(name)
                return { id: nextId(), name, status: 'checking', progress: 0, file, preview: URL.createObjectURL(file) }
            })
            setItems((prev) => [...prev, ...fresh])
            fresh.forEach(async (it) => {
                try {
                    const { width, height } = await readImageSize(it.file!)
                    const verdict = checkPanorama({ width, height, bytes: it.file!.size, type: it.file!.type, name: it.file!.name })
                    patch(it.id, verdict.ok ? { status: 'ready', message: `${width}×${height}` } : { status: 'invalid', message: verdict.reason })
                } catch {
                    patch(it.id, { status: 'invalid', message: 'We could not read this picture. Try exporting it as a JPG.' })
                }
            })
        },
        [patch]
    )

    const nameProblemIn = useCallback((item: Item, list: Item[]): string | null => {
        const slug = slugifyRoomName(item.name)
        if (!item.name.trim()) return 'Give this room a name.'
        const clash = list.find((o) => o.id !== item.id && (o.slug ?? slugifyRoomName(o.name)) === slug)
        return clash ? `Another room is already called "${clash.name}".` : null
    }, [])
    const nameProblem = useCallback((item: Item) => nameProblemIn(item, items), [items, nameProblemIn])

    const uploadOne = useCallback(
        async (item: Item) => {
            if (!item.file) return
            patch(item.id, { status: 'uploading', progress: 0, message: undefined })
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    const result = await uploadRoomPhoto(propertyId, item.file, item.name, {
                        onProgress: (f) => patch(item.id, { progress: f }),
                    })
                    patch(item.id, {
                        status: result.status === 'success' ? 'qualified' : 'needs_retake',
                        progress: 1,
                        slug: result.room.slug,
                        message:
                            result.status === 'success'
                                ? result.room.warnings.join(' ') || undefined
                                : result.room.rejectionReasons.join(' ') || 'This photo could not be used.',
                    })
                    return
                } catch (err) {
                    const e = err as UploadError
                    if (e.retryable && attempt < MAX_ATTEMPTS) {
                        patch(item.id, { message: `Connection problem, trying again (${attempt}/${MAX_ATTEMPTS - 1})…` })
                        await wait(1200 * attempt)
                        continue
                    }
                    patch(item.id, { status: 'error', message: e.message || 'Upload failed.' })
                    return
                }
            }
        },
        [patch, propertyId]
    )

    const startUploads = useCallback(async () => {
        if (runningRef.current) return
        runningRef.current = true
        try {
            // One at a time, in the order picked (see the component note).
            for (;;) {
                const next = itemsRef.current.find((i) => i.status === 'ready' && i.file && !nameProblemIn(i, itemsRef.current))
                if (!next) break
                await uploadOne(next)
            }
        } finally {
            runningRef.current = false
        }
    }, [nameProblemIn, uploadOne])

    const remove = async (item: Item) => {
        if (item.status === 'uploading') return
        setItems((prev) => prev.filter((i) => i.id !== item.id))
        if (item.file && item.preview) URL.revokeObjectURL(item.preview)
        if (item.slug) {
            try {
                await deleteDraftRoom(propertyId, item.slug)
            } catch {
                // The room is gone from the screen; a leftover draft room can be removed on the next visit.
            }
        }
    }

    const retry = (item: Item) => {
        patch(item.id, { status: 'ready', message: undefined, progress: 0 })
        setTimeout(startUploads, 0)
    }

    const readyCount = items.filter((i) => i.status === 'ready').length
    const qualifiedCount = items.filter((i) => i.status === 'qualified').length
    const busy = items.some((i) => i.status === 'uploading' || i.status === 'checking')
    const hasNameProblems = items.some((i) => i.status === 'ready' && nameProblem(i))

    const publish = async () => {
        setPublishing(true)
        setPublishError('')
        setPublishProgress(0)
        setPublishMessage('Starting…')
        stopListeningRef.current = await finalizeTour(propertyId, {
            onProgress: (p, m) => {
                setPublishProgress(p)
                setPublishMessage(m)
            },
            onDone: (url) => {
                setPublishing(false)
                setItems((prev) => {
                    prev.forEach((i) => i.file && i.preview && URL.revokeObjectURL(i.preview))
                    return []
                })
                onPublished(url)
            },
            onError: (m) => {
                setPublishing(false)
                setPublishError(m)
            },
        })
    }

    const dropZone = useMemo(
        () => (
            <div
                onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    addFiles(e.dataTransfer.files)
                }}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    dragging ? 'border-accent bg-accent/10' : 'border-border bg-muted/20'
                }`}
            >
                <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 font-medium">Add your 360 photos</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Pick all of them at once, one photo per room. Start with the entrance: the first photo is where the tour opens.
                </p>
                <Button type="button" className="mt-3" onClick={() => inputRef.current?.click()} data-testid="pick-360-photos">
                    <Upload className="mr-2 h-4 w-4" /> Choose 360 photos
                </Button>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    data-testid="360-file-input"
                    onChange={(e) => {
                        addFiles(e.target.files)
                        e.target.value = ''
                    }}
                />
            </div>
        ),
        [addFiles, dragging]
    )

    return (
        <div className="space-y-4">
            {dropZone}

            <details className="rounded-md border bg-card px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Tips for a good 360 photo</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>Put the camera on a tripod at about chest height, in the middle of the room.</li>
                    <li>Step out of the picture (or hide behind a door) and use the timer or the app.</li>
                    <li>Switch the lights on and open the curtains. One 360 photo per room.</li>
                    <li>Export as JPG at full size. A 360 photo is exactly twice as wide as it is tall.</li>
                </ul>
            </details>

            {loadingDraft && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking for photos you already uploaded…
                </p>
            )}

            {items.length > 0 && (
                <ul className="space-y-2" aria-label="Rooms">
                    {items.map((item) => {
                        const problem = item.status === 'ready' ? nameProblem(item) : null
                        const editable = item.status === 'ready' || item.status === 'invalid' || item.status === 'checking'
                        return (
                            <li key={item.id} className="flex gap-3 rounded-md border p-3" data-testid="room-row" data-status={item.status}>
                                <div className="h-16 w-24 shrink-0 overflow-hidden rounded bg-muted">
                                    {item.preview && <img src={item.preview} alt="" className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        {editable && item.status !== 'invalid' ? (
                                            <Input
                                                value={item.name}
                                                onChange={(e) => patch(item.id, { name: e.target.value.slice(0, 60) })}
                                                aria-label="Room name"
                                                className="h-9"
                                            />
                                        ) : (
                                            <span className="truncate font-medium">{item.name}</span>
                                        )}
                                        <StatusBadge status={item.status} />
                                    </div>
                                    {item.status === 'uploading' && <Progress value={Math.round(item.progress * 100)} className="h-1.5" />}
                                    {problem && <p className="text-xs text-destructive">{problem}</p>}
                                    {item.message && !problem && (
                                        <p
                                            className={`text-xs ${
                                                item.status === 'invalid' || item.status === 'needs_retake' || item.status === 'error'
                                                    ? 'text-destructive'
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            {item.message}
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-start gap-1">
                                    {item.status === 'error' && (
                                        <Button type="button" size="sm" variant="outline" onClick={() => retry(item)}>
                                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Remove ${item.name}`}
                                        disabled={item.status === 'uploading'}
                                        onClick={() => remove(item)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {items.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                    {readyCount > 0 && (
                        <Button type="button" className="w-full" onClick={startUploads} disabled={busy || hasNameProblems} data-testid="upload-360">
                            {busy ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" /> Upload {readyCount} photo{readyCount === 1 ? '' : 's'}
                                </>
                            )}
                        </Button>
                    )}

                    {publishing ? (
                        <div className="space-y-2">
                            <Progress value={publishProgress} />
                            <p className="text-sm text-muted-foreground">{publishMessage}</p>
                        </div>
                    ) : (
                        <Button
                            type="button"
                            variant={readyCount > 0 ? 'outline' : 'default'}
                            className="w-full"
                            disabled={qualifiedCount === 0 || busy || readyCount > 0}
                            onClick={publish}
                            data-testid="publish-360"
                        >
                            <Check className="mr-2 h-4 w-4" />
                            Publish tour ({qualifiedCount} room{qualifiedCount === 1 ? '' : 's'})
                        </Button>
                    )}
                    {readyCount > 0 && qualifiedCount > 0 && (
                        <p className="text-xs text-muted-foreground">Upload the new photos first, then publish.</p>
                    )}
                    {publishError && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Could not publish</AlertTitle>
                            <AlertDescription>{publishError}</AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: ItemStatus }) {
    switch (status) {
        case 'checking':
            return <Badge variant="outline">Checking…</Badge>
        case 'invalid':
            return <Badge variant="destructive">Can't use</Badge>
        case 'ready':
            return <Badge variant="outline">Ready</Badge>
        case 'uploading':
            return <Badge variant="outline">Uploading</Badge>
        case 'qualified':
            return <Badge className="bg-green-100 text-green-700">Good</Badge>
        case 'needs_retake':
            return <Badge variant="destructive">Retake</Badge>
        case 'error':
            return <Badge variant="destructive">Failed</Badge>
    }
}
