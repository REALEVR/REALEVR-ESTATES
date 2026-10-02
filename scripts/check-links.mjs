/**
 * Finds internal links that point nowhere: every href="/..." (and similar) in the client, shared data and the server's
 * crawler pages, compared with the routes declared in client/src/App.tsx. Run: node scripts/check-links.mjs
 * Exits 1 when it finds any, so it can run in CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) walk(rel, out)
        else if (/\.(tsx?|html)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel)
    }
    return out
}

// Routes the app declares.
const app = read('client/src/App.tsx')
const patterns = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
// Files and endpoints the server answers.
const server = ['/sitemap.xml', '/robots.txt', '/llms.txt', '/favicon.ico', '/site.webmanifest', '/og-default.jpg', '/sw.js']
const isRoute = (p) => {
    if (server.includes(p) || p.startsWith('/api/') || p.startsWith('/assets/') || p.startsWith('/uploads/') || p.startsWith('/tours/')) return true
    return patterns.some((pat) => {
        const re = new RegExp('^' + pat.replace(/\/:([A-Za-z]+)\?/g, '(?:/[^/]+)?').replace(/:([A-Za-z]+)/g, '[^/]+').replace(/\*/g, '.*') + '/?$')
        return re.test(p)
    })
}

const files = [...walk('client/src'), ...walk('shared'), 'server/crawler-pages.ts', 'client/index.html']
const LINK = /(?:href|to|setLocation|navigate|path|canonicalPath)\s*[=(:]\s*\{?\s*(["'`])(\/[^"'`\s{$?#]*)(?:[?#][^"'`]*)?\1/g
const bad = new Map()
for (const f of files) {
    const text = read(f)
    for (const m of text.matchAll(LINK)) {
        const p = m[2].replace(/\/+$/, '') || '/'
        if (p.startsWith('//') || p === '/') continue
        if (!isRoute(p)) {
            const line = text.slice(0, m.index).split('\n').length
            const list = bad.get(p) ?? []
            list.push(`${f}:${line}`)
            bad.set(p, list)
        }
    }
}
if (!bad.size) console.log('No broken internal links found.')
for (const [p, where] of bad) console.log(`BROKEN ${p}\n   ${where.slice(0, 4).join('\n   ')}${where.length > 4 ? `\n   (+${where.length - 4} more)` : ''}`)
process.exit(bad.size ? 1 : 0)
