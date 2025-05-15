import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, CheckCircle2 } from "lucide-react";
import { FlutterWaveButton } from "flutterwave-react-v3";

type PaymentType = "PropertyDeposit" | "ViewingFee" | "Subscription" | "BnBBookingDeposit";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  propertyTitle?: string;
  paymentType: PaymentType;
  amount: number;
  successCallback?: (response: any) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  propertyId,
  propertyTitle,
  paymentType,
  amount,
  successCallback
}: PaymentModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Get the Flutterwave public key from environment variables
  const publicKey = import.meta.env.FLUTTERWAVE_PUBLIC_KEY || "";
  
  // Generate a random transaction reference for tracking
  const txRef = `tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  
  const handlePaymentSuccess = async (response: any) => {
    if (response.status === "successful") {
      setIsLoading(true);
      
      try {
        // In a production app, you would verify this payment with your backend
        // But for now, we'll just simulate a successful payment verification
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setIsSuccess(true);
        
        if (successCallback) {
          await successCallback(response);
        } else {
          toast({
            title: "Payment Successful",
            description: `Your payment of ${amount.toLocaleString()} UGX has been processed successfully.`,
            duration: 5000,
          });
        }
      } catch (error) {
        toast({
          title: "Payment Verification Failed",
          description: "There was an error verifying your payment. Please contact support.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      toast({
        title: "Payment Failed",
        description: "Your payment could not be processed. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handlePaymentClose = () => {
    toast({
      title: "Payment Cancelled",
      description: "You have cancelled the payment process.",
      variant: "destructive",
    });
  };
  
  // Fallback payment method when Flutterwave isn't available
  const handlePayNow = async () => {
    setIsLoading(true);
    
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock successful payment
      setIsSuccess(true);
      
      // If there's a success callback, call it with mock payment data
      if (successCallback) {
        await successCallback({
          status: "successful",
          transaction_id: `sim-${Date.now()}`,
          tx_ref: txRef,
          amount: amount,
          currency: "UGX"
        });
      } else {
        // Otherwise show a toast
        toast({
          title: "Payment Successful",
          description: `Your payment of ${amount.toLocaleString()} UGX has been processed successfully.`,
          duration: 5000,
        });
      }
    } catch (error) {
      toast({
        title: "Payment Failed",
        description: "Your payment could not be processed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Configuration for Flutterwave
  const config = {
    public_key: publicKey,
    tx_ref: txRef,
    amount: amount,
    currency: "UGX",
    payment_options: "card,mobilemoney,ussd",
    customer: {
      email: "user@example.com",  // In a real app, this would be the user's email
      phone_number: "256700000000",  // In a real app, this would be the user's phone
      name: "User",  // In a real app, this would be the user's name
    },
    customizations: {
      title: "RealEVR Estates",
      description: paymentType === "BnBBookingDeposit" 
        ? `Booking Deposit for ${propertyTitle}` 
        : paymentType === "ViewingFee"
        ? `Viewing Fee for ${propertyTitle}`
        : "Payment",
      logo: "https://realevr.ug/logo.png",
    },
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isSuccess ? "Payment Successful" : "Complete Payment"}
          </DialogTitle>
          <DialogDescription>
            {isSuccess 
              ? "Your payment has been processed successfully."
              : paymentType === "BnBBookingDeposit"
              ? `Pay a 20% deposit (${amount.toLocaleString()} UGX) to secure your booking.`
              : paymentType === "ViewingFee"
              ? `Pay the standard viewing fee of ${amount.toLocaleString()} UGX.`
              : `Complete your payment of ${amount.toLocaleString()} UGX.`
            }
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-10 w-10 text-[#FF5A5F] animate-spin mb-4" />
            <p className="text-center text-gray-500">
              Processing your payment...
              <br />
              Please do not close this window.
            </p>
          </div>
        ) : isSuccess ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <p className="text-center text-gray-700 font-medium mb-2">
              Thank you for your payment!
            </p>
            <p className="text-center text-gray-500 max-w-sm">
              {paymentType === "BnBBookingDeposit" 
                ? "Owner contact details are now available. You can contact them directly to arrange your stay."
                : paymentType === "ViewingFee"
                ? "You can now view up to 10 properties for the next 24 hours."
                : "Your payment has been processed successfully."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{amount.toLocaleString()} UGX</p>
              <p className="text-gray-500 text-sm">
                {paymentType === "BnBBookingDeposit" 
                  ? "20% Booking Deposit" 
                  : paymentType === "ViewingFee"
                  ? "Property Viewing Fee (24 hours)"
                  : "Total Amount"}
              </p>
            </div>
            
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-center">
                {publicKey ? (
                  <FlutterWaveButton
                    {...config}
                    className="w-full bg-[#FF5A5F] hover:bg-[#FF7478] text-white py-2 px-4 rounded-md flex items-center justify-center"
                    callback={handlePaymentSuccess}
                    onClose={handlePaymentClose}
                    text={
                      <div className="flex items-center">
                        <CreditCard className="mr-2 h-5 w-5" />
                        Pay {amount.toLocaleString()} UGX Now
                      </div>
                    }
                  />
                ) : (
                  <Button 
                    onClick={handlePayNow}
                    className="w-full bg-[#FF5A5F] hover:bg-[#FF7478] text-white"
                  >
                    <CreditCard className="mr-2 h-5 w-5" />
                    Pay {amount.toLocaleString()} UGX Now
                  </Button>
                )}
              </div>
              
              <p className="text-center text-gray-500 text-xs">
                By clicking "Pay Now", you agree to our terms of service and payment policies.
              </p>
            </div>
          </div>
        )}
        
        <DialogFooter>
          {isSuccess ? (
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          ) : (
            <Button onClick={onClose} variant="outline" className="w-full">
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}