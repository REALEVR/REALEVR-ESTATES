import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import {
    AlertCircle,
    Camera,
    Check,
    ChevronRight,
    Loader2,
    Plus,
    RotateCcw,
    Trash2,
    Upload,
    Video,
    X,
} from 'lucide-react'

interface RoomCaptureGuideProps {
    propertyId: number
    onPublished: (tourUrl: string) => void
}

type RoomStatus = 'not_started' | 'capturing' | 'qualified' | 'needs_retake'

interface RoomState {
    slug: string
    name: string
    status: RoomStatus
    warnings: string[]
    rejectionReasons: string[]
}

const DEFAULT_ROOMS = ['Living Room', 'Kitchen', 'Master Bedroom', 'Bathroom', 'Exterior / Entrance']
const MIN_PHOTOS_RECOMMENDED = 8
const COMPASS_BUCKETS = [0, 45, 90, 135, 180, 225, 270, 315]

function slugify(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'room'
    )
}

async function quickBrightnessCheck(canvas: HTMLCanvasElement): Promise<{ tooDark: boolean; tooBright: boolean }> {
    const ctx = canvas.getContext('2d')
    if (!ctx) return { tooDark: false, tooBright: false }
    const { width, height } = canvas
    const { data } = ctx.getImageData(0, 0, width, height)
    let sum = 0
    let count = 0
    // Sample every 40th pixel -- fast enough to run per-shot without a stutter.
    for (let i = 0; i < data.length; i += 160) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3
        count++
    }
    const mean = count > 0 ? sum / count : 128
    return { tooDark: mean < 30, tooBright: mean > 235 }
}

