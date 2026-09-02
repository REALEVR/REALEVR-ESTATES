import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AuthGate from "./AuthGate";

/**
 * Browsing is no longer gated - visitors land straight on the real site.
 * Instead, this nudges anyone not signed in toward the AuthGate card on a
 * schedule: a dismissible popup 20 seconds in, then ~4 more dismissible
 * reappearances spaced across the next 10 minutes, and a final one right
 * at the 10-minute mark that can't be dismissed - if someone's genuinely
 * still browsing anonymously 10 minutes in, that last appearance behaves
 * like the old compulsory gate and stays up until they actually sign in.
 *
 * All five timers are scheduled once, up front, independent of each other -
 * dismissing an early popup doesn't cancel the later ones, which is what
 * makes the "~5 reminders, then lock" behavior work without re-deriving a
 * schedule on every dismiss.
 *
 * Known simplification: timers are in-memory (setTimeout), so a full page
 * reload restarts the 10-minute countdown rather than resuming it - fine
 * for a first pass, not persisted across reloads.
 */
const REMINDER_SECONDS = [20, 165, 310, 455, 600]; // last entry (600s = 10min) is the locked one
const LOCK_INDEX = REMINDER_SECONDS.length - 1;

export default function SignupNudgeGate() {
    const { user, isLoading } = useAuth();
    const [visibleIndex, setVisibleIndex] = useState<number | null>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        // Signed in (or the initial /api/user check hasn't resolved yet) -
        // nothing to schedule, and clear anything already pending.
        if (isLoading || user) {
            timers.current.forEach(clearTimeout);
            timers.current = [];
            setVisibleIndex(null);
            return;
        }

        timers.current = REMINDER_SECONDS.map((_, index) =>
            setTimeout(() => setVisibleIndex(index), REMINDER_SECONDS[index] * 1000)
        );

        return () => {
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
    }, [user, isLoading]);

    if (user || visibleIndex === null) return null;

    const isLocked = visibleIndex === LOCK_INDEX;
    return <AuthGate onDismiss={isLocked ? undefined : () => setVisibleIndex(null)} />;
}
