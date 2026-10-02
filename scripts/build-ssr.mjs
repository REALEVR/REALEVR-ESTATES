/**
 * Bundles server/ssr/static-pages.tsx into dist/ssr/static-pages.cjs so the production server can render content pages
 * for crawlers. Never fails the deploy: if this step breaks, crawlers get the smaller fallback page instead.
 */
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
    await build({
        entryPoints: [path.join(root, 'server/ssr/static-pages.tsx')],
        outfile: path.join(root, 'dist/ssr/static-pages.cjs'),
        bundle: true,
        platform: 'node',
        format: 'cjs',
        jsx: 'automatic',
        logLevel: 'warning',
        alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') },
        loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl', '.gif': 'dataurl' },
        define: { 'import.meta.env': '{"MODE":"production","DEV":false,"PROD":true,"SSR":true}', 'process.env.NODE_ENV': '"production"' },
    })
    console.log('[ssr] built dist/ssr/static-pages.cjs')
} catch (err) {
    console.warn('[ssr] could not build the crawler pages bundle; crawlers will get the fallback page.', err?.message ?? err)
}
