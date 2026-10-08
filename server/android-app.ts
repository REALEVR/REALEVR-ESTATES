/**
 * The Android app (android/ in this repo) is a Trusted Web Activity: it opens this site full screen inside Chrome. For Chrome to
 * hide its address bar, the site must vouch for the app's signing key, which is what /.well-known/assetlinks.json does.
 *
 * The fingerprint below is the key the APK on the site is signed with. When the app is published on Google Play, Play re-signs it
 * with its own key: add that SHA-256 (Play Console > Setup > App signing) to ANDROID_CERT_SHA256 (comma separated) on the server.
 */
import type { Express } from 'express'

const PACKAGE_NAME = 'com.realevr.estates'
const UPLOAD_KEY_SHA256 = '93:46:C5:69:79:1F:21:18:08:C2:D2:45:89:62:F7:D1:A8:AE:57:4E:2B:23:69:C7:45:B1:82:E0:8A:0D:D6:E1'

export function androidFingerprints(extra = process.env.ANDROID_CERT_SHA256 ?? ''): string[] {
    const clean = extra
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s))
    return Array.from(new Set([UPLOAD_KEY_SHA256, ...clean]))
}

export function registerAndroidAppRoutes(app: Express): void {
    app.get('/.well-known/assetlinks.json', (_req, res) => {
        res.set('Cache-Control', 'public, max-age=3600').json([
            {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: { namespace: 'android_app', package_name: PACKAGE_NAME, sha256_cert_fingerprints: androidFingerprints() },
            },
        ])
    })
}