export default function RoomCaptureGuide({ propertyId, onPublished }: RoomCaptureGuideProps) {
    const { toast } = useToast()

    const [rooms, setRooms] = useState<RoomState[]>(
        DEFAULT_ROOMS.map((name) => ({ slug: slugify(name), name, status: 'not_started', warnings: [], rejectionReasons: [] }))
    )
    const [newRoomName, setNewRoomName] = useState('')
    const [activeRoom, setActiveRoom] = useState<RoomState | null>(null)

    // Live camera capture state
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const [cameraActive, setCameraActive] = useState(false)
    const [cameraError, setCameraError] = useState('')
    const [shots, setShots] = useState<Blob[]>([])
    const [filledBuckets, setFilledBuckets] = useState<Set<number>>(new Set())
    const [heading, setHeading] = useState<number | null>(null)
    const [orientationSupported, setOrientationSupported] = useState(false)
    const [lastShotWarning, setLastShotWarning] = useState('')
    const galleryInputRef = useRef<HTMLInputElement>(null)
    const videoInputRef = useRef<HTMLInputElement>(null)

    const [submitting, setSubmitting] = useState(false)

    // Finalize / SSE progress
    const [finalizing, setFinalizing] = useState(false)
    const [finalizeProgress, setFinalizeProgress] = useState(0)
    const [finalizeMessage, setFinalizeMessage] = useState('')
    const [finalizeError, setFinalizeError] = useState('')

    const qualifiedCount = rooms.filter((r) => r.status === 'qualified').length

    // --- Device orientation (compass) -------------------------------------
    useEffect(() => {
        if (!activeRoom) return

        const handler = (e: DeviceOrientationEvent) => {
            if (e.alpha == null) return
            setOrientationSupported(true)
            // `alpha` is compass heading (0-360) on most Android browsers when
            // absolute; treat missing `webkitCompassHeading` gracefully.
            const compass = (e as any).webkitCompassHeading ?? 360 - e.alpha
            setHeading(((compass % 360) + 360) % 360)
        }

        window.addEventListener('deviceorientationabsolute' as any, handler, true)
        window.addEventListener('deviceorientation', handler, true)
        return () => {
            window.removeEventListener('deviceorientationabsolute' as any, handler, true)
            window.removeEventListener('deviceorientation', handler, true)
        }
    }, [activeRoom])

    async function requestOrientationPermission() {
        const DOEAny = (window as any).DeviceOrientationEvent
        if (DOEAny && typeof DOEAny.requestPermission === 'function') {
            try {
                await DOEAny.requestPermission()
            } catch {
                // Permission denied -- capture still works, just without the compass overlay.
            }
        }
    }

    // --- Camera lifecycle ---------------------------------------------------
    const startCamera = useCallback(async () => {
        setCameraError('')
        try {
            await requestOrientationPermission()
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                await videoRef.current.play()
            }
            setCameraActive(true)
        } catch (err: any) {
            setCameraError(
                err?.name === 'NotAllowedError'
                    ? 'Camera access was denied. Allow camera access, or upload photos from your gallery instead.'
                    : `Could not access the camera (${err?.message || 'unknown error'}). Upload photos from your gallery instead.`
            )
            setCameraActive(false)
        }
    }, [])

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setCameraActive(false)
    }, [])

    useEffect(() => {
        return () => stopCamera()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function nearestBucket(h: number): number {
        return COMPASS_BUCKETS.reduce((best, b) => {
            const d = Math.min(Math.abs(h - b), 360 - Math.abs(h - b))
            const bestD = Math.min(Math.abs(h - best), 360 - Math.abs(h - best))
            return d < bestD ? b : best
        }, COMPASS_BUCKETS[0])
    }

    async function captureShot() {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return

        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const { tooDark, tooBright } = await quickBrightnessCheck(canvas)
        setLastShotWarning(tooDark ? 'That shot looks dark -- consider turning on more lights.' : tooBright ? 'That shot looks overexposed.' : '')

        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
        if (!blob) return

        setShots((prev) => [...prev, blob])
        if (heading != null) {
            setFilledBuckets((prev) => new Set(prev).add(nearestBucket(heading)))
        }
    }

    function openRoom(room: RoomState) {
        setActiveRoom(room)
        setShots([])
        setFilledBuckets(new Set())
        setLastShotWarning('')
        setRooms((prev) => prev.map((r) => (r.slug === room.slug ? { ...r, status: 'capturing' } : r)))
    }

    function closeRoom() {
        stopCamera()
        setActiveRoom(null)
    }

    function addGalleryPhotos(files: FileList | null) {
        if (!files) return
        setShots((prev) => [...prev, ...Array.from(files)])
    }

    async function submitRoom(video?: File) {
        if (!activeRoom) return
        if (!video && shots.length === 0) {
            toast({ title: 'Nothing to submit', description: 'Capture or upload at least a few photos first.', variant: 'destructive' })
            return
        }

        setSubmitting(true)
        try {
            const formData = new FormData()
            formData.append('roomName', activeRoom.name)
            if (video) {
                formData.append('video', video)
            } else {
                shots.forEach((blob, i) => formData.append('photos', blob, `shot_${i + 1}.jpg`))
            }

            const res = await fetch(`/api/upload/room-capture/${propertyId}`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            })
            const result = await res.json()

            if (!res.ok && result.status !== 'needs_retake') {
                throw new Error(result.message || 'Upload failed')
            }

            const qualified = result.status === 'success'
            setRooms((prev) =>
                prev.map((r) =>
                    r.slug === activeRoom.slug
                        ? {
                              ...r,
                              status: qualified ? 'qualified' : 'needs_retake',
                              warnings: result.room?.warnings ?? [],
                              rejectionReasons: result.room?.rejectionReasons ?? [],
                          }
                        : r
                )
            )

            toast({
                title: qualified ? `${activeRoom.name} qualified!` : `${activeRoom.name} needs a retake`,
                description: qualified
                    ? 'This room is ready to be part of the tour.'
                    : (result.room?.rejectionReasons ?? []).join(' ') || result.message,
                variant: qualified ? undefined : 'destructive',
            })

            if (qualified) closeRoom()
        } catch (err: any) {
            toast({ title: 'Upload failed', description: err.message, variant: 'destructive' })
        } finally {
            setSubmitting(false)
        }
    }

    function addRoom() {
        const name = newRoomName.trim()
        if (!name) return
        const slug = slugify(name)
        if (rooms.some((r) => r.slug === slug)) {
            toast({ title: 'Room already added', variant: 'destructive' })
            return
        }
        setRooms((prev) => [...prev, { slug, name, status: 'not_started', warnings: [], rejectionReasons: [] }])
        setNewRoomName('')
    }

    async function removeRoom(room: RoomState) {
        setRooms((prev) => prev.filter((r) => r.slug !== room.slug))
        try {
            await fetch(`/api/upload/room-capture/${propertyId}/${room.slug}`, { method: 'DELETE', credentials: 'include' })
        } catch {
            // Best-effort -- the room is already removed from local state.
        }
    }

    async function finalizeTour() {
        setFinalizing(true)
        setFinalizeError('')
        setFinalizeProgress(0)
        setFinalizeMessage('Starting...')
        try {
            const res = await fetch(`/api/upload/room-capture/${propertyId}/finalize`, { method: 'POST', credentials: 'include' })
            const result = await res.json()
            if (!res.ok) throw new Error(result.message || 'Could not start tour build')

            const source = new EventSource(`/api/upload/virtual-tour/progress/${result.jobId}`)
            source.onmessage = (evt) => {
                const data = JSON.parse(evt.data)
                if (data.error) {
                    setFinalizeError(data.error)
                    setFinalizing(false)
                    source.close()
                    return
                }
                setFinalizeProgress(data.progress ?? 0)
                setFinalizeMessage(data.message ?? '')
                if (data.done) {
                    source.close()
                    setFinalizing(false)
                    if (data.tourUrl) onPublished(data.tourUrl)
                }
            }
            source.onerror = () => {
                source.close()
            }
        } catch (err: any) {
            setFinalizeError(err.message)
            setFinalizing(false)
        }
    }

    // --- Room capture screen -------------------------------------------------
    if (activeRoom) {
        return (
            <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Capturing: {activeRoom.name}</h3>
                    <Button variant="ghost" size="sm" onClick={closeRoom}>
                        <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                </div>

                <Alert>
                    <AlertTitle>Before you start</AlertTitle>
                    <AlertDescription>
                        Turn on the lights, open curtains, and clear clutter from the walking path. Stand near the
                        center of the room and rotate slowly, taking a photo roughly every 45° (about {MIN_PHOTOS_RECOMMENDED}
                        {' '}photos covering the full room). You can also upload a video of you turning around the room, or a
                        single 360 photo/video if you have a 360 camera.
                    </AlertDescription>
                </Alert>

                {!cameraActive && (
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={startCamera}>
                            <Camera className="h-4 w-4 mr-2" /> Use camera
                        </Button>
                        <Button type="button" variant="outline" onClick={() => galleryInputRef.current?.click()}>
                            <Upload className="h-4 w-4 mr-2" /> Upload photos
                        </Button>
                        <Button type="button" variant="outline" onClick={() => videoInputRef.current?.click()}>
                            <Video className="h-4 w-4 mr-2" /> Upload a video instead
                        </Button>
                        <input
                            ref={galleryInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => addGalleryPhotos(e.target.files)}
                        />
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) submitRoom(file)
                            }}
                        />
                    </div>
                )}

                {cameraError && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{cameraError}</AlertDescription>
                    </Alert>
                )}

                {cameraActive && (
                    <div className="space-y-3">
                        <div className="relative rounded-md overflow-hidden bg-black aspect-video">
                            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                            {/* Compass overlay */}
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/50 rounded-full px-3 py-2">
                                {COMPASS_BUCKETS.map((b) => (
                                    <div
                                        key={b}
                                        className={`h-2 w-2 rounded-full ${
                                            filledBuckets.has(b) ? 'bg-green-400' : 'bg-white/40'
                                        } ${heading != null && nearestBucket(heading) === b ? 'ring-2 ring-white' : ''}`}
                                        title={`${b}°`}
                                    />
                                ))}
                            </div>
                            {!orientationSupported && (
                                <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                                    Compass unavailable on this device -- just rotate evenly and keep capturing
                                </div>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />

                        <div className="flex items-center justify-between">
                            <Button type="button" size="lg" onClick={captureShot}>
                                <Camera className="h-4 w-4 mr-2" /> Capture ({shots.length})
                            </Button>
                            <Button type="button" variant="ghost" onClick={stopCamera}>
                                Stop camera
                            </Button>
                        </div>
                        {lastShotWarning && (
                            <p className="text-sm text-amber-600 flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> {lastShotWarning}
                            </p>
                        )}
                    </div>
                )}

                {shots.length > 0 && (
                    <div>
                        <p className="text-sm text-muted-foreground mb-2">
                            {shots.length} photo{shots.length === 1 ? '' : 's'} ready
                            {shots.length < MIN_PHOTOS_RECOMMENDED && ` (recommend at least ${MIN_PHOTOS_RECOMMENDED})`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {shots.map((s, i) => (
                                <img
                                    key={i}
                                    src={URL.createObjectURL(s)}
                                    alt={`shot ${i + 1}`}
                                    className="h-16 w-16 object-cover rounded border"
                                />
                            ))}
                        </div>
                    </div>
                )}

                {activeRoom.status === 'needs_retake' && activeRoom.rejectionReasons.length > 0 && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>This room needs a retake</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc pl-4">
                                {activeRoom.rejectionReasons.map((r, i) => (
                                    <li key={i}>{r}</li>
                                ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                <Button type="button" className="w-full" onClick={() => submitRoom()} disabled={submitting || shots.length === 0}>
                    {submitting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking quality...
                        </>
                    ) : (
                        <>
                            <Check className="h-4 w-4 mr-2" /> Submit {activeRoom.name}
                        </>
                    )}
                </Button>
            </div>
        )
    }

    // --- Room list / overview screen -----------------------------------------
    return (
        <div className="rounded-lg border bg-card p-4 space-y-4">
            <div>
                <h3 className="text-lg font-semibold mb-1">Capture with your phone</h3>
                <p className="text-sm text-muted-foreground">
                    No 3D Vista export? Capture each room yourself -- a guided photo sweep, a video walk-around, or a
                    single shot from a 360 camera all work. Each room is checked automatically before it counts toward
                    the tour.
                </p>
            </div>

            <div className="space-y-2">
                {rooms.map((room) => (
                    <div key={room.slug} className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{room.name}</span>
                            {room.status === 'qualified' && <Badge className="bg-green-100 text-green-700">Qualified</Badge>}
                            {room.status === 'needs_retake' && <Badge variant="destructive">Needs retake</Badge>}
                            {room.status === 'not_started' && <Badge variant="outline">Not started</Badge>}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button type="button" size="sm" variant="outline" onClick={() => openRoom(room)}>
                                {room.status === 'not_started' ? (
                                    <>
                                        <ChevronRight className="h-4 w-4 mr-1" /> Capture
                                    </>
                                ) : (
                                    <>
                                        <RotateCcw className="h-4 w-4 mr-1" /> Retake
                                    </>
                                )}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeRoom(room)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <Input
                    placeholder="Add another room (e.g. Bedroom 2)"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRoom()}
                />
                <Button type="button" variant="outline" onClick={addRoom}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                    {qualifiedCount} of {rooms.length} room{rooms.length === 1 ? '' : 's'} qualified
                </p>
                {finalizing ? (
                    <div className="space-y-2">
                        <Progress value={finalizeProgress} />
                        <p className="text-sm text-muted-foreground">{finalizeMessage}</p>
                    </div>
                ) : (
                    <Button type="button" className="w-full" disabled={qualifiedCount === 0} onClick={finalizeTour}>
                        Build virtual tour ({qualifiedCount} room{qualifiedCount === 1 ? '' : 's'})
                    </Button>
                )}
                {finalizeError && (
                    <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{finalizeError}</AlertDescription>
                    </Alert>
                )}
            </div>
        </div>
    )
}
