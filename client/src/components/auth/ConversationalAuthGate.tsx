import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, LogIn, Send } from "lucide-react";
import houseImg from "@/assets/images/hero-house.jpg";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { User } from "@shared/schema";

interface ChatMessage {
    role: "bot" | "user";
    text: string;
}

interface OnboardingProfile {
    fullName?: string;
    email?: string;
    phone?: string;
    role?: "tenant" | "agent";
}

const WELCOME: ChatMessage = {
    role: "bot",
    text:
        "Hi there! Welcome to RealEVR Estates. I'll get you set up with an account in a minute — " +
        "what's your name?",
};

const LOGIN_WELCOME: ChatMessage = {
    role: "bot",
    text: "Welcome back! What's your username or email?",
};

/**
 * Full-site takeover shown whenever there's no signed-in user - a single screen
 * (backed by a real house photo, not a generic gradient) that handles BOTH new
 * signups and returning logins the same conversational way, plus a one-click
 * Google option. There's no separate "login page" to hand off to: everything
 * happens right here, so signing in never feels like leaving the site to fill
 * out a form.
 *
 * - New here: a short guided conversation (via Gemini, server-side) collects
 *   name/email/phone/role, then a dedicated password step, then auto-login.
 * - Returning: a scripted (no AI round-trip needed - it's just two questions)
 *   chat asks for username-or-email, then password, and signs in through the
 *   exact same session-based /api/login this app has always used.
 * - Google: reuses the popup + postMessage flow from server/gene/google-auth.ts
 *   (also used by AuthModal.tsx) - one Google OAuth integration, not a new one.
 */
