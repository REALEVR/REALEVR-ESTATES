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
import { Loader2, LogOut, Settings, User } from "lucide-react";

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

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-light">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <img src={logoPath} alt="RealEVR Estates Logo" className="h-10 mr-2" />
          <span className="text-black text-2xl font-bold">RealEVR Estates</span>
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
          {!user && (
            <Link href="/membership" className="hidden md:block text-gray-800 hover:text-[#FF5A5F] font-medium">
              Become a Member
            </Link>
          )}
          
          {user && user.membershipPlan && (
            <span className="hidden md:block text-gray-800 font-medium">
              {user.membershipPlan.charAt(0).toUpperCase() + user.membershipPlan.slice(1)} Plan
            </span>
          )}
          
          <Button variant="ghost" size="icon" className="hidden md:flex rounded-full p-2 hover:bg-gray-100">
            <i className="fas fa-globe text-gray-800"></i>
          </Button>
          
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
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
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
                    <Link href="/membership">Sign In</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
      
      {/* Mobile Search (Only visible on mobile) */}
      <div className="md:hidden px-4 pb-4">
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
