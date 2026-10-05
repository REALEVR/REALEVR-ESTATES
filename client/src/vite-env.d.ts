/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PUBLIC_SITE_URL?: string
    /** Google AdSense publisher id (ca-pub-...) and the ad unit id; ads stay off until both are set. */
    readonly VITE_ADSENSE_CLIENT?: string
    readonly VITE_ADSENSE_SLOT?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
