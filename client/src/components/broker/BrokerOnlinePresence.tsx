import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessageCircle, Volume2 } from "lucide-react";

/**
 * Site-wide "broker is online" presence popup — the Siri/Gemini-style
 * center-screen activation the team asked for: after a short delay, a card
 * animates in announcing a named broker is online, optionally speaks a
 * greeting out loud (browser Web Speech API — no API key, no cost, and it
 * degrades silently on browsers/devices that don't support it), and offers
 * one action: open WhatsApp with a real person. No AI answers questions
 * here — same honesty-first pattern as WhatsAppFab.tsx, just with presence.
 *
 * Visible to every visitor (not gated by useAuth, unlike AgentLauncher.tsx
 * which is signed-in-users-only), shown once per browser tab session via
 * sessionStorage so it doesn't nag on every page navigation.
 *
 * Reuses the existing GET /api/config/whatsapp-business-number endpoint
 * (server/gene/whatsapp-growth.ts) rather than a new one — same
 * graceful-degrade contract: renders nothing if no number is configured.
 */

// Easy to customize: swap in your actual broker/agent's name and title.
// A single site-wide persona, same for every visitor — not personalized
// per logged-in user (kept simple on purpose; ask to change this later
// if you want it to show the visitor's actual assigned agent instead).
const BROKER_NAME = "Grace";
const BROKER_TITLE = "RealEVR Broker";
const GREETING_TEXT = `Hi, I'm ${BROKER_NAME}, your RealEVR broker — I'm online now if you have any questions about a property.`;

const SHOWN_THIS_SESSION_KEY = "realevr_broker_presence_shown";
const SHOW_DELAY_MS = 5000;

export default function BrokerOnlinePresence() {
  const [number, setNumber] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hasSpokenRef = useRef(false);

  // Fetch the configured business number (same source as WhatsAppFab).
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

  // Schedule the pop-in, once per tab session, only once we know we have
  // somewhere for the visitor to actually go (a real number configured).
  useEffect(() => {
    if (!number) return;
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === "1";
    } catch {
      // Private browsing / storage blocked — fall back to showing every
      // load rather than crashing; not worth gating a presence popup on.
      alreadyShown = false;
    }
    if (alreadyShown) return;

    const timer = setTimeout(() => {
      setVisible(true);
      try {
        sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, "1");
      } catch {
        // Ignore — worst case it shows again on the next page in this tab.
      }
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [number]);

  // Best-effort spoken greeting — browsers vary widely in whether this is
  // allowed without a prior user gesture, so failures here are silent and
  // never block the visual popup, which is the reliable part.
  useEffect(() => {
    if (!visible || hasSpokenRef.current) return;
    hasSpokenRef.current = true;
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(GREETING_TEXT);
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Speech synthesis unsupported or blocked — the card still shows.
    }
  }, [visible]);

  if (!number) return null;

  const whatsappHref = `https://wa.me/${number}?text=${encodeURIComponent(
    `Hi ${BROKER_NAME}, I saw you're online on RealEVR Estates — I have a question.`
  )}`;

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Soft backdrop — click-through dismiss, never blocks scrolling/reading */}
          <motion.div
            key="broker-presence-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
            aria-hidden="true"
          />
          <motion.div
            key="broker-presence-card"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            role="dialog"
            aria-label={`${BROKER_NAME}, ${BROKER_TITLE}, is online`}
            className="fixed left-1/2 top-1/2 z-[61] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl"
          >
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-accent-foreground">
                {BROKER_NAME.charAt(0)}
              </span>
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card bg-green-500" />
            </div>

            <p className="text-sm font-medium text-muted-foreground">{BROKER_TITLE}</p>
            <h2 className="font-display text-xl font-bold text-foreground">
              {BROKER_NAME} is online
            </h2>
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Volume2 className="h-3 w-3" /> "{GREETING_TEXT}"
            </p>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-medium text-white shadow-md transition-transform hover:scale-[1.02] active:scale-95"
            >
              <MessageCircle className="h-5 w-5" fill="white" strokeWidth={0} />
              Chat with {BROKER_NAME} on WhatsApp
            </a>

            <button
              onClick={dismiss}
              className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Not now
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
