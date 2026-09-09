import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";

interface VirtualTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
  tourUrl?: string;
  /** Rental-unit free preview (payments round 2): when set, the tour opens
   * immediately and free, then this many seconds later `onPreviewExpired`
   * fires so the caller can swap this modal for the payment prompt.
   * Omit entirely for a category that should never be time-limited (BnB,
   * for-sale, bank sales, or a rental unit the visitor has already paid
   * for) — undefined means "no timer, view for as long as you like." */
  previewSeconds?: number;
  onPreviewExpired?: () => void;
}

export default function VirtualTourModal({
  isOpen,
  onClose,
  propertyTitle,
  tourUrl = "https://app.lapentor.com/sphere/la-rose-apartments",
  previewSeconds,
  onPreviewExpired,
}: VirtualTourModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(previewSeconds ?? 0);
  // This is the core product — the 360 tour itself — loading into a plain
  // black rectangle with zero feedback while the third-party embed (often
  // several seconds on the data-constrained mobile connections this
  // platform's Uganda audience is most likely on, per PropertyCard.tsx's
  // own lazy-loading comment) fetches.
  const [tourLoaded, setTourLoaded] = useState(false);

  // Radix unmounts <DialogContent> (and the iframe inside it) when the
  // dialog closes, so the iframe itself does reload fresh on every open —
  // but this component instance stays mounted the whole time (callers hold
  // it open with an isOpen prop, not by conditionally rendering
  // <VirtualTourModal>), so tourLoaded is *not* naturally reset by that.
  // Without this, reopening the same tour after closing it once would
  // leave the loading overlay permanently skipped from the second open on.
  useEffect(() => {
    if (isOpen) setTourLoaded(false);
  }, [isOpen]);

  // Restart the countdown fresh every time the modal opens with a preview
  // limit — without resetting on `isOpen`, closing and reopening the same
  // tour (e.g. after paying elsewhere and coming back) would either skip
  // the countdown or fire onPreviewExpired instantly from stale state.
  useEffect(() => {
    if (!isOpen || !previewSeconds) return;
    setSecondsLeft(previewSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const timeout = setTimeout(() => {
      onPreviewExpired?.();
    }, previewSeconds * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPreviewExpired
    // intentionally excluded: it's a fresh closure from the parent on every
    // render, and including it would restart the countdown on every tick.
  }, [isOpen, previewSeconds]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden border-none bg-transparent">
        <div className="bg-white w-full h-12 flex items-center justify-between px-4 rounded-t-lg">
          <DialogTitle className="text-lg truncate">
            Virtual Tour: {propertyTitle}
          </DialogTitle>
          <div className="flex items-center gap-3 shrink-0">
            {previewSeconds !== undefined && (
              <span className="text-xs font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1 whitespace-nowrap">
                Free preview: {secondsLeft}s
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close virtual tour">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="relative w-full h-[calc(90vh-48px)] bg-black rounded-b-lg">
          <AnimatePresence>
            {!tourLoaded && (
              <motion.div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Loader2 className="h-8 w-8 text-white/70 animate-spin" />
                <p className="text-sm text-white/70">Loading virtual tour…</p>
              </motion.div>
            )}
          </AnimatePresence>
          <iframe
            src={tourUrl}
            title={`Virtual tour of ${propertyTitle}`}
            className="w-full h-full rounded-b-lg"
            allowFullScreen
            onLoad={() => setTourLoaded(true)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
