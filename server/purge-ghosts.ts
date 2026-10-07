/**
 * One-shot cleanup of the empty "ghost" property records that visits to non-existent ids used to create (see isGhostRecord).
 * It does nothing unless PURGE_GHOST_RECORDS=1 is set on the server, and it is meant to be switched on for one deploy and then removed.
 *
 * Safety: only records that are ghosts by isGhostRecord AND carry none of the fields a real listing has are deleted; it refuses to
 * run if the numbers look wrong; and every deleted record is printed in full to the log first, so the log is the backup.
 */
import { DynamoDBUtils, TABLES } from './dynamodb'
import { isGhostRecord } from './dynamodb-storage'

const REAL_LISTING_FIELDS = ['title', 'price', 'description', 'location', 'images', 'image', 'ownerId', 'userId', 'agentId', 'tourUrl', 'category', 'propertyType', 'bedrooms']
const MAX_DELETES = 60

export async function purgeGhostRecords(): Promise<void> {
    if (process.env.PURGE_GHOST_RECORDS !== '1') return
    try {
        const items = (await DynamoDBUtils.scanTable(TABLES.PROPERTIES)) as Record<string, unknown>[]
        const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
        const ghosts = items.filter((it) => isGhostRecord(it) && REAL_LISTING_FIELDS.every((f) => blank(it[f])))
        const real = items.length - items.filter((it) => isGhostRecord(it)).length
        console.log(`[purge-ghosts] ${items.length} records: ${real} real, ${items.length - real} ghosts, ${ghosts.length} safe to delete`)
        if (real < 10 || ghosts.length > MAX_DELETES) {
            console.error(`[purge-ghosts] refusing to delete: expected at least 10 real records and at most ${MAX_DELETES} ghosts`)
            return
        }
        for (const g of ghosts) {
            console.log(`[purge-ghosts] BACKUP ${JSON.stringify(g)}`)
        }
        let deleted = 0
        for (const g of ghosts) {
            try {
                await DynamoDBUtils.deleteItem(TABLES.PROPERTIES, { id: g.id })
                deleted++
            } catch (err) {
                console.error(`[purge-ghosts] could not delete ${String(g.id)}:`, err)
            }
        }
        console.log(`[purge-ghosts] deleted ${deleted} of ${ghosts.length}`)
    } catch (err) {
        console.error('[purge-ghosts] failed:', err)
    }
}
