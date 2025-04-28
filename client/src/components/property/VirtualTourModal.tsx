import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface VirtualTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
  tourUrl?: string;
}

export default function VirtualTourModal({ 
  isOpen, 
  onClose, 
  propertyTitle,
  tourUrl = "https://app.lapentor.com/sphere/la-rose-apartments"
}: VirtualTourModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden border-none bg-transparent">
        <div className="bg-white w-full h-12 flex items-center justify-between px-4 rounded-t-lg">
          <DialogTitle className="text-lg truncate">
            Virtual Tour: {propertyTitle}
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="w-full h-[calc(90vh-48px)] bg-black rounded-b-lg">
          <iframe 
            src={tourUrl}
            title={`Virtual tour of ${propertyTitle}`}
            className="w-full h-full rounded-b-lg"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}