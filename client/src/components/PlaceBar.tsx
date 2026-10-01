import { useState } from "react";
import { useLocation } from "wouter";
import { LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePlace } from "@/lib/place";
import { AFRICAN_COUNTRIES, countryByCode, placeLabel } from "@shared/africa";

// Pages that list homes: the bar belongs on these, and nowhere else.
const LISTING_PATHS = ["/", "/properties", "/rental-units", "/for-sale", "/bnbs", "/bank-sales", "/featured-properties", "/new-listings"];

const ANY_CITY = "__any__";

/**
 * "Showing homes near Kampala, Uganda": says where the listings are being
 * ordered from, lets the visitor use their exact location, or pick any
 * African country and city by hand.
 */
export default function PlaceBar() {
  const [path] = useLocation();
  const { place, abroad, choose, shareLocation } = usePlace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(place.country);
  const [city, setCity] = useState(place.city ?? ANY_CITY);
  const [busy, setBusy] = useState(false);

  if (!LISTING_PATHS.includes(path) || (abroad && path === "/")) return null;

  const cities = countryByCode(country)?.cities ?? [];

  const locate = async () => {
    setBusy(true);
    const result = await shareLocation();
    setBusy(false);
    if (result === "denied") toast({ title: "Location is blocked", description: "Allow location for this site in your browser, or pick a place by hand." });
    else if (result === "unavailable") toast({ title: "Couldn't find you in Africa", description: "Pick a country by hand instead." });
    else setOpen(false);
  };

  return (
    <>
      <div className="border-b border-border bg-secondary/50 px-4 text-xs md:px-8 md:text-sm">
        <div className="mx-auto flex h-9 max-w-[1500px] items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate md:hidden">
              Near <strong>{placeLabel(place)}</strong>
            </span>
            <span className="hidden truncate md:inline">
              Showing homes near <strong>{placeLabel(place)}</strong> first
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void locate()}
              disabled={busy}
              className="hidden items-center gap-1 text-accent underline-offset-2 hover:underline disabled:opacity-60 md:flex"
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              {place.source === "geo" ? "Update my location" : "Use my exact location"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-[36px] font-semibold text-foreground underline underline-offset-2 hover:text-accent"
            >
              Change
            </button>
          </span>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Where are you looking?</DialogTitle>
            <DialogDescription>Homes in this place come first. Everything else is still there below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={country}
              onValueChange={(code) => {
                setCountry(code);
                setCity(ANY_CITY);
              }}
            >
              <SelectTrigger aria-label="Country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {AFRICAN_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger aria-label="City">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CITY}>Anywhere in the country</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  choose(country, city === ANY_CITY ? undefined : city);
                  setOpen(false);
                }}
              >
                Show homes here
              </Button>
              <Button variant="outline" onClick={() => void locate()} disabled={busy}>
                <LocateFixed className="mr-1.5 h-4 w-4" /> Use my location
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
