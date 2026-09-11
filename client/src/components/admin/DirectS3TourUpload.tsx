import { useRef, useState } from 'react'
import { apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Check, AlertCircle, Upload, Loader2 } from 'lucide-react'

/**
 * Virtual tour ZIP upload - the ONLY upload path now (a classic path that
 * relayed the whole ZIP through our own Node server was retired once this
 * one existed - it was strictly worse on speed, resilience, and server
 * load, so there was no reason to keep two). The browser uploads the ZIP
 * straight to S3 as a multipart upload - several parts in parallel, each
 * over its own connection - rather than our server ever touching the raw
 * bytes, then hands the server a small S3 key to kick off extraction.
 *
 * Multipart instead of one big PUT: a single request is capped by ONE TCP
 * connection's own throughput (and by TCP's slow-start ramp-up, which
 * matters a lot on a higher-latency mobile link long before the device's
 * real uplink bandwidth is used), and a failure anywhere in a multi-GB PUT
 * meant starting over from zero. Splitting into ~16MB parts uploaded in
 * parallel uses several connections' worth of throughput at once, and a
 * failed part only costs re-uploading that one part.
 */

type Stage = 'idle' | 'presigning' | 'uploading' | 'completing' | 'starting' | 'extracting' | 'done' | 'error'

const PART_UPLOAD_CONCURRENCY = 6
const PART_RETRY_ATTEMPTS = 3
// A part that stops sending bytes and never recovers (a dropped
// connection, a dead proxy in between) is the exact "ends at 68%" failure
// mode this whole direct-to-S3 path exists to fix - a frozen progress bar
// with no error and no way to tell "still working" from "wedged." Any
// part making progress resets this clock, so it only fires once the WHOLE
// upload has gone quiet, not just one slow part among several healthy ones.
const STALL_LIMIT_MS = 2 * 60_000

interface PresignedPart {
  partNumber: number
  uploadUrl: string
}

/**
 * Uploads every part of a multipart upload in parallel (a worker-pool
 * pattern, same shape as the server's own uploadFilesInParallel in
 * server/s3-tour-hosting.ts - a handful of workers pulling the next
 * unstarted part off a shared index, rather than kicking off all parts at
 * once, which could be hundreds for a large ZIP and would overwhelm both
 * the browser's connection pool and the user's own bandwidth).
 * `onProgress` receives the aggregate percentage across all parts.
 * Returns the {partNumber, etag} list CompleteMultipartUpload needs, in
 * whatever order the parts happened to finish (S3 sorts by part number
 * server-side when completing, so order here doesn't matter).
 */
