import { Link } from "wouter";
import { WHATSAPP_NUMBERS, whatsAppLink, SOCIAL_LINKS } from "@/lib/siteLinks";
import logoPath from '../../assets/logo.png';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    // pb-[var(--mobile-tabbar-h)] on mobile: MobileTabBar.tsx is `fixed
    // bottom-0`, so without this the footer's own last row (the social
    // icons/copyright line right below) has nowhere left to scroll to —
    // it sits permanently behind the tab bar instead of above it. See
    // index.css's --mobile-tabbar-h doc comment for why this exact value,
    // not a guessed one, is what actually clears it on notched phones too.
    <footer className="surface-invert border-t border-border pb-[var(--mobile-tabbar-h)] md:pb-0">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 pb-10">
          <div className="md:col-span-2">
            <img src={logoPath} alt="RealEVR Estates Logo" className="h-12 mb-4 brightness-0 invert" />
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Immersive virtual tours for rentals, BnBs, homes for sale, and bank auction
              properties across Uganda.
            </p>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-foreground">RealEVR Estates</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-accent transition-colors">About Us</Link></li>
              <li><Link href="/how-it-works" className="hover:text-accent transition-colors">How It Works</Link></li>
              <li><Link href="/careers" className="hover:text-accent transition-colors">Careers</Link></li>
              <li><Link href="/investors" className="hover:text-accent transition-colors">Investors</Link></li>
              <li><Link href="/news" className="hover:text-accent transition-colors">News</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-foreground">Discover</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/#featured" className="hover:text-accent transition-colors">Virtual Tours</Link></li>
              <li><Link href="/featured-properties" className="hover:text-accent transition-colors">Featured Properties</Link></li>
              <li><Link href="/properties" className="hover:text-accent transition-colors">Building Types</Link></li>
              <li><Link href="/rentrail" className="hover:text-accent transition-colors">Pay Rent (RentRail)</Link></li>
            </ul>
            <h3 className="font-display text-base mb-4 mt-6 text-foreground">Hosting</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/admin/properties" className="hover:text-accent transition-colors">Add Your Property</Link></li>
              <li><Link href="/list-your-property" className="hover:text-accent transition-colors">List a Property, Earn 1,000 UGX</Link></li>
              <li><Link href="/resources" className="hover:text-accent transition-colors">Resources</Link></li>
              <li><Link href="/host-responsibly" className="hover:text-accent transition-colors">Host Responsibly</Link></li>
              <li><Link href="/virtual-tour-creation" className="hover:text-accent transition-colors">Virtual Tour Creation</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base mb-4 text-foreground">Support</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/help" className="hover:text-accent transition-colors">Help Center</Link></li>
              <li><Link href="/contact" className="hover:text-accent transition-colors">Contact Us</Link></li>
              <li><Link href="/trust-safety" className="hover:text-accent transition-colors">Trust &amp; Safety</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-4">
            {/* Facebook and X are real, live accounts (SOCIAL_LINKS in
                lib/siteLinks.ts) and render as real clickable links.
                Instagram/Pinterest have no account yet — those two still
                render as inert, slightly faded "Coming soon" buttons rather
                than a plain `<a href="#">`, which looks clickable and
                silently jumps to the top of the page when tapped, reading
                as broken rather than "not live yet." Swap SOCIAL_LINKS'
                value the moment either account exists — no change needed
                here, this already renders a real link for any key whose
                URL isn't "#". */}
            {([
              ['facebook', 'fa-facebook-f'],
              ['twitter', 'fa-twitter'],
              ['instagram', 'fa-instagram'],
              ['pinterest', 'fa-pinterest-p'],
            ] as const).map(([key, icon]) => {
              const href = SOCIAL_LINKS[key];
              if (href === "#") {
                return (
                  <button
                    key={key}
                    type="button"
                    disabled
                    title="Coming soon"
                    aria-label={`${key.charAt(0).toUpperCase()}${key.slice(1)} — coming soon`}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-muted text-muted-foreground/50 cursor-not-allowed"
                  >
                    <i className={`fab ${icon} text-sm`}></i>
                  </button>
                );
              }
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${key.charAt(0).toUpperCase()}${key.slice(1)}`}
                  aria-label={`${key.charAt(0).toUpperCase()}${key.slice(1)}`}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <i className={`fab ${icon} text-sm`}></i>
                </a>
              );
            })}
            {WHATSAPP_NUMBERS.map((agent) => (
              <a
                key={agent.number}
                href={whatsAppLink(agent.number)}
                target="_blank"
                rel="noopener noreferrer"
                title={`WhatsApp ${agent.label}`}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-[#25D366] hover:text-white transition-colors"
              >
                <i className="fab fa-whatsapp text-sm"></i>
              </a>
            ))}
          </div>

          <div className="text-muted-foreground text-sm text-center">
            &copy; {currentYear} RealEVR Estates, Inc. All rights reserved.
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-accent hover:underline">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-accent hover:underline">Terms</Link>
            <span className="mx-2">·</span>
            <Link href="/cookies" className="hover:text-accent hover:underline">Cookies</Link>
            <span className="mx-2">·</span>
            <Link href="/refund-policy" className="hover:text-accent hover:underline">Refund Policy</Link>
            <span className="mx-2">·</span>
            <Link href="/sitemap.xml" className="hover:text-accent hover:underline">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
