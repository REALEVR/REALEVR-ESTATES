
import { useState, useEffect } from 'react';

export function usePropertyViews() {
  const [viewedProperties, setViewedProperties] = useState(0);
  const [hasValidPayment, setHasValidPayment] = useState(false);
  
  useEffect(() => {
    const views = localStorage.getItem('propertyViews');
    const payment = localStorage.getItem('propertyPayment');
    
    if (views) {
      setViewedProperties(parseInt(views, 10));
    }
    
    if (payment) {
      const paymentData = JSON.parse(payment);
      const isValid = new Date(paymentData.expiry) > new Date();
      setHasValidPayment(isValid);
    }
  }, []);
  
  return { viewedProperties, hasValidPayment };
}
