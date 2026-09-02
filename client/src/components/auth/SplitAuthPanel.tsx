import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Home, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useProperties } from "@/hooks/usePropertyData";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { User } from "@shared/schema";

/**
 * The polished "sign in with an existing account" alternative to the
 * guided AI conversation - reached via ConversationalAuthGate's "Already
 * have an account? Sign in" link, never the primary/default view (that's
 * still the compulsory conversational flow). Split-screen: a real login
 * form on the left, an auto-sliding showcase of real listings on the
 * right (hidden below `lg` - this is a bonus, not core functionality).
 *
 * Google sign-in reuses the exact popup + postMessage flow already built
 * and working in AuthModal.tsx / server/gene/google-auth.ts, rather than
 * a new auth library - one Google integration, two entry points.
 */
export default function SplitAuthPanel({ onBackToChat }: { onBackToChat: () => void }) {
    const { loginMutation } = useAuth();
    const { toast } = useToast();
    const { data: properties } = useProperties();

    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [googleBusy, setGoogleBusy] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        loginMutation.mutate({ username: loginUsername, password: loginPassword });
    };

    const handleGoogle = () => {
        setGoogleBusy(true);
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
            setGoogleBusy(false);
            toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" });
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.source !== "realevr-google-auth") return;

            window.removeEventListener("message", handleMessage);
            setGoogleBusy(false);

            if (event.data.ok) {
                const user = event.data.user as Omit<User, "password">;
                queryClient.setQueryData(["/api/user"], user);
                toast({ title: "Signed in with Google", description: `Welcome, ${user.fullName || user.username}!` });
            } else {
                toast({ title: "Google sign-in failed", description: event.data.error || "Please try again.", variant: "destructive" });
            }
        };
        window.addEventListener("message", handleMessage);

        const pollClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(pollClosed);
                window.removeEventListener("message", handleMessage);
                setGoogleBusy(false);
            }
        }, 500);
    };

    return (
        <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl bg-card shadow-2xl lg:grid-cols-12">
            {/* Left: the actual auth form */}
            <div className="flex flex-col justify-center gap-6 p-8 lg:col-span-5 lg:p-12">
                <div>
                    <h1 className="font-display text-2xl font-medium text-foreground">RealEVR Estates</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
                </div>

                <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={googleBusy}>
                    {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
                    Continue with Google
                </Button>

                <div className="relative text-center text-xs text-muted-foreground">
                    <span className="relative z-10 bg-card px-2">or sign in with your username</span>
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <Input
                        placeholder="Username"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        required
                        autoFocus
                    />
                    <Input
                        type="password"
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                    />
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                        {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sign In
                    </Button>
                </form>

                <button
                    onClick={onBackToChat}
                    className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    <LogIn size={13} />
                    New here? Start the guided sign-up instead
                </button>

                <p className="text-xs text-muted-foreground">
                    By continuing you agree to our{" "}
                    <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link> and{" "}
                    <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
                </p>
            </div>

            {/* Right: auto-sliding showcase of real listings - decorative, hidden below lg */}
            <div className="relative hidden overflow-hidden lg:col-span-7 lg:block">
                <PropertyShowcase properties={properties ?? []} />
            </div>
        </div>
    );
}

function PropertyShowcase({ properties }: { properties: Array<{ id: number; title: string; location: string; price: number; currency: string; imageUrl: string; hasTour?: boolean | null }> }) {
    const slides = properties.filter((p) => p.imageUrl).slice(0, 6);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (slides.length < 2 || paused) return;
        const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 4000);
        return () => clearInterval(timer);
    }, [slides.length, paused]);

    // Keep `index` in range if the property list shrinks out from under it.
    useEffect(() => {
        if (index >= slides.length && slides.length > 0) setIndex(0);
    }, [slides.length, index]);

    if (slides.length === 0) {
        return (
            <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-emerald-900 to-stone-900 text-emerald-100">
                <Home size={32} className="opacity-70" />
                <p className="text-sm">New listings are on their way.</p>
            </div>
        );
    }

    const current = slides[index];
    const tourReadyCount = properties.filter((p) => p.hasTour).length;

    return (
        <div
            className="relative h-full min-h-[520px]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {slides.map((slide, i) => (
                <div
                    key={slide.id}
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
                    style={{ backgroundImage: `url(${slide.imageUrl})`, opacity: i === index ? 1 : 0 }}
                />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

            {/* Manual controls */}
            <button
                onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
                aria-label="Previous property"
                className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
            >
                <ChevronLeft size={18} />
            </button>
            <button
                onClick={() => setIndex((i) => (i + 1) % slides.length)}
                aria-label="Next property"
                className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
            >
                <ChevronRight size={18} />
            </button>

            {/* Live platform stats - real numbers, not invented claims */}
            <div className="absolute left-8 right-8 top-8 rounded-2xl bg-emerald-900/40 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    <ShieldCheck size={14} />
                    RealEVR Estates, live right now
                </div>
                <p className="mt-1 text-sm text-white">
                    {properties.length} listing{properties.length === 1 ? "" : "s"} on the platform
                    {tourReadyCount > 0 && <> · {tourReadyCount} with a VR walkthrough</>}
                </p>
            </div>

            {/* Current listing details */}
            <div className="absolute bottom-8 left-8 right-8 text-white">
                {current.hasTour && (
                    <span className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
                        3D VR Walkthrough Ready
                    </span>
                )}
                <h2 className="font-display text-2xl font-medium leading-tight">{current.title}</h2>
                <div className="mt-2 flex items-center gap-4 text-sm text-white/80">
                    <span>{current.location}</span>
                    <span className="font-semibold text-white">
                        {current.currency} {current.price.toLocaleString()}
                    </span>
                </div>
                <div className="mt-4 flex gap-1.5">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            aria-label={`Go to slide ${i + 1}`}
                            aria-current={i === index}
                            className={`h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-white" : "w-1.5 bg-white/40"}`}
                        />
                    ))}
                </div>
            </div>
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
