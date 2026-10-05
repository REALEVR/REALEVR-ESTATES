import { useEffect, useRef, useState } from "react";

/**
 * One Google AdSense display ad. Shows nothing at all until the site owner sets VITE_ADSENSE_CLIENT (ca-pub-...) and
 * a slot id (VITE_ADSENSE_SLOT, or the `slot` prop), so it can sit in the pages now and start earning the day the
 * AdSense account is approved. Used on listing results, place pages and guides, never beside a tour or a form.
 */
const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim();
const DEFAULT_SLOT = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined)?.trim();

let scriptRequested = false;
function loadScript(client: string) {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

export default function AdSlot({ slot, className = "" }: { slot?: string; className?: string }) {
  const id = slot?.trim() || DEFAULT_SLOT;
  const ref = useRef<HTMLModElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT || !id) return;
    loadScript(CLIENT);
    setReady(true);
  }, [id]);

  useEffect(() => {
    if (!ready || !ref.current) return;
    try {
      ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      // The ad script was blocked or is still loading: the page is fine without it.
    }
  }, [ready]);

  // Nothing until the browser has loaded the ad script: crawlers and server-rendered pages never see an empty label.
  if (!CLIENT || !id || !ready) return null;
  return (
    <aside className={`mx-auto my-8 w-full max-w-5xl ${className}`} aria-label="Advertisement">
      <p className="mb-1 text-center text-[11px] uppercase tracking-wide text-muted-foreground">Advertisement</p>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={id}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
