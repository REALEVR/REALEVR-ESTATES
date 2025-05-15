import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PaymentModal from "@/components/payment/PaymentModal";

interface BookingCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: number;
  propertyTitle: string;
  propertyCategory?: string; // Add category to determine payment flow
  propertyPrice?: number; // Daily rate for furnished properties
}

export default function BookingCalendarModal({
  isOpen,
  onClose,
  propertyId,
  propertyTitle,
  propertyCategory = "rental",
  propertyPrice = 0
}: BookingCalendarModalProps) {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [numGuests, setNumGuests] = useState(1);
  const [numNights, setNumNights] = useState(1);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState("calendar");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // For BnBs, calculate 20% deposit
  const isBnB = propertyCategory === "BnB" || propertyCategory === "furnished_houses";
  const totalAmount = isBnB ? propertyPrice * numNights : 15000; // 15,000 UGX viewing fee for rentals
  const depositAmount = isBnB ? Math.round(totalAmount * 0.2) : totalAmount;
  
  const timeSlots = [
    "9:00 AM", "10:00 AM", "11:00 AM", 
    "12:00 PM", "1:00 PM", "2:00 PM", 
    "3:00 PM", "4:00 PM", "5:00 PM"
  ];
  
  const timeToDate = (timeString: string, baseDate: Date): Date => {
    const [hourMinute, period] = timeString.split(" ");
    let [hours, minutes] = hourMinute.split(":").map(Number);
    
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    
    const result = new Date(baseDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  };
  
  const handleTimeSlotClick = (slot: string) => {
    setSelectedTimeSlot(slot);
  };
  
  const handleContinue = () => {
    if (!date) {
      toast({
        title: "Please select a date",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedTimeSlot && !isBnB) {
      toast({
        title: "Please select a time slot",
        variant: "destructive",
      });
      return;
    }
    
    if (isBnB) {
      setTab("details");
    } else {
      // For rentals, proceed to payment directly
      handleBookNow();
    }
  };
  
  const handleBookNow = () => {
    if (isBnB && numNights < 1) {
      toast({
        title: "Please enter at least 1 night",
        variant: "destructive",
      });
      return;
    }
    
    // Show payment modal with appropriate details
    setIsPaymentModalOpen(true);
  };
  
  const handlePaymentSuccess = (response: any) => {
    setIsPaymentModalOpen(false);
    onClose();
    
    // Save transaction details to localStorage for reference
    const paymentInfo = {
      transactionId: response.transaction_id,
      amount: response.amount,
      propertyId,
      propertyTitle,
      date: new Date().toISOString()
    };
    
    try {
      // Store the payment info in localStorage
      const payments = JSON.parse(localStorage.getItem('payments') || '[]');
      payments.push(paymentInfo);
      localStorage.setItem('payments', JSON.stringify(payments));
    } catch (error) {
      console.error('Error saving payment info', error);
    }
    
    // Redirect with success parameter for BnBs
    if (isBnB) {
      window.location.href = `${window.location.pathname}?booking=confirmed`;
    }
    
    toast({
      title: isBnB ? "Booking Confirmed!" : "Viewing Booked!",
      description: isBnB 
        ? `Your booking for ${propertyTitle} has been confirmed. You've paid a ${depositAmount.toLocaleString()} UGX deposit. Transaction ID: ${response.transaction_id}`
        : `Your viewing for ${propertyTitle} has been scheduled on ${format(date!, "PPP")} at ${selectedTimeSlot}.`,
      duration: 5000,
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {isBnB ? "Book Your Stay" : "Schedule a Viewing"}
            </DialogTitle>
            <DialogDescription>
              {isBnB 
                ? "Select your check-in date and duration" 
                : "Select your preferred date and time to view this property"}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="calendar">{isBnB ? "Check-in Date" : "Select Date"}</TabsTrigger>
              {isBnB && <TabsTrigger value="details">Booking Details</TabsTrigger>}
              {!isBnB && <TabsTrigger value="time">Select Time</TabsTrigger>}
            </TabsList>
            
            <TabsContent value="calendar">
              <div className="flex justify-center mb-4">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(date) => date < new Date()}
                  className="rounded-md border mx-auto"
                />
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleContinue}>
                  {isBnB ? "Continue" : "Select Time"}
                </Button>
              </DialogFooter>
            </TabsContent>
            
            {!isBnB && (
              <TabsContent value="time">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {timeSlots.map((slot) => (
                    <Button
                      key={slot}
                      variant={selectedTimeSlot === slot ? "default" : "outline"}
                      className={selectedTimeSlot === slot ? "bg-[#FF5A5F] hover:bg-[#FF7478]" : ""}
                      onClick={() => handleTimeSlotClick(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTab("calendar")}>Back</Button>
                  <Button onClick={handleBookNow}>Book Viewing (15,000 UGX)</Button>
                </DialogFooter>
              </TabsContent>
            )}
            
            {isBnB && (
              <TabsContent value="details">
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nights">Number of Nights</Label>
                      <Input
                        id="nights"
                        type="number"
                        min="1"
                        value={numNights}
                        onChange={(e) => setNumNights(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guests">Number of Guests</Label>
                      <Input
                        id="guests"
                        type="number"
                        min="1"
                        value={numGuests}
                        onChange={(e) => setNumGuests(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes">Special Requests</Label>
                    <Input
                      id="notes"
                      placeholder="Any special requests or notes for the host"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span>Price per night:</span>
                      <span>{propertyPrice?.toLocaleString()} UGX</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Number of nights:</span>
                      <span>{numNights}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span>{totalAmount.toLocaleString()} UGX</span>
                    </div>
                    <div className="flex justify-between text-[#FF5A5F] font-medium border-t pt-2">
                      <span>Required deposit (20%):</span>
                      <span>{depositAmount.toLocaleString()} UGX</span>
                    </div>
                    
                    {/* Payment button directly under deposit amount */}
                    <Button 
                      onClick={handleBookNow}
                      className="w-full mt-3 bg-[#FF5A5F] hover:bg-[#FF7478] text-white"
                    >
                      Pay {depositAmount.toLocaleString()} UGX Deposit Now
                    </Button>
                  </div>
                  
                  <div className="mt-2 text-center text-sm text-gray-500">
                    <p>After payment, you'll receive the owner's contact information</p>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTab("calendar")}>Back</Button>
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </DialogFooter>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        propertyId={propertyId}
        propertyTitle={propertyTitle}
        paymentType={isBnB ? "BnBBookingDeposit" : "ViewingFee"}
        amount={depositAmount}
        successCallback={handlePaymentSuccess}
      />
    </>
  );
}