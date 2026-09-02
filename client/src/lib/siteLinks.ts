// Single source of truth for the site's outbound contact/social links, so the
// footer, the floating WhatsApp button, and anywhere else that needs them stay in sync.

export const WHATSAPP_NUMBERS = [
    { label: "Agent 1", number: "256771891323" },
    { label: "Agent 2", number: "256702742333" },
] as const;

export function whatsAppLink(number: string, message = "Hello, I'm interested in a property on RealEVR Estates. Can you provide more details?") {
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// TODO: replace with the real page URLs once available. Left as "#" (no-op) rather
// than a guessed/placeholder domain so the footer icons don't link anywhere wrong.
export const SOCIAL_LINKS = {
    facebook: "#",
    twitter: "#",
    instagram: "#",
    pinterest: "#",
} as const;
