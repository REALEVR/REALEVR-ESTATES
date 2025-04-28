
import React from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function PaymentModal({ isOpen, onClose, onConfirm }: PaymentModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock Premium Properties</DialogTitle>
          <DialogDescription>
            Pay ₦10,000 to view up to 5 rental properties. This is a one-time payment valid for 24 hours.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <div className="text-center">
            <span className="text-2xl font-bold">₦10,000</span>
            <span className="text-gray-500 ml-2">/ 24 hours</span>
          </div>
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onConfirm} className="bg-[#FF5A5F]">Pay Now</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
