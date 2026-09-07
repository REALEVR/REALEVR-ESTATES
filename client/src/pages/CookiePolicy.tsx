import { Link } from "wouter";

export default function CookiePolicy() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
        <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
        <p className="text-gray-500 mb-8">Last Updated: September 7, 2026</p>

        <div className="prose max-w-none">
          <p>
            This policy explains what cookies and similar technologies RealEVR Estates actually uses on this site,
            why, and how you can control them. It should be read alongside our{" "}
            <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">1. What Cookies Are</h2>
          <p>
            Cookies are small text files a site stores in your browser to remember information between visits or
            requests. We also use similar browser storage — <code>localStorage</code> and <code>sessionStorage</code> —
            for the same kind of purpose, and this policy covers those the same way.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">2. What We Actually Use</h2>
          <p>
            We keep this list honest rather than exhaustive-by-template — it only lists what this site's code
            actually sets:
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>
              <strong>Session cookie (strictly necessary):</strong> keeps you signed in after you log in. Without
              it, the site can't tell who you are between page loads. This is set automatically once you sign in and
              cannot be turned off without signing out.
            </li>
            <li>
              <strong>Local storage — property viewing pass:</strong> remembers that you've paid the rental-property
              viewing fee, so you're not asked to pay again for 24 hours.
            </li>
            <li>
              <strong>Local storage — cookie/consent preferences:</strong> remembers the choice you make on this
              site's cookie banner, so it doesn't ask again every visit.
            </li>
            <li>
              <strong>Local storage — your device only:</strong> a few small conveniences (like a collapsed filter
              panel) that never leave your browser and are never sent to us.
            </li>
          </ul>
          <p>
            We do not currently run any third-party advertising, analytics, or tracking-pixel cookies (no Google
            Analytics, no Meta Pixel, no ad-network cookies) — if that changes, this page and the consent banner will
            be updated to reflect it before any such cookie is set.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">3. Third-Party Content</h2>
          <p>
            Virtual tours are displayed via an embedded iframe (either our own hosted tour player or, for some
            listings, a third-party tour host). That embedded page may set its own cookies under its own domain,
            governed by that provider's own policy, not this one. We link out to WhatsApp for agent messaging, which
            is likewise governed by WhatsApp's own policies once you leave this site.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">4. Your Choices</h2>
          <p>
            The cookie banner shown on your first visit lets you accept or decline non-essential storage (the
            viewing-pass and preference items above). Strictly necessary items — keeping you signed in — aren't
            optional, the same way they aren't optional on virtually any site that has accounts. You can also clear
            cookies and site data at any time from your browser's settings, which resets all of the above.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">5. Changes to This Policy</h2>
          <p>
            If what this site actually stores changes, this page will be updated and the "Last Updated" date above
            will change with it.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">6. Contact Us</h2>
          <p>Questions about this policy:</p>
          <address className="not-italic mt-4">
            RealEVR Estates<br />
            Email: privacy@realevr.com
          </address>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/" className="text-accent hover:underline">
            &larr; Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
