import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState } from "react";

/** A still picture with a play button; the 1 MB YouTube player loads only when someone presses it. */
function VideoFacade({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <iframe
        className="w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    );
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} className="group relative block h-full w-full" aria-label={`Play video: ${title}`}>
      <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" width={480} height={360} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/30">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-foreground shadow-lg">
          <i className="fas fa-play ml-1 text-xl" aria-hidden="true"></i>
        </span>
      </span>
    </button>
  );
}

export default function HowItWorks() {
  const steps = [
    {
      icon: "search",
      title: "Find Properties",
      description: "Browse our extensive collection of properties with virtual tours available"
    },
    {
      icon: "vr-cardboard",
      title: "Take Virtual Tours",
      description: "Navigate through properties in 360° view, exploring every room and detail"
    },
    {
      icon: "calendar-check",
      title: "Schedule a Visit",
      description: "Like what you see? Schedule an in-person visit or contact the property agent"
    }
  ];

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <h2 className="section-title mb-2 text-center">How Virtual Tours Work in Uganda</h2>
        <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
          Experience Kampala properties from anywhere with our immersive virtual tours
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="bg-accent/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <i className={`fas fa-${step.icon} text-accent text-2xl`}></i>
              </div>
              <h3 className="font-bold text-xl mb-2">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
        
        {/* Demo Video Section */}
        <div className="mt-12 mb-8">
          <h3 className="text-xl font-bold text-center mb-6">Watch How It Works</h3>
          <div className="aspect-w-16 aspect-h-9 max-w-3xl mx-auto bg-muted rounded-xl overflow-hidden shadow-lg">
            <VideoFacade videoId="Ef7CC5EtJww" title="BnB Booking Process Demo" />
          </div>
          <p className="text-muted-foreground text-center mt-4 max-w-2xl mx-auto">
            This video demonstrates how our BnB booking system works - browse properties, book your stay, pay a 20% deposit, and get instant access to owner contact details.
          </p>
        </div>
        
        <div className="mt-12 text-center">
          <Button asChild className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Link href="#featured">Start Exploring</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
