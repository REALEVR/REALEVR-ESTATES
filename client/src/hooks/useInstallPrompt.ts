import { useEffect, useState, useCallback } from "react";

/**
 * Captures the browser's "beforeinstallprompt" event (Chrome/Edge/Android)
 * so we can show our own "Install app" button instead of relying on the
 * browser's default install UI. On iOS Safari this event doesn't exist —
 * `promptable` stays false there, and the landlord dashboard shows manual
 * "Add to Home Screen" instructions instead (see AgentDashboard.tsx).
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
    return choice?.outcome === "accepted";
  }, [deferredPrompt]);

  return { promptable: !!deferredPrompt, installed, promptInstall };
}
