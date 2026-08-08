import { useState, useEffect, useRef } from 'react';
import { getProductImage } from '../../lib/image';

interface Props {
  src: string | null | undefined;
  alt: string;
  className?: string;
  lazy?: boolean;
  fallback?: string;
}

const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect fill="#e8f5e9" width="400" height="400"/>
    <g fill="none" stroke="#81c784" stroke-width="8" stroke-linecap="round">
      <rect x="120" y="110" width="160" height="160" rx="24"/>
      <circle cx="165" cy="160" r="18"/>
      <path d="M120 250 l70 -55 55 45 45 -30 55 40"/>
    </g>
  </svg>`
);

export default function ProductImage({ src, alt, className = '', lazy = true, fallback }: Props) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const prevSrc = useRef(src);
  const imageUrl = getProductImage(src);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (src !== prevSrc.current) {
      prevSrc.current = src;
      setLoaded(false);
      setError(false);
    }
  }, [src]);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [imageUrl]);

  const handleLoad = () => {
    if (mountedRef.current) setLoaded(true);
  };

  const handleError = () => {
    if (mountedRef.current) setError(true);
  };

  return (
    <div className={`${className} relative overflow-hidden`}>
      {!loaded && !error && imageUrl && (
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-cream-100 via-cream-200 to-cream-100 animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-forest-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {imageUrl && !error && (
        <img
          ref={imgRef}
          src={imageUrl}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading={lazy ? 'lazy' : undefined}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {(!imageUrl || error) && (
        <img
          src={fallback || PLACEHOLDER}
          alt={alt}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}