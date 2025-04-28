import { useState } from "react";
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type PaymentType = "PropertyDeposit" | "ViewingFee" | "Subscription";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  propertyTitle?: string;
  paymentType: PaymentType;
  amount?: number;
  successCallback?: (response: any) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  propertyId,
  propertyTitle,
  paymentType,
  amount = 0,
  successCallback
}: PaymentModalProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<string>(amount > 0 ? amount.toString() : "");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Generate a unique transaction reference
  const generateReference = () => {
    const date = new Date();
    return `RealEVR-${date.getTime()}-${Math.floor(Math.random() * 1000000)}`;
  };

  // Get payment title based on type
  const getPaymentTitle = () => {
    switch (paymentType) {
      case "PropertyDeposit":
        return `Property Deposit: ${propertyTitle}`;
      case "ViewingFee":
        return `Viewing Fee: ${propertyTitle}`;
      case "Subscription":
        return "Membership Subscription";
      default:
        return "Payment";
    }
  };

  // Calculate final amount to pay
  const getFinalAmount = () => {
    if (selectedAmount === "custom") {
      return Number(customAmount);
    }
    return Number(selectedAmount);
  };

  // Configure Flutterwave payment
  const config = {
    public_key: "FLWPUBK_TEST-YOUR_PUBLIC_KEY_HERE", // Replace with your actual public key
    tx_ref: generateReference(),
    amount: getFinalAmount(),
    currency: "UGX", // Using Uganda Shillings
    payment_options: "card,mobilemoney,ussd",
    customer: {
      email,
      phone_number: phone,
      name,
    },
    customizations: {
      title: getPaymentTitle(),
      description: `Payment for ${getPaymentTitle()}`,
      logo: "https://realevr.com/logo.png", // Replace with your actual logo
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !name || !phone || getFinalAmount() <= 0) {
      toast({
        title: "Missing Information",
        description: "Please fill out all required fields and enter a valid amount.",
        variant: "destructive"
      });
      return;
    }
    
    setIsProcessing(true);
    
    // Initiate Flutterwave payment
    handleFlutterPayment({
      callback: (response) => {
        console.log("Payment response:", response);
        closePaymentModal();
        
        if (response.status === "successful") {
          toast({
            title: "Payment Successful!",
            description: `Your payment of ${getFinalAmount()} UGX has been processed successfully.`,
          });
          
          // Call success callback if provided
          if (successCallback) {
            successCallback(response);
          }
        } else {
          toast({
            title: "Payment Failed",
            description: "There was an issue processing your payment. Please try again.",
            variant: "destructive"
          });
        }
        
        setIsProcessing(false);
        resetForm();
        onClose();
      },
      onClose: () => {
        toast({
          title: "Payment Cancelled",
          description: "You cancelled the payment process.",
        });
        setIsProcessing(false);
        onClose();
      },
    });
  };
  
  const resetForm = () => {
    setEmail("");
    setName("");
    setPhone("");
    setSelectedAmount(amount > 0 ? amount.toString() : "");
    setCustomAmount("");
  };

  // Available amounts based on payment type
  const getAmountOptions = () => {
    switch (paymentType) {
      case "PropertyDeposit":
        return [
          { label: "10% Deposit (50,000 UGX)", value: "50000" },
          { label: "25% Deposit (125,000 UGX)", value: "125000" },
          { label: "50% Deposit (250,000 UGX)", value: "250000" },
          { label: "Custom Amount", value: "custom" }
        ];
      case "ViewingFee":
        return [
          { label: "Standard Viewing (10,000 UGX)", value: "10000" },
          { label: "Premium Viewing (25,000 UGX)", value: "25000" },
          { label: "Custom Amount", value: "custom" }
        ];
      case "Subscription":
        return [
          { label: "1 Month (50,000 UGX)", value: "50000" },
          { label: "3 Months (135,000 UGX)", value: "135000" },
          { label: "6 Months (250,000 UGX)", value: "250000" },
          { label: "1 Year (450,000 UGX)", value: "450000" }
        ];
      default:
        return [{ label: "Custom Amount", value: "custom" }];
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Make a Payment</DialogTitle>
          <DialogDescription>
            {paymentType === "PropertyDeposit" && "Secure this property with a deposit payment."}
            {paymentType === "ViewingFee" && "Pay a small fee to schedule a viewing of this property."}
            {paymentType === "Subscription" && "Subscribe to our premium membership plan."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
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
              placeholder="Your email address"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="amount">Select Amount</Label>
            <Select value={selectedAmount} onValueChange={setSelectedAmount}>
              <SelectTrigger>
                <SelectValue placeholder="Select an amount" />
              </SelectTrigger>
              <SelectContent>
                {getAmountOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedAmount === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="customAmount">Custom Amount (UGX)</Label>
              <Input
                id="customAmount"
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Enter amount in UGX"
                min="1"
                required
              />
            </div>
          )}
          
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="mr-2"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isProcessing || !email || !name || !phone || getFinalAmount() <= 0}
            >
              {isProcessing ? "Processing..." : `Pay ${getFinalAmount().toLocaleString()} UGX`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}