import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

/**
 * Site-wide floating "Chat on WhatsApp" button — the click-to-WhatsApp
 * feature from the platform's growth ask. Reads the business number from
 * GET /api/config/whatsapp-business-number (server/gene/whatsapp-growth.ts)
 * rather than a build-time env var, so it can be turned on/off without a
 * rebuild. Renders nothing at all if that number isn't configured —
 * graceful degrade, never a dead wa.me link.
 *
 * Signed-in users see nothing here — AgentLauncher.tsx's "My Agent" button
 * is their one floating icon, and its own panel offers "Continue on
 * WhatsApp" (once linked) or a way to link it, so a second, separate
 * WhatsApp bubble would just be a redundant icon stacked on top of it.
 * Signed-out visitors, who never see AgentLauncher, keep this as their only
 * floating contact channel.
 */
export default function WhatsAppFab() {
  const { user } = useAuth();
  const [number, setNumber] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/whatsapp-business-number")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNumber(typeof d?.number === "string" && d.number ? d.number : null);
      })
      .catch(() => {
        if (!cancelled) setNumber(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user || !number) return null;

  const href = `https://wa.me/${number}?text=${encodeURIComponent("Hi! I'm interested in a property on RealEVR Estates.")}`;

  return (
    <AnimatePresence>
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with RealEVR Estates on WhatsApp"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 md:bottom-5"
      >
        <MessageCircle className="h-7 w-7" fill="white" strokeWidth={0} />
      </motion.a>
    </AnimatePresence>
  );
}
