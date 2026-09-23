'use client';
import { useEffect, useRef, useState } from 'react';

// Scale the entire reference feed surface together, including type and controls.
// The real recipient feed still center-covers this portrait on their own screen.
export function FeedPhotoPreview({ src, firstName, bio, likeLabel }: { src: string; firstName: string; bio: string; likeLabel: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  return <div ref={host} data-testid="feed-photo-preview" className="relative h-full w-full overflow-hidden">
    <div className="absolute left-0 top-0 origin-top-left overflow-hidden bg-bordeaux" style={{ width: 390, height: 845, transform: `scale(${width / 390})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="room-grade absolute inset-0" /><div className="room-key absolute inset-0" />
      <div className="room-vignette absolute inset-0" /><div className="room-grain absolute inset-0" />
      <div className="room-top-scrim absolute inset-x-0 top-0 h-40" /><div className="room-identity-scrim absolute inset-0" />
      <div className="absolute inset-x-6 bottom-11 text-center">
        <h2 className={`wordmark mx-auto line-clamp-2 max-w-full overflow-hidden break-all pb-[.1em] leading-[1.02] text-cream ${Array.from(firstName).length <= 18 ? 'text-[3.25rem]' : Array.from(firstName).length <= 24 ? 'text-[2.625rem]' : 'text-[2rem]'}`} style={{ textShadow: '0 1px 22px rgba(18,10,15,.7)' }}>{firstName}</h2>
        {bio.trim() && <p className="mx-auto mt-3 line-clamp-2 max-w-[250px] wrap-anywhere font-body text-sm font-light leading-relaxed text-taupe" style={{ textShadow: '0 1px 16px rgba(18,10,15,.6)' }}>{bio.trim()}</p>}
        <hr className="hairline mx-auto my-5 w-16" />
        <span aria-hidden className="heart-button heart-idle inline-flex px-8 py-[15px] text-xs"><span className="text-base leading-none">♡</span>{likeLabel}</span>
      </div>
    </div>
  </div>;
}
