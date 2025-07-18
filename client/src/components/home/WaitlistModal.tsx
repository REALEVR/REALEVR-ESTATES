import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: "ios" | "android" | null;
}

export default function WaitlistModal({ isOpen, onClose, platform }: WaitlistModalProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [rating, setRating] = useState("5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const platformName = platform === "ios" ? "App Store" : platform === "android" ? "Google Play" : "";
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast({
        title: "Joined Waitlist Successfully!",
        description: `We'll notify you when RealEVR Estates is available on ${platformName}.`,
      });
      onClose();
      resetForm();
    }, 1000);
    
    // In a real implementation, you would send this data to your backend:
    console.log({
      email,
      name,
      platform,
      rating: parseInt(rating),
      date: new Date().toISOString()
    });
  };
  
  const resetForm = () => {
    setEmail("");
    setName("");
    setRating("5");
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Join the Waitlist</DialogTitle>
          <DialogDescription>
            Be the first to know when our app is available on {platformName}.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="rating">How excited are you about this app? (1-5)</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger>
                <SelectValue placeholder="Select a rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Not very excited</SelectItem>
                <SelectItem value="2">2 - Somewhat interested</SelectItem>
                <SelectItem value="3">3 - Interested</SelectItem>
                <SelectItem value="4">4 - Very interested</SelectItem>
                <SelectItem value="5">5 - Can't wait!</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="mr-2">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Join Waitlist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}