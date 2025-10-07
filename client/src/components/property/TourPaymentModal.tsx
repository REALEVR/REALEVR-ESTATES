import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFlutterwave, FlutterwaveConfig } from "flutterwave-react-v3";
import { Loader2, Eye, CreditCard, UserPlus } from "lucide-react";
import type { Property } from "@shared/schema";
import Logo from "../../assets/logo.png";

const tourPaymentSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 characters"),
});

type TourPaymentFormValues = z.infer<typeof tourPaymentSchema>;

interface TourPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  onPaymentSuccess: () => void;
}

export default function TourPaymentModal({ 
  isOpen, 
  onClose, 
  property,
  onPaymentSuccess 
}: TourPaymentModalProps) {
  const { toast } = useToast();
  const { user, loginMutation } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const form = useForm<TourPaymentFormValues>({
    resolver: zodResolver(tourPaymentSchema),
    defaultValues: {
      email: "",
      fullName: "",
      phoneNumber: "",
    },
  });

  // Flutterwave configuration
  const publicKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
  // console.log('Flutterwave Public Key:', publicKey); // Debug log

  const config: FlutterwaveConfig = {
    public_key: publicKey, // Fallback to test key
    tx_ref: `tour-view-${property.id}-${Date.now()}`,
    amount: 15000, // 15,000 UGX
    currency: "UGX",
    payment_options: 'card,mobilemoney,ussd',
    customer: {
      email: form.watch('email') || user?.email || 'user@example.com',
      phone_number: form.watch('phoneNumber') || user?.phoneNumber || '',
      name: form.watch('fullName') || user?.fullName || '',
    },
    customizations: {
      title: 'Tour View Payment - RealEVR Estates',
      description: `Virtual tour access for ${property.title}`,
      logo: 'https://st2.depositphotos.com/1802620/7621/v/450/depositphotos_76219969-stock-illustration-real-estate-logo-template.jpg',
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const handlePaymentSuccess = async (response: any) => {
    if (response.status === 'successful') {
      try {
        // Verify the payment with our backend
        const verificationResponse = await fetch("/api/verify-tour-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transaction_id: response.transaction_id,
            property_id: property.id,
            user_id: user?.id
          })
        });

        const verificationData = await verificationResponse.json();

        if (verificationData.status === "success") {
          toast({
            title: "Payment Successful!",
            description: "You can now view the virtual tour.",
          });
          onPaymentSuccess();
          onClose();
        } else {
          toast({
            title: "Payment Verification Failed",
            description: "Payment could not be verified. Please contact support.",
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Payment Error",
          description: "Failed to process payment. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Payment Failed",
        description: "Payment was not successful. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handlePayForTour = async (data: TourPaymentFormValues) => {
    console.log('Processing payment for tour access...', data);
    setIsProcessing(true);

    // Proceed with payment
    handleFlutterPayment({
      callback: async (response) => {
        if (response.status === 'successful') {
          try {
            // Verify payment
            const verificationResponse = await fetch("/api/verify-tour-payment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                transaction_id: response.transaction_id,
                property_id: property.id,
                customer_email: data.email,
                customer_name: data.fullName
              })
            });

            const verificationData = await verificationResponse.json();

            if (verificationData.status === "success") {
              toast({
                title: "Payment Successful!",
                description: "You can now view the virtual tour.",
              });
              onPaymentSuccess(); // This will open the tour
              onClose();
            } else {
              toast({
                title: "Payment Verification Failed",
                description: "Payment could not be verified. Please contact support.",
                variant: "destructive"
              });
            }
          } catch (error) {
            toast({
              title: "Payment Error",
              description: "Failed to process payment. Please try again.",
              variant: "destructive"
            });
          }
        } else {
          toast({
            title: "Payment Failed",
            description: "Payment was not successful. Please try again.",
            variant: "destructive"
          });
        }
        setIsProcessing(false);
      },
      onClose: () => setIsProcessing(false),
    });
  };

  const handleExistingUserPayment = () => {
    console.log('Starting payment for existing user...', config); // Debug log
    setIsProcessing(true);
    handleFlutterPayment({
      callback: handlePaymentSuccess,
      onClose: () => {
        console.log('Payment modal closed'); // Debug log
        setIsProcessing(false);
      },
    });
  };

  const handlePaymentClose = () => {
    setIsProcessing(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            View Virtual Tour
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Tour Access Required</h4>
            <p className="text-sm text-blue-800">
              To view the virtual tour for this property, a one-time payment of <strong>15,000 UGX</strong> is required.
            </p>
          </div>

          {user ? (
            // User is logged in
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  Welcome back, <strong>{user.fullName}</strong>! You're logged in and ready to pay.
                </p>
              </div>
              
              <Button 
                onClick={handleExistingUserPayment}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay 15,000 UGX to View Tour
                  </>
                )}
              </Button>
            </div>
          ) : (
            // User is not logged in
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowLoginForm(false)}
                  className={!showLoginForm ? "bg-blue-50 border-blue-200" : ""}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account & Pay
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowLoginForm(true)}
                  className={showLoginForm ? "bg-blue-50 border-blue-200" : ""}
                >
                  Login & Pay
                </Button>
              </div>

              {!showLoginForm ? (
                // Create account form
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handlePayForTour)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your phone number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit" 
                      disabled={isProcessing}
                      className="w-full"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing Payment...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay 15,000 UGX to View Tour
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              ) : (
                // Login form
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    Please login to your existing account first, then you can proceed with the payment.
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)}
                    className="mt-3 w-full"
                  >
                    Go to Login
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <Button variant="ghost" onClick={handlePaymentClose} className="text-gray-500">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 