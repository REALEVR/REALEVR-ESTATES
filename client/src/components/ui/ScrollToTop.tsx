import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

const ScrollToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 shadow-lg transition-all duration-500 ease-out hover:scale-110 hover:shadow-xl animate-in slide-in-from-bottom-4 zoom-in-95"
          aria-label="Scroll to top"
          style={{
            animation: 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
          }}
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes bounceIn {
            0% {
              opacity: 0;
              transform: scale(0.3) translateY(20px);
            }
            50% {
              opacity: 1;
              transform: scale(1.05) translateY(-5px);
            }
            70% {
              transform: scale(0.9) translateY(0);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          
          @keyframes bounceOut {
            0% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
            20% {
              opacity: 1;
              transform: scale(1.1) translateY(-5px);
            }
            100% {
              opacity: 0;
              transform: scale(0.3) translateY(20px);
            }
          }
        `
      }} />
    </>
  );
};

export default ScrollToTop; 