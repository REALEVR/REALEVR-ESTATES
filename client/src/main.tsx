import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted Font Awesome (GENE v1.11 fix) — was previously loaded from
// cdnjs.cloudflare.com via a <link> in index.html. That's an external
// webfont dependency: every icon on the site (nav, footer socials,
// category tabs, app-store buttons, etc.) is a CSS ::before glyph with no
// fallback content, so on any connection that can't reach that CDN —
// this sandbox's own verification environment included, confirmed via
// getComputedStyle before this fix — every icon silently collapses to an
// empty shape instead of erroring. Bundling the package locally removes
// that external dependency entirely: no runtime network call for icons
// at all, in dev, in this sandbox, or in production.
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for PWA installability (the landlord mini
// app, and installability site-wide) — see public/sw.js for what it does
// and, importantly, what it deliberately does NOT cache (any /api/ call).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
