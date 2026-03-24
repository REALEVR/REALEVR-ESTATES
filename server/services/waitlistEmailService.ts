import fs from 'fs'
import path from 'path'
import { sendEmail } from '../email-service'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import type { WaitlistEntry } from '../models/Waitlist'

const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'email-templates')

function loadTemplate(filename: string): string {
    try {
        return fs.readFileSync(path.join(TEMPLATES_DIR, filename), 'utf-8')
    } catch {
        console.error(`[WaitlistEmailService] Failed to load template: ${filename}`)
        return ''
    }
}

function renderTemplate(template: string, variables: Record<string, string | number>): string {
    let rendered = template
    for (const [key, value] of Object.entries(variables)) {
        rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''))
    }
    return rendered
}

async function getWaitlistPosition(waitlistId: string): Promise<{ position: number; total: number }> {
    try {
        const allEntries = await DynamoDBUtils.scanTable(TABLES.WAITLIST)
        const sorted = allEntries
            .filter((e) => e.status !== 'rejected')
            .sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())
        const position = sorted.findIndex((e) => e.id === waitlistId) + 1
        return { position: position > 0 ? position : sorted.length, total: sorted.length }
    } catch {
        return { position: 1, total: 1 }
    }
}

export async function sendConfirmationEmail(entry: WaitlistEntry): Promise<boolean> {
    const template = loadTemplate('waitlistConfirmation.html')
    if (!template) return false

    const { position, total } = await getWaitlistPosition(entry.id)
    const baseUrl = process.env.APP_BASE_URL || 'https://realevr.com'
    const verificationLink = `${baseUrl}/api/waitlist/verify/${entry.verificationToken}`

    const html = renderTemplate(template, {
        firstName: entry.firstName,
        position,
        totalWaitlisted: total,
        verificationLink,
        propertyType: entry.propertyType,
        propertyCount: entry.propertyCount ?? 0,
        location: entry.location ?? '',
        city: entry.city ?? '',
        state: entry.state ?? '',
        interest: entry.interest,
    })

    return sendEmail({
        to: entry.email,
        subject: 'Welcome to REALEVR Waitlist - Please Verify Your Email',
        html,
        text: `Hi ${entry.firstName}, thank you for joining the REALEVR waitlist! Your position is #${position}. Please verify your email: ${verificationLink}`,
    })
}

export async function sendVerificationReminderEmail(entry: WaitlistEntry): Promise<boolean> {
    const baseUrl = process.env.APP_BASE_URL || 'https://realevr.com'
    const verificationLink = `${baseUrl}/api/waitlist/verify/${entry.verificationToken}`
    const { position } = await getWaitlistPosition(entry.id)

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Don't forget to verify your email!</h2>
      </div>
      <div style="background: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px;">
        <p>Hi ${entry.firstName},</p>
        <p>You're on the REALEVR waitlist at position <strong>#${position}</strong>, but you haven't verified your email yet.</p>
        <p>Please verify to secure your spot:</p>
        <div style="text-align: center;">
          <a href="${verificationLink}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email Now</a>
        </div>
        <p style="font-size: 12px; color: #999; margin-top: 20px;">If you didn't sign up, please ignore this email.</p>
      </div>
    </body>
    </html>`

    return sendEmail({
        to: entry.email,
        subject: 'Reminder: Please verify your REALEVR waitlist email',
        html,
        text: `Hi ${entry.firstName}, please verify your REALEVR waitlist email: ${verificationLink}`,
    })
}

export async function sendInviteEmail(entry: WaitlistEntry, customMessage?: string): Promise<boolean> {
    const template = loadTemplate('waitlistInvite.html')
    if (!template) return false

    const baseUrl = process.env.APP_BASE_URL || 'https://realevr.com'
    const signupLink = `${baseUrl}/auth?invite=${entry.inviteToken}&email=${encodeURIComponent(entry.email)}`
    const adminMessage = customMessage || "We've reviewed your application and we're excited to have you join REALEVR!"

    const html = renderTemplate(template, {
        firstName: entry.firstName,
        adminMessage,
        signupLink,
    })

    return sendEmail({
        to: entry.email,
        subject: "You're Invited to Join REALEVR! 🚀",
        html,
        text: `Hi ${entry.firstName}, you're invited to join REALEVR! Create your account: ${signupLink}`,
    })
}

export async function sendStatusUpdateEmail(
    entry: WaitlistEntry,
    message: string
): Promise<boolean> {
    const template = loadTemplate('waitlistStatusUpdate.html')
    if (!template) return false

    const { position } = await getWaitlistPosition(entry.id)

    const html = renderTemplate(template, {
        firstName: entry.firstName,
        status: entry.status.charAt(0).toUpperCase() + entry.status.slice(1),
        position,
        message,
    })

    return sendEmail({
        to: entry.email,
        subject: 'Update on Your REALEVR Waitlist Application',
        html,
        text: `Hi ${entry.firstName}, here's an update on your REALEVR waitlist application. Status: ${entry.status}. Position: #${position}. Message: ${message}`,
    })
}
