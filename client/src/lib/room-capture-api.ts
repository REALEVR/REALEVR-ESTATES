/** Client calls for the room-capture pipeline (server/room-capture.ts), shared by the 360 photo uploader. */

export interface DraftRoom {
    slug: string
    name: string
    kind: string
    status: 'qualified' | 'needs_retake'
    warnings: string[]
    rejectionReasons: string[]
    /** First picture of the room, for a thumbnail. */
    thumb?: string
}

export interface RoomUploadResult {
    status: 'success' | 'needs_retake'
    room: DraftRoom
}

export class UploadError extends Error {
    /** True for failures worth trying again (lost connection, server hiccup); false for "the file is the problem". */
    retryable: boolean
    constructor(message: string, retryable: boolean) {
        super(message)
        this.retryable = retryable
    }
}

/** The rooms already uploaded for this property but not yet published, so a refresh or a second visit picks up where it left off. */
export async function fetchDraftRooms(propertyId: number): Promise<DraftRoom[]> {
    const res = await fetch(`/api/upload/room-capture/${propertyId}/manifest`, { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    return (data.rooms ?? []).map((r: any) => ({
        slug: r.slug,
        name: r.name,
        kind: r.kind,
        status: r.status,
        warnings: r.warnings ?? [],
        rejectionReasons: r.rejectionReasons ?? [],
        thumb: r.assets?.[0]?.url,
    }))
}

/** One room per request, with upload progress (fetch cannot report it). `batch` tells the server not to alert admins per room. */
export function uploadRoomPhoto(
    propertyId: number,
    file: File,
    roomName: string,
    opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<RoomUploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `/api/upload/room-capture/${propertyId}`)
        xhr.withCredentials = true
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total)
        }
        xhr.onload = () => {
            let body: any = null
            try {
                body = JSON.parse(xhr.responseText)
            } catch {
                // not JSON: handled below
            }
            if (xhr.status >= 200 && xhr.status < 300 && body?.room) {
                const room = body.room
                resolve({
                    status: body.status === 'success' ? 'success' : 'needs_retake',
                    room: {
                        slug: room.slug,
                        name: room.name,
                        kind: room.kind,
                        status: room.status,
                        warnings: room.warnings ?? [],
                        rejectionReasons: room.rejectionReasons ?? [],
                    },
                })
                return
            }
            if (xhr.status === 401 || xhr.status === 403) {
                reject(new UploadError('Your session has ended. Sign in again, then press Retry. Photos already uploaded are kept.', false))
            } else if (xhr.status === 413) {
                reject(new UploadError('This file is too large for the server. Export it as a smaller JPG and try again.', false))
            } else if (xhr.status >= 500 || xhr.status === 0 || xhr.status === 502 || xhr.status === 503 || xhr.status === 504) {
                reject(new UploadError(body?.message || 'The server could not process this photo right now.', true))
            } else {
                reject(new UploadError(body?.message || `Upload failed (${xhr.status}).`, false))
            }
        }
        xhr.onerror = () => reject(new UploadError('Lost the connection while uploading.', true))
        xhr.ontimeout = () => reject(new UploadError('The upload took too long.', true))
        xhr.onabort = () => reject(new UploadError('Upload cancelled.', false))
        opts.signal?.addEventListener('abort', () => xhr.abort())

        const form = new FormData()
        form.append('roomName', roomName)
        form.append('batch', '1')
        form.append('photos', file, file.name)
        xhr.send(form)
    })
}

export async function deleteDraftRoom(propertyId: number, slug: string): Promise<void> {
    await fetch(`/api/upload/room-capture/${propertyId}/${encodeURIComponent(slug)}`, { method: 'DELETE', credentials: 'include' })
}

export interface FinalizeHandlers {
    onProgress: (percent: number, message: string) => void
    onDone: (tourUrl: string) => void
    onError: (message: string) => void
}

/** Starts the build and follows its progress. Returns a function that stops listening. */
export async function finalizeTour(propertyId: number, h: FinalizeHandlers): Promise<() => void> {
    const res = await fetch(`/api/upload/room-capture/${propertyId}/finalize`, { method: 'POST', credentials: 'include' })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
        h.onError(result.message || 'Could not start building the tour.')
        return () => {}
    }
    const source = new EventSource(`/api/upload/virtual-tour/progress/${result.jobId}`)
    let finished = false
    source.onmessage = (evt) => {
        let data: any
        try {
            data = JSON.parse(evt.data)
        } catch {
            return
        }
        if (data.error) {
            finished = true
            source.close()
            h.onError(data.error)
            return
        }
        h.onProgress(data.progress ?? 0, data.message ?? '')
        if (data.done) {
            finished = true
            source.close()
            if (data.tourUrl) h.onDone(data.tourUrl)
            else h.onError('The tour was built but no link came back. Refresh and check the property.')
        }
    }
    source.onerror = () => {
        // A dropped progress stream does not stop the build on the server; say so rather than leaving a frozen bar.
        if (!finished) {
            source.close()
            h.onError('Lost the progress connection. The tour may still be building: refresh in a minute to check.')
        }
    }
    return () => source.close()
}
