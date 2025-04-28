
import React from 'react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function PaymentModal({ isOpen, onClose, onConfirm }: PaymentModalProps) {
  const config = {
    public_key: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: Date.now().toString(),
    amount: 10000,
    currency: 'UGX',
    payment_options: 'card,mobilemoney,ussd',
    customer: {
      email: 'user@example.com',
      phone_number: '',
      name: '',
    },
    customizations: {
      title: 'Property Viewing Access',
      description: 'Payment for viewing 5 rental properties',
      logo: 'https://st2.depositphotos.com/1802620/7621/v/450/depositphotos_76219969-stock-illustration-real-estate-logo-template.jpg',
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const handlePayment = () => {
    handleFlutterPayment({
      callback: (response) => {
        if (response.status === 'successful') {
          onConfirm();
        }
        closePaymentModal();
      },
      onClose: () => {},
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock Premium Properties</DialogTitle>
          <DialogDescription>
            Pay UGX 10,000 to view up to 5 rental properties. This is a one-time payment valid for 24 hours.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <div className="text-center">
            <span className="text-2xl font-bold">UGX 10,000</span>
            <span className="text-gray-500 ml-2">/ 24 hours</span>
          </div>
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handlePayment} className="bg-[#FF5A5F]">Pay with Flutterwave</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
