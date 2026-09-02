import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

/**
 * Real browser push notifications (server/gene/web-push.ts). Deliberately
 * opt-in (never auto-prompts for Notification permission on mount — that's
 * a well-known dark pattern browsers actively discourage) — a UI element
 * calls `subscribe()` in direct response to a click.
 *
 * Gracefully does nothing (never throws, `available` stays false) when:
 * the browser doesn't support Push/Notification APIs, the server hasn't
 * configured VAPID keys yet, or the visitor isn't signed in (subscriptions
 * are per-user).
 */
export function usePushSubscription() {
  const { user } = useAuth();
  const [available, setAvailable] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [subscribed, setSubscribed] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
    if (!supported || !user) return;

    let cancelled = false;
    fetch("/api/gene/push/vapid-public-key")
      .then((r) => r.json())
      .then(async (d) => {
        if (cancelled) return;
        const key = typeof d?.publicKey === "string" ? d.publicKey : null;
        setVapidPublicKey(key);
        setAvailable(!!key);
        if (key) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            setSubscribed(!!existing);
          } catch {
            // Service worker not ready yet — subscribed stays false, fine.
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!available || !vapidPublicKey || !user) return false;
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      await apiRequest("POST", "/api/gene/push/subscribe", { subscription: sub.toJSON() });
      setSubscribed(true);
      return true;
    } catch (err) {
      console.error("[usePushSubscription] subscribe failed:", err);
      return false;
    }
  }, [available, vapidPublicKey, user]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/gene/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    } catch (err) {
      console.error("[usePushSubscription] unsubscribe failed:", err);
    } finally {
      setSubscribed(false);
    }
  }, []);

  return { available, permission, subscribed, subscribe, unsubscribe };
}

// Web Push applicationServerKey must be a Uint8Array, but the server hands
// back a URL-safe base64 string — this is the standard conversion.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
