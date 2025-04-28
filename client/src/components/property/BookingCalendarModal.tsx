import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, setHours, setMinutes, differenceInCalendarDays } from "date-fns";
import PaymentModal from "@/components/payment/PaymentModal";

interface BookingCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: number;
  propertyTitle: string;
  propertyCategory?: string; // Add category to determine payment flow
  propertyPrice?: number; // Daily rate for furnished properties
}

const availableTimeSlots = [
  "09:00", "10:00", "11:00", "12:00", "13:00", 
  "14:00", "15:00", "16:00", "17:00"
];

export default function BookingCalendarModal({
  isOpen,
  onClose,
  propertyId,
  propertyTitle,
  propertyCategory = "other", // Default to other if not specified
  propertyPrice = 35000 // Default daily rate in UGX
}: BookingCalendarModalProps) {
  // For regular viewing appointment
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string>(availableTimeSlots[0]);
  
  // For BnB/furnished properties booking
  const [startDate, setStartDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 3)); // 2-night default
  const [totalNights, setTotalNights] = useState<number>(2);
  const [totalAmount, setTotalAmount] = useState<number>(propertyPrice * 2);
  
  // Common fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<any>(null);
  const { toast } = useToast();
  
  // Check if this is a BnB booking
  const isBnB = propertyCategory === "BnB" || propertyCategory === "furnished_houses";
  
  // Calculate booking details when dates change
  useEffect(() => {
    if ((propertyCategory === "furnished_houses" || propertyCategory === "BnB") && startDate && endDate) {
      const nights = differenceInCalendarDays(endDate, startDate);
      if (nights > 0) {
        setTotalNights(nights);
        setTotalAmount(propertyPrice * nights);
      } else {
        // If end date is before or same as start date, reset it
        setEndDate(addDays(startDate, 1));
        setTotalNights(1);
        setTotalAmount(propertyPrice);
      }
    }
  }, [startDate, endDate, propertyPrice, propertyCategory]);

  // Function to validate the form before submission
  const isFormValid = () => {
    return selectedDate && selectedTime && name && email && phone;
  };

  // Function to convert time string (e.g., "09:00") to Date object
  const timeToDate = (timeString: string, baseDate: Date): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const dateWithTime = new Date(baseDate);
    return setMinutes(setHours(dateWithTime, hours), minutes);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid()) {
      toast({
        title: "Missing Information",
        description: "Please fill out all required fields.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    // Handle different booking types
    if (isBnB) {
      // For BnB bookings - date range with no immediate payment
      const bookingRequest = {
        propertyId,
        propertyTitle,
        guestName: name,
        guestEmail: email,
        guestPhone: phone,
        notes,
        checkInDate: startDate?.toISOString(),
        checkOutDate: endDate?.toISOString(),
        totalNights,
        totalAmount,
        bookingId: Math.random().toString(36).substring(2, 9),
        status: "pending", // Initial status
        paymentStatus: "pending" // Payment will be collected later
      };
      
      // Just confirm booking for BnB (Airbnb style) - payment collected later
      processBnBBooking(bookingRequest);
    } else {
      // For regular property viewings
      // Create the calendar event details
      const eventDateTime = selectedDate ? timeToDate(selectedTime, selectedDate) : new Date();
      const eventEndTime = selectedDate ? addDays(timeToDate(selectedTime, selectedDate), 0) : new Date();
      eventEndTime.setHours(eventEndTime.getHours() + 1); // 1 hour viewing
      
      // Create the event object (in a production system, this would be sent to your API)
      const calendarEvent = {
        propertyId,
        propertyTitle,
        visitorName: name,
        visitorEmail: email,
        visitorPhone: phone,
        notes,
        startTime: eventDateTime.toISOString(),
        endTime: eventEndTime.toISOString(),
        bookingId: Math.random().toString(36).substring(2, 9)
      };
      
      processBooking(calendarEvent);
    }
  };
  
  // Process BnB booking with payment requirement
  const processBnBBooking = (bookingRequest: any) => {
    // Store the booking request for after payment
    setPendingEvent(bookingRequest);
    
    // Open payment modal
    setIsSubmitting(false);
    setIsPaymentModalOpen(true);
  };
  
  // Process the booking after payment (if required)
  const processBooking = (calendarEvent: any) => {
    // Simulate sending to API
    setTimeout(() => {
      console.log("Booking request:", calendarEvent);
      
      // In a real implementation, this would send the data to your server
      // which would then create an event in your Google Calendar using the Google Calendar API
      
      const eventDateTime = new Date(calendarEvent.startTime);
      
      toast({
        title: "Visit Scheduled!",
        description: `Your visit has been scheduled for ${format(eventDateTime, 'MMM d, yyyy')} at ${selectedTime}.`,
      });
      
      setIsSubmitting(false);
      resetForm();
      onClose();
    }, 1500);
  };
  
  // Handle payment confirmation
  const handlePaymentConfirm = (response: any) => {
    console.log("Payment successful:", response);
    
    if (pendingEvent) {
      setIsSubmitting(true);
      processBooking(pendingEvent);
      setPendingEvent(null);
    }
  };
  
  const resetForm = () => {
    setSelectedDate(addDays(new Date(), 1));
    setSelectedTime(availableTimeSlots[0]);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[525px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isBnB ? "Book Your Stay" : "Schedule a Visit"}</DialogTitle>
            <DialogDescription>
              {isBnB ? (
                <>
                  Book your stay at {propertyTitle}. Select your check-in and check-out dates.
                  <span className="block mt-2 text-sm font-medium">
                    <i className="fas fa-info-circle mr-1 text-[#FF5A5F]"></i>
                    Payment is required to confirm booking and view owner contact details.
                  </span>
                </>
              ) : (
                <>
                  Schedule a visit to view {propertyTitle}. Select a date and time that works for you.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid gap-6">
              {isBnB ? (
                <div className="space-y-4">
                  <Label className="text-lg font-medium">Select Your Stay Dates</Label>
                  <div className="space-y-2">
                    <Label>Check-in / Check-out Dates</Label>
                    <div className="border rounded-md p-3">
                      <Calendar
                        mode="range"
                        selected={{
                          from: startDate!,
                          to: endDate!
                        }}
                        onSelect={(range) => {
                          if (range?.from) setStartDate(range.from);
                          if (range?.to) setEndDate(range.to);
                        }}
                        disabled={(date) => 
                          date < new Date() || // No past dates
                          date > addDays(new Date(), 90) // No dates more than 90 days in the future
                        }
                        initialFocus
                        numberOfMonths={2}
                      />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-md">
                    <h4 className="font-medium text-base mb-2">Booking Summary</h4>
                    <div className="flex justify-between mb-1">
                      <span>Price per night:</span>
                      <span>{propertyPrice.toLocaleString()} UGX</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Number of nights:</span>
                      <span>{totalNights}</span>
                    </div>
                    <div className="flex justify-between font-medium text-lg pt-2 border-t">
                      <span>Total:</span>
                      <span>{totalAmount.toLocaleString()} UGX</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      <i className="fas fa-info-circle mr-1"></i>
                      A booking deposit (20% of total) is required now to confirm and view contact details.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select a Date</Label>
                    <div className="border rounded-md p-3">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => 
                          date < new Date() || // No past dates
                          date.getDay() === 0 || // No Sundays
                          date > addDays(new Date(), 60) // No dates more than 60 days in the future
                        }
                        initialFocus
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="time">Select a Time</Label>
                    <Select value={selectedTime} onValueChange={setSelectedTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a time" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTimeSlots.map((time) => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              
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
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any specific details or questions about the property"
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="mr-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isFormValid()}
              >
                {isSubmitting ? 
                  "Processing..." : 
                  isBnB ? 
                    "Continue to Payment" : 
                    "Schedule Visit"
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Payment Modal for BnB/Furnished Properties */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        propertyId={propertyId}
        propertyTitle={propertyTitle}
        paymentType={isBnB ? "BnBBookingDeposit" : "PropertyDeposit"}
        amount={isBnB ? Math.ceil(totalAmount * 0.2) : 5000} // 20% deposit for BnBs, 5000 UGX for regular viewings
        successCallback={handlePaymentConfirm}
      />
    </>
  );
}