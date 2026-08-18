/**
 * GENE Platform — lightweight JSON-file collection store.
 *
 * This is intentionally NOT DynamoDB. It exists so every "GENE Platform"
 * scaffolding module (chat, ingestion, analytics, payments, WhatsApp queue,
 * etc. — see docs/GENE_PLATFORM.md) can persist real data today, in the same
 * additive spirit as `server/room-capture.ts`'s on-disk draft manifests,
 * without requiring new DynamoDB tables/credentials to be provisioned before
 * this code can even be reviewed.
 *
 * MIGRATION PATH: every collection here (`data/gene/<name>.json`) is a
 * natural DynamoDB table later. The read/write surface is deliberately tiny
 * (readCollection/writeCollection/nextId) so swapping the implementation for
 * one backed by `server/dynamodb.ts` (see `TABLES`, `DynamoDBUtils`) is a
 * localized change in this one file — nothing that imports from here needs
 * to change.
 */
import fs from 'fs'
import path from 'path'

const DATA_ROOT = path.join(process.cwd(), 'data', 'gene')

function collectionPath(name: string): string {
    return path.join(DATA_ROOT, `${name}.json`)
}

export function readCollection<T>(name: string): T[] {
    const p = collectionPath(name)
    if (!fs.existsSync(p)) return []
    try {
        const raw = fs.readFileSync(p, 'utf8')
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        // Corrupt/partial write — fail safe to empty rather than crash the route.
        return []
    }
}

export function writeCollection<T>(name: string, rows: T[]): void {
    fs.mkdirSync(DATA_ROOT, { recursive: true })
    const p = collectionPath(name)
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2))
    fs.renameSync(tmp, p) // atomic-ish swap, avoids readers seeing a half-written file
}

export function nextId(rows: Array<{ id: number }>): number {
    return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
}

export function nowIso(): string {
    return new Date().toISOString()
}
