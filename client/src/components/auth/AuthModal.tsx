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
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import type { User } from "@shared/schema";
import GoogleSignInButton from "./GoogleSignInButton";

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
 * fields — see shared/schema.ts v1.8), and Google sign-in via
 * GoogleSignInButton (see that file for why it's not a raw window.open
 * anymore).
 */
export default function AuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"login" | "register">("login");

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
    // Compulsory: a rent payment/receipt can only ever reach this account's
    // dashboard or notifications by matching this phone number — see
    // server/gene/rentrail.ts's findLandlordUserIdByPhone doc comment.
    if (phoneNumber.replace(/\D/g, "").length < 7) {
      toast({ title: "Phone number required", description: "Enter a valid phone number to create your account.", variant: "destructive" });
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

  const handleGoogleSignedIn = (user: Omit<User, "password">) => {
    toast({ title: "Signed in with Google", description: `Welcome, ${user.fullName || user.username}!` });
    onOpenChange(false);
  };

  const handleGoogleError = (message: string) => {
    toast({ title: "Google sign-in failed", description: message, variant: "destructive" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Welcome to RealEVR Estates</DialogTitle>
          <DialogDescription>Sign in or create an account to save properties, list, and more.</DialogDescription>
        </DialogHeader>

        <GoogleSignInButton onSignedIn={handleGoogleSignedIn} onError={handleGoogleError} className="w-full" />

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
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">Required — we use this to send you payment receipts and booking updates.</p>
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
