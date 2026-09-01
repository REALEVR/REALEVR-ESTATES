import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import type { User } from "@shared/schema";

/**
 * "Make auth feel like a popup" — a modal sign-in/sign-up, triggered from
 * Header.tsx, instead of a full-page navigation to /auth. /auth itself is
 * left untouched and still works (direct links, bookmarks, anywhere else
 * in the app that points at it) — this is an additional entry point, not
 * a replacement.
 *
 * Reuses useAuth()'s existing loginMutation/registerMutation (same
 * validated, tested logic the /auth page uses) rather than re-implementing
 * auth — this modal is a new UI shell around existing plumbing.
 *
 * Adds the two new asks on top of that: a phone number + country-code
 * picker at sign-up (captured into the new `phoneNumber`/`countryCode`
 * fields — see shared/schema.ts v1.8), and a real "Continue with Google"
 * button that opens server/gene/google-auth.ts's popup flow in an actual
 * child window and listens for its postMessage result — no page reload
 * needed for that path, since the full user object comes back directly.
 */
export default function AuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [googleBusy, setGoogleBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username: loginUsername, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    registerMutation.mutate({
      fullName,
      username,
      email,
      password,
      confirmPassword,
      phoneNumber: phoneNumber ? `${countryCode}${phoneNumber.replace(/^0+/, "")}` : undefined,
      countryCode,
      role: "normal",
    } as any);
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
        onOpenChange(false);
      } else {
        toast({ title: "Google sign-in failed", description: event.data.error || "Please try again.", variant: "destructive" });
      }
    };
    window.addEventListener("message", handleMessage);

    // If the user just closes the popup manually, don't leave the button
    // stuck in a "busy" state forever.
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", handleMessage);
        setGoogleBusy(false);
      }
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Welcome to RealEVR Estates</DialogTitle>
          <DialogDescription>Sign in or create an account to save properties, list, and more.</DialogDescription>
        </DialogHeader>

        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={handleGoogle}
          disabled={googleBusy}
        >
          {googleBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="h-4 w-4" />
          )}
          Continue with Google
        </Button>

        <div className="relative my-1 text-center text-xs text-muted-foreground">
          <span className="bg-card px-2 relative z-10">or</span>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="modal-login-username">Username</Label>
                <Input id="modal-login-username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-login-password">Password</Label>
                <Input id="modal-login-password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-4">
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="modal-reg-fullname">Full name</Label>
                <Input id="modal-reg-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-reg-username">Username</Label>
                <Input id="modal-reg-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-reg-email">Email</Label>
                <Input id="modal-reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="space-y-1">
                <Label>Phone number</Label>
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
                    id="modal-reg-phone"
                    type="tel"
                    placeholder="700 000 000"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Optional, but helps us reach you about your listings/bookings.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="modal-reg-password">Password</Label>
                <Input id="modal-reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-reg-confirm">Confirm password</Label>
                <Input id="modal-reg-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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
