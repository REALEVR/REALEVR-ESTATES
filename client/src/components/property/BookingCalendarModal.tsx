import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, setHours, setMinutes } from "date-fns";
import PaymentModal from "@/components/payment/PaymentModal";

interface BookingCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: number;
  propertyTitle: string;
  propertyCategory?: string; // Add category to determine payment flow
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
  propertyCategory = "other" // Default to other if not specified
}: BookingCalendarModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string>(availableTimeSlots[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<any>(null);
  const { toast } = useToast();

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
    
    // Create the Google Calendar event details
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
    
    // For furnished properties, require payment before confirming booking
    if (propertyCategory === "furnished_houses") {
      setPendingEvent(calendarEvent);
      setIsPaymentModalOpen(true);
      setIsSubmitting(false);
    } else {
      // For other property types, confirm booking immediately
      processBooking(calendarEvent);
    }
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
            <DialogTitle>Schedule a Visit</DialogTitle>
            <DialogDescription>
              Schedule a visit to view {propertyTitle}. Select a date and time that works for you.
              {propertyCategory === "furnished_houses" && (
                <span className="block mt-2 text-sm font-medium">
                  <i className="fas fa-info-circle mr-1 text-[#FF5A5F]"></i>
                  Payment required to confirm booking for furnished properties.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid gap-6">
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
                {isSubmitting ? "Scheduling..." : propertyCategory === "furnished_houses" ? "Continue to Payment" : "Schedule Visit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Payment Modal for Furnished Properties */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        propertyId={propertyId}
        propertyTitle={propertyTitle}
        paymentType="PropertyDeposit"
        amount={5000} // Default deposit amount in UGX
        successCallback={handlePaymentConfirm}
      />
    </>
  );
}