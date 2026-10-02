/**
 * Asking the server to turn a clip of speech into words (ElevenLabs Scribe, see server/gene/kevin-stt.ts), and knowing
 * whether it can. When it cannot (no key, free credits used up, the daily budget spent, offline) everything keeps
 * working with the browser's own recogniser.
 */
import { useEffect, useState } from 'react'

let available: boolean | null = null
let checkedAt = 0
let pending: Promise<boolean> | null = null
const listeners = new Set<(v: boolean) => void>()

function publish(v: boolean) {
  available = v
  checkedAt = Date.now()
  listeners.forEach((l) => l(v))
}

/** Asked at most every five minutes. */
export function serverSttAvailable(): Promise<boolean> {
  if (available !== null && Date.now() - checkedAt < 5 * 60_000) return Promise.resolve(available)
  if (!pending) {
    pending = fetch('/api/gene/transcribe/status')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j) => j?.available === true)
      .catch(() => false)
      .then((v) => {
        publish(v)
        pending = null
        return v
      })
  }
  return pending
}

/** Stop using the server for a while (it said no, or failed). The status is re-read after the pause. */
export function pauseServerStt(minutes = 10): void {
  available = false
  checkedAt = Date.now() - (5 - minutes) * 60_000
  listeners.forEach((l) => l(false))
}

export function useServerStt(): boolean {
  const [v, setV] = useState<boolean>(available === true)
  useEffect(() => {
    let alive = true
    listeners.add(setV)
    serverSttAvailable().then((x) => alive && setV(x))
    return () => {
      alive = false
      listeners.delete(setV)
    }
  }, [])
  return v
}

/** The words in a clip: '' if nothing intelligible was said, null if the server could not be used. */
export async function transcribeClip(wav: Blob, bcp47: string | null): Promise<string | null> {
  try {
    const res = await fetch(`/api/gene/transcribe?lang=${encodeURIComponent((bcp47 || '').split('-')[0])}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
    if (!res.ok) {
      if (res.status === 429 || res.status === 501 || res.status >= 500) pauseServerStt()
      return null
    }
    const j = await res.json()
    return typeof j?.text === 'string' ? j.text.trim() : null
  } catch {
    return null
  }
}
