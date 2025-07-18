import { useEffect, useRef } from "react";

interface VirtualTourProps {
  tourUrl: string;
  isFullscreen?: boolean;
}

export default function VirtualTour({ tourUrl, isFullscreen = false }: VirtualTourProps) {
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
        className="w-full h-full border-0"
      />
    </div>
  );
}
