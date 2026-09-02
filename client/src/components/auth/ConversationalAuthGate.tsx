import { useEffect, useRef, useState } from "react";
import { Bot, Send, LogIn } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SplitAuthPanel from "./SplitAuthPanel";

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

// Full-site takeover shown whenever there's no signed-in user. Replaces the standard
// registration form with a short guided conversation (via Gemini, server-side) that
// builds the visitor's profile, then a dedicated password step, then auto-signs them in.
export default function ConversationalAuthGate() {
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [profile, setProfile] = useState<OnboardingProfile>({});
    const [readyForPassword, setReadyForPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);

    const [showLoginInstead, setShowLoginInstead] = useState(false);

    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, readyForPassword]);

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

    if (showLoginInstead) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-emerald-900 via-stone-900 to-emerald-950 p-4">
                <SplitAuthPanel onBackToChat={() => setShowLoginInstead(false)} />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-emerald-900 via-stone-900 to-emerald-950 p-4">
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-center justify-between bg-[#FF5A5F] px-6 py-4 text-white">
                    <div className="flex items-center gap-2">
                        <Bot size={20} />
                        <span className="font-semibold">RealEVR Estates — Let's get you set up</span>
                    </div>
                </div>

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

                <div className="border-t border-gray-100 px-6 py-3 text-center">
                    <button
                        onClick={() => setShowLoginInstead(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#FF5A5F]"
                    >
                        <LogIn size={13} />
                        Already have an account? Sign in
                    </button>
                </div>
            </div>
        </div>
    );
}
