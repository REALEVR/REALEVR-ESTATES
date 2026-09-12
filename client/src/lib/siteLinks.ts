// Single source of truth for the site's outbound contact/social links, so the
// footer, the floating WhatsApp button, and anywhere else that needs them stay in sync.

export const WHATSAPP_NUMBERS = [
    { label: "Agent 1", number: "256771891323" },
    { label: "Agent 2", number: "256702742333" },
] as const;

export function whatsAppLink(number: string, message = "Hello, I'm interested in a property on RealEVR Estates. Can you provide more details?") {
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Facebook and X (Twitter) are real, live accounts — Footer.tsx renders them
// as real clickable links. Instagram/Pinterest have no account yet, so they
// stay "#" and Footer.tsx keeps rendering those two specifically as inert
// "Coming soon" buttons rather than a dead link — swap to the real URL here
// the moment either account exists, no other change needed.
export const SOCIAL_LINKS = {
    facebook: "https://www.facebook.com/profile.php?id=100091423856819",
    twitter: "https://x.com/realevrug",
    instagram: "#",
    pinterest: "#",
} as const;
