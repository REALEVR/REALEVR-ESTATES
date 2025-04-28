import { Link } from "wouter";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white border-t border-gray-200 py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">RealEVR Estates</h3>
            <ul className="space-y-2 text-gray-500">
              <li><Link href="#" className="hover:text-[#FF5A5F]">About Us</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">How It Works</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Careers</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Investors</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">News</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4">Discover</h3>
            <ul className="space-y-2 text-gray-500">
              <li><Link href="#" className="hover:text-[#FF5A5F]">Virtual Tours</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Featured Properties</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Cities</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Building Types</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Amenities</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4">Hosting</h3>
            <ul className="space-y-2 text-gray-500">
              <li><Link href="#" className="hover:text-[#FF5A5F]">Add Your Property</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Resources</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Community Forum</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Host Responsibly</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Virtual Tour Creation</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4">Support</h3>
            <ul className="space-y-2 text-gray-500">
              <li><Link href="#" className="hover:text-[#FF5A5F]">Help Center</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Contact Us</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Trust & Safety</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Cancellation Options</Link></li>
              <li><Link href="#" className="hover:text-[#FF5A5F]">Accessibility</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-200 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-4 mb-4 md:mb-0">
            <Link href="#" className="text-gray-500 hover:text-gray-800">
              <i className="fab fa-facebook-f"></i>
            </Link>
            <Link href="#" className="text-gray-500 hover:text-gray-800">
              <i className="fab fa-twitter"></i>
            </Link>
            <Link href="#" className="text-gray-500 hover:text-gray-800">
              <i className="fab fa-instagram"></i>
            </Link>
            <Link href="#" className="text-gray-500 hover:text-gray-800">
              <i className="fab fa-pinterest-p"></i>
            </Link>
          </div>
          
          <div className="text-gray-500 text-sm">
            &copy; {currentYear} RealEVR Estates, Inc. All rights reserved.
            <span className="mx-2">·</span>
            <Link href="#" className="hover:underline">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="#" className="hover:underline">Terms</Link>
            <span className="mx-2">·</span>
            <Link href="#" className="hover:underline">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
