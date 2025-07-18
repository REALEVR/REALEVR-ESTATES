import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert square feet to square meters
 * @param sqft Square feet value
 * @returns Square meters value (rounded to nearest integer)
 */
export function sqftToSqm(sqft: number): number {
  return Math.round(sqft * 0.093);
}

/**
 * Convert square meters to square feet
 * @param sqm Square meters value
 * @returns Square feet value (rounded to nearest integer)
 */
export function sqmToSqft(sqm: number): number {
  return Math.round(sqm / 0.093);
}

/**
 * Format a currency value with the appropriate currency symbol
 * @param value The numeric value
 * @param currency The currency code (e.g., "UGX", "USD")
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, currency: string = "UGX"): string {
  return `${value.toLocaleString()} ${currency}`;
}
