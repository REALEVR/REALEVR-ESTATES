import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import {
  PLACE_COOKIE,
  placeFromCookieHeader,
  placeFromCoordinates,
  placeFromTimezone,
  isOutsideAfrica,
  serializePlace,
  DEFAULT_COUNTRY,
  type Place,
} from "@shared/africa";

/**
 * Where the visitor is, so discovery can start from there.
 *
 * The place comes, in order of trust, from: a place they chose; a position they
 * shared (the browser asks, and only when they press "Use my exact location");
 * their time zone (free, private, no prompt: it tells the country, usually); and
 * finally the platform's home country. It lives in a cookie so the server can order
 * every listing request by it without each page passing anything along
 * (see presentListings in server/routes.ts).
 *
 * It follows the person: once they have allowed location, it is re-read when they
 * come back to the tab (at most every ten minutes), so travelling from Kampala to
 * Nairobi changes what comes first. It never asks for permission by itself.
 */

interface PlaceApi {
  place: Place;
  /**
   * The visitor looks to be outside Africa (by time zone) and has not picked an African place
   * or shared a position. They are shown the "list your property free" welcome, not the renter's.
   */
  abroad: boolean;
  /** Pick a country (and optionally a city) by hand. Stays until they use their location again. */
  choose: (country: string, city?: string) => void;
  /** Ask the browser for the current position. Resolves to how it went. */
  shareLocation: () => Promise<"ok" | "denied" | "unavailable">;
}

const PlaceContext = createContext<PlaceApi | null>(null);

const REFRESH_EVERY_MS = 10 * 60 * 1000;

function readCookie(): Place | null {
  try {
    return placeFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

function writeCookie(place: Place) {
  try {
    document.cookie = `${PLACE_COOKIE}=${serializePlace(place)}; path=/; max-age=${30 * 24 * 3600}; samesite=lax`;
  } catch {
    /* cookies blocked: the site still works, just without nearest-first */
  }
}

function initialPlace(): Place {
  const saved = readCookie();
  // A guess made from the time zone is cheap to redo; a chosen or shared place is kept.
  if (saved && saved.source !== "timezone" && saved.source !== "default") return saved;
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  const guess = placeFromTimezone(zone) ?? saved ?? { country: DEFAULT_COUNTRY, source: "default" as const };
  // Written before anything renders, so the very first listing request is already ordered.
  writeCookie(guess);
  return guess;
}

const keyOf = (p: Place) => `${p.country}|${p.city ?? ""}`;

export function PlaceProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place>(initialPlace);
  const placeRef = useRef(place);
  placeRef.current = place;
  const lastRead = useRef(0);

  const apply = useCallback((next: Place) => {
    const changed = keyOf(next) !== keyOf(placeRef.current);
    writeCookie(next);
    placeRef.current = next;
    setPlace(next);
    if (changed) {
      // Everything listed is ordered by place on the server: ask again.
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/properties") });
    }
  }, []);

  const choose = useCallback(
    (country: string, city?: string) => apply({ country: country.toUpperCase(), ...(city ? { city } : {}), source: "chosen" }),
    [apply],
  );

  const readPosition = useCallback(
    (maximumAge: number) =>
      new Promise<"ok" | "denied" | "unavailable">((resolve) => {
        if (!navigator.geolocation) return resolve("unavailable");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const found = placeFromCoordinates(pos.coords.latitude, pos.coords.longitude);
            if (!found) return resolve("unavailable"); // not in Africa: keep what we have
            lastRead.current = Date.now();
            apply(found);
            resolve("ok");
          },
          (err) => resolve(err.code === 1 ? "denied" : "unavailable"),
          { timeout: 8000, maximumAge },
        );
      }),
    [apply],
  );

  const shareLocation = useCallback(() => readPosition(0), [readPosition]);

  // Follow the person, but only if they already allowed location, and never more than every ten minutes.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (Date.now() - lastRead.current < REFRESH_EVERY_MS) return;
      if (placeRef.current.source === "chosen") return; // they picked a place by hand: leave it
      try {
        const status = await (navigator as any).permissions?.query?.({ name: "geolocation" });
        if (status?.state === "granted") await readPosition(5 * 60 * 1000);
      } catch {
        /* no permissions API: do nothing */
      }
    };
    void refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [readPosition]);

  const abroad = useMemo(() => {
    if (place.source === "chosen" || place.source === "geo") return false;
    try {
      return isOutsideAfrica(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      return false;
    }
  }, [place.source]);

  const api = useMemo(() => ({ place, abroad, choose, shareLocation }), [place, abroad, choose, shareLocation]);
  return <PlaceContext.Provider value={api}>{children}</PlaceContext.Provider>;
}

export function usePlace(): PlaceApi {
  const ctx = useContext(PlaceContext);
  if (!ctx) throw new Error("usePlace must be used inside PlaceProvider");
  return ctx;
}
