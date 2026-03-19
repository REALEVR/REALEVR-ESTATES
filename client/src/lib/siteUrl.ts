/**
 * Canonical site origin for meta tags, JSON-LD, and canonical links.
 * Set VITE_PUBLIC_SITE_URL in production to match BASE_URL on the server (no trailing slash).
 */
export function getSiteUrl(): string {
    const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
    if (fromEnv && fromEnv.trim()) {
        return fromEnv.trim().replace(/\/$/, '')
    }
    if (typeof window !== 'undefined') {
        return window.location.origin
    }
    return ''
}
