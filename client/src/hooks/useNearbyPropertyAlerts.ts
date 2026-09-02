import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncAgentLocation, fetchAgentNearby } from "@/hooks/useAgent";

const STORAGE_KEY = "realevr:locationSyncEnabled";
const RESYNC_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Opt-in "properties near me" popups. Nothing here runs until the user
 * explicitly turns it on (see the toggle in AgentPanel) — we never request
 * geolocation permission without a deliberate user action.
 *
 * On enable, and then periodically while the tab is visible: reads the
 * browser's geolocation, reverse-geocodes it client-side (BigDataCloud's
 * free, keyless reverse-geocode endpoint — no server-side dependency or
 * API key needed for this), posts the resulting place label to the agent
 * profile, and checks for newly-nearby matches. When the backend reports a
 * genuinely new match (see personal-agent.ts's notifiedNearbyPropertyIds
 * dedup) this surfaces a toast popup, and the same message is also waiting
 * in the agent's Chat tab.
 */
export function useNearbyPropertyAlerts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const syncLocation = useSyncAgentLocation();
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable — default to off, no crash.
    }
  }, []);

  const runSync = useCallback(async () => {
    if (!user || !navigator.geolocation) return;
    setStatus("syncing");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 5 * 60 * 1000 })
      );
      const { latitude: lat, longitude: lng } = position.coords;

      let label = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      try {
        const geoRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          label = [geo.locality, geo.city, geo.principalSubdivision, geo.countryName].filter(Boolean).join(", ") || label;
        }
      } catch {
        // Reverse geocoding failed — fall back to raw coordinates as the label.
      }

      await syncLocation.mutateAsync({ lat, lng, label });
      const nearby = await fetchAgentNearby();
      queryClient.setQueryData(["/api/gene/agent/nearby"], nearby);

      if (nearby.notified && nearby.matches.length > 0) {
        const first = nearby.matches[0];
        toast({
          title: `Properties near ${nearby.location}`,
          description:
            nearby.matches.length === 1
              ? `"${first.property.title}" just came up near you — check your agent for details.`
              : `${nearby.matches.length} properties near you, including "${first.property.title}" — check your agent for the full list.`,
        });
        // The Chat tab already has the matching message waiting; make sure a
        // subsequent open of the panel shows it fresh.
        queryClient.invalidateQueries({ queryKey: ["/api/gene/agent/chat/history"] });
      }
      setStatus("idle");
    } catch (err) {
      setStatus("error");
    }
  }, [user, syncLocation, toast, queryClient]);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Best-effort only.
      }
      if (next) void runSync();
    },
    [runSync]
  );

  useEffect(() => {
    if (!enabled || !user) return;

    void runSync();
    intervalRef.current = window.setInterval(() => void runSync(), RESYNC_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user]);

  return { enabled, setEnabled, status };
}
