/**
 * "VR Ready" badge — the NeoVision theme's honest way of surfacing this
 * platform's real capability: every property with `hasTour` has an
 * immersive 360° tour, viewable on a phone, tablet, desktop, OR a VR
 * headset browser. Deliberately doesn't claim a specific certified
 * headset integration (Quest/Vision Pro/etc.) this codebase can't verify
 * from here — "VR headset compatible" describes the real, general
 * capability of a 360° panorama viewer, not a fabricated feature.
 *
 * Two sizes: `sm` for overlaying a property card's image, `md` for a
 * standalone panel (see PropertyPage's tour section).
 */
import { Headset } from "lucide-react";

export default function VRBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const isSmall = size === "sm";
  return (
    <span className={`vr-badge ${isSmall ? "" : "text-xs px-3 py-1.5"}`}>
      <Headset className={isSmall ? "h-3 w-3" : "h-3.5 w-3.5"} />
      VR &amp; 360&deg; Ready
    </span>
  );
}
