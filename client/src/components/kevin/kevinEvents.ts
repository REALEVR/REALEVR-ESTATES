/**
 * Any screen can ask Kevin to open (the sign-up card does, so he is there while someone signs up).
 * Kept as a window event so those screens need no link to Kevin's code.
 */
export const KEVIN_OPEN_EVENT = 'realevr:kevin-open'

export interface KevinOpenDetail {
  /** Where the visitor is, so Kevin can behave like an assistant for that moment. */
  context?: 'signup' | 'welcome'
  /** Show the hands-free offer straight away. */
  handsFree?: boolean
  /** Their first name, for the welcome after sign-up. */
  name?: string
}

export function openKevin(detail: KevinOpenDetail = {}): void {
  try {
    window.dispatchEvent(new CustomEvent<KevinOpenDetail>(KEVIN_OPEN_EVENT, { detail }))
  } catch {
    /* Kevin is a helper, never a requirement */
  }
}
