import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoPath from '../../assets/logo.png';
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Loader2, LogOut, Settings, User, Glasses, Building, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function Header() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logoutMutation } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would redirect to search results
    console.log("Searching for:", searchQuery);
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
    <header className="sticky top-0 z-50 bg-white border-b border-light">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <img src={logoPath} alt="RealEVR Estates Logo" className="h-10 mr-2" />
          {/* <span className="text-black text-2xl font-bold">RealEVR Estates</span> */}
        </Link>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <form className="relative w-full" onSubmit={handleSearch}>
            <Input
              type="text"
              placeholder="Search for virtual tours by location or property type"
              className="w-full py-2 pl-10 pr-4 border border-gray-200 rounded-full text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#FF5A5F] focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <i className="fas fa-search absolute left-3 top-3 text-gray-500"></i>
          </form>
        </div>

        {/* Navigation Menu */}
        <nav className="flex items-center space-x-4">
          {/* TEMP: Setup DynamoDB Button */}
          {/* <Button variant="outline" onClick={triggerDynamoDBSetup} className="bg-yellow-200 text-black font-bold mr-2">
            Setup DynamoDB
          </Button> */}
          {/* {!user && (
            <>
              <Link href="/membership" className="hidden md:block text-gray-800 hover:text-[#FF5A5F] font-medium">
                Become a Member
              </Link>
              <Link href="/agent/register" className="hidden md:block text-gray-800 hover:text-[#FF5A5F] font-medium">
                Become an Agent
              </Link>
            </>
          )} */}

          {user && (
            <span className="hidden md:block text-gray-800 font-medium">
              {user.role === "agent" && user.subscriptionStatus === "active" 
                ? `${user.membershipPlan ? user.membershipPlan.charAt(0).toUpperCase() + user.membershipPlan.slice(1) : 'Professional'} Agent`
                : user.membershipPlan 
                  ? `${user.membershipPlan.charAt(0).toUpperCase() + user.membershipPlan.slice(1)} Plan`
                  : user.role === "admin" 
                    ? "Admin"
                    : "Basic Plan"
              }
            </span>
          )}

          <Button variant="ghost" size="icon" className="hidden md:flex rounded-full p-2 hover:bg-gray-100">
            <i className="fas fa-globe text-gray-800"></i>
          </Button>

          {/* Notification Center */}
          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center border border-gray-200 rounded-full p-2 hover:shadow-md">
                <i className="fas fa-bars text-gray-800 mx-2"></i>
                <i className="fas fa-user-circle text-gray-500 text-2xl"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Navigation Links (Mobile) */}
              <div className="md:hidden">
                <div className="px-2 py-1.5 text-sm font-semibold">
                  Property Categories
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/furnished-rentals">Furnished Houses</Link>
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
                  <DropdownMenuItem asChild>
                    <Link href="/profile?tab=settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/properties">
                          <Building className="mr-2 h-4 w-4" />
                          <span>Property Manager</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/virtual-tours">
                          <Glasses className="mr-2 h-4 w-4" />
                          <span>Virtual Tour Manager</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  {user.role === "agent" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/agent/dashboard">
                          <Building className="mr-2 h-4 w-4" />
                          <span>Agent Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/virtual-tours">
                          <Glasses className="mr-2 h-4 w-4" />
                          <span>Virtual Tour Manager</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin/users">
                        <Users className="mr-2 h-4 w-4" />
                        <span>User Management</span>
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
                    <Link href="/auth">Sign In</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>

      {/* Mobile Search (Only visible on mobile) */}
      <div className="md:hidden px-6 pb-4">
        <form className="relative w-full" onSubmit={handleSearch}>
          <Input
            type="text"
            placeholder="Search properties"
            className="w-full py-2 pl-10 pr-4 border border-gray-200 rounded-full text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#FF5A5F] focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <i className="fas fa-search absolute left-3 top-3 text-gray-500"></i>
        </form>
      </div>
    </header>
  );
}
