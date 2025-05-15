import { useState } from "react";
import { Button } from "@/components/ui/button";
import WaitlistModal from "./WaitlistModal";

export default function DownloadApp() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"ios" | "android" | null>(null);
  
  const openWaitlist = (platform: "ios" | "android") => {
    setSelectedPlatform(platform);
    setIsWaitlistOpen(true);
  };
  
  const closeWaitlist = () => {
    setIsWaitlistOpen(false);
  };
  
  return (
    <section className="py-12 bg-gray-900 text-white">
      <div className="container mx-auto px-4">
        <div className="md:flex items-center">
          <div className="md:w-1/2 mb-8 md:mb-0">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Take a Virtual Tour with Us</h2>
            <p className="mb-6 text-gray-300">
              Download our mobile app to explore virtual tours on the go. Access our full catalog of properties, 
              save favorites, and get notifications about new listings.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button 
                variant="outline" 
                onClick={() => openWaitlist("ios")}
                className="bg-black border border-gray-700 rounded-xl py-7 px-5 flex items-center hover:bg-gray-800 text-white h-auto"
              >
                <i className="fab fa-apple text-2xl mr-3"></i>
                <div>
                  <div className="text-xs text-left">Download on the</div>
                  <div className="font-medium">App Store</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => openWaitlist("android")}
                className="bg-black border border-gray-700 rounded-xl py-7 px-5 flex items-center hover:bg-gray-800 text-white h-auto"
              >
                <i className="fab fa-google-play text-2xl mr-3"></i>
                <div>
                  <div className="text-xs text-left">Get it on</div>
                  <div className="font-medium">Google Play</div>
                </div>
              </Button>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Coming soon! Join our waitlist to be notified when our app is released.
            </p>
          </div>
          <div className="md:w-1/2 md:pl-12">
            <img 
              src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=600&q=80" 
              alt="Mobile app on smartphone" 
              className="rounded-xl shadow-2xl mx-auto md:ml-auto md:mr-0 max-w-sm"
            />
          </div>
        </div>
      </div>
      
      <WaitlistModal 
        isOpen={isWaitlistOpen} 
        onClose={closeWaitlist} 
        platform={selectedPlatform} 
      />
    </section>
  );
}