async function uploadPartsInParallel(
  file: File,
  partSize: number,
  parts: PresignedPart[],
  onProgress: (percent: number) => void
): Promise<Array<{ partNumber: number; etag: string }>> {
  const loadedByPart = new Array(parts.length).fill(0)
  let lastProgressAt = Date.now()
  const reportProgress = () => {
    const loaded = loadedByPart.reduce((sum, n) => sum + n, 0)
    onProgress(Math.round((loaded / file.size) * 100))
  }

  let stalled = false
  const inFlightXhrs = new Set<XMLHttpRequest>()
  const stallWatchdog = setInterval(() => {
    if (Date.now() - lastProgressAt > STALL_LIMIT_MS) {
      stalled = true
      inFlightXhrs.forEach((xhr) => xhr.abort())
    }
  }, 15_000)

  const uploadOnePart = async (part: PresignedPart): Promise<{ partNumber: number; etag: string }> => {
    const start = (part.partNumber - 1) * partSize
    const end = Math.min(start + partSize, file.size)
    const blob = file.slice(start, end)
    const partIndex = part.partNumber - 1

    let lastError: Error = new Error(`Part ${part.partNumber} upload failed`)
    for (let attempt = 1; attempt <= PART_RETRY_ATTEMPTS; attempt++) {
      if (stalled) {
        throw new Error('Upload stalled — no data was sent for 2 minutes. Check your connection and try again.')
      }
      try {
        const etag: string = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          inFlightXhrs.add(xhr)
          xhr.open('PUT', part.uploadUrl)

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              loadedByPart[partIndex] = event.loaded
              lastProgressAt = Date.now()
              reportProgress()
            }
          }
          xhr.onload = () => {
            inFlightXhrs.delete(xhr)
            if (xhr.status === 200 || xhr.status === 204) {
              // S3 returns the part's ETag as a response header - required
              // to identify this part when completing the upload. The
              // bucket's CORS config exposes this header for a browser to
              // read cross-origin (see setupS3TourBucket's ExposeHeaders).
              const etagHeader = xhr.getResponseHeader('ETag')
              if (!etagHeader) {
                reject(new Error(`Part ${part.partNumber} upload succeeded but S3 didn't return an ETag`))
                return
              }
              loadedByPart[partIndex] = blob.size
              lastProgressAt = Date.now()
              reportProgress()
              resolve(etagHeader)
            } else {
              reject(new Error(`Part ${part.partNumber} upload failed (status ${xhr.status})`))
            }
          }
          xhr.onerror = () => {
            inFlightXhrs.delete(xhr)
            reject(new Error(`Part ${part.partNumber} upload failed`))
          }
          xhr.onabort = () => {
            inFlightXhrs.delete(xhr)
            reject(new Error(`Part ${part.partNumber} upload aborted`))
          }
          xhr.send(blob)
        })
        return { partNumber: part.partNumber, etag }
      } catch (err: any) {
        lastError = err
        if (stalled) throw err
        // Small backoff before retrying this one part - cheap since it's
        // only ~16MB, not the whole file.
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
    throw lastError
  }

  const results: Array<{ partNumber: number; etag: string }> = new Array(parts.length)
  let nextIndex = 0
  let firstError: unknown = null

  async function worker() {
    while (true) {
      if (firstError) return
      const myIndex = nextIndex++
      if (myIndex >= parts.length) return
      try {
        results[myIndex] = await uploadOnePart(parts[myIndex])
      } catch (err) {
        if (!firstError) firstError = err
      }
    }
  }

  const workerCount = Math.min(PART_UPLOAD_CONCURRENCY, parts.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  clearInterval(stallWatchdog)

  if (firstError) throw firstError
  return results
}

interface DirectS3TourUploadProps {
  propertyId: number
  onSuccess: (tourUrl: string) => void
}

