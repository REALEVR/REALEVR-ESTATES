import React, { createContext, useContext, useState, ReactNode } from 'react';
import PropertyViewingPaymentPrompt from '@/components/payment/PropertyViewingPaymentPrompt';

interface PaymentContextType {
  openViewingPaymentPrompt: () => void;
  openDepositPaymentPrompt: (propertyId: number, propertyTitle: string) => void;
  hasActiveViewingPackage: boolean; // This would be determined through an API in a real app
  setActiveViewingPackage: (value: boolean) => void;
}

const PaymentContext = createContext<PaymentContextType | null>(null);

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [isViewingPromptOpen, setIsViewingPromptOpen] = useState(false);
  const [hasActiveViewingPackage, setHasActiveViewingPackage] = useState(false);
  const [propertyForDeposit, setPropertyForDeposit] = useState<{ id: number; title: string } | null>(null);

  const openViewingPaymentPrompt = () => {
    setIsViewingPromptOpen(true);
  };

  const openDepositPaymentPrompt = (propertyId: number, propertyTitle: string) => {
    setPropertyForDeposit({ id: propertyId, title: propertyTitle });
    setIsViewingPromptOpen(true);
  };

  return (
    <PaymentContext.Provider
      value={{
        openViewingPaymentPrompt,
        openDepositPaymentPrompt,
        hasActiveViewingPackage,
        setActiveViewingPackage: setHasActiveViewingPackage
      }}
    >
      {children}

      {/* Payment Prompt Components */}
      <PropertyViewingPaymentPrompt
        isOpen={isViewingPromptOpen}
        onClose={() => setIsViewingPromptOpen(false)}
      />
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
}