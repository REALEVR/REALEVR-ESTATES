/**
 * Masks a phone number's last 4 digits, keeping everything before them
 * visible - the pre-payment host/landlord contact preview shown on a
 * property page ("show the host's number leaving out the last 4 digits
 * until someone pays"). Deliberately the opposite of the usual "•••• 1234"
 * credit-card convention: showing the prefix (country/area code, and most
 * of the subscriber number) is what lets a viewer recognize a real, live
 * number is behind this listing without it being directly callable before
 * they've paid.
 *
 * Only touches digits - punctuation/spacing in the original number
 * (spaces, dashes, a leading +) is left exactly where it was, so
 * "+256 772 456 789" masks to "+256 772 456 •••" rather than collapsing
 * into one run of bullets.
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''

  const digitPositions: number[] = []
  for (let i = 0; i < phone.length; i++) {
    if (/\d/.test(phone[i])) digitPositions.push(i)
  }

  if (digitPositions.length <= 4) {
    // Too short to meaningfully mask (would hide the whole number) - show
    // it as-is rather than a string of bullets that reveals nothing.
    return phone
  }

  const maskFrom = new Set(digitPositions.slice(-4))
  return phone
    .split('')
    .map((ch, i) => (maskFrom.has(i) ? '•' : ch))
    .join('')
}
