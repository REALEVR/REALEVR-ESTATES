import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { usePropertyViews } from '@/hooks/usePropertyViews';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckIcon, BriefcaseIcon, HomeIcon, KeyIcon } from 'lucide-react';

interface PropertyViewingPaymentPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PropertyViewingPaymentPrompt({
  isOpen,
  onClose,
}: PropertyViewingPaymentPromptProps) {
  const { registerPayment } = usePropertyViews();
  const { toast } = useToast();

  // Flutterwave configuration
  const config = {
    public_key: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: Date.now().toString(),
    amount: 10000, // 10,000 UGX
    currency: 'UGX',
    payment_options: 'card,mobilemoney,ussd',
    customer: {
      email: 'user@example.com',
      phone_number: '',
      name: '',
    },
    customizations: {
      title: 'Property Viewing Package',
      description: 'Access to view 5 furnished rental properties',
      logo: 'https://st2.depositphotos.com/1802620/7621/v/450/depositphotos_76219969-stock-illustration-real-estate-logo-template.jpg',
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const handlePayment = () => {
    handleFlutterPayment({
      callback: (response) => {
        if (response.status === 'successful') {
          // Register the successful payment
          registerPayment();
          
          // Show success message
          toast({
            title: 'Payment Successful!',
            description: 'You now have access to view furnished rental properties for 7 days.',
          });
          
          onClose();
        } else {
          // Show error toast
          toast({
            title: 'Payment Failed',
            description: 'There was an issue processing your payment. Please try again.',
            variant: 'destructive',
          });
        }
        
        closePaymentModal();
      },
      onClose: () => {
        // Payment modal closed without completing
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Furnished Property Access</DialogTitle>
          <DialogDescription>
            Purchase a viewing package to access our premium furnished rental properties.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="standard" className="mt-4">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="standard">Standard Access</TabsTrigger>
            <TabsTrigger value="premium">Premium Access</TabsTrigger>
          </TabsList>
          
          <TabsContent value="standard" className="pt-4">
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg">Standard Package</div>
                <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">Popular</div>
              </div>
              
              <div className="flex items-baseline">
                <span className="text-3xl font-bold">UGX 10,000</span>
                <span className="text-muted-foreground ml-2">/week</span>
              </div>
              
              <ul className="space-y-2">
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>Access to view 5 furnished rental properties</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>7-day access period</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>Basic property details</span>
                </li>
              </ul>
              
              <Button 
                className="w-full bg-[#FF5A5F] hover:bg-[#FF5A5F]/90"
                onClick={handlePayment}
              >
                Purchase Now
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="premium" className="pt-4">
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg">Premium Package</div>
                <div className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-sm font-medium">Best Value</div>
              </div>
              
              <div className="flex items-baseline">
                <span className="text-3xl font-bold">UGX 30,000</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              
              <ul className="space-y-2">
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>Unlimited property views</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>30-day access period</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>Detailed floor plans</span>
                </li>
                <li className="flex items-center">
                  <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span>Priority booking for viewings</span>
                </li>
              </ul>
              
              <Button 
                className="w-full bg-amber-500 hover:bg-amber-600"
                onClick={handlePayment}
              >
                Go Premium
              </Button>
              
              <p className="text-sm text-center text-muted-foreground">
                Coming soon! Contact us for early access.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="flex flex-col space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <div className="flex items-center">
              <KeyIcon className="h-4 w-4 mr-1" />
              <span>Secure Payment</span>
            </div>
            <div className="h-4 w-px bg-muted-foreground/30" />
            <div className="flex items-center">
              <HomeIcon className="h-4 w-4 mr-1" />
              <span>Quality Properties</span>
            </div>
            <div className="h-4 w-px bg-muted-foreground/30" />
            <div className="flex items-center">
              <BriefcaseIcon className="h-4 w-4 mr-1" />
              <span>Professional Service</span>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}