import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ConnectionStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const { toast } = useToast();

  useEffect(() => {
    // Function to check API connectivity
    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/api/test-endpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp: Date.now() }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          if (status !== 'connected') {
            setStatus('connected');
            toast({
              title: "Connection Restored",
              description: "You're back online and connected to the server.",
              variant: "default",
            });
          }
        } else {
          if (status === 'connected') {
            setStatus('disconnected');
            toast({
              title: "Connection Issue",
              description: "There seems to be a problem connecting to the server.",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        if (status === 'connected') {
          setStatus('disconnected');
          toast({
            title: "Connection Lost",
            description: "Unable to connect to the server. Retrying...",
            variant: "destructive",
          });
        } else if (status === 'disconnected') {
          setStatus('reconnecting');
        }
      }
    };

    // Check connection immediately
    checkConnection();
    
    // Then check every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    
    // Also check when the window regains focus
    const handleFocus = () => {
      checkConnection();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [status, toast]);

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 p-3 rounded-md shadow-lg flex items-center gap-2 ${
      status === 'disconnected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      {status === 'disconnected' ? (
        <WifiOff className="h-5 w-5" />
      ) : (
        <AlertCircle className="h-5 w-5" />
      )}
      <span className="text-sm font-medium">
        {status === 'disconnected' 
          ? 'Connection lost. Please check your internet.' 
          : 'Reconnecting...'}
      </span>
    </div>
  );
}
