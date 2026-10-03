import { useEffect, useRef, useState } from "react";
import { Headset } from "lucide-react";
import { enterTourVr } from "@/lib/tourVr";
import ExitFullscreenButton from "./ExitFullscreenButton";

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
  /** Called when the visitor leaves full screen (the Exit button, or Esc), so the parent can drop its own full-screen state. */
  onExitFullscreen?: () => void;
  /** The property's cover photo: shown while the tour is loading, then faded away. */
  coverImage?: string | null;
}

export default function VirtualTour({ tourUrl, isFullscreen = false, showVrButton = false, onExitFullscreen, coverImage }: VirtualTourProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [tourUrl]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // True while the browser has THIS tour full screen (by the prop below, or by the Enter VR button).
  const [apiFull, setApiFull] = useState(false);
  const wasMine = useRef(false);
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null;
      const mine = !!fs && fs === containerRef.current;
      setApiFull(mine);
      // Left with Esc or the browser's own control: let the parent know too, or its overlay stays up.
      if (wasMine.current && !mine) onExitFullscreenRef.current?.();
      wasMine.current = mine;
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  const onExitFullscreenRef = useRef(onExitFullscreen);
  onExitFullscreenRef.current = onExitFullscreen;

  const exitFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if ((document as any).webkitFullscreenElement) (document as any).webkitExitFullscreen?.();
    } catch {
      /* fall through to the parent's own state */
    }
    onExitFullscreen?.();
  };

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
        // The page has arrived; give the first picture a moment to draw before the cover photo fades.
        onLoad={() => window.setTimeout(() => setLoaded(true), 500)}
      />
      {coverImage && (
        <div
          aria-hidden={loaded}
          className={`pointer-events-none absolute inset-0 z-[1] transition-opacity duration-500 ease-out ${loaded ? "opacity-0" : "opacity-100"}`}
        >
          <img src={coverImage} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            Loading the 360° tour…
          </span>
        </div>
      )}
      {(isFullscreen || apiFull) && <ExitFullscreenButton onClick={exitFullscreen} />}
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
