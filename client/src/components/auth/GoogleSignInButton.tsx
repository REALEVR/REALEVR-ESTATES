import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

declare global {
  interface Window {
    google?: any;
  }
}

/** sessionStorage flag WhatsAppNumberPrompt (rendered once, globally, in
 * App.tsx) watches for — set here, in the one place both Google sign-in
 * paths below funnel through, whenever a Google account has no phone
 * number on file (Google never gives us one). */
export const PROMPT_WHATSAPP_FLAG = "realevr_prompt_whatsapp";

let gisScriptPromise: Promise<void> | null = null;
function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

let clientIdPromise: Promise<string | null> | null = null;
function fetchGoogleClientId(): Promise<string | null> {
  if (clientIdPromise) return clientIdPromise;
  clientIdPromise = fetch("/api/config/google-client-id")
    .then((r) => r.json())
    .then((d) => (typeof d?.clientId === "string" ? d.clientId : null))
    .catch(() => null);
  return clientIdPromise;
}

interface GoogleSignInButtonProps {
  onSignedIn: (user: Omit<User, "password">) => void;
  onError?: (message: string) => void;
  className?: string;
}

/**
 * "Continue with Google" — two mechanisms, same result, tried in order:
 *
 * 1. Google Identity Services (GIS): renders Google's own button via the
 *    accounts.google.com/gsi/client script. Clicking it shows Google's
 *    account chooser as a genuine in-viewport overlay that GIS's own
 *    script manages (an iframe on Google's domain, permitted for their
 *    own official widget) — nothing ever navigates away or opens a
 *    separate window/tab, mobile included. The resulting signed ID token
 *    ("credential") goes to POST /api/auth/google/onetap, which verifies
 *    it server-side before ever logging anyone in.
 *
 * 2. Classic popup window (window.open + postMessage): the fallback if
 *    GIS can't initialize (GOOGLE_CLIENT_ID not configured, script
 *    blocked/offline). This is the flow this app used exclusively before —
 *    on desktop it behaves like a real popup, but on many mobile browsers
 *    `window.open` gets silently upgraded to a full new tab, which is
 *    exactly the "has to leave the page" problem GIS above solves. Kept
 *    only as a safety net, not the primary path anymore.
 *
 * Both paths funnel through the same success handling here (cache the
 * user, flag PROMPT_WHATSAPP_FLAG if they have no phone number yet), so
 * every "Continue with Google" button in the app — AuthModal, AuthGate —
 * behaves identically regardless of which mechanism actually ran.
 */
export default function GoogleSignInButton({ onSignedIn, onError, className }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"loading" | "gis" | "fallback">("loading");
  const [popupBusy, setPopupBusy] = useState(false);

  const handleSuccess = (user: Omit<User, "password">, needsPhone: boolean) => {
    if (needsPhone) {
      try {
        sessionStorage.setItem(PROMPT_WHATSAPP_FLAG, "1");
      } catch {
        // Private-browsing/storage-disabled — the prompt is a nice-to-have
        // mechanism, never worth failing the actual sign-in over.
      }
    }
    queryClient.setQueryData(["/api/user"], user);
    onSignedIn(user);
  };

  useEffect(() => {
    let cancelled = false;

    async function handleCredential(response: { credential: string }) {
      try {
        const res = await apiRequest("POST", "/api/auth/google/onetap", { credential: response.credential });
        const data = await res.json();
        handleSuccess(data.user, !!data.needsPhone);
      } catch (error: any) {
        onError?.(error?.message?.replace(/^\d+:\s*/, "") || "Google sign-in failed. Please try again.");
      }
    }

    (async () => {
      const clientId = await fetchGoogleClientId();
      if (cancelled) return;
      if (!clientId) {
        setMode("fallback");
        return;
      }
      try {
        await loadGisScript();
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) {
          if (!cancelled) setMode("fallback");
          return;
        }
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential, ux_mode: "popup" });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 320,
        });
        setMode("gis");
      } catch {
        if (!cancelled) setMode("fallback");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePopupFallback = () => {
    setPopupBusy(true);
    const width = 480;
    const height = 620;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "/api/auth/google",
      "realevr-google-auth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      setPopupBusy(false);
      onError?.("Please allow popups for this site and try again.");
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "realevr-google-auth") return;

      window.removeEventListener("message", handleMessage);
      setPopupBusy(false);

      if (event.data.ok) {
        handleSuccess(event.data.user, !!event.data.needsPhone);
      } else {
        onError?.(event.data.error || "Google sign-in failed. Please try again.");
      }
    };
    window.addEventListener("message", handleMessage);

    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", handleMessage);
        setPopupBusy(false);
      }
    }, 500);
  };

  if (mode === "fallback") {
    return (
      <Button type="button" variant="outline" className={className} onClick={handlePopupFallback} disabled={popupBusy}>
        <GoogleIcon className="h-4 w-4" />
        Continue with Google
      </Button>
    );
  }

  return (
    <div className={className}>
      {mode === "loading" && (
        <div className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-300 text-sm text-gray-400">
          Loading…
        </div>
      )}
      <div ref={containerRef} className={mode === "gis" ? "flex justify-center [&>div]:w-full" : "hidden"} />
    </div>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.42 3.58v3h3.91c2.29-2.11 3.53-5.22 3.53-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.96-2.91l-3.91-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.93H1.28v3.09C3.28 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.31 14.32c-.24-.72-.38-1.49-.38-2.32s.14-1.6.38-2.32V6.59H1.28A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.28 5.41l4.03-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.28 2.7 1.28 6.59l4.03 3.09C6.25 6.85 8.89 4.75 12 4.75Z" />
    </svg>
  );
}
