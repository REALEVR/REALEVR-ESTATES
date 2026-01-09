import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import "../Hero.css"

import houseImg from '../../assets/images/hero.jpg';
import FilterBar from './FilterBar';

// Custom hook for mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768); // 768px is the md breakpoint
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

interface HeroProps {
  videoUrl?: string;
}

const Hero: React.FC<HeroProps> = ({ videoUrl }) => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showImage, setShowImage] = useState(!videoUrl);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [searchFilters, setSearchFilters] = useState({
    location: '',
    propertyType: '',
    priceRange: '',
    bedrooms: '',
    bathrooms: ''
  });

  // Convert YouTube URL to embed URL
  const getVideoUrl = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // Check if it's a playlist URL
      if (url.includes('playlist?list=') || url.includes('&list=')) {
        const playlistId = url.includes('playlist?list=')
          ? url.split('playlist?list=')[1]?.split('&')[0]
          : url.split('&list=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&enablejsapi=1&origin=${window.location.origin}`;
      }

      // Regular single video
      const videoId = url.includes('youtube.com')
        ? url.split('v=')[1]?.split('&')[0]
        : url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&enablejsapi=1&origin=${window.location.origin}`;
    }
    return url;
  };

  useEffect(() => {
    console.log('Hero component - videoUrl:', videoUrl);
    if (videoUrl) {
      setIsVideoLoading(true);
      setVideoError(false);
      setShowImage(false);
    }
  }, [videoUrl]);

  // Property types
  const propertyTypes = [
    { value: '', label: 'Property Type' },
    { value: 'Apartment', label: 'Apartment' },
    { value: 'House', label: 'House' },
    { value: 'Villa', label: 'Villa' },
    { value: 'Land', label: 'Land' },
    { value: 'Commercial', label: 'Commercial' }
  ];

  // Popular locations
  const locations = [
    { value: '', label: 'Location' },
    { value: 'Kololo', label: 'Kololo' },
    { value: 'Nakasero', label: 'Nakasero' },
    { value: 'Bugolobi', label: 'Bugolobi' },
    { value: 'Muyenga', label: 'Muyenga' },
    { value: 'Ntinda', label: 'Ntinda' },
    { value: 'Munyonyo', label: 'Munyonyo' },
    { value: 'Naguru', label: 'Naguru' },
    { value: 'Kira', label: 'Kira' },
    { value: 'Lubowa', label: 'Lubowa' },
    { value: 'Entebbe', label: 'Entebbe' }
  ];

  // Price ranges
  const priceRanges = [
    { value: '', label: 'Price Range' },
    { value: 'low', label: 'Under 500K UGX' },
    { value: 'medium', label: '500K - 1.5M UGX' },
    { value: 'high', label: 'Above 1.5M UGX' }
  ];

  // Bedroom options
  const bedroomOptions = [
    { value: '', label: 'Bedrooms' },
    { value: '1', label: '1 Bedroom' },
    { value: '2', label: '2 Bedrooms' },
    { value: '3', label: '3 Bedrooms' },
    { value: '4', label: '4 Bedrooms' },
    { value: '5+', label: '5+ Bedrooms' }
  ];

  // Bathroom options
  const bathroomOptions = [
    { value: '', label: 'Bathrooms' },
    { value: '1', label: '1 Bathroom' },
    { value: '2', label: '2 Bathrooms' },
    { value: '3', label: '3 Bathrooms' },
    { value: '4', label: '4 Bathrooms' },
    { value: '5+', label: '5+ Bathrooms' }
  ];

  const handleFilterChange = (filterType: string, value: string) => {
    setSearchFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleSearch = () => {
    // Build query parameters
    const params = new URLSearchParams();
    
    if (searchFilters.location) params.append('location', searchFilters.location);
    if (searchFilters.propertyType) params.append('type', searchFilters.propertyType);
    if (searchFilters.priceRange) params.append('price', searchFilters.priceRange);
    if (searchFilters.bedrooms) params.append('bedrooms', searchFilters.bedrooms);
    if (searchFilters.bathrooms) params.append('bathrooms', searchFilters.bathrooms);

    // Navigate to rental units page with search parameters
    // This is the most general property category
    const searchUrl = `/rental-units?${params.toString()}`;
    setLocation(searchUrl);
  };

  const handleVideoLoad = () => {
    console.log('Video loaded successfully');
    setIsVideoLoading(false);
  };

  const handleVideoError = () => {
    console.log('Video failed to load, falling back to image');
    setIsVideoLoading(false);
    setVideoError(true);
    setShowImage(true);
  };

  const handlePlayPause = () => {
    if (!videoUrl) return;
    
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      // For YouTube iframe, we need to send a message to control playback
      if (iframeRef.current) {
        const iframe = iframeRef.current;
        if (isVideoPlaying) {
          iframe.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        } else {
          iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        }
      }
    } else {
      // For regular video element
      if (videoRef.current) {
        if (isVideoPlaying) {
          videoRef.current.pause();
        } else {
          videoRef.current.play();
        }
      }
    }
    setIsVideoPlaying(!isVideoPlaying);
  };

  return (
    <section className='bg-[#faf8f6] -mx-4 sm:-mx-6 lg:-mx-8'>
 <section className="w-full mdx_hero p-8 md:p-12 mt-6 flex flex-col gap-8 hero-video-wrapper  newHero">

      {/* Main hero content */}
      <div className="flex flex-col md:flex-row md:items-center gap-8">
        {/* Left: Headline */}
        <div className="flex-1 hero-left-content">
          <h1 className="text-5xl md:text-7xl font-light leading-tight">
            <span className="font-serif italic text-6xl md:text-8xl hero-find-text">Find</span> <br />
            <span className="font-sans hero-text-two">Your Modern House</span>
          </h1>
        </div>
        {/* Right: Description and stats */}
        <div className="flex-1 flex flex-col gap-8 hero-right-content">
          <p className="text-lg md:text-xl text-gray-600 mb-4">
            Experience a seamless real estate journey using VR tailored to your unique needs, where every home search leads to a place that was made specifically just for you.
          </p>
          <div className="flex gap-12">
            <div>
              <div className="text-3xl md:text-4xl font-bold">1,000+</div>
              <div className="text-gray-500 text-base">Target House Listings</div>
            </div>
            <div className="border-l border-gray-300 h-12 mx-4"></div>
            <div>
              <div className="text-3xl md:text-4xl font-bold">98%</div>
              <div className="text-gray-500 text-base">Target Customer Satisfaction</div>
            </div>
          </div>
        </div>
      </div>
       <FilterBar />

      {/* House image/video and search bar */}
      <div className="relative mt-4">
        {videoUrl && !showImage ? (
          // Video content - full width and height
          <div className="relative w-full h-96 md:h-[500px] lg:h-[600px] rounded-2xl shadow-md overflow-hidden">
            {/* Loading spinner */}
            {isVideoLoading && (
              <div className="absolute inset-0 bg-gray-200 flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <span className="ml-3 text-gray-600">Loading video...</span>
              </div>
            )}
            
            {/* YouTube iframe */}
            {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <iframe
                  ref={iframeRef}
                  src={getVideoUrl(videoUrl)}
                  className="w-full h-full"
                  style={{
                    width: '100%',
                    height: '100%',
                    minWidth: '100%',
                    minHeight: '100%',
                    border: 'none'
                  }}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onLoad={handleVideoLoad}
                  onError={handleVideoError}
                />
              </div>
            ) : (
              // Regular video element
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }}
                autoPlay
                muted
                loop
                playsInline
                onLoadedData={handleVideoLoad}
                onError={handleVideoError}
              />
            )}
            
            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
          </div>
        ) : (
          // Image content (fallback or default) - also larger
          <img
            src={houseImg}
            alt="Modern house"
            className="w-full h-96 md:h-[500px] lg:h-[600px] object-cover rounded-2xl shadow-md"
          />
        )}
        
        {/* Play/Pause button overlay - always show in top right */}
        <button 
          onClick={handlePlayPause}
          className="absolute top-4 right-4 bg-white rounded-full p-3 shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          {isVideoPlaying ? (
            // Pause icon
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" fill="currentColor" />
              <rect x="14" y="4" width="4" height="16" fill="currentColor" />
            </svg>
          ) : (
            // Play icon
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="8,5 19,12 8,19" fill="currentColor" />
            </svg>
          )}
        </button>
        
        {/* Search bar - hidden on mobile */}
        {!isMobile && (
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-[95%] bg-white rounded-full shadow-lg flex flex-wrap md:flex-nowrap items-center px-4 py-2 gap-2 md:gap-4">
          <select 
            className="flex-1 min-w-[120px] bg-transparent px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-black transition-colors"
            value={searchFilters.location}
            onChange={(e) => handleFilterChange('location', e.target.value)}
          >
            {locations.map((location, index) => (
              <option key={index} value={location.value}>
                {location.label}
              </option>
            ))}
          </select>
          <select 
            className="flex-1 min-w-[120px] bg-transparent px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-black transition-colors"
            value={searchFilters.propertyType}
            onChange={(e) => handleFilterChange('propertyType', e.target.value)}
          >
            {propertyTypes.map((type, index) => (
              <option key={index} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <select 
            className="flex-1 min-w-[120px] bg-transparent px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-black transition-colors"
            value={searchFilters.priceRange}
            onChange={(e) => handleFilterChange('priceRange', e.target.value)}
          >
            {priceRanges.map((range, index) => (
              <option key={index} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          <select 
            className="flex-1 min-w-[120px] bg-transparent px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-black transition-colors"
            value={searchFilters.bedrooms}
            onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
          >
            {bedroomOptions.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select 
            className="flex-1 min-w-[120px] bg-transparent px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-black transition-colors"
            value={searchFilters.bathrooms}
            onChange={(e) => handleFilterChange('bathrooms', e.target.value)}
          >
            {bathroomOptions.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button 
            className="bg-black text-white rounded-full px-8 py-2 font-semibold text-lg hover:bg-gray-800 transition"
            onClick={handleSearch}
          >
            Search
          </button>
        </div>
        )}
      </div>
      <div className="h-12" /> {/* Spacer for search bar overlap */}
    </section>
    </section>
   
  );
};

export default Hero;
