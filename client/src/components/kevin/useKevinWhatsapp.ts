import { useEffect, useState } from 'react'
import type { KevinCard } from './kevinTypes'

/**
 * "Message the owner on WhatsApp": a wa.me link with the message already
 * written (which home, and who is asking), so a visitor who is interested in a
 * property is one tap from a real conversation. The number comes from the
 * server (GET /api/gene/kevin/whatsapp), so it can change without a rebuild;
 * with none configured the buttons simply do not appear.
 */
let cachedNumber: Promise<string | null> | null = null

function loadNumber(): Promise<string | null> {
  cachedNumber =
    cachedNumber ??
    fetch('/api/gene/kevin/whatsapp')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (typeof d?.number === 'string' && /^\d{7,15}$/.test(d.number) ? d.number : null))
      .catch(() => null)
  return cachedNumber
}

export function whatsappHref(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function interestText(card: Pick<KevinCard, 'id' | 'title' | 'location'>, name?: string | null): string {
  const who = name ? `Hi, I'm ${name}. ` : 'Hi! '
  return `${who}I'm interested in "${card.title}" in ${card.location} on RealEVR Estates: ${window.location.origin}/property/${card.id}`
}

export function useKevinWhatsapp() {
  const [number, setNumber] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadNumber().then((n) => alive && setNumber(n))
    return () => {
      alive = false
    }
  }, [])
  return number
}

/** Tell the team (once per home) that this visitor is taking the conversation to WhatsApp. */
export function recordInterest(sessionId: string | undefined, propertyId: number): void {
  if (!sessionId) return
  try {
    void fetch('/api/gene/kevin/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, propertyId }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* the chat to WhatsApp must not depend on this */
  }
}
