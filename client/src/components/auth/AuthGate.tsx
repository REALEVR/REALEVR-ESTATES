import { useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
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

/** sessionStorage flag WhatsAppNumberPrompt (rendered once the gate hands off
 *  to the real site) watches for - set here when a Google sign-in lands on
 *  an account with no phone number yet. */
const PROMPT_WHATSAPP_FLAG = "realevr_prompt_whatsapp";

/**
 * Full-site takeover shown whenever there's no signed-in user - a single,
 * plain sign-in/sign-up card modeled directly on Airbnb's own auth screen:
 * one "Continue with Google" button, a divider, then a simple log in /
 * sign up form. No AI conversation, no house-photo backdrop - just the
 * fastest, most familiar path in and back out to the actual site.
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
export default function AuthGate() {
    const { loginMutation } = useAuth();
    const { toast } = useToast();
    const [tab, setTab] = useState<"login" | "signup">("login");
    const [googleBusy, setGoogleBusy] = useState(false);

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
                if (event.data.needsPhone) {
                    try {
                        sessionStorage.setItem(PROMPT_WHATSAPP_FLAG, "1");
                    } catch {
                        // Private-browsing/storage-disabled - the WhatsApp prompt is a
                        // nice-to-have, never worth failing the actual sign-in over.
                    }
                }
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
                <h1 className="text-center font-display text-2xl font-semibold text-gray-900">Log in or sign up</h1>
                <p className="mt-1 text-center text-sm text-gray-500">Welcome to RealEVR Estates</p>

                <Button
                    type="button"
                    variant="outline"
                    className="mt-6 w-full justify-center gap-2 rounded-lg border-gray-300 py-6 text-[15px] font-medium"
                    onClick={handleGoogle}
                    disabled={googleBusy}
                >
                    {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
                    Continue with Google
                </Button>

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

export { PROMPT_WHATSAPP_FLAG };
