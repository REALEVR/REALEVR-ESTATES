import { Minimize2 } from "lucide-react";

/**
 * The way out of a full-screen tour, always visible while one is showing: a clear, labelled pill in
 * the top corner (clear of a phone's notch), big enough to hit with a thumb. Esc still works on a
 * keyboard, but nobody should have to know that.
 */
export default function ExitFullscreenButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Exit full screen"
      style={{ top: "max(0.75rem, env(safe-area-inset-top))", right: "max(0.75rem, env(safe-area-inset-right))" }}
      className={`absolute z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8b46a]/70 bg-black/70 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b46a] ${className}`}
    >
      <Minimize2 className="h-4 w-4" aria-hidden="true" />
      Exit full screen
    </button>
  );
}