export default function DirectS3TourUpload({ propertyId, onSuccess }: DirectS3TourUploadProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [error, setError] = useState('')
  const [successUrl, setSuccessUrl] = useState<string | null>(null)

  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error'

  const handleUpload = async () => {
    const fileInput = fileInputRef.current
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({ title: 'Error', description: 'Please select a ZIP file to upload', variant: 'destructive' })
      return
    }

    const file = fileInput.files[0]

    if (!file.name.endsWith('.zip')) {
      toast({ title: 'Error', description: 'Please upload a ZIP file (3D Vista tour export)', variant: 'destructive' })
      return
    }

    if (file.size > 5 * 1024 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File is too large. Maximum allowed size is 5GB', variant: 'destructive' })
      return
    }

    setError('')
    setSuccessUrl(null)
    setUploadPercent(0)
    setProgressMessage('')
    setProgressPercent(0)

    try {
      // Step 1: ask our server to start a multipart upload and presign
      // every part. This is the only part of the raw file transfer our
      // server is involved in - it never sees the ZIP's bytes, only the
      // small JSON describing where to PUT each part.
      setStage('presigning')
      const contentType = file.type || 'application/zip'
      const presignRes = await apiRequest('POST', `/api/upload/virtual-tour/${propertyId}/presign-zip`, {
        fileSizeBytes: file.size,
        contentType,
      })
      const { s3Key, uploadId, partSize, parts } = await presignRes.json()

      // Step 2: PUT each part straight to S3 in parallel. credentials/auth
      // headers are deliberately omitted here - these requests go to AWS,
      // not to our API, and each part's own presigned URL is the only
      // thing granting access to write it.
      setStage('uploading')
      const uploadedParts = await uploadPartsInParallel(file, partSize, parts, setUploadPercent)

      // Step 3: tell S3 to assemble the parts into the final object. This
      // needs our server's own AWS credentials (a presigned URL alone
      // can't do it, since the part ETags aren't known until each part's
      // PUT actually completes), so it's a real API call, not a presign.
      setStage('completing')
      await apiRequest('POST', `/api/upload/virtual-tour/${propertyId}/complete-multipart`, {
        s3Key,
        uploadId,
        parts: uploadedParts,
      })

      // Step 4: tell our server the ZIP landed in S3 and to start
      // extracting it.
      setStage('starting')
      const processRes = await apiRequest('POST', `/api/upload/virtual-tour/${propertyId}/process-from-s3`, { s3Key })
      const { jobId } = await processRes.json()

      // Step 5: listen for extraction progress over SSE.
      setStage('extracting')
      const tourUrl = await new Promise<string>((resolve, reject) => {
        const evtSource = new EventSource(`/api/upload/virtual-tour/progress/${jobId}`)

        // Stall watchdog for the extraction stage, copied from
        // handleTourUpload's SSE watchdog - the XHR watchdog above only
        // covers the raw browser->S3 transfer, which finishes (and stops
        // applying) the moment this SSE stage begins. The server sends a
        // heartbeat comment every 15s to keep the connection itself alive,
        // but a comment line never reaches onmessage - so track real
        // progress events here independently and bail out if none arrive
        // for a while, instead of waiting on a connection that's
        // technically still open but not actually making progress.
        let lastSseEventAt = Date.now()
        const sseStallLimitMs = 3 * 60_000
        const sseWatchdog = setInterval(() => {
          if (Date.now() - lastSseEventAt > sseStallLimitMs) {
            clearInterval(sseWatchdog)
            evtSource.close()
            reject(new Error('Upload stalled while processing the tour. Please try again.'))
          }
        }, 15_000)
        const clearSseWatchdog = () => clearInterval(sseWatchdog)

        evtSource.onmessage = (event) => {
          lastSseEventAt = Date.now()
          try {
            const data = JSON.parse(event.data)
            if (data.progress) setProgressPercent(data.progress)
            if (data.message) setProgressMessage(data.message)
            if (data.done) {
              clearSseWatchdog()
              evtSource.close()
              resolve(data.tourUrl || '')
            }
            if (data.error) {
              clearSseWatchdog()
              evtSource.close()
              reject(new Error(data.error))
            }
          } catch (err) {
            clearSseWatchdog()
            evtSource.close()
            reject(err)
          }
        }
        evtSource.onerror = () => {
          clearSseWatchdog()
          evtSource.close()
          reject(new Error('Connection lost to progress server'))
        }
      })

      setStage('done')
      setSuccessUrl(tourUrl)
      toast({ title: 'Success', description: 'Virtual tour uploaded and extracted successfully' })
      onSuccess(tourUrl)
    } catch (err: any) {
      setStage('error')
      const message = err?.message || 'Failed to upload virtual tour'
      setError(message)
      toast({ title: 'Error', description: 'Failed to upload virtual tour: ' + message, variant: 'destructive' })
    }
  }

  const buttonLabel = () => {
    switch (stage) {
      case 'presigning':
        return 'Preparing upload…'
      case 'uploading':
        return `Uploading: ${uploadPercent}%`
      case 'completing':
        return 'Finalizing upload…'
      case 'starting':
        return 'Starting…'
      case 'extracting':
        return progressPercent > 0 ? `${progressMessage} (${progressPercent}%)` : progressMessage || 'Processing…'
      default:
        return 'Upload'
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2 mt-2">
        <Input ref={fileInputRef} type="file" accept=".zip" className="flex-1" disabled={busy} />
        <Button type="button" onClick={handleUpload} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {buttonLabel()}
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </div>

      {stage === 'uploading' && (
        <Progress value={uploadPercent} />
      )}
      {stage === 'extracting' && (
        <Progress value={progressPercent} />
      )}

      {stage === 'done' && (
        <Alert className="mt-4 bg-green-50 border-green-300">
          <Check className="h-4 w-4 text-green-500" />
          <AlertTitle>Success!</AlertTitle>
          <AlertDescription>
            Virtual tour uploaded and extracted successfully.
          </AlertDescription>
        </Alert>
      )}

      {stage === 'error' && error && (
        <Alert className="mt-4" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
