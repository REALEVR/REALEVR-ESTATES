import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoPath from '../../assets/logo.png';
import logoIconPath from '../../assets/logo-icon.png';
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Loader2, LogOut, User, Building, BarChart3, Receipt } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import NotificationCenter from "@/components/NotificationCenter";
import AuthModal from "@/components/auth/AuthModal";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";

export default function Header() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  // Search goes to the property list, which filters by the words typed (title, place, type).
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setLocation(q ? `/properties?q=${encodeURIComponent(q)}` : "/properties");
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  async function triggerDynamoDBSetup() {
    try {
      const res = await fetch("/api/setup-dynamodb", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "DynamoDB setup complete!", description: data.message || "Tables created." });
      } else {
        toast({ title: "DynamoDB setup failed", description: data.error || "Unknown error.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Network error", description: String(err), variant: "destructive" });
    }
  }

  return (
    <header className="fx-glass-bar sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 md:h-20 md:gap-6 md:px-8">
        {/* Logo: the mark alone on a phone (the search needs the room), the full lockup from tablet up. */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="RealEVR Estates home">
          <img src={logoIconPath} alt="" className="h-9 w-9 object-contain md:hidden" />
          <img src={logoPath} alt="RealEVR Estates" className="hidden h-12 md:block" />
        </Link>

        {/* Search: one pill, on every screen size. */}
        <form className="min-w-0 flex-1 md:mx-auto md:max-w-2xl" onSubmit={handleSearch} role="search">
          <label className="group flex h-11 items-center gap-2 rounded-full border border-border bg-card pl-4 pr-1.5 shadow-sm transition hover:shadow-md focus-within:border-foreground/40 focus-within:shadow-md md:h-12 md:pl-5">
            <span className="sr-only">Search homes</span>
            <Input
              type="text"
              placeholder="Search homes or areas"
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              aria-label="Search"
              className="shine grid h-8 w-8 shrink-0 place-items-center rounded-full md:h-9 md:w-9"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </label>
        </form>

        {/* Navigation Menu */}
        <nav className="flex shrink-0 items-center gap-1 md:gap-3">
          {/* TEMP: Setup DynamoDB Button */}
          {/* <Button variant="outline" onClick={triggerDynamoDBSetup} className="bg-yellow-200 text-black font-bold mr-2">
            Setup DynamoDB
          </Button> */}
          {/* {!user && (
            <>
              <Link href="/membership" className="hidden md:block text-gray-800 hover:text-accent font-medium">
                Become a Member
              </Link>
              <Link href="/agent/register" className="hidden md:block text-gray-800 hover:text-accent font-medium">
                Become an Agent
              </Link>
            </>
          )} */}

          {user && (
            <span className="hidden md:block text-foreground font-medium">
              {user.role === "agent" && user.subscriptionStatus === "active"
                ? `${user.membershipPlan ? user.membershipPlan.charAt(0).toUpperCase() + user.membershipPlan.slice(1) : 'Professional'} Agent`
                : user.membershipPlan
                  ? `${user.membershipPlan.charAt(0).toUpperCase() + user.membershipPlan.slice(1)} Plan`
                  : user.role === "admin"
                    ? "Admin"
                    // An agent account with no active subscription and no
                    // membershipPlan set yet (a freshly-created agent, or one
                    // on the FREE_AGENT_EMAILS allowlist) used to fall all
                    // the way through to "Basic Plan" here - the same label
                    // a plain signed-up-but-not-an-agent user sees. That's
                    // misleading for an account that IS an agent; show
                    // "Agent" instead so the role-appropriate menu badge
                    // matches what the account can actually do.
                    : user.role === "agent"
                      ? "Agent"
                      : "Basic Plan"
              }
            </span>
          )}

          {/* RentRail — pay any landlord's momo number directly, not tied to
              a RealEVR listing. Always visible: this isn't gated by having
              an account, since paying rent shouldn't require signing up first. */}
          <Link
            href="/list-your-property"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary lg:block"
          >
            List a property
          </Link>
          <Link href="/rentrail" className="hidden md:block">
            <Button variant="outline" className="rounded-full gap-2 border-border font-semibold text-foreground hover:bg-secondary">
              <Receipt className="h-4 w-4 text-accent" />
              Pay Rent
            </Button>
          </Link>

          <LanguageSwitcher />

          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Menu" className="flex h-11 items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm transition hover:shadow-md md:h-12 md:gap-2 md:px-3">
                <i className="fas fa-bars mx-1.5 text-foreground"></i>
                <i className="fas fa-user-circle text-2xl text-muted-foreground md:text-[1.75rem]"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Navigation Links (Mobile) */}
              <div className="md:hidden">
                <DropdownMenuItem asChild>
                  <Link href="/rentrail" className="pay-rent-glow rounded-sm">
                    <Receipt className="mr-2 h-4 w-4" />
                    <span>Pay Rent</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-sm font-semibold">
                  Property Categories
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/bnbs">Furnished Houses</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/bank-sales">Bank Sales Auctions</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/rental-units">Rental Units</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/for-sale">Properties For Sale</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </div>

              {user ? (
                <>
                  <div className="px-2 py-1.5 text-sm font-medium">
                    Welcome, {user.fullName || user.username}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  {/* Virtual Tour Manager and Boost Confirmations used to be
                      separate links here — both are now reachable as tabs
                      inside Agent Dashboard itself ("Virtual Tours" links out
                      per-property to the same manager page; "Boost" embeds
                      AdminBoostConfirmations directly), so this dropdown
                      doesn't need to duplicate them. */}
                  {user.role === "agent" && (
                    <DropdownMenuItem asChild>
                      <Link href="/agent/dashboard">
                        <Building className="mr-2 h-4 w-4" />
                        <span>Agent Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}

                  {/* Trimmed to just Analytics (per user request) — every other
                      admin destination this dropdown used to link to
                      (Property Manager, Virtual Tour Manager, User
                      Management, Payout Approvals, Boost Confirmations,
                      Broadcast, Settings) is still fully reachable, just via
                      AdminDashboardLayout's sidebar once inside the admin
                      area (Analytics -> /admin/analytics is the entry
                      point), not duplicated here too. */}
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin/analytics">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Analytics</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
                    {logoutMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Logging out...</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Logout</span>
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/membership">Become a Member</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/agent/register">Become an Agent</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/list-your-property">List a Property</Link>
                  </DropdownMenuItem>
                  {/* Popup sign-in (GENE v1.8) — the plain /auth page still
                      exists as a fallback for anywhere else that links to
                      it directly (e.g. a redirect after email verification). */}
                  <DropdownMenuItem onSelect={() => setAuthModalOpen(true)}>Sign In</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />

    </header>
  );
}
