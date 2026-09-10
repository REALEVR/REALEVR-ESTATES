import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Maximize, Minimize, Headset } from "lucide-react";
import { enterTourVr } from "@/lib/tourVr";

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tourContainerRef = useRef<HTMLDivElement>(null);
  const tourIframeRef = useRef<HTMLIFrameElement>(null);

  // True "own window" fullscreen (the Fullscreen API, not just a bigger
  // modal) - the tour fills the whole screen with no browser chrome, and
  // "Exit fullscreen" (or the browser's own Esc handling) hands it straight
  // back to the normal windowed view. Tracking document.fullscreenElement
  // via the fullscreenchange event (rather than only toggling on the
  // button click) means the icon/label stay correct even when the viewer
  // exits with Esc instead of clicking our own button.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === tourContainerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Leaving the modal (closing it, or it unmounting) should never leave the
  // browser stuck in fullscreen with nothing visible behind it.
  useEffect(() => {
    if (!isOpen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [isOpen]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      tourContainerRef.current?.requestFullscreen().catch(() => {});
    }
  };

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
        {/* Both the header bar and the iframe live inside this one ref'd
            container, so entering fullscreen (which only shows this
            element and its descendants, hiding everything else on the
            page - the modal chrome, the browser's own UI) still leaves
            the title, the "back to normal window" button, and Close all
            reachable, not just a bare iframe with no way out but Esc. */}
        <div ref={tourContainerRef} className="w-full h-full flex flex-col bg-black">
          <div className="bg-white w-full h-12 flex items-center justify-between px-4 rounded-t-lg shrink-0">
            <DialogTitle className="text-lg truncate">
              Virtual Tour: {propertyTitle}
            </DialogTitle>
            <div className="flex items-center gap-3 shrink-0">
              {previewSeconds !== undefined && (
                <span className="text-xs font-medium text-muted-foreground bg-secondary rounded-full px-3 py-1 whitespace-nowrap">
                  Free preview: {secondsLeft}s
                </span>
              )}
              {/* Enter VR - see client/src/lib/tourVr.ts for exactly what
                  this does and doesn't guarantee depending on who's
                  actually hosting this tour. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => enterTourVr(tourContainerRef.current, tourIframeRef.current)}
                aria-label="Enter VR"
                title="View in VR - slot your phone into a headset once fullscreen"
              >
                <Headset className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close virtual tour">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="w-full flex-1 bg-black rounded-b-lg">
            <iframe
              ref={tourIframeRef}
              src={tourUrl}
              title={`Virtual tour of ${propertyTitle}`}
              className="w-full h-full rounded-b-lg"
              allowFullScreen
              // Without this, a VR/Cardboard button already built into the
              // hosted tour itself (3D Vista's own player, Lapentor, or our
              // own generated-tour.html panoramas) is silently blocked: an
              // iframe doesn't inherit these permissions from the parent
              // page by default, so device-orientation-driven VR mode
              // never activates no matter what the tour's own UI offers.
              allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
