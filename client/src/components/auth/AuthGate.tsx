import { useState } from "react";
import { Link } from "wouter";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import type { User } from "@shared/schema";
import GoogleSignInButton from "./GoogleSignInButton";

/**
 * The sign-in/sign-up card - a single, plain form modeled directly on
 * Airbnb's own auth screen: one "Continue with Google" button, a divider,
 * then a simple log in / sign up form. No AI conversation, no house-photo
 * backdrop - just the fastest, most familiar path in.
 *
 * Browsing itself is NOT gated behind this (see SignupNudgeGate.tsx, which
 * decides when this actually appears and whether it's dismissible) - this
 * component is just the card/form and doesn't know or care why it's on
 * screen.
 *
 * - Google reuses the popup + postMessage flow from server/gene/google-auth.ts.
 * - Log in and sign up both go through the same session-based /api/login and
 *   /api/ai/onboarding-register this app already used - "onboarding-register"
 *   despite its name is a plain create-account-and-sign-in endpoint (no AI
 *   involved) that, unlike /api/register, logs the new user in immediately
 *   instead of requiring an email-verification round trip - the "seamless,
 *   not routine" signup this app has aimed for throughout.
 * - Sign up also collects a WhatsApp number up front (with a country-code
 *   picker) so every account - not just Google ones - has one on file for
 *   agents/RealEVR to actually reach them on.
 */
export default function AuthGate({ onDismiss }: { onDismiss?: () => void } = {}) {
    const { loginMutation } = useAuth();
    const { toast } = useToast();
    const [tab, setTab] = useState<"login" | "signup">("login");

    const [loginId, setLoginId] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    const [fullName, setFullName] = useState("");
    const [signupEmail, setSignupEmail] = useState("");
    const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
    const [whatsappNumber, setWhatsappNumber] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupConfirm, setSignupConfirm] = useState("");
    const [isSigningUp, setIsSigningUp] = useState(false);
    const [signupError, setSignupError] = useState<string | null>(null);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        loginMutation.mutate({ username: loginId, password: loginPassword });
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setSignupError(null);

        if (signupPassword.length < 6) {
            setSignupError("Password must be at least 6 characters.");
            return;
        }
        if (signupPassword !== signupConfirm) {
            setSignupError("Passwords don't match.");
            return;
        }
        if (!whatsappNumber.trim()) {
            setSignupError("Add a WhatsApp number so agents and RealEVR can reach you.");
            return;
        }

        setIsSigningUp(true);
        try {
            const res = await apiRequest("POST", "/api/ai/onboarding-register", {
                fullName,
                email: signupEmail,
                phone: `${countryCode}${whatsappNumber.replace(/^0+/, "")}`,
                role: "tenant",
                password: signupPassword,
                confirmPassword: signupConfirm,
            });
            const data = await res.json();
            // Adopt the freshly-created, now-logged-in user immediately - no reload needed.
            queryClient.setQueryData(["/api/user"], data.user);
        } catch (error: any) {
            setSignupError(error.message || "Failed to create your account. Please try again.");
        } finally {
            setIsSigningUp(false);
        }
    };

    const handleGoogleSignedIn = (user: Omit<User, "password">) => {
        toast({ title: "Signed in with Google", description: `Welcome, ${user.fullName || user.username}!` });
    };

    const handleGoogleError = (message: string) => {
        toast({ title: "Google sign-in failed", description: message, variant: "destructive" });
    };

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${
                onDismiss ? "bg-black/50 backdrop-blur-sm" : "bg-gray-50"
            }`}
            onClick={onDismiss ? (e) => e.target === e.currentTarget && onDismiss() : undefined}
        >
            <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        aria-label="Close"
                        className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X size={18} />
                    </button>
                )}
                <h1 className="text-center font-display text-2xl font-semibold text-gray-900">Log in or sign up</h1>
                <p className="mt-1 text-center text-sm text-gray-500">Welcome to RealEVR Estates</p>

                <GoogleSignInButton
                    onSignedIn={handleGoogleSignedIn}
                    onError={handleGoogleError}
                    className="mt-6 w-full"
                />

                <div className="relative my-6 text-center text-xs text-gray-400">
                    <span className="relative z-10 bg-white px-3">or</span>
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-200" />
                </div>

                <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="login">Log in</TabsTrigger>
                        <TabsTrigger value="signup">Sign up</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login" className="mt-5">
                        <form onSubmit={handleLogin} className="space-y-3">
                            <div className="space-y-1">
                                <Label htmlFor="gate-login-id">Username or email</Label>
                                <Input id="gate-login-id" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="gate-login-password">Password</Label>
                                <Input
                                    id="gate-login-password"
                                    type="password"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full rounded-lg py-6" disabled={loginMutation.isPending}>
                                {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Log in
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="signup" className="mt-5">
                        <form onSubmit={handleSignup} className="space-y-3">
                            <div className="space-y-1">
                                <Label htmlFor="gate-signup-name">Full name</Label>
                                <Input id="gate-signup-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="gate-signup-email">Email</Label>
                                <Input
                                    id="gate-signup-email"
                                    type="email"
                                    value={signupEmail}
                                    onChange={(e) => setSignupEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>WhatsApp number</Label>
                                <div className="flex gap-2">
                                    <Select value={countryCode} onValueChange={setCountryCode}>
                                        <SelectTrigger className="w-[110px] shrink-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72">
                                            {COUNTRY_CODES.map((c) => (
                                                <SelectItem key={c.code + c.country} value={c.code}>
                                                    {c.flag} {c.code}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="tel"
                                        placeholder="700 000 000"
                                        value={whatsappNumber}
                                        onChange={(e) => setWhatsappNumber(e.target.value.replace(/[^0-9]/g, ""))}
                                        required
                                    />
                                </div>
                                <p className="text-xs text-gray-400">Agents and RealEVR use this to reach you about bookings and viewings.</p>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="gate-signup-password">Password</Label>
                                <Input
                                    id="gate-signup-password"
                                    type="password"
                                    value={signupPassword}
                                    onChange={(e) => setSignupPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="gate-signup-confirm">Confirm password</Label>
                                <Input
                                    id="gate-signup-confirm"
                                    type="password"
                                    value={signupConfirm}
                                    onChange={(e) => setSignupConfirm(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                            {signupError && <p className="text-sm text-red-600">{signupError}</p>}
                            <Button type="submit" className="w-full rounded-lg py-6" disabled={isSigningUp}>
                                {isSigningUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {isSigningUp ? "Creating your account..." : "Sign up"}
                            </Button>
                        </form>
                    </TabsContent>
                </Tabs>

                <p className="mt-6 text-center text-xs text-gray-400">
                    By continuing you agree to RealEVR Estates'{" "}
                    <Link href="/terms" className="underline hover:text-gray-600">Terms of Service</Link> and{" "}
                    <Link href="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );
}

