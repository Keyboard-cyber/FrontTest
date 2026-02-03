import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { LocalPaymentQueue } from '../types';

interface PaymentContextType {
  // État réactif
  recentPayment: LocalPaymentQueue | null;
  paymentUpdated: LocalPaymentQueue | null;
  syncTrigger: number; // Simple counter pour déclencher les updates
  
  // Actions
  addPaymentToUI: (payment: LocalPaymentQueue) => void;
  updatePaymentInUI: (payment: LocalPaymentQueue) => void;
  triggerPaymentUpdate: () => void;
  clearRecentPayment: () => void;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

export const usePayment = (): PaymentContextType => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

interface PaymentProviderProps {
  children: ReactNode;
}

export const PaymentProvider: React.FC<PaymentProviderProps> = ({ children }) => {
  const [recentPayment, setRecentPayment] = useState<LocalPaymentQueue | null>(null);
  const [paymentUpdated, setPaymentUpdated] = useState<LocalPaymentQueue | null>(null);
  const [syncTrigger, setSyncTrigger] = useState(0);

  const addPaymentToUI = useCallback((payment: LocalPaymentQueue) => {
    setRecentPayment(payment);
    // Émettre aussi comme updated pour que les listeners réagissent
    setPaymentUpdated(payment);
  }, []);

  const updatePaymentInUI = useCallback((payment: LocalPaymentQueue) => {
    setPaymentUpdated(payment);
  }, []);

  const triggerPaymentUpdate = useCallback(() => {
    // Incrémenter le compteur pour déclencher les mises à jour
    setSyncTrigger(prev => prev + 1);
  }, []);

  const clearRecentPayment = useCallback(() => {
    setRecentPayment(null);
  }, []);

  const value: PaymentContextType = {
    recentPayment,
    paymentUpdated,
    syncTrigger,
    addPaymentToUI,
    updatePaymentInUI,
    triggerPaymentUpdate,
    clearRecentPayment,
  };

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};
