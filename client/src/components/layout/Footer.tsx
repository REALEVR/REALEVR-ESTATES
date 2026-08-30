import { Link } from "wouter";
import logoPath from '../../assets/logo.png';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#211B17] text-[#F1E9E0]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-10">
          <div className="md:col-span-2">
            <img src={logoPath} alt="RealEVR Estates Logo" className="h-12 mb-4 brightness-0 invert" />
            <p className="text-sm text-[#F1E9E0]/60 max-w-xs leading-relaxed">
              Immersive virtual tours for rentals, BnBs, homes for sale, and bank auction
              properties across Uganda.
            </p>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-[#F1E9E0]">RealEVR Estates</h3>
            <ul className="space-y-2 text-sm text-[#F1E9E0]/60">
              <li><Link href="/about" className="hover:text-accent transition-colors">About Us</Link></li>
              <li><Link href="/how-it-works" className="hover:text-accent transition-colors">How It Works</Link></li>
              <li><Link href="#" className="hover:text-accent transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-accent transition-colors">Investors</Link></li>
              <li><Link href="#" className="hover:text-accent transition-colors">News</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-[#F1E9E0]">Discover</h3>
            <ul className="space-y-2 text-sm text-[#F1E9E0]/60">
              <li><Link href="#" className="hover:text-accent transition-colors">Virtual Tours</Link></li>
              <li><Link href="#" className="hover:text-accent transition-colors">Featured Properties</Link></li>
              <li><Link href="#" className="hover:text-accent transition-colors">Building Types</Link></li>
            </ul>
            <h3 className="font-display text-base mb-4 mt-6 text-[#F1E9E0]">Hosting</h3>
            <ul className="space-y-2 text-sm text-[#F1E9E0]/60">
              <li><Link href="/admin/properties" className="hover:text-accent transition-colors">Add Your Property</Link></li>
              <li><Link href="/resources" className="hover:text-accent transition-colors">Resources</Link></li>
              <li><Link href="/host-responsibly" className="hover:text-accent transition-colors">Host Responsibly</Link></li>
              <li><Link href="/virtual-tour-creation" className="hover:text-accent transition-colors">Virtual Tour Creation</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-[#F1E9E0]">Support</h3>
            <ul className="space-y-2 text-sm text-[#F1E9E0]/60">
              <li><Link href="/help" className="hover:text-accent transition-colors">Help Center</Link></li>
              <li><Link href="/contact" className="hover:text-accent transition-colors">Contact Us</Link></li>
              <li><Link href="/trust-safety" className="hover:text-accent transition-colors">Trust &amp; Safety</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#F1E9E0]/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-4">
            <Link href="#" className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1E9E0]/5 text-[#F1E9E0]/70 hover:bg-accent hover:text-white transition-colors">
              <i className="fab fa-facebook-f text-sm"></i>
            </Link>
            <Link href="#" className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1E9E0]/5 text-[#F1E9E0]/70 hover:bg-accent hover:text-white transition-colors">
              <i className="fab fa-twitter text-sm"></i>
            </Link>
            <Link href="#" className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1E9E0]/5 text-[#F1E9E0]/70 hover:bg-accent hover:text-white transition-colors">
              <i className="fab fa-instagram text-sm"></i>
            </Link>
            <Link href="#" className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1E9E0]/5 text-[#F1E9E0]/70 hover:bg-accent hover:text-white transition-colors">
              <i className="fab fa-pinterest-p text-sm"></i>
            </Link>
          </div>

          <div className="text-[#F1E9E0]/50 text-sm text-center">
            &copy; {currentYear} RealEVR Estates, Inc. All rights reserved.
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-accent hover:underline">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-accent hover:underline">Terms</Link>
            <span className="mx-2">·</span>
            <Link href="/sitemap.xml" className="hover:text-accent hover:underline">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
