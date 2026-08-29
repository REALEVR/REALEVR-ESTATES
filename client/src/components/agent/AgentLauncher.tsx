import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles } from "lucide-react";
import AgentPanel from "./AgentPanel";

/**
 * Persistent "My Agent" launcher — a floating button visible only to signed-in
 * users, opening a slide-over with chat / recommendations / market insight /
 * news. Mounted once, globally, in App.tsx.
 */
export default function AgentLauncher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open your RealEVR agent"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-5 w-5" />
        <span className="hidden text-sm font-medium sm:inline">My Agent</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Your RealEVR Agent</SheetTitle>
            <SheetDescription>Personalized picks, market insight, and news — just for you.</SheetDescription>
          </SheetHeader>
          <div className="mt-2 flex-1 overflow-hidden">
            <AgentPanel onClose={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
