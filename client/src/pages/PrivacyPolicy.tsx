import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last Updated: May 5, 2025</p>
        
        <div className="prose max-w-none">
          <p>
            At RealEVR Estates, we respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and protect your information when you use our services.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">1. Introduction</h2>
          <p>
            This policy applies to all users of RealEVR Estates' services in Uganda, including our website, mobile applications, and virtual tour features. We comply with the Data Protection and Privacy Act, 2019 of Uganda and other applicable data protection laws.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">2. Information We Collect</h2>
          <p>We may collect the following types of information:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li><strong>Personal Identification Information:</strong> Name, email address, phone number, and national ID information when you register or make transactions.</li>
            <li><strong>Account Information:</strong> Username, password, account preferences.</li>
            <li><strong>Transaction Information:</strong> Details about property viewings, bookings, and payments.</li>
            <li><strong>Technical Information:</strong> IP address, browser type, device information, and usage data.</li>
            <li><strong>Location Information:</strong> With your consent, precise or approximate location to show properties near you.</li>
          </ul>
          
          <h2 className="text-xl font-bold mt-8 mb-4">3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Provide and improve our services</li>
            <li>Process transactions and send related information</li>
            <li>Respond to your comments and questions</li>
            <li>Send you information about our services, new features, and promotions</li>
            <li>Verify your identity and prevent fraud</li>
            <li>Comply with legal obligations</li>
          </ul>
          
          <h2 className="text-xl font-bold mt-8 mb-4">4. Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no internet transmission is completely secure, and we cannot guarantee the security of information transmitted to our platform.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">5. Data Retention</h2>
          <p>
            We retain your personal information for as long as necessary to fulfill the purposes outlined in this privacy policy, unless a longer retention period is required by law. When we no longer need your data, we will securely delete or anonymize it.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">6. Your Rights</h2>
          <p>Under Ugandan data protection law, you have the right to:</p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to processing of your data</li>
            <li>Request restriction of processing</li>
            <li>Data portability</li>
            <li>Withdraw consent</li>
          </ul>
          <p>To exercise these rights, please contact us using the details provided below.</p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">7. Third-Party Disclosure</h2>
          <p>
            We may share your information with:
          </p>
          <ul className="list-disc pl-6 my-4 space-y-2">
            <li><strong>Service Providers:</strong> Payment processors, cloud hosting providers, and customer support services.</li>
            <li><strong>Property Owners:</strong> When you book or express interest in a property.</li>
            <li><strong>Legal Requirements:</strong> When required by applicable law, court orders, or governmental regulations.</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
          </ul>
          
          <h2 className="text-xl font-bold mt-8 mb-4">8. Children's Privacy</h2>
          <p>
            Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children under 18. If we learn we have collected personal information from a child under 18, we will delete that information.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">9. Changes to This Privacy Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Last Updated" date.
          </p>
          
          <h2 className="text-xl font-bold mt-8 mb-4">10. Contact Us</h2>
          <p>
            If you have any questions about this privacy policy or our data practices, please contact us at:
          </p>
          <address className="not-italic mt-4">
            RealEVR Estates<br />
            Plot 123, Kampala Road<br />
            Kampala, Uganda<br />
            Email: privacy@realevr.com<br />
            Phone: +256 700 123456
          </address>
          
          <h2 className="text-xl font-bold mt-8 mb-4">11. Complaints</h2>
          <p>
            You have the right to lodge a complaint with the National Information Technology Authority-Uganda (NITA-U) or other relevant data protection authority if you are concerned about how we are processing your personal data.
          </p>
        </div>
        
        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/" className="text-[#FF5A5F] hover:underline">
            &larr; Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}