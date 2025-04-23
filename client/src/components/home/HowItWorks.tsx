import { Link } from "wouter";
import { Button } from "@/components/ui/button";

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
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">How Virtual Tours Work</h2>
        <p className="text-gray-500 text-center mb-10 max-w-2xl mx-auto">
          Experience properties from anywhere with our immersive virtual tours
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="bg-[#FF5A5F]/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <i className={`fas fa-${step.icon} text-[#FF5A5F] text-2xl`}></i>
              </div>
              <h3 className="font-bold text-xl mb-2">{step.title}</h3>
              <p className="text-gray-500">{step.description}</p>
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <Button asChild className="bg-[#FF5A5F] hover:bg-[#FF7478] text-white">
            <Link href="#">Start Exploring</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