export default function ConversationalAuthGate() {
    const { loginMutation } = useAuth();
    const { toast } = useToast();
    const [mode, setMode] = useState<"signup" | "login">("signup");
    const [googleBusy, setGoogleBusy] = useState(false);

    // --- Signup (AI-guided) state ---
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [profile, setProfile] = useState<OnboardingProfile>({});
    const [readyForPassword, setReadyForPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);

    // --- Login (scripted, no AI needed - it's just two questions) state ---
    const [loginMessages, setLoginMessages] = useState<ChatMessage[]>([LOGIN_WELCOME]);
    const [loginInput, setLoginInput] = useState("");
    const [loginStep, setLoginStep] = useState<"identifier" | "password">("identifier");
    const [loginIdentifier, setLoginIdentifier] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, readyForPassword, loginMessages, loginStep, mode]);

    const handleSend = async () => {
        const message = input.trim();
        if (!message || isLoading) return;

        setInput("");
        const nextMessages = [...messages, { role: "user" as const, text: message }];
        setMessages(nextMessages);
        setIsLoading(true);

        try {
            const res = await apiRequest("POST", "/api/ai/onboarding-chat", {
                message,
                history: nextMessages.slice(-10),
                profile,
            });
            const data = await res.json();
            setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
            if (data.profile) setProfile(data.profile);
            if (data.readyForPassword) setReadyForPassword(true);
        } catch (error: any) {
            const notConfigured = String(error?.message || "").includes("503");
            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text: notConfigured
                        ? "Sign-in setup isn't fully configured on this server yet — please try again shortly, or contact support."
                        : "Sorry, I had trouble with that. Could you try again?",
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterError(null);

        if (password.length < 6) {
            setRegisterError("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setRegisterError("Passwords don't match.");
            return;
        }

        setIsRegistering(true);
        try {
            const res = await apiRequest("POST", "/api/ai/onboarding-register", {
                ...profile,
                password,
                confirmPassword,
            });
            const data = await res.json();
            // Adopt the freshly-created, now-logged-in user immediately - no reload needed.
            queryClient.setQueryData(["/api/user"], data.user);
        } catch (error: any) {
            setRegisterError(error.message || "Failed to create your account. Please try again.");
        } finally {
            setIsRegistering(false);
        }
    };

    // Login is just two questions, asked one at a time in the same chat style -
    // no Gemini call needed, so this is entirely local/instant.
    const handleLoginIdentifierSend = () => {
        const value = loginInput.trim();
        if (!value) return;
        setLoginInput("");
        setLoginIdentifier(value);
        setLoginMessages((prev) => [
            ...prev,
            { role: "user", text: value },
            { role: "bot", text: "Thanks — enter your password below to finish signing in." },
        ]);
        setLoginStep("password");
    };

    const handleLoginPasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loginMutation.mutate({ username: loginIdentifier, password: loginPassword });
    };

    const switchMode = (next: "signup" | "login") => {
        setMode(next);
        // Re-asking is a fair default if someone bounces back and forth after a
        // failed attempt - a blank password field is safer than a stale one.
        if (next === "login") setLoginPassword("");
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
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-cover bg-center p-4"
            style={{
                backgroundImage: `linear-gradient(to bottom, rgba(6,32,22,0.78), rgba(12,10,9,0.9)), url(${houseImg})`,
            }}
        >
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-center justify-between bg-[#FF5A5F] px-6 py-4 text-white">
                    <div className="flex items-center gap-2">
                        <Bot size={20} />
                        <span className="font-semibold">
                            {mode === "signup" ? "RealEVR Estates — Let's get you set up" : "RealEVR Estates — Welcome back"}
                        </span>
                    </div>
                </div>

                <div className="space-y-3 border-b border-gray-100 px-6 py-4">
                    <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={googleBusy}>
                        {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
                        Continue with Google
                    </Button>
                    <div className="relative text-center text-xs text-gray-400">
                        <span className="relative z-10 bg-white px-2">
                            {mode === "signup" ? "or tell me about yourself below" : "or sign in with your username/email below"}
                        </span>
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-200" />
                    </div>
                </div>

                {mode === "signup" ? (
                    <>
                        <div className="flex h-[420px] flex-col gap-3 overflow-y-auto px-6 py-4">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                                            m.role === "user" ? "bg-[#FF5A5F] text-white" : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {m.text}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-400">Typing...</div>
                                </div>
                            )}

                            {readyForPassword && (
                                <form onSubmit={handleRegister} className="mt-2 space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                    <p className="text-sm font-medium text-emerald-900">
                                        Last step — set a password to secure your account.
                                    </p>
                                    <Input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <Input
                                        type="password"
                                        placeholder="Confirm password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                    {registerError && <p className="text-sm text-red-600">{registerError}</p>}
                                    <Button type="submit" className="w-full" disabled={isRegistering}>
                                        {isRegistering ? "Creating your account..." : "Create my account"}
                                    </Button>
                                </form>
                            )}
                            <div ref={endRef} />
                        </div>

                        {!readyForPassword && (
                            <div className="flex items-center gap-2 border-t border-gray-100 p-4">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    placeholder="Type your answer..."
                                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]/30"
                                    autoFocus
                                />
                                <Button size="icon" className="rounded-full" onClick={handleSend} disabled={isLoading}>
                                    <Send size={16} />
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex h-[420px] flex-col gap-3 overflow-y-auto px-6 py-4">
                            {loginMessages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                                            m.role === "user" ? "bg-[#FF5A5F] text-white" : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {m.text}
                                    </div>
                                </div>
                            ))}

                            {loginStep === "password" && (
                                <form onSubmit={handleLoginPasswordSubmit} className="mt-2 space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                    <p className="text-sm font-medium text-emerald-900">Enter your password to finish signing in.</p>
                                    <Input
                                        type="password"
                                        placeholder="Password"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                                        {loginMutation.isPending ? "Signing you in..." : "Sign In"}
                                    </Button>
                                </form>
                            )}
                            <div ref={endRef} />
                        </div>

                        {loginStep === "identifier" && (
                            <div className="flex items-center gap-2 border-t border-gray-100 p-4">
                                <input
                                    value={loginInput}
                                    onChange={(e) => setLoginInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleLoginIdentifierSend()}
                                    placeholder="Username or email..."
                                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]/30"
                                    autoFocus
                                />
                                <Button size="icon" className="rounded-full" onClick={handleLoginIdentifierSend}>
                                    <Send size={16} />
                                </Button>
                            </div>
                        )}
                    </>
                )}

                <div className="border-t border-gray-100 px-6 py-3 text-center">
                    <button
                        onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#FF5A5F]"
                    >
                        <LogIn size={13} />
                        {mode === "signup" ? "Already have an account? Sign in" : "New here? Start the guided sign-up instead"}
                    </button>
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
