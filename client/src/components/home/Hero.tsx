import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import "../Hero.css"

import houseImg from '../../assets/images/hero-house.jpg';
import FilterBar from './FilterBar';
import MotionBackground from '@/components/motion/MotionBackground';
import CountUp from '@/components/motion/CountUp';
import VRBadge from '@/components/property/VRBadge';
import ExploreFiltersDialog from './ExploreFiltersDialog';
import HeroNewsSlide from './HeroNewsSlide';
import { useProperties } from '@/hooks/usePropertyData';

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
  // Design-review fix (round 2): the hero stats used to read "1,000+
  // Target House Listings" / "98% Target Customer Satisfaction" — both
  // visibly labeled as unmet goals, which self-discredits the one place
  // on the page meant to build trust at a glance. Real, live listing
  // count instead (react-query dedupes this against Home.tsx's own
  // useProperties() call — same query key, no extra network request).
  // The satisfaction percentage is dropped entirely below rather than
  // replaced with another number — there's no real survey/rating data
  // behind it anywhere in this codebase to report honestly.
  const { data: heroProperties } = useProperties();
  const liveHeroListings = (heroProperties ?? []).filter((p) => p.title && p.title.trim() !== '');
  const liveListingCount = liveHeroListings.length;
  // Second stat is a real computed share of live listings that actually
  // have a tour (property.hasTour), not an assumed 100% — falls back to
  // null (stat hidden) rather than a divide-by-zero NaN% when there's no
  // data yet.
  const tourCoveragePercent =
    liveListingCount > 0
      ? Math.round((liveHeroListings.filter((p) => p.hasTour).length / liveListingCount) * 100)
      : null;
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showImage, setShowImage] = useState(!videoUrl);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // Tour video and the Africa Real Estate Pulse news/listings feed now
  // share this one slide container instead of the news feed being a
  // separate section further down the page — "let the news be put where
  // the video is... let the 2 slide as part of the same container." Pauses
  // on hover, same pattern as every other rotation in this codebase
  // (FeaturedTour.tsx, AfricaRealEstatePulse's own internal rotation).
  const [heroSlide, setHeroSlide] = useState<'tour' | 'news'>('tour');
  const [isSlidePaused, setIsSlidePaused] = useState(false);
  useEffect(() => {
    if (isSlidePaused) return;
    const timer = setInterval(() => {
      setHeroSlide((s) => (s === 'tour' ? 'news' : 'tour'));
    }, 10000);
    return () => clearInterval(timer);
  }, [isSlidePaused]);
  const [searchFilters, setSearchFilters] = useState({
    location: '',
    propertyType: '',
    priceRange: '',
    bedrooms: '',
    bathrooms: ''
  });
  // Mobile redesign (GENE v1.11.2): the desktop 5-field search bar was
  // simply hidden on mobile with nothing in its place — a real gap, not a
  // sizing issue. Airbnb's mobile pattern is a single tappable "Where to?"
  // pill that opens a full search sheet; reusing the already-shipped
  // ExploreFiltersDialog (property type/area/price/features tabs) gets
  // that behavior for free instead of building a second filter UI.
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Design-review fix (round 3): the YouTube embed was set to autoplay
  // unconditionally, including on mobile — the mobile/performance reviewer
  // flagged this as a real data-cost concern for a platform whose audience
  // is disproportionately on constrained mobile data plans across Africa.
  // On mobile, a single (non-playlist) YouTube video now shows a static
  // thumbnail with a tap-to-play control instead of autoplaying; tapping
  // it loads and plays the real embed. Desktop behavior is unchanged.
  // Playlists are left autoplaying as before — YouTube doesn't expose one
  // predictable thumbnail per playlist the way it does per video.
  const getYouTubeVideoId = (url: string): string | null => {
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return null;
    if (url.includes('playlist?list=') || url.includes('&list=')) return null;
    const videoId = url.includes('youtube.com')
      ? url.split('v=')[1]?.split('&')[0]
      : url.split('youtu.be/')[1]?.split('?')[0];
    return videoId || null;
  };
  const [mobileFacadeDismissed, setMobileFacadeDismissed] = useState(false);
  const youtubeVideoId = videoUrl ? getYouTubeVideoId(videoUrl) : null;
  const showYoutubeFacade = Boolean(isMobile && youtubeVideoId && !mobileFacadeDismissed);

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
    <section className='relative bg-background -mx-4 sm:-mx-6 lg:-mx-8 vr-grid-bg'>
      <MotionBackground tone="accent" />
 <section className="relative z-10 w-full mdx_hero p-8 md:p-12 mt-6 flex flex-col gap-8 hero-video-wrapper  newHero">

      {/* Main hero content */}
      <div className="flex flex-col md:flex-row md:items-center gap-8">
        {/* Left: Headline */}
        <motion.div
          className="flex-1 hero-left-content"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-4">
            <VRBadge size="md" />
          </div>
          <h1 className="text-5xl md:text-7xl font-light leading-tight text-foreground">
            {/* Design-review fix (round 1): this was `text-accent` — the flat
                shiny-silver token (#7D828A-ish) at italic/medium weight over
                the alabaster background reads as near-illegible watermark
                text rather than an intentional two-tone headline. Softened
                charcoal (`text-foreground/70`) keeps the same "understated
                second line" effect while staying clearly readable. */}
            <span className="font-display italic font-medium text-foreground/70 text-6xl md:text-8xl hero-find-text vr-glow-text">Step Inside</span> <br />
            <span className="font-display hero-text-two">Before You Arrive</span>
          </h1>
        </motion.div>
        {/* Right: Description and stats */}
        <motion.div
          className="flex-1 flex flex-col gap-8 hero-right-content"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-lg md:text-xl text-muted-foreground mb-4">
            Every listing comes with an immersive 360° virtual tour — walk through real homes on your phone, tablet, or a VR headset, before you ever set foot on the property.
          </p>
          <div className="flex gap-12">
            <div>
              <div className="text-3xl md:text-4xl font-display font-medium text-foreground">
                <CountUp value={liveListingCount} suffix="+" />
              </div>
              <div className="text-muted-foreground text-base">Live Listings Today</div>
            </div>
            {tourCoveragePercent !== null && (
              <>
                <div className="border-l border-border h-12 mx-4"></div>
                <div>
                  <div className="text-3xl md:text-4xl font-display font-medium text-foreground">
                    <CountUp value={tourCoveragePercent} suffix="%" />
                  </div>
                  <div className="text-muted-foreground text-base">Listings With a Virtual Tour</div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
       <FilterBar />

      {/* House image/video and search bar — plus, sharing this same
          container, the "news" slide (HeroNewsSlide, real Africa
          property/housing news + this platform's own live listings),
          alternating with the tour video/image every 10s. */}
      <div
        className="relative mt-4"
        onMouseEnter={() => setIsSlidePaused(true)}
        onMouseLeave={() => setIsSlidePaused(false)}
      >
        {heroSlide === 'news' ? (
          <div className="relative w-full h-96 md:h-[500px] lg:h-[600px] rounded-2xl shadow-md overflow-hidden bg-muted">
            <HeroNewsSlide active={heroSlide === 'news'} />
          </div>
        ) : videoUrl && !showImage ? (
          // Video content - full width and height
          <div className="relative w-full h-96 md:h-[500px] lg:h-[600px] rounded-2xl shadow-md overflow-hidden">
            {/* Loading spinner — suppressed while the tap-to-play facade is
                showing, since nothing is actually loading yet at that point. */}
            {isVideoLoading && !showYoutubeFacade && (
              <div className="absolute inset-0 bg-muted flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                <span className="ml-3 text-muted-foreground">Loading video...</span>
              </div>
            )}

            {/* YouTube iframe */}
            {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                {showYoutubeFacade && youtubeVideoId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileFacadeDismissed(true);
                      setIsVideoLoading(true);
                      setIsVideoPlaying(true);
                    }}
                    aria-label="Play video"
                    className="relative w-full h-full block"
                  >
                    <img
                      src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/90 shadow-lg">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="translate-x-0.5">
                          <polygon points="8,5 19,12 8,19" fill="currentColor" className="text-foreground" />
                        </svg>
                      </span>
                    </span>
                  </button>
                ) : (
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
                )}
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
          <motion.img
            src={houseImg}
            alt="Modern house"
            className="w-full h-96 md:h-[500px] lg:h-[600px] object-cover rounded-2xl shadow-md"
            initial={{ scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        
        {/* Play/Pause button overlay - top right. Hidden while the mobile
            tap-to-play facade is showing — tapping the facade itself is the
            play action, so a second play control would be redundant —
            and while the news slide is showing, since it controls video
            playback specifically. */}
        {heroSlide === 'tour' && !showYoutubeFacade && (
          <button
            onClick={handlePlayPause}
            aria-label={isVideoPlaying ? 'Pause video' : 'Play video'}
            className="absolute top-4 right-4 bg-card rounded-full p-3 shadow-lg border border-border hover:bg-secondary transition-colors"
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
        )}

        {/* Tour / News slide indicators — the "2 slide" dots. Sits just
            below the top-right play/pause button (shown on the tour slide
            only) and clear of the news slide's own top-left "Pulse" badge
            and the search bar overlapping the bottom edge. */}
        <div className="absolute top-20 right-4 z-10 flex gap-1.5">
          {(['tour', 'news'] as const).map((slide) => (
            <button
              key={slide}
              type="button"
              onClick={() => setHeroSlide(slide)}
              aria-label={slide === 'tour' ? 'Show tour video' : 'Show real estate news'}
              className={`h-1.5 rounded-full transition-all ${
                heroSlide === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>

        {/* Mobile: a single tappable Airbnb-style "Where to?" pill in place
            of the 5-field bar (which doesn't fit and was previously just
            hidden with nothing shown instead). Opens the same
            ExploreFiltersDialog the "Filters" button in FilterBar already
            uses — one filter UI, not a second one to maintain. */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen(true)}
            className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-[92%] bg-card rounded-full shadow-lg border border-border flex items-center gap-3 px-5 py-3.5 text-left active:scale-[0.98] transition-transform"
          >
            <i className="fas fa-search text-foreground"></i>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">Where are you looking?</span>
              <span className="text-xs text-muted-foreground">Any type · Any price</span>
            </span>
          </button>
        )}

        {/* Search bar - desktop only (5 inline fields need the width).
            One seamless pill with thin dividers between segments (Airbnb's
            actual search-bar signature - "Where / Check in / ... / Who" as
            one bar, not five separate boxes) instead of five individually
            bordered/rounded selects. Same fields, same handleSearch - purely
            a container/border restyle. */}
        {!isMobile && (
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-[95%] bg-card rounded-full shadow-lg flex flex-wrap md:flex-nowrap items-center pl-2 pr-2 py-2">
          <select
            className="flex-1 min-w-[110px] bg-transparent px-4 py-2 text-foreground focus:outline-none border-r border-border last:border-r-0"
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
            className="flex-1 min-w-[110px] bg-transparent px-4 py-2 text-foreground focus:outline-none border-r border-border last:border-r-0"
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
            className="flex-1 min-w-[110px] bg-transparent px-4 py-2 text-foreground focus:outline-none border-r border-border last:border-r-0"
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
            className="flex-1 min-w-[110px] bg-transparent px-4 py-2 text-foreground focus:outline-none border-r border-border last:border-r-0"
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
            className="flex-1 min-w-[110px] bg-transparent px-4 py-2 text-foreground focus:outline-none"
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
            className="shine rounded-full px-8 py-2.5 font-semibold text-lg hover:opacity-90 transition ml-2"
            onClick={handleSearch}
          >
            <i className="fas fa-search mr-2 text-base"></i>
            Search
          </button>
        </div>
        )}
      </div>
      <div className={isMobile ? "h-8" : "h-12"} /> {/* Spacer for search bar overlap — smaller on mobile since the pill sits closer to the image */}

      <ExploreFiltersDialog
        isOpen={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
      />
    </section>
    </section>

  );
};

export default Hero;
