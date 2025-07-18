import { useState, useEffect } from 'react';

// This hook manages tracking property views for limiting access to premium properties
export function usePropertyViews() {
  const [viewedProperties, setViewedProperties] = useState<number>(0);
  const [hasValidPayment, setHasValidPayment] = useState<boolean>(false);
  const [paymentExpiry, setPaymentExpiry] = useState<number | null>(null);

  // On load, check local storage for existing data
  useEffect(() => {
    const storedViews = localStorage.getItem('viewedPropertiesCount');
    const storedPayment = localStorage.getItem('propertyViewingPayment');
    const storedExpiry = localStorage.getItem('propertyViewingExpiry');

    if (storedViews) {
      setViewedProperties(parseInt(storedViews, 10));
    }

    if (storedPayment === 'true' && storedExpiry) {
      const expiryTime = parseInt(storedExpiry, 10);
      if (expiryTime > Date.now()) {
        setHasValidPayment(true);
        setPaymentExpiry(expiryTime);
      } else {
        // Payment expired, clean up
        localStorage.removeItem('propertyViewingPayment');
        localStorage.removeItem('propertyViewingExpiry');
      }
    }
  }, []);

  // Record a property view
  const recordPropertyView = (propertyId: number) => {
    // Don't count duplicate views of the same property
    const viewedIds = JSON.parse(localStorage.getItem('viewedPropertyIds') || '[]');
    if (!viewedIds.includes(propertyId)) {
      const newCount = viewedProperties + 1;
      setViewedProperties(newCount);
      localStorage.setItem('viewedPropertiesCount', newCount.toString());
      
      // Store the viewed property ID to prevent duplicates
      viewedIds.push(propertyId);
      localStorage.setItem('viewedPropertyIds', JSON.stringify(viewedIds));
    }
  };

  // Register a successful payment
  const registerPayment = () => {
    // Payment valid for 24 hours
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000);
    setHasValidPayment(true);
    setPaymentExpiry(expiryTime);
    localStorage.setItem('propertyViewingPayment', 'true');
    localStorage.setItem('propertyViewingExpiry', expiryTime.toString());
    
    // Reset view count
    setViewedProperties(0);
    localStorage.setItem('viewedPropertiesCount', '0');
  };

  return {
    viewedProperties,
    hasValidPayment,
    paymentExpiry,
    recordPropertyView,
    registerPayment
  };
}