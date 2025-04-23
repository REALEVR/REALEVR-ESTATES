import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoPath from '../../assets/logo.png';

export default function Header() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would redirect to search results
    console.log("Searching for:", searchQuery);
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
        <div className="hidden md:flex flex-1 max-w-2xl mx-8">
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
          <Link href="#" className="hidden md:block text-gray-800 hover:text-[#FF5A5F] font-medium">
            Become a Host
          </Link>
          <Button variant="ghost" size="icon" className="hidden md:flex rounded-full p-2 hover:bg-gray-100">
            <i className="fas fa-globe text-gray-800"></i>
          </Button>
          <Button variant="outline" className="flex items-center border border-gray-200 rounded-full p-2 hover:shadow-md">
            <i className="fas fa-bars text-gray-800 mx-2"></i>
            <i className="fas fa-user-circle text-gray-500 text-2xl"></i>
          </Button>
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
