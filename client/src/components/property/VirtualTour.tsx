import { useEffect, useRef } from "react";
import { Headset } from "lucide-react";
import { enterTourVr } from "@/lib/tourVr";

interface VirtualTourProps {
  tourUrl: string;
  isFullscreen?: boolean;
  /** Shows a floating "Enter VR" button over the tour - see
   * client/src/lib/tourVr.ts for what it actually does. Off by default:
   * this component is also used for small thumbnail-sized previews
   * (FurnishedRentalsPage.tsx's listing grid) where an overlay button
   * would just be clutter - opt in from full-size viewing contexts
   * (PropertyPage.tsx, FeaturedTour.tsx). */
  showVrButton?: boolean;
}

export default function VirtualTour({ tourUrl, isFullscreen = false, showVrButton = false }: VirtualTourProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFullscreen && containerRef.current) {
      const requestFullscreen = containerRef.current.requestFullscreen
        || (containerRef.current as any).mozRequestFullScreen
        || (containerRef.current as any).webkitRequestFullscreen
        || (containerRef.current as any).msRequestFullscreen;

      if (requestFullscreen) {
        requestFullscreen.call(containerRef.current);
      }
    }
  }, [isFullscreen]);

  return (
    <div
      ref={containerRef}
      className={`tour-container ${isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'relative h-full'}`}
    >
      <iframe
        ref={iframeRef}
        src={tourUrl}
        title="Virtual Property Tour"
        allowFullScreen
        // See VirtualTourModal.tsx's identical attribute for why this is
        // required for any VR/Cardboard mode the tour itself offers to
        // work at all inside an iframe.
        allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
        className="w-full h-full border-0"
      />
      {showVrButton && (
        <button
          type="button"
          onClick={() => enterTourVr(containerRef.current, iframeRef.current)}
          aria-label="Enter VR"
          title="View in VR - slot your phone into a headset once fullscreen"
          className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-black/75 transition-colors"
        >
          <Headset className="h-4 w-4" />
          Enter VR
        </button>
      )}
    </div>
  );
}
