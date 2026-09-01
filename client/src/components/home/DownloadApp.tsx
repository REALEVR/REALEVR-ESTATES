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
    <section className="py-12 surface-invert -mx-4 sm:-mx-6 lg:-mx-8 border-y border-border">
      <div className="container mx-auto px-4">
        <div className="md:flex items-center">
          <div className="md:w-1/2 mb-8 md:mb-0">
            <h2 className="text-2xl md:text-3xl font-display font-medium mb-4 text-foreground">Coming soon on mobile</h2>
            <p className="mb-6 text-muted-foreground">
              Download our mobile app to explore virtual tours on the go. Access our full catalog of properties,
              save favorites, and get notifications about new listings.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                variant="outline"
                onClick={() => openWaitlist("ios")}
                className="bg-transparent border border-border rounded-xl py-7 px-5 flex items-center hover:bg-muted hover:border-accent text-foreground h-auto"
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
                className="bg-transparent border border-border rounded-xl py-7 px-5 flex items-center hover:bg-muted hover:border-accent text-foreground h-auto"
              >
                <i className="fab fa-google-play text-2xl mr-3"></i>
                <div>
                  <div className="text-xs text-left">Get it on</div>
                  <div className="font-medium">Google Play</div>
                </div>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
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
