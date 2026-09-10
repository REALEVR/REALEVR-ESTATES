/**
 * "Enter VR" trigger shared by every tour viewer (VirtualTourModal.tsx,
 * VirtualTour.tsx). One consistent, RealEVR-branded VR icon regardless of
 * which service actually hosts the tour behind it:
 *
 *   - Our own self-hosted panorama tours (server/templates/generated-tour.html,
 *     built for agent self-capture via server/tour-generator.ts) listen for
 *     the postMessage below and flip straight into the Photo Sphere Viewer
 *     Stereo plugin's headset mode — this is the one case we can guarantee
 *     actually works, since we author both ends of the message.
 *   - Third-party-hosted tours (a 3D Vista export, Lapentor, or anything
 *     else a `tourUrl` might point at) ignore a postMessage they were never
 *     written to expect, so this is a harmless no-op there — but most such
 *     platforms ship their own VR/Cardboard button already, and that
 *     button only works at all once the iframe actually delegates
 *     `xr-spatial-tracking`/gyroscope/accelerometer to it (see the `allow`
 *     attribute alongside every tour iframe), which is the real fix for
 *     that case. Requesting fullscreen here helps either way — most VR/
 *     Cardboard viewing modes assume the page is already fullscreen.
 */

export const TOUR_VR_MESSAGE = { source: "realevr-tour", action: "enter-vr" } as const;

/** Best-effort: request fullscreen on `container`, then ask the tour
 * iframe to enter VR mode if it's listening. Never throws — a headset
 * button doing nothing worse than "stay in the normal view" on an
 * unsupported tour is the correct failure mode, not a crash. */
export function enterTourVr(container: HTMLElement | null, iframe: HTMLIFrameElement | null): void {
    try {
        if (container && !document.fullscreenElement) {
            container.requestFullscreen?.().catch(() => {});
        }
    } catch {
        // Fullscreen can be denied (e.g. not triggered by a direct user
        // gesture in some embedding context) — VR entry itself still
        // proceeds below regardless.
    }
    try {
        iframe?.contentWindow?.postMessage(TOUR_VR_MESSAGE, "*");
    } catch {
        // A cross-origin iframe that rejects postMessage for some reason
        // shouldn't take the rest of the page down with it.
    }
}
