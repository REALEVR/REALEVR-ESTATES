// Types for tour-progress-manager.js (progress events streamed to the browser while a tour is processed).
import type { Response } from 'express'

export function createJob(): string
export function sendProgress(jobId: string, data: Record<string, unknown> & { done?: boolean; error?: unknown }): void
export function addListener(jobId: string, res: Response): boolean
export function cleanupJob(jobId: string): void
