import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import "../Hero.css"

import houseImg from '../../assets/images/hero-house.jpg';
import mansionBg from '../../assets/images/hero-mansion.jpg';
import FilterBar from './FilterBar';
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

  // Depth: the photo drifts slower than the page as you scroll, and a mouse
  // pointer nudges each layer (photo, headline, copy) by a different amount.
  // Touch and reduced-motion visitors get the still scene.
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 700], [0, reduceMotion ? 0 : 56]);
  const heroRef = React.useRef<HTMLElement | null>(null);
  const handleSceneMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  };
  const handleSceneLeave = () => {
    heroRef.current?.style.setProperty('--px', '0');
    heroRef.current?.style.setProperty('--py', '0');
  };

  return (
    <>
      {/* ------------------------------------------------------------------
          Desktop and tablet: a full-bleed photo at golden hour, a headline
          with room to breathe, and the search as a floating pill. */}
      <section
        ref={heroRef}
        onPointerMove={handleSceneMove}
        onPointerLeave={handleSceneLeave}
        className="relative -mx-4 hidden overflow-hidden bg-foreground sm:-mx-6 md:block lg:-mx-8"
        aria-label="Search homes"
      >
        <motion.img
          src={mansionBg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover parallax-layer"
          style={{ y: bgY, scale: 1.12, ['--depth' as string]: '-10px' }}
        />
        {/* Dusk: ink rising from the left and the bottom, so white type has 7:1 or better wherever it sits. */}
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(235_30%_8%/0.88)] via-[hsl(235_30%_8%/0.55)] to-[hsl(235_30%_8%/0.1)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(235_30%_8%/0.75)] via-transparent to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-[640px] max-w-[1500px] flex-col justify-end gap-10 px-8 pb-14 pt-24 lg:min-h-[700px]">
          <motion.div
            className="max-w-3xl parallax-layer"
            style={{ ['--depth' as string]: '7px' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="tour-chip mb-6">
              <i className="fas fa-vr-cardboard" aria-hidden="true" /> 360° tours · across Africa
            </span>
            <h1 className="font-display text-6xl font-bold leading-[1.02] tracking-tight text-white lg:text-[5.5rem]">
              Walk in
              <br />
              <span className="font-medium italic text-[hsl(var(--gold))]">before you arrive.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90 lg:text-xl">
              Tour real homes on your phone, tablet or headset, then message the owner on WhatsApp. Rentals, BnBs, homes for sale and bank
              auctions.
            </p>
            <div className="mt-7 flex gap-10 text-white">
              <div>
                <div className="font-display text-3xl font-semibold">
                  <CountUp value={liveListingCount} suffix="+" />
                </div>
                <div className="text-sm text-white/80">live listings</div>
              </div>
              {tourCoveragePercent !== null && (
                <div>
                  <div className="font-display text-3xl font-semibold">
                    <CountUp value={tourCoveragePercent} suffix="%" />
                  </div>
                  <div className="text-sm text-white/80">with a virtual tour</div>
                </div>
              )}
            </div>
          </motion.div>

          <div className="flex justify-start">
        {/* Search bar - desktop only (5 inline fields need the width).
            One seamless pill with thin dividers between segments (Airbnb's
            actual search-bar signature - "Where / Check in / ... / Who" as
            one bar, not five separate boxes) instead of five individually
            bordered/rounded selects. Same fields, same handleSearch - purely
            a container/border restyle. */}
        {!isMobile && (
          <div className="w-full max-w-5xl bg-card rounded-full shadow-[0_20px_60px_-12px_rgba(0,0,0,0.55)] flex flex-wrap md:flex-nowrap items-center pl-3 pr-2 py-2">
          <select
            aria-label="Location"
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
            aria-label="Property Type"
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
            aria-label="Price Range"
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
            aria-label="Bedrooms"
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
            aria-label="Bathrooms"
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
        </div>
      </section>

      {/* ------------------------------------------------------------------
          Phone: no wall of text. One line of headline, then straight to
          browsing, the way people expect from a home-search app. */}
      <section className="pt-5 md:hidden">
        <h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground">
          Walk in before you arrive
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Tour real homes in 360° first.</p>
      </section>

      <FilterBar />

      {/* The tour (or the news slide that alternates with it). */}
      <section className="mt-5 md:mt-10" aria-label="Featured tour">
      <div
        className="relative"
        onMouseEnter={() => setIsSlidePaused(true)}
        onMouseLeave={() => setIsSlidePaused(false)}
      >
        {heroSlide === 'news' ? (
          <div className="relative w-full aspect-[4/3] md:aspect-auto md:h-[520px] lg:h-[600px] rounded-3xl shadow-[0_8px_30px_-8px_rgba(31,32,55,0.35)] overflow-hidden bg-muted">
            <HeroNewsSlide active={heroSlide === 'news'} />
          </div>
        ) : videoUrl && !showImage ? (
          // Video content - full width and height
          <div className="relative w-full aspect-[4/3] md:aspect-auto md:h-[520px] lg:h-[600px] rounded-3xl shadow-[0_8px_30px_-8px_rgba(31,32,55,0.35)] overflow-hidden">
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
          // Image content (fallback or default) - also larger. Wrapped the
          // same way the video branch above is (a relative container
          // holding the media plus its own gradient overlay) so the static
          // fallback gets the same subtle bottom-lit vignette instead of a
          // flat, uncomposited photo — a small thing, but it's what most of
          // this page's visitors actually see before any admin-configured
          // video is set.
          <div className="relative w-full aspect-[4/3] md:aspect-auto md:h-[520px] lg:h-[600px] rounded-3xl shadow-[0_8px_30px_-8px_rgba(31,32,55,0.35)] overflow-hidden">
            <motion.img
              src={houseImg}
              alt="Modern house"
              className="w-full h-full object-cover"
              initial={{ scale: 1.06, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent"></div>
          </div>
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
            // The visible pill stays thin (h-1.5) for the small indicator
            // look, but the button itself carries p-2.5 so the actual
            // tappable area is ~28x28 — a bare h-1.5 hit target was ~6px
            // tall, well under the accessibility floor for a control.
            <button
              key={slide}
              type="button"
              onClick={() => setHeroSlide(slide)}
              aria-label={slide === 'tour' ? 'Show tour video' : 'Show real estate news'}
              className="p-2.5 flex items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  heroSlide === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
      </section>

      <ExploreFiltersDialog isOpen={isMobileSearchOpen} onClose={() => setIsMobileSearchOpen(false)} />
    </>
  );
};

export default Hero;
