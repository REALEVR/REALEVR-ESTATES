import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import AgentPanel from "./AgentPanel";
import { useNearbyPropertyAlerts } from "@/hooks/useNearbyPropertyAlerts";

/**
 * The signed-in "My Agent" slide-over — chat / recommendations / market
 * insight / news / rewards. Mounted once, globally, in App.tsx.
 *
 * It used to have its own floating pill in the bottom-right corner. Kevin
 * (components/kevin) now owns that corner as the one AI presence for
 * everybody, and opens this panel from his own header via the
 * "realevr:open-agent" window event, so there aren't two competing assistant
 * buttons stacked on top of each other.
 *
 * Also owns the single instance of useNearbyPropertyAlerts (opt-in location
 * sync + periodic nearby-property popups) — kept at this level rather than
 * inside AgentPanel so alerts keep arriving even while the panel is closed,
 * the way a real "proactive" assistant should behave. That is why this
 * component stays mounted even though it no longer draws a button.
 */
export default function AgentLauncher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const nearbyAlerts = useNearbyPropertyAlerts();

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener("realevr:open-agent", openPanel);
    return () => window.removeEventListener("realevr:open-agent", openPanel);
  }, []);

  if (!user) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Your RealEVR Agent</SheetTitle>
            <SheetDescription>Personalized picks, market insight, and news — just for you.</SheetDescription>
          </SheetHeader>
          <div className="mt-2 flex-1 overflow-hidden">
            <AgentPanel onClose={() => setOpen(false)} nearbyAlerts={nearbyAlerts} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
