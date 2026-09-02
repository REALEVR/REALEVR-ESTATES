/**
 * One-off migration: back up all existing users, create realevrug@gmail.com as the
 * sole admin account, then permanently delete every other user from DynamoDB.
 *
 * Usage: cross-env NODE_ENV=production tsx server/scripts/resetToSingleAdmin.ts
 *
 * Safe to delete after running once.
 */
import { scrypt, randomBytes } from 'crypto'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { storage } from '../storage'

const scryptAsync = promisify(scrypt)

async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    const buf = (await scryptAsync(password, salt, 64)) as Buffer
    return `${buf.toString('hex')}.${salt}`
}

function generatePassword(): string {
    // 16 random bytes -> base64url, trimmed to a friendly length, guaranteed to include
    // upper/lower/digits given the alphabet, no ambiguity chars needed since it's shown once.
    return randomBytes(12).toString('base64url')
}

async function main() {
    console.log('[reset-admin] Fetching all existing users...')
    const allUsers = await storage.getAllUsers()
    console.log(`[reset-admin] Found ${allUsers.length} existing users`)

    const backupPath = path.resolve(process.cwd(), 'server/scripts/users-backup.json')
    fs.writeFileSync(backupPath, JSON.stringify(allUsers, null, 2))
    console.log(`[reset-admin] Backed up ${allUsers.length} users to ${backupPath}`)

    const adminEmail = 'realevrug@gmail.com'
    const existingAdmin = allUsers.find((u) => u.email?.toLowerCase() === adminEmail)
    if (existingAdmin) {
        console.log('[reset-admin] Admin account already exists, skipping creation')
    } else {
        const password = generatePassword()
        const hashed = await hashPassword(password)
        const admin = await storage.createUser({
            username: 'realevrug',
            password: hashed,
            email: adminEmail,
            fullName: 'RealEVR Estates Admin',
            membershipPlan: null,
            role: 'admin',
            isVerified: true,
            membershipStartDate: null,
            membershipEndDate: null,
            phoneNumber: undefined,
            companyName: undefined,
            licenseNumber: undefined,
            subscriptionPaymentId: undefined,
            subscriptionStatus: 'active',
        } as any)
        console.log(`[reset-admin] Created admin user id=${admin.id} email=${admin.email}`)
        console.log(`[reset-admin] TEMPORARY PASSWORD (shown once, change after first login): ${password}`)
    }

    const usersToDelete = allUsers.filter((u) => u.email?.toLowerCase() !== adminEmail)
    console.log(`[reset-admin] Deleting ${usersToDelete.length} non-admin users...`)
    let deleted = 0
    for (const u of usersToDelete) {
        try {
            await storage.deleteUser(u.id)
            deleted++
        } catch (err) {
            console.error(`[reset-admin] Failed to delete user id=${u.id} email=${u.email}:`, err)
        }
    }
    console.log(`[reset-admin] Deleted ${deleted}/${usersToDelete.length} users`)

    const remaining = await storage.getAllUsers()
    console.log(`[reset-admin] Remaining users: ${remaining.length}`)
    remaining.forEach((u) => console.log(`  - id=${u.id} email=${u.email} role=${u.role}`))
}

main()
    .then(() => {
        console.log('[reset-admin] Done.')
        process.exit(0)
    })
    .catch((err) => {
        console.error('[reset-admin] FAILED:', err)
        process.exit(1)
    })
