import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

interface VirtualTourProps {
  tourUrl: string;
  isFullscreen?: boolean;
}

export default function VirtualTour({ tourUrl, isFullscreen = false }: VirtualTourProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Same fix as VirtualTourModal.tsx: the 360 embed used to load into a
  // blank rectangle with no feedback. Keyed to tourUrl (not just mount)
  // so navigating between properties on PropertyPage — same component
  // instance, new tourUrl — re-shows the loading state for the new tour
  // instead of leaving the previous tour's "loaded" flag stuck true.
  const [tourLoaded, setTourLoaded] = useState(false);
  useEffect(() => {
    setTourLoaded(false);
  }, [tourUrl]);

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
        ref={iframeRef}
        src={tourUrl}
        title="Virtual Property Tour"
        allowFullScreen
        className="w-full h-full border-0"
        onLoad={() => setTourLoaded(true)}
      />
    </div>
  );
}
