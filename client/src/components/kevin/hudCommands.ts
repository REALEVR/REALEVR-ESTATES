import type { KevinCard } from './kevinTypes'

/**
 * Jarvis mode (the command centre, KevinHUD.tsx) is something a visitor asks for, never something that appears
 * by itself: "Kevin, Jarvis mode", "open the command centre". These are the few words that open and close it.
 */
const HUD_NAME = /\b(jarvis|j\.?a\.?r\.?v\.?i\.?s\.?|command (?:cent(?:er|re)|deck)|control room|mission control|hud)\b/i
const OPEN_WORDS = /\b(open|show|start|launch|activate|enable|switch (?:to|on)|turn on|go to|enter|bring up|load|run)\b/i
const CLOSE_WORDS = /\b(close|exit|leave|hide|dismiss|quit|shut|turn off|switch off|disable|deactivate|stand down|end)\b/i

export type HudCommand = 'open' | 'close' | null

export function hudCommand(text: string, hudOpen: boolean): HudCommand {
  const t = text.trim()
  if (!t || t.length > 90) return null // a command is short; a long sentence that mentions it is a conversation
  const named = HUD_NAME.test(t)
  if (hudOpen && /^(?:okay |ok |please |kevin,? )*(?:close|exit|leave|hide|dismiss|stand down|that'?s all|go back)(?: this| it| now| please)*[.!\s]*$/i.test(t)) return 'close'
  if (!named) return null
  if (CLOSE_WORDS.test(t)) return 'close'
  if (OPEN_WORDS.test(t) || /^(?:okay |ok |hey |please |kevin,? )*(?:jarvis|command (?:cent(?:er|re)|deck)|control room|mission control)(?: mode)?[.!\s]*$/i.test(t)) return 'open'
  return null
}

export interface MarketPulse {
  count: number
  currency: string
  min: number
  median: number
  max: number
}

/** The spread of prices in what Kevin has put on the screen (one currency at a time; the most common one). */
export function marketPulse(cards: Pick<KevinCard, 'price' | 'currency'>[]): MarketPulse | null {
  const priced = cards.filter((c) => Number.isFinite(c.price) && c.price > 0)
  if (priced.length < 2) return null
  const tally = new Map<string, number>()
  for (const c of priced) tally.set(c.currency, (tally.get(c.currency) ?? 0) + 1)
  const currency = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0][0]
  const prices = priced.filter((c) => c.currency === currency).map((c) => c.price).sort((a, b) => a - b)
  if (prices.length < 2) return null
  const mid = Math.floor(prices.length / 2)
  const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2)
  return { count: prices.length, currency, min: prices[0], median, max: prices[prices.length - 1] }
}

/** "2.5M", "850K", "1.2B": short enough for a dial. */
export function compactMoney(n: number): string {
  const trim = (v: number) => String(Math.round(v * 10) / 10).replace(/\.0$/, '')
  if (n >= 1e9) return `${trim(n / 1e9)}B`
  if (n >= 1e6) return `${trim(n / 1e6)}M`
  if (n >= 1e3) return `${trim(n / 1e3)}K`
  return String(Math.round(n))
}
