import { useRef, useState } from 'react'
import { apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Check, AlertCircle, Upload, Loader2 } from 'lucide-react'

/**
 * Direct-to-S3 virtual tour upload - the fast alternative to the classic
 * path in PropertyFormNew.tsx's handleTourUpload, which relays the whole
 * ZIP through our own Node server and has been the source of the "stalls at
 * 68%/77%" reports on large files over slow/flaky connections. Here the
 * browser uploads the ZIP straight to S3 with a presigned URL (cutting our
 * server out of the multi-GB transfer entirely, so it can't be the thing
 * that times out or drops the connection), and only hands the server a
 * small S3 key afterward to kick off the same extraction job the classic
 * path already runs. The extraction stage - and its progress reporting -
 * is genuinely shared: both paths finish by opening the same
 * /api/upload/virtual-tour/progress/:jobId SSE stream, so that handling is
 * intentionally a close copy of handleTourUpload's, not a reinvention.
 */

type Stage = 'idle' | 'presigning' | 'uploading' | 'starting' | 'extracting' | 'done' | 'error'

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
      // Step 1: ask our server for a presigned S3 PUT URL. This is the only
      // part of the raw file transfer our server is involved in - it never
      // sees the ZIP's bytes.
      setStage('presigning')
      const contentType = file.type || 'application/zip'
      const presignRes = await apiRequest('POST', `/api/upload/virtual-tour/${propertyId}/presign-zip`, {
        fileSizeBytes: file.size,
        contentType,
      })
      const { uploadUrl, s3Key } = await presignRes.json()

      // Step 2: PUT the raw ZIP straight to S3. credentials/auth headers
      // are deliberately omitted here - this request goes to AWS, not to
      // our API, and the presigned URL itself is the only thing granting
      // access to write this object.
      setStage('uploading')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', contentType)

        // Stall watchdog, copied from handleTourUpload's classic-path
        // watchdog: a large ZIP can legitimately take a long time to PUT,
        // but if xhr.upload.onprogress goes quiet for a stretch - a
        // dropped wifi/mobile connection, a dead proxy in between - the
        // browser doesn't reliably fire onerror on its own, and the
        // request just sits there with a frozen progress bar and no
        // feedback (the exact "ends at 68%" report this whole fast path
        // exists to fix). Track the last time bytes actually moved and
        // abort with a clear, retryable error if nothing has moved in 2
        // minutes.
        let lastProgressAt = Date.now()
        const stallCheckMs = 15_000
        const stallLimitMs = 2 * 60_000
        const stallWatchdog = setInterval(() => {
          if (Date.now() - lastProgressAt > stallLimitMs) {
            clearInterval(stallWatchdog)
            xhr.abort()
          }
        }, stallCheckMs)
        const clearWatchdog = () => clearInterval(stallWatchdog)

        xhr.upload.onprogress = (event) => {
          lastProgressAt = Date.now()
          if (event.lengthComputable) {
            setUploadPercent(Math.round((event.loaded * 100) / event.total))
          }
        }

        xhr.onabort = () => {
          clearWatchdog()
          reject(new Error('Upload stalled — no data was sent for 2 minutes. Check your connection and try again.'))
        }

        xhr.onload = () => {
          clearWatchdog()
          if (xhr.status === 200 || xhr.status === 204) {
            setUploadPercent(100)
            resolve()
          } else {
            reject(new Error(`S3 upload failed (status ${xhr.status})`))
          }
        }

        xhr.onerror = () => {
          clearWatchdog()
          reject(new Error('Upload to S3 failed'))
        }

        xhr.send(file)
      })

      // Step 3: tell our server the ZIP landed in S3 and to start
      // extracting it. From here on this is the exact same background job
      // (and the exact same progress stream) the classic upload path
      // starts once its own server-side upload finishes.
      setStage('starting')
      const processRes = await apiRequest('POST', `/api/upload/virtual-tour/${propertyId}/process-from-s3`, { s3Key })
      const { jobId } = await processRes.json()

      // Step 4: listen for extraction progress on the same SSE endpoint
      // the classic path uses.
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
